-- =====================================================================
-- El Atelier - Catálogo público (parte 5)
-- Identificador visible de pieza por producto ("chapita" vintage
-- numerada). Único por producto, con restricción real en la base (no
-- sólo validación en el frontend). Nullable a propósito: los productos
-- existentes sin ID asignado simplemente no muestran chapita.
--
-- Si una instalación anterior llegó a tener la columna plate_id (versión
-- previa de esta función, nunca publicada en producción), se renombra
-- para no perder los valores ya cargados.
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'plate_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'id_pieza'
  ) THEN
    ALTER TABLE productos RENAME COLUMN plate_id TO id_pieza;
  END IF;
END $$;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS id_pieza VARCHAR(20);

ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_id_pieza_key;
ALTER TABLE productos ADD CONSTRAINT productos_id_pieza_key UNIQUE (id_pieza);
