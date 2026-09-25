-- =====================================================================
-- Migración 015: ventas de productos para las estadísticas.
-- Un producto activo está disponible (entra en la proyección); al
-- desactivarlo o eliminarlo pasa a contarse como VENDIDO. "Eliminar" deja
-- de borrar la fila (borrado lógico) para no perder la venta.
--
-- Si ya ejecutaste schema.sql con esta versión (o corriste
-- node server/scripts/aplicar-schema.js) no hace falta correrla aparte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- VENTAS DE PRODUCTOS (activo / vendido / eliminado)
-- Regla de negocio de las estadísticas: un producto ACTIVO está disponible
-- para la venta y entra en la PROYECCIÓN (se supone que se va a vender a
-- su precio_venta). Un producto se considera VENDIDO recién cuando el admin
-- lo desactiva o lo elimina. Para no perder esa venta:
--   * vendido_en      fecha en que dejó de estar activo (fecha de la venta).
--   * precio_vendido  precio de venta al momento de venderse.
--   * costo_vendido   costo calculado (mano de obra + costo del producto +
--                     materiales) al momento de venderse.
--   * eliminado       "Eliminar" ya no borra la fila: la oculta del panel y
--                     de la web, pero la venta sigue contando en las
--                     estadísticas (antes se perdía con el DELETE).
-- El trigger productos_registrar_venta mantiene estas columnas solas, sin
-- importar qué ruta cambie "activo": así un producto nunca queda a la vez
-- activo y vendido, y desactivarlo dos veces (o desactivarlo y después
-- eliminarlo) no duplica la venta. Reactivarlo anula la venta.
-- ---------------------------------------------------------------------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS vendido_en TIMESTAMPTZ;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_vendido NUMERIC(12,2);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_vendido NUMERIC(12,2);

-- Costo unitario de un producto: misma fórmula que conCostoCalculado en
-- server/rutas/productos.js (horas-hombre × costo de la hora configurable
-- + costo_producto + suma de materiales). Se usa para la foto del costo al
-- vender y para el costo proyectado del stock activo en las estadísticas.
CREATE OR REPLACE FUNCTION costo_unitario_producto(p_id BIGINT, p_horas NUMERIC, p_costo NUMERIC) RETURNS NUMERIC AS $$
  SELECT ROUND(
      COALESCE(p_horas, 0) * COALESCE((SELECT CASE WHEN btrim(valor) ~ '^[0-9]+(\.[0-9]+)?$' THEN btrim(valor)::numeric END
                                       FROM configuracion WHERE clave = 'costo_hora_mano_obra'), 0)
    + COALESCE(p_costo, 0)
    + COALESCE((SELECT SUM(pm.precio_unitario * pm.cantidad) FROM producto_materiales pm WHERE pm.producto_id = p_id), 0)
  , 2)
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION productos_registrar_venta() RETURNS trigger AS $$
BEGIN
  -- Un producto eliminado nunca puede volver a estar activo.
  IF NEW.eliminado THEN NEW.activo := FALSE; END IF;
  IF NEW.activo THEN
    NEW.vendido_en := NULL;
    NEW.precio_vendido := NULL;
    NEW.costo_vendido := NULL;
  ELSIF NEW.vendido_en IS NULL THEN
    NEW.vendido_en := NOW();
    NEW.precio_vendido := NEW.precio_venta;
    NEW.costo_vendido := costo_unitario_producto(NEW.id, NEW.horas_hombre, NEW.costo_producto);
  ELSIF TG_OP = 'UPDATE' AND NEW.precio_venta IS DISTINCT FROM OLD.precio_venta THEN
    -- Si el admin corrige el precio de un producto ya vendido, se toma
    -- como el precio real al que se vendió.
    NEW.precio_vendido := NEW.precio_venta;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_productos_registrar_venta ON productos;
CREATE TRIGGER trg_productos_registrar_venta
  BEFORE INSERT OR UPDATE OF activo, eliminado, precio_venta ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_registrar_venta();

-- Compatibilidad con datos existentes: los productos que ya estaban
-- desactivados se toman como vendidos en su última actualización, al
-- precio y costo que tienen hoy (no hay un dato mejor guardado).
UPDATE productos SET
    vendido_en = COALESCE(actualizado_en, creado_en),
    precio_vendido = precio_venta,
    costo_vendido = costo_unitario_producto(id, horas_hombre, costo_producto)
  WHERE NOT activo AND vendido_en IS NULL;

ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_venta_coherente;
ALTER TABLE productos ADD CONSTRAINT productos_venta_coherente CHECK (
  (activo AND NOT eliminado AND vendido_en IS NULL) OR (NOT activo AND vendido_en IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_productos_vendido_en ON productos(vendido_en) WHERE vendido_en IS NOT NULL;

