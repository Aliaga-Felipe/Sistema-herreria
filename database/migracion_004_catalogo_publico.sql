-- =====================================================================
-- El Atelier - Catálogo público
-- Delta idempotente para bases que ya tenían el esquema anterior. Agrega
-- categorías, galería de imágenes, slugs amigables para URL, el
-- indicador de producto destacado y los datos públicos del negocio
-- (WhatsApp, redes, descripción) usados por la web pública.
-- No crea ninguna tabla paralela de productos: todo cuelga de la misma
-- tabla `productos` que ya usa el sistema interno.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATEGORÍAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  slug VARCHAR(140) UNIQUE NOT NULL,
  descripcion TEXT,
  orden SMALLINT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- PRODUCTOS: categoría, slug amigable y bandera de destacado
-- ---------------------------------------------------------------------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria_id BIGINT REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS slug VARCHAR(200);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS destacado BOOLEAN NOT NULL DEFAULT FALSE;

-- Genera un slug a partir del nombre para los productos que todavía no
-- tienen uno (instalaciones existentes). Los productos nuevos reciben su
-- slug desde la API al crearse.
UPDATE productos SET slug = LOWER(
    regexp_replace(
      regexp_replace(
        translate(nombre, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'),
        '[^a-zA-Z0-9]+', '-', 'g'
      ), '(^-+)|(-+$)', '', 'g'
    )
  ) || '-' || id
  WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_slug ON productos(slug);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);

-- ---------------------------------------------------------------------
-- GALERÍA DE IMÁGENES DEL PRODUCTO
-- Varias imágenes por producto, ordenadas, con una marcada como
-- principal (la que se usa en las grillas del catálogo).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  orden SMALLINT NOT NULL DEFAULT 0,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_producto_imagenes_producto ON producto_imagenes(producto_id, orden);

-- Sólo puede haber una imagen principal por producto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_imagenes_principal
  ON producto_imagenes(producto_id) WHERE es_principal;

-- ---------------------------------------------------------------------
-- DATOS PÚBLICOS DEL NEGOCIO
-- Reutiliza la tabla `configuracion` existente: mismo patrón clave/valor
-- que ya usa el admin para recompensas y semáforo, ahora también para los
-- datos que consume la web pública (nombre, WhatsApp, redes, dirección).
-- ---------------------------------------------------------------------
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('negocio_nombre', 'El Atelier', 'Nombre de la herrería mostrado en la web pública.'),
  ('negocio_eslogan', 'Diseño que perdura', 'Frase corta mostrada en el hero de la web pública.'),
  ('negocio_descripcion', 'Muebles y piezas de herrería artesanal, diseñados y fabricados a medida.', 'Descripción breve usada en la portada y en las meta etiquetas SEO.'),
  ('negocio_whatsapp', '5491100000000', 'Número de WhatsApp (con código de país, sin signos) para el botón de consulta. Ejemplo Argentina: 5491122334455.'),
  ('negocio_email', 'contacto@elatelier.com', 'Correo de contacto mostrado en la web pública.'),
  ('negocio_telefono', '', 'Teléfono alternativo mostrado en el pie de página (opcional).'),
  ('negocio_direccion', '', 'Dirección del taller mostrada en Contacto (opcional).'),
  ('negocio_instagram', '', 'URL del Instagram (opcional, se oculta si está vacío).'),
  ('negocio_facebook', '', 'URL del Facebook (opcional, se oculta si está vacío).'),
  ('negocio_horario', 'Lunes a viernes de 9 a 18 hs', 'Horario de atención mostrado en Contacto.')
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- CATEGORÍAS INICIALES (típicas de una herrería de muebles y objetos)
-- No se insertan si la tabla ya tiene categorías cargadas.
-- ---------------------------------------------------------------------
INSERT INTO categorias (nombre, slug, descripcion, orden)
SELECT * FROM (VALUES
  ('Mesas', 'mesas', 'Mesas de hierro y madera para comedor, centro y exterior.', 1),
  ('Sillas y bancos', 'sillas-y-bancos', 'Asientos forjados, individuales y bancos largos.', 2),
  ('Estanterías', 'estanterias', 'Estanterías y racks de hierro para el hogar y el comercio.', 3),
  ('Portones y rejas', 'portones-y-rejas', 'Portones, rejas y cerramientos a medida.', 4),
  ('Decoración', 'decoracion', 'Piezas decorativas y objetos utilitarios en hierro.', 5),
  ('Iluminación', 'iluminacion', 'Lámparas y artefactos de iluminación forjados.', 6)
) AS datos(nombre, slug, descripcion, orden)
WHERE NOT EXISTS (SELECT 1 FROM categorias);
