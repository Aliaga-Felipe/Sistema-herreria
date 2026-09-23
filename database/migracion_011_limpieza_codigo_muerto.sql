-- =====================================================================
-- Migración 011: tablas y columnas sin uso (equipos, recuperación de
-- contraseña, pedidos de un solo producto).
--
-- Si ya ejecutaste schema.sql con esta versión no hace falta correrla
-- aparte. Para bases existentes, aplicala una sola vez.
-- =====================================================================

-- "equipos" y "equipo_integrantes" son de un diseño anterior (asignar
-- trabajo a un equipo, no a una persona); "recuperaciones_contrasena"
-- nunca tuvo un flujo de recuperación de contraseña implementado;
-- pedidos.producto_id (pedido de un solo producto) quedó reemplazado por
-- pedido_items. Ninguna de estas la usa el código actual.
ALTER TABLE pedidos DROP COLUMN IF EXISTS producto_id;
ALTER TABLE pedidos DROP COLUMN IF EXISTS equipo_id;
ALTER TABLE recompensas DROP COLUMN IF EXISTS equipo_id;

DROP TABLE IF EXISTS equipo_integrantes CASCADE;
DROP TABLE IF EXISTS equipos CASCADE;
DROP TABLE IF EXISTS recuperaciones_contrasena;
