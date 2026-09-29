-- =====================================================================
-- Migración 017: precio de venta opcional + categorías creadas desde el panel
-- (database/schema.sql ya incluye estos mismos cambios: si lo volvés a
-- aplicar con `node server/scripts/aplicar-schema.js` no hace falta
-- correr este archivo aparte). No borra ni modifica datos existentes.
-- =====================================================================

-- 1) Precio de venta OPCIONAL: NULL = "sin precio". La web pública muestra
--    "Consultar precio" y el panel "Sin precio". Los productos que ya
--    tienen precio no cambian (los que tenían 0 se conservan tal cual; al
--    mostrarlos también se tratan como "sin precio").
ALTER TABLE productos ALTER COLUMN precio_venta DROP NOT NULL;

-- 2) Publicar en la web ya no exige precio (sí nombre, ID, descripción
--    técnica, historia y categoría, igual que antes).
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_publicado_completo;
ALTER TABLE productos ADD CONSTRAINT productos_publicado_completo CHECK (
  NOT publicado OR (
    btrim(nombre) <> ''
    AND btrim(COALESCE(chapita_id, '')) <> ''
    AND btrim(COALESCE(descripcion, '')) <> ''
    AND btrim(COALESCE(historia, '')) <> ''
    AND categoria_id IS NOT NULL
  )
);

-- 3) Categorías: el esquema ya no borra las categorías distintas de Mesas,
--    Mesitas ratoneras y Fogoneros, así que las que se creen desde el panel
--    (sección "Categorías") se conservan. No requiere cambios de tablas: se
--    reutiliza la tabla `categorias` existente.
