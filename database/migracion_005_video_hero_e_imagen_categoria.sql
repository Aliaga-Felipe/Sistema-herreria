-- =====================================================================
-- El Atelier - Catálogo público (parte 2)
-- Delta idempotente: agrega una foto propia por categoría (en vez de
-- depender siempre de la foto de algún producto) y un video de fondo
-- opcional para el hero de la portada.
-- =====================================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS imagen_url TEXT;

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('negocio_hero_video', '', 'URL del video de fondo del hero de portada (opcional, se sube desde Configuración).')
ON CONFLICT (clave) DO NOTHING;
