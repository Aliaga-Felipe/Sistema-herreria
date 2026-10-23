-- =====================================================================
-- Un atelier - Disponibilidad en los productos (delta idempotente)
-- Texto corto y opcional por producto (hasta 40 caracteres, ej.
-- "Disponible", "Próximamente", "Consultar") que el admin carga en el
-- panel y la web pública muestra en la tarjeta del catálogo y en el
-- detalle. Los productos existentes quedan en NULL y no cambian en la
-- web. Este mismo cambio ya está en database/schema.sql: alcanza con
-- `node server/scripts/aplicar-schema.js`.
-- =====================================================================

-- Disponibilidad (migracion_024): texto corto y opcional que carga el admin
-- (ej. "Disponible", "Próximamente", "Consultar") y la web muestra en la
-- tarjeta del catálogo y en el detalle del producto (ver ProductCard.jsx y
-- ProductoDetalle.jsx). Nullable a propósito: vacío = NULL y la web no
-- muestra nada, así los productos existentes no cambian.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS disponibilidad VARCHAR(40);
