-- =====================================================================
-- Migración 014: reintroduce el costeo de materiales por producto (con
-- un diseño más simple que el original, ver comentario abajo) y agrega
-- la clave de configuración "mail_receptor_consultas" para el
-- formulario de contacto de la web pública.
--
-- Si ya ejecutaste schema.sql con esta versión no hace falta correrla
-- aparte. Para bases existentes, aplicala una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- MATERIALES UTILIZADOS POR PRODUCTO
-- La sección Materiales se había quitado por completo (ver
-- migracion_010) y se reintroduce acá con un diseño más simple que el
-- original: cada fila es un material cargado a mano para ESE producto
-- (nombre libre, sin un catálogo compartido entre productos como tenía
-- la vieja tabla "materiales"), con su precio unitario y la cantidad que
-- usa una unidad del producto. El costo de materiales de un producto es
-- la suma de precio_unitario × cantidad de sus filas; se calcula al leer
-- el producto (ver conCostoCalculado en server/rutas/productos.js) y es
-- un concepto aparte tanto del precio de venta como del costo_producto
-- manual ya existente. La vieja tabla "materiales" (catálogo compartido)
-- no se recrea: este formato de carga no la necesita.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producto_materiales (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  cantidad NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  orden SMALLINT NOT NULL DEFAULT 1,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_producto_materiales_producto ON producto_materiales(producto_id, orden);

-- ---------------------------------------------------------------------
-- MAIL RECEPTOR DE CONSULTAS (formulario de Contacto de la web pública)
-- Clave más en la tabla "configuracion" existente. A propósito NO se
-- agrega a configuracionPorDefecto (server/comun.js): así ni siquiera un
-- llamado directo a GET /api/configuracion/valores con un token de
-- "admin" o "empleado" puede leerla. Sólo se lee/edita desde los
-- endpoints dedicados GET/PUT /api/configuracion/mail-receptor,
-- restringidos a "super_admin".
-- ---------------------------------------------------------------------
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('mail_receptor_consultas', '', 'Correo que recibe las consultas del formulario de Contacto de la web publica. Exclusivo de super_admin. Si queda vacio se usa negocio_email como respaldo.')
ON CONFLICT (clave) DO NOTHING;
