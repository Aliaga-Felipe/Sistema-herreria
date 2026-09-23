-- =====================================================================
-- Migración 010: limpieza de tablas/columnas sin uso y consolidación
-- de chapita_id -> id_pieza.
--
-- Si ya ejecutaste schema.sql con esta versión no hace falta correrla
-- aparte. Para bases existentes, aplicala una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- chapita_id -> id_pieza (dos columnas para la misma idea; id_pieza es
-- la que usa el backend y la web pública actuales). Se migran los
-- valores que falten y se borra la columna vieja. Si algún producto
-- tenía los dos campos cargados con valores distintos, la restricción
-- UNIQUE puede fallar: revisar ese caso a mano antes de reintentar.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'chapita_id') THEN
    UPDATE productos SET id_pieza = chapita_id WHERE id_pieza IS NULL AND chapita_id IS NOT NULL;
    ALTER TABLE productos DROP COLUMN chapita_id;
  END IF;
END $$;

ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_id_pieza_key;
ALTER TABLE productos ADD CONSTRAINT productos_id_pieza_key UNIQUE (id_pieza);

-- ---------------------------------------------------------------------
-- Tablas y columnas sin ningún uso en el código actual: "equipos" y
-- "equipo_integrantes" son de un diseño anterior (asignar trabajo a un
-- equipo en vez de a una persona); "recuperaciones_contrasena" nunca
-- tuvo un flujo de recuperación de contraseña implementado;
-- pedidos.producto_id (pedido de un solo producto) quedó reemplazado
-- por pedido_items.
-- ---------------------------------------------------------------------
ALTER TABLE pedidos DROP COLUMN IF EXISTS producto_id;
ALTER TABLE pedidos DROP COLUMN IF EXISTS equipo_id;
ALTER TABLE recompensas DROP COLUMN IF EXISTS equipo_id;

DROP TABLE IF EXISTS equipo_integrantes CASCADE;
DROP TABLE IF EXISTS equipos CASCADE;
DROP TABLE IF EXISTS recuperaciones_contrasena;
