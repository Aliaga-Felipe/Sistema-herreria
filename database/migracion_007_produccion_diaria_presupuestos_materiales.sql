-- =====================================================================
-- El Atelier - Panel de gestión (delta idempotente)
-- Agrega, sin tocar el catálogo público ni lo ya existente:
--   1) Objetivos de producción diaria por producto + recompensa asociada
--   2) Registro diario de producción y su cumplimiento (historial)
--   3) Presupuestos (seña, restante, cobro total), separados de pedidos
--   4) Horas-hombre por producto
--   5) Materiales y su asociación a productos, para el costo calculado
--      (materiales + mano de obra), que convive con el costo por etapas
--      ya existente sin reemplazarlo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) y 2) PRODUCCIÓN DIARIA
-- Un objetivo activo por producto (editable); cada registro diario
-- guarda una copia del objetivo vigente ese día, así que editar el
-- objetivo más adelante no reescribe el historial de cumplimiento.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objetivos_produccion (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL UNIQUE REFERENCES productos(id) ON DELETE CASCADE,
  cantidad_objetivo INTEGER NOT NULL CHECK (cantidad_objetivo > 0),
  tipo_recompensa VARCHAR(20) NOT NULL DEFAULT 'monto' CHECK (tipo_recompensa IN ('monto', 'libre')),
  valor_recompensa NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_recompensa >= 0),
  descripcion_recompensa TEXT NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros_produccion (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  cantidad_producida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_producida >= 0),
  objetivo_cantidad INTEGER NOT NULL,
  cumplido BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (producto_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_registros_produccion_fecha ON registros_produccion(fecha);
CREATE INDEX IF NOT EXISTS idx_registros_produccion_producto ON registros_produccion(producto_id, fecha);

-- ---------------------------------------------------------------------
-- 3) PRESUPUESTOS
-- Entidad nueva e independiente de "pedidos": guarda seña y saldo de
-- una cotización, se pueda o no convertir luego en un pedido real.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre VARCHAR(150),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  monto_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_total >= 0),
  sena_monto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sena_monto >= 0),
  notas TEXT,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
  creado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_fecha ON presupuestos(fecha);
CREATE INDEX IF NOT EXISTS idx_presupuestos_cliente ON presupuestos(cliente_id);

CREATE TABLE IF NOT EXISTS presupuesto_items (
  id BIGSERIAL PRIMARY KEY,
  presupuesto_id BIGINT NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  producto_id BIGINT REFERENCES productos(id) ON DELETE SET NULL,
  descripcion VARCHAR(200) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0)
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_items_presupuesto ON presupuesto_items(presupuesto_id);

-- ---------------------------------------------------------------------
-- 4) HORAS-HOMBRE POR PRODUCTO
-- ---------------------------------------------------------------------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS horas_hombre NUMERIC(8,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- 5) MATERIALES Y COSTEO
-- El costo de materiales + mano de obra se calcula al leer el producto
-- (cantidad × precio de cada material, más horas-hombre × costo de la
-- hora configurado abajo) y se muestra desglosado junto al costo por
-- etapas ya existente, sin reemplazarlo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materiales (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  unidad_medida VARCHAR(30) NOT NULL DEFAULT 'unidad',
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS producto_materiales (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  UNIQUE (producto_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_producto_materiales_producto ON producto_materiales(producto_id);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('costo_hora_mano_obra', '0', 'Costo por hora de mano de obra, usado junto a las horas-hombre del producto para calcular el costo de materiales + mano de obra.')
ON CONFLICT (clave) DO NOTHING;
