-- =====================================================================
-- El Atelier - Recompensa por equipo (delta idempotente)
-- Reemplaza el bono individual por etapa (semáforo en verde) por una
-- recompensa única para todo el equipo, calculada por día:
--   excedente (hs) = Σ (unidades × horas-hombre del producto) − objetivo (hs)
--   recompensa     = excedente × valor hora-hombre × % premio
-- La lógica vive en server/recompensa-equipo.js (funciones puras) y
-- server/jornadas.js (lectura/guardado).
--
-- No borra datos: las recompensas individuales ya otorgadas quedan en la
-- tabla "recompensas" como historial y siguen contando como gasto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) HORAS TRABAJADAS POR EMPLEADO Y DÍA (las carga el admin)
-- Solo se usan para sumar las horas totales del equipo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horas_trabajadas (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  horas NUMERIC(5,2) NOT NULL CHECK (horas > 0 AND horas <= 24),
  cargado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_horas_trabajadas_fecha ON horas_trabajadas(fecha);

-- ---------------------------------------------------------------------
-- 2) VALOR HORA-HOMBRE Y % DE PREMIO CON HISTORIAL
-- Cada cambio agrega una fila con su fecha de vigencia; un día usa la
-- última fila con vigente_desde <= esa fecha, así que cambiar el valor
-- no recalcula días anteriores. Arranca con el valor hora que ya estaba
-- configurado (recompensa_valor_hora) y 100% de premio.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parametros_recompensa_historial (
  id BIGSERIAL PRIMARY KEY,
  vigente_desde DATE NOT NULL,
  valor_hora NUMERIC(12,2) NOT NULL CHECK (valor_hora >= 0),
  porcentaje_premio NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (porcentaje_premio >= 0 AND porcentaje_premio <= 100),
  creado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parametros_recompensa_vigencia ON parametros_recompensa_historial(vigente_desde, id);

INSERT INTO parametros_recompensa_historial (vigente_desde, valor_hora, porcentaje_premio)
SELECT DATE '2000-01-01',
       COALESCE((SELECT CASE WHEN btrim(valor) ~ '^[0-9]+(\.[0-9]+)?$' THEN btrim(valor)::numeric END
                 FROM configuracion WHERE clave = 'recompensa_valor_hora'), 2500),
       100
WHERE NOT EXISTS (SELECT 1 FROM parametros_recompensa_historial);

-- ---------------------------------------------------------------------
-- 3) JORNADAS DEL EQUIPO (una fila por día)
-- Guarda el objetivo vigente del día (el sugerido o el que fijó el admin)
-- y una copia del cálculo, para que modificaciones posteriores no cambien
-- días ya cerrados.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jornadas_equipo (
  fecha DATE PRIMARY KEY,
  horas_totales NUMERIC(8,2) NOT NULL DEFAULT 0,
  objetivo_horas NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (objetivo_horas >= 0),
  objetivo_manual BOOLEAN NOT NULL DEFAULT FALSE,
  objetivo_definido_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  horas_producidas NUMERIC(10,2) NOT NULL DEFAULT 0,
  excedente_horas NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_hora NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje_premio NUMERIC(5,2) NOT NULL DEFAULT 100,
  recompensa NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (recompensa >= 0),
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4) PRODUCCIÓN: objetivo por producto opcional + tiempo estándar copiado
-- Registrar producción ya no exige un objetivo por producto. Cada
-- registro guarda las horas-hombre del producto al momento de cargarlo,
-- así que editar el producto después no cambia días pasados.
-- ---------------------------------------------------------------------
ALTER TABLE registros_produccion ALTER COLUMN objetivo_cantidad DROP NOT NULL;
ALTER TABLE registros_produccion ADD COLUMN IF NOT EXISTS tiempo_estandar NUMERIC(8,2);
UPDATE registros_produccion r SET tiempo_estandar = p.horas_hombre
  FROM productos p WHERE p.id = r.producto_id AND r.tiempo_estandar IS NULL;

-- ---------------------------------------------------------------------
-- 5) PARÁMETROS DEL BONO INDIVIDUAL (ya no se usan)
-- Van después del paso 2, que copia el valor hora al historial.
-- semaforo_tolerancia se conserva: el semáforo sigue como indicador.
-- ---------------------------------------------------------------------
DELETE FROM configuracion WHERE clave IN ('recompensa_activa', 'recompensa_valor_hora', 'recompensa_factor_ahorro', 'recompensa_bono_minimo');
