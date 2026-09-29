-- =====================================================================
-- Migración 016: las tareas de producción se definen en cada pedido (ya no
-- en el producto) y el pedido toma el precio de venta del producto.
--
-- Si ya ejecutaste schema.sql con esta versión (o corriste
-- node server/scripts/aplicar-schema.js) no hace falta correrla aparte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TAREAS POR PEDIDO (no por producto) Y PRECIO TOMADO DEL PRODUCTO
-- * Las tareas de producción viven en pedido_etapas, una lista propia por
--   cada producto de cada pedido (ya era así: cada pedido guardaba su copia
--   de nombre, orden y minutos). Lo que cambia es que ahora se definen al
--   crear el pedido y los productos ya no tienen tareas. La tabla
--   etapas_producto NO se borra ni se modifica: queda sólo como sugerencia
--   de tareas para pedidos nuevos de productos que nunca se pidieron (ver
--   GET /pedidos/tareas-sugeridas), y pedido_etapas.etapa_producto_id queda
--   como referencia histórica de los pedidos viejos.
-- * El formulario de pedido ya no pide precio: cada ítem toma el precio de
--   venta del producto. Los ítems de pedidos ABIERTOS que quedaron con
--   precio 0 toman el precio de venta actual de su producto (si tiene uno).
--   Pedidos terminados o cancelados no se tocan.
-- ---------------------------------------------------------------------
COMMENT ON TABLE etapas_producto IS 'Legado: etapas que tenían los productos antes de que las tareas pasaran al pedido. Sólo lectura (sugerencias).';
UPDATE pedido_items i SET precio_unitario = pr.precio_venta
  FROM pedidos p, productos pr
  WHERE p.id = i.pedido_id AND pr.id = i.producto_id
    AND i.precio_unitario = 0 AND pr.precio_venta > 0
    AND p.estado IN ('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO');

