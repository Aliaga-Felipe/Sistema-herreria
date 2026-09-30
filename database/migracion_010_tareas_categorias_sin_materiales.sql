-- =====================================================================
-- Un atelier - Migración 010
-- 1) Se elimina la sección Materiales (tablas materiales y
--    producto_materiales). Ninguna pantalla ni endpoint las usa ya.
--    ATENCIÓN: borra los materiales cargados y su vínculo con productos.
-- 2) Categorías de producto fijas (actualizado en la migración 011:
--    ver la migración 012: Mesas, Mesitas ratoneras y Fogoneros).
--    Cualquier otra categoría se elimina y sus productos quedan "sin
--    categoría" (la categoría ahora es opcional).
-- La asignación de empleados a etapas pasa a hacerse solo desde Tareas:
-- no requiere cambios de esquema (sigue usando pedido_etapas.responsable_id
-- y tareas.asignado_a).
-- Idempotente: puede correrse más de una vez. schema.sql ya incluye estos
-- mismos cambios (alcanza con `node server/scripts/aplicar-schema.js`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- MATERIALES (ELIMINADO)
-- La sección Materiales se quitó de la aplicación por completo: ningún
-- endpoint ni pantalla la usa. Se borran sus tablas si todavía existen.
-- El costo de un producto queda en mano de obra (horas_hombre × costo de
-- la hora configurado abajo) + costo del producto cargado a mano.
-- pedido_items.costo_materiales_unitario se conserva solo para no alterar
-- el costo guardado de pedidos viejos (los nuevos lo guardan en 0).
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS producto_materiales;
DROP TABLE IF EXISTS materiales;

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

