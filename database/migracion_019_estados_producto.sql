-- =====================================================================
-- Migración 019: estados de producto (ACTIVO / VENDIDO / DESACTIVADO) y
-- eliminación real con ID reutilizable.
-- Idempotente y ya incluida en database/schema.sql (alcanza con
-- `node server/scripts/aplicar-schema.js`; este archivo es la versión suelta).
-- Efecto sobre datos existentes: los productos que estaban desactivados
-- pasan a DESACTIVADO (dejan de contarse como vendidos); los eliminados con
-- borrado lógico siguen ocultos y contando como vendidos, pero liberan su ID.
-- =====================================================================
-- ---------------------------------------------------------------------
-- ESTADOS DE PRODUCTO: ACTIVO / VENDIDO / DESACTIVADO (+ ventas históricas)
--   * ACTIVO       disponible: se ve en la web (si está publicado) y entra en
--                  el stock / la proyección de las estadísticas.
--   * VENDIDO      se vendió (botón "Producto vendido" o una venta registrada
--                  con registrarVentaProducto). Guarda vendido_en,
--                  precio_vendido y costo_vendido. Sigue existiendo para
--                  conservar el historial. No se muestra en la web.
--   * DESACTIVADO  sigue existiendo y se consulta en el panel, pero no se
--                  ve en la web y NO cuenta como stock ni como venta.
--   "activo" se mantiene como columna derivada (activo = estado='ACTIVO')
--   para no tocar las consultas que ya la usan (web pública, pedidos,
--   WhatsApp). El trigger la sincroniza solo, y también acepta código viejo
--   que sólo cambie "activo".
--   Eliminar un producto ahora lo BORRA de verdad (ver DELETE /productos/:id):
--   se van con él sus fotos, materiales y objetivos, y su ID de producto
--   (chapita_id) y su URL (slug) quedan libres. Si estaba VENDIDO, antes de
--   borrarlo el trigger guarda la venta en historial_ventas_productos para
--   que las estadísticas no la pierdan. La vista ventas_productos_registradas
--   junta las dos fuentes (productos vendidos + historial).
--   Los productos "eliminados" con el modelo anterior (borrado lógico, que
--   contaban como vendidos) se conservan ocultos como VENDIDO, sin ID ni URL,
--   así no se pierde ninguna venta ya registrada.
-- ---------------------------------------------------------------------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS vendido_en TIMESTAMPTZ;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_vendido NUMERIC(12,2);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_vendido NUMERIC(12,2);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS estado VARCHAR(12);

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

-- Historial de ventas de productos que ya no existen (se borraron estando
-- vendidos). Sin clave foránea a propósito: el producto ya no está.
CREATE TABLE IF NOT EXISTS historial_ventas_productos (
  id BIGSERIAL PRIMARY KEY,
  producto_id_original BIGINT,
  chapita_id VARCHAR(20),
  nombre VARCHAR(160) NOT NULL,
  precio_vendido NUMERIC(12,2),
  costo_vendido NUMERIC(12,2),
  vendido_en TIMESTAMPTZ NOT NULL,
  eliminado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_historial_ventas_productos_fecha ON historial_ventas_productos(vendido_en);

-- Migración de datos (sólo corre una vez: mientras estado sea NULL). Se
-- suelta el trigger y la restricción viejos para poder reclasificar.
DROP TRIGGER IF EXISTS trg_productos_registrar_venta ON productos;
DROP TRIGGER IF EXISTS trg_productos_conservar_venta ON productos;
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_venta_coherente;
-- Eliminados con el modelo anterior: siguen ocultos y contando como vendidos
-- (con su fecha, precio y costo), pero liberan su ID de producto y su URL.
UPDATE productos SET estado = 'VENDIDO', activo = FALSE, publicado = FALSE,
    chapita_id = NULL, slug = LEFT(slug || '-eliminado-' || id, 200),
    vendido_en = COALESCE(vendido_en, actualizado_en, creado_en),
    precio_vendido = COALESCE(precio_vendido, precio_venta),
    costo_vendido = COALESCE(costo_vendido, costo_unitario_producto(id, horas_hombre, costo_producto))
  WHERE estado IS NULL AND eliminado;
-- Desactivados: pasan a DESACTIVADO (dejan de contarse como venta).
UPDATE productos SET estado = 'DESACTIVADO', vendido_en = NULL, precio_vendido = NULL, costo_vendido = NULL
  WHERE estado IS NULL AND NOT activo;
UPDATE productos SET estado = 'ACTIVO' WHERE estado IS NULL;
ALTER TABLE productos ALTER COLUMN estado SET DEFAULT 'ACTIVO';
ALTER TABLE productos ALTER COLUMN estado SET NOT NULL;

CREATE OR REPLACE FUNCTION productos_registrar_venta() RETURNS trigger AS $$
BEGIN
  -- Compatibilidad: código que sólo cambia "activo" (true = ACTIVO,
  -- false = DESACTIVADO; nunca implica una venta).
  IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado AND NEW.activo IS DISTINCT FROM OLD.activo THEN
    NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'DESACTIVADO' END;
  END IF;
  -- Un producto oculto (eliminado con el modelo anterior) nunca vuelve a estar activo.
  IF NEW.eliminado AND NEW.estado = 'ACTIVO' THEN NEW.estado := 'DESACTIVADO'; END IF;
  NEW.activo := (NEW.estado = 'ACTIVO');
  IF NEW.estado = 'VENDIDO' THEN
    IF NEW.vendido_en IS NULL THEN
      NEW.vendido_en := NOW();
      NEW.precio_vendido := NEW.precio_venta;
      NEW.costo_vendido := costo_unitario_producto(NEW.id, NEW.horas_hombre, NEW.costo_producto);
    ELSIF TG_OP = 'UPDATE' AND NEW.precio_venta IS DISTINCT FROM OLD.precio_venta THEN
      -- Si el admin corrige el precio de un producto ya vendido, se toma
      -- como el precio real al que se vendió.
      NEW.precio_vendido := NEW.precio_venta;
    END IF;
  ELSE
    -- ACTIVO o DESACTIVADO: no hay venta (reactivar o desactivar la anula).
    NEW.vendido_en := NULL;
    NEW.precio_vendido := NULL;
    NEW.costo_vendido := NULL;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productos_registrar_venta
  BEFORE INSERT OR UPDATE OF estado, activo, eliminado, precio_venta ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_registrar_venta();

-- Al borrar un producto VENDIDO, la venta pasa al historial.
CREATE OR REPLACE FUNCTION productos_conservar_venta() RETURNS trigger AS $$
BEGIN
  IF OLD.estado = 'VENDIDO' THEN
    INSERT INTO historial_ventas_productos (producto_id_original, chapita_id, nombre, precio_vendido, costo_vendido, vendido_en)
    VALUES (OLD.id, OLD.chapita_id, OLD.nombre, OLD.precio_vendido, OLD.costo_vendido, OLD.vendido_en);
  END IF;
  RETURN OLD;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productos_conservar_venta
  BEFORE DELETE ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_conservar_venta();

ALTER TABLE productos ADD CONSTRAINT productos_venta_coherente CHECK (
  estado IN ('ACTIVO', 'VENDIDO', 'DESACTIVADO')
  AND activo = (estado = 'ACTIVO')
  AND ((estado = 'VENDIDO') = (vendido_en IS NOT NULL))
  AND NOT (eliminado AND estado = 'ACTIVO')
);
CREATE INDEX IF NOT EXISTS idx_productos_vendido_en ON productos(vendido_en) WHERE vendido_en IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productos_estado ON productos(estado);

-- Ventas de productos: los que están vendidos + los vendidos que se borraron.
CREATE OR REPLACE VIEW ventas_productos_registradas AS
  SELECT id AS producto_id, chapita_id, nombre, precio_vendido, costo_vendido, vendido_en, eliminado
    FROM productos WHERE estado = 'VENDIDO'
  UNION ALL
  SELECT producto_id_original, chapita_id, nombre, precio_vendido, costo_vendido, vendido_en, TRUE
    FROM historial_ventas_productos;
