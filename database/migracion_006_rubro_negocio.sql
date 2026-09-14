-- =====================================================================
-- El Atelier - Catálogo público (parte 3)
-- Delta idempotente: el texto corto que acompaña al nombre del negocio
-- ("Herrería de diseño") pasa a ser editable desde Configuración en vez
-- de estar fijo en el código del encabezado y la portada.
-- =====================================================================

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('negocio_rubro', 'Herrería de diseño', 'Frase corta que acompaña al nombre del negocio en el encabezado y la portada de la web pública.')
ON CONFLICT (clave) DO NOTHING;
