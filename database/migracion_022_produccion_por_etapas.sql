-- =====================================================================
-- Un atelier - Producción diaria por etapas (delta idempotente)
-- Une productos, pedidos, tareas, producción diaria y recompensas en un
-- solo flujo:
--   1. Al crear un pedido, cada producto lleva sus horas-hombre estimadas
--      repartidas en etapas, cada una con su empleado. La suma de las
--      etapas tiene que coincidir con las horas-hombre estimadas.
--   2. La producción diaria es la lista de etapas propuestas para un día
--      (un pedido completo, un producto o etapas sueltas).
--   3. El empleado solo marca la etapa como completada (ya no informa el
--      tiempo que tardó).
--   4. El admin verifica y marca la producción diaria como terminada. Si se
--      completó todo lo propuesto, el equipo cobra las horas-hombre
--      estimadas × valor hora × % premio; si no, 0.
-- La lógica vive en server/recompensa-equipo.js (funciones puras) y
-- server/jornadas.js (lectura y cierre). Este mismo cambio ya está en
-- database/schema.sql: alcanza con `node server/scripts/aplicar-schema.js`.
--
-- No borra datos: los días calculados con el modelo anterior (objetivos
-- por producto) quedan como terminados con su detalle, y las tablas
-- objetivos_produccion y registros_produccion se conservan como historial.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) HORAS-HOMBRE POR ETAPA DEL PEDIDO
-- Total de la etapa (por unidad × cantidad). Las etapas existentes toman
-- sus minutos estimados pasados a horas.
-- ---------------------------------------------------------------------
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS horas_hombre NUMERIC(8,2);
UPDATE pedido_etapas SET horas_hombre = ROUND(minutos_estimados / 60.0, 2) WHERE horas_hombre IS NULL;
ALTER TABLE pedido_etapas ALTER COLUMN horas_hombre SET DEFAULT 0;
ALTER TABLE pedido_etapas ALTER COLUMN horas_hombre SET NOT NULL;
ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS pedido_etapas_horas_hombre_check;
ALTER TABLE pedido_etapas ADD CONSTRAINT pedido_etapas_horas_hombre_check CHECK (horas_hombre >= 0);

-- La bandeja de trabajo expone las horas-hombre de cada etapa.
DROP VIEW IF EXISTS vista_rendimiento_empleados;
DROP VIEW IF EXISTS vista_tareas_empleado;

CREATE VIEW vista_tareas_empleado AS
SELECT 'PEDIDO'::text AS origen,
       pe.id::bigint AS id,
       pe.pedido_id::bigint AS contenedor_id,
       p.codigo::text AS referencia,
       COALESCE(pr.nombre, 'Pedido')::text AS titulo,
       pe.nombre::text AS etapa,
       pe.orden::int AS orden,
       pe.responsable_id::bigint AS asignado_a,
       pe.estado::text AS estado,
       pe.minutos_estimados::int AS minutos_estimados,
       pe.minutos_reales::int AS minutos_reales,
       pe.costo_estimado::numeric(12,2) AS costo,
       pe.semaforo AS semaforo,
       pe.completado_en AS completado_en,
       pe.observaciones::text AS observaciones,
       pe.iniciado_en AS iniciado_en,
       p.fecha_entrega AS fecha_entrega,
       p.prioridad::int AS prioridad,
       pe.horas_hombre::numeric(8,2) AS horas_hombre
FROM pedido_etapas pe
JOIN pedidos p ON p.id = pe.pedido_id
LEFT JOIN pedido_items pi ON pi.id = pe.pedido_item_id
LEFT JOIN productos pr ON pr.id = pi.producto_id
UNION ALL
SELECT 'TAREA'::text,
       te.id::bigint,
       t.id::bigint,
       ('T-' || t.id)::text,
       t.titulo::text,
       te.nombre::text,
       te.orden::int,
       t.asignado_a::bigint,
       (CASE WHEN te.realizada THEN 'COMPLETADA' ELSE 'PENDIENTE' END)::text,
       te.minutos_estimados::int,
       te.minutos_reales::int,
       te.costo::numeric(12,2),
       te.semaforo,
       te.completada_en,
       t.descripcion::text,
       NULL::timestamptz,
       NULL::date,
       NULL::int,
       ROUND(te.minutos_estimados / 60.0, 2)::numeric(8,2)
FROM tarea_etapas te
JOIN tareas t ON t.id = te.tarea_id;

CREATE VIEW vista_rendimiento_empleados AS
SELECT u.id, u.nombre, u.email, u.activo,
       COUNT(v.id) FILTER (WHERE v.estado = 'COMPLETADA')::int AS completadas,
       COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA')::int AS pendientes,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'VERDE')::int AS verdes,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'AMARILLO')::int AS amarillos,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'ROJO')::int AS rojos,
       COALESCE(SUM(v.minutos_estimados) FILTER (WHERE v.estado = 'COMPLETADA'), 0)::int AS minutos_estimados,
       COALESCE(SUM(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA'), 0)::int AS minutos_reales,
       COALESCE(ROUND(AVG(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA')), 0)::int AS promedio_minutos,
       COALESCE((SELECT SUM(r.monto) FROM recompensas r WHERE r.usuario_id = u.id), 0)::numeric(12,2) AS recompensas_monto
FROM usuarios u
LEFT JOIN vista_tareas_empleado v ON v.asignado_a = u.id
WHERE LOWER(u.rol::text) = 'empleado'
GROUP BY u.id;

-- ---------------------------------------------------------------------
-- 2) ESTADO DE LA JORNADA: ABIERTA (en curso) / TERMINADA (verificada)
-- Los días que ya existían (modelo anterior) quedan TERMINADOS.
-- ---------------------------------------------------------------------
ALTER TABLE jornadas_equipo ADD COLUMN IF NOT EXISTS estado VARCHAR(12);
UPDATE jornadas_equipo SET estado = 'TERMINADA' WHERE estado IS NULL;
ALTER TABLE jornadas_equipo ALTER COLUMN estado SET DEFAULT 'ABIERTA';
ALTER TABLE jornadas_equipo ALTER COLUMN estado SET NOT NULL;
ALTER TABLE jornadas_equipo DROP CONSTRAINT IF EXISTS jornadas_equipo_estado_check;
ALTER TABLE jornadas_equipo ADD CONSTRAINT jornadas_equipo_estado_check CHECK (estado IN ('ABIERTA', 'TERMINADA'));
ALTER TABLE jornadas_equipo ADD COLUMN IF NOT EXISTS cumplido BOOLEAN;
UPDATE jornadas_equipo SET cumplido = (objetivo_horas > 0 AND horas_producidas >= objetivo_horas) WHERE cumplido IS NULL;
ALTER TABLE jornadas_equipo ALTER COLUMN cumplido SET DEFAULT FALSE;
ALTER TABLE jornadas_equipo ALTER COLUMN cumplido SET NOT NULL;
ALTER TABLE jornadas_equipo ADD COLUMN IF NOT EXISTS creado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE jornadas_equipo ADD COLUMN IF NOT EXISTS terminada_en TIMESTAMPTZ;
ALTER TABLE jornadas_equipo ADD COLUMN IF NOT EXISTS terminada_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3) ETAPAS PROPUESTAS PARA CADA JORNADA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jornada_etapas (
  fecha DATE NOT NULL REFERENCES jornadas_equipo(fecha) ON DELETE CASCADE,
  pedido_etapa_id BIGINT NOT NULL REFERENCES pedido_etapas(id) ON DELETE CASCADE,
  agregada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fecha, pedido_etapa_id)
);
CREATE INDEX IF NOT EXISTS idx_jornada_etapas_etapa ON jornada_etapas(pedido_etapa_id);
CREATE INDEX IF NOT EXISTS idx_jornadas_equipo_estado ON jornadas_equipo(estado);
COMMENT ON TABLE objetivos_produccion IS 'Legado: objetivos diarios por producto del modelo anterior. Sólo historial (ver jornada_etapas).';
COMMENT ON TABLE registros_produccion IS 'Legado: unidades producidas por día del modelo anterior. Sólo historial (ver jornada_etapas).';
