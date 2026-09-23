-- =====================================================================
-- El Atelier - Rediseño de costeo de productos y pedidos
--
-- 1) Nuevos campos de producto: medidas, costo del producto (reemplaza al
--    costo por etapa como número de referencia cargado a mano) e historia
--    del producto (texto editorial distinto de la descripción técnica).
--
-- 2) El costo de un pedido ya no se arma sumando "costo" de cada etapa
--    (ese campo se sigue guardando en etapas_producto por compatibilidad,
--    pero el formulario de producto dejó de pedirlo). En su lugar, cada
--    ítem del pedido guarda una copia del costo de materiales y de mano
--    de obra por unidad vigente al momento de crear el pedido -mismo
--    criterio que ya se usaba para copiar el costo de las etapas: lo que
--    ya está en producción no cambia si después se edita el producto.
-- =====================================================================

ALTER TABLE productos ADD COLUMN IF NOT EXISTS medidas VARCHAR(200);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_producto NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS historia TEXT;

-- La chapita (chapita_id) es el "Product ID" visible que pidió el admin:
-- ídem id_pieza (migracion_008), pero sobre la columna que realmente está
-- conectada de punta a punta (formulario → base → web pública). Antes
-- sólo se validaba la unicidad en el frontend contra la lista cargada; la
-- garantía real la da esta restricción UNIQUE en la base.
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_chapita_id_key;
ALTER TABLE productos ADD CONSTRAINT productos_chapita_id_key UNIQUE (chapita_id);

ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS costo_materiales_unitario NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS costo_mano_obra_unitario NUMERIC(12,2) NOT NULL DEFAULT 0;
