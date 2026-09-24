-- =====================================================================
-- El Atelier - Migración 012
-- 1) Borradores: un producto sin "Publicar en la web" puede guardarse sin
--    precio, descripción técnica, historia ni categoría.
-- 2) Publicar exige nombre, ID, precio > 0, descripción técnica, historia
--    y categoría (restricción productos_publicado_completo). Los productos
--    publicados que no cumplen pasan a borrador (dejan de verse en la web
--    hasta que se completen y se vuelvan a publicar).
-- 3) Categorías en español: Mesas, Mesitas ratoneras y Fogoneros.
-- Idempotente. schema.sql ya incluye estos mismos cambios (alcanza con
-- `node server/scripts/aplicar-schema.js`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATEGORIAS DE PRODUCTO (lista fija)
-- Las categorías disponibles son exactamente tres, en español: Mesas,
-- Mesitas ratoneras y Fogoneros (mismos slugs que usa CATEGORIAS_PRODUCTO
-- en server/comun.js). La categoría es opcional en un borrador y
-- obligatoria para publicar en la web. Las variantes anteriores (Tables /
-- Coffee Tables / Fire Pits, Mesas ratonas) se renombran para conservar los
-- productos que ya tenían asignados. Cualquier otra categoría se elimina y
-- sus productos quedan "sin categoría" (y, por lo tanto, sin publicar).
-- ---------------------------------------------------------------------
UPDATE categorias SET slug = 'mesas'
WHERE id = (SELECT id FROM categorias WHERE slug IN ('tables') ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM categorias WHERE slug = 'mesas');
UPDATE categorias SET slug = 'mesitas-ratoneras'
WHERE id = (SELECT id FROM categorias WHERE slug IN ('coffee-tables', 'mesas-ratonas') ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM categorias WHERE slug = 'mesitas-ratoneras');
UPDATE categorias SET slug = 'fogoneros'
WHERE id = (SELECT id FROM categorias WHERE slug IN ('fire-pits') ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM categorias WHERE slug = 'fogoneros');

INSERT INTO categorias (nombre, slug, descripcion, orden, activo) VALUES
  ('Mesas', 'mesas', 'Mesas de hierro y madera para comedor y exterior.', 1, TRUE),
  ('Mesitas ratoneras', 'mesitas-ratoneras', 'Mesitas ratoneras y de centro en hierro y madera.', 2, TRUE),
  ('Fogoneros', 'fogoneros', 'Fogoneros de hierro para exterior.', 3, TRUE)
ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, activo = TRUE;

-- Un producto sin categoría no puede estar publicado: si todavía existe la
-- columna "publicado", los que pierden la categoría pasan a borrador.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'publicado'
  ) THEN
    UPDATE productos SET categoria_id = NULL, publicado = FALSE
    WHERE categoria_id IN (SELECT id FROM categorias WHERE slug NOT IN ('mesas', 'mesitas-ratoneras', 'fogoneros'));
  ELSE
    UPDATE productos SET categoria_id = NULL
    WHERE categoria_id IN (SELECT id FROM categorias WHERE slug NOT IN ('mesas', 'mesitas-ratoneras', 'fogoneros'));
  END IF;
END $$;
DELETE FROM categorias WHERE slug NOT IN ('mesas', 'mesitas-ratoneras', 'fogoneros');

-- ---------------------------------------------------------------------
-- BORRADOR vs. PUBLICADO (validación en la base de datos)
-- Un producto sin publicar es un borrador y puede tener datos incompletos
-- (precio, descripción técnica, historia, categoría). Para estar publicado
-- en la web necesita nombre, ID (chapita), precio > 0, descripción
-- técnica, historia y categoría: la misma regla que valida la API (ver
-- validarPublicacion en server/rutas/productos.js). Los productos que hoy
-- están publicados sin esos datos pasan a borrador antes de aplicar la
-- restricción.
-- ---------------------------------------------------------------------
UPDATE productos SET publicado = FALSE
WHERE publicado AND NOT (
    precio_venta > 0
    AND btrim(nombre) <> ''
    AND btrim(COALESCE(chapita_id, '')) <> ''
    AND btrim(COALESCE(descripcion, '')) <> ''
    AND btrim(COALESCE(historia, '')) <> ''
    AND categoria_id IS NOT NULL
);
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_publicado_completo;
ALTER TABLE productos ADD CONSTRAINT productos_publicado_completo CHECK (
  NOT publicado OR (
    precio_venta > 0
    AND btrim(nombre) <> ''
    AND btrim(COALESCE(chapita_id, '')) <> ''
    AND btrim(COALESCE(descripcion, '')) <> ''
    AND btrim(COALESCE(historia, '')) <> ''
    AND categoria_id IS NOT NULL
  )
);

