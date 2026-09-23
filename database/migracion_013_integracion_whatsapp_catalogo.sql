-- =====================================================================
-- El Atelier - Migración 013: integración con el catálogo de WhatsApp Business
--
-- Cada producto activo y "Publicado en la web" se sincroniza automáticamente
-- contra el catálogo de Meta conectado al WhatsApp Business del cliente (ver
-- server/meta-whatsapp.js e INTEGRACION_WHATSAPP.md para la configuración
-- completa). Se agregan estas columnas a `productos`:
--
-- 1) whatsapp_retailer_id: identificador propio y estable que se envía a
--    Meta como "retailer_id". Se genera a partir del id interno (BIGSERIAL)
--    la primera vez que el producto se sincroniza. A propósito NO reutiliza
--    chapita_id (la chapita vintage "PC N°..." que ve el público en la web,
--    ver migracion_009 y ChapitaProducto.jsx) ni id_pieza (columna agregada
--    en migracion_008 que nunca se llegó a usar en el código): son
--    identificadores con otro propósito y el admin los edita a mano.
-- 2) whatsapp_product_id: id numérico que devuelve Meta al crear/actualizar
--    el ítem del catálogo. Solo informativo/diagnóstico: la sincronización
--    no lo necesita porque el endpoint de Meta hace upsert por retailer_id.
-- 3) whatsapp_sync_estado: NO_SINCRONIZADO | PENDIENTE | SINCRONIZADO | ERROR.
-- 4) whatsapp_sync_error: motivo del último error (sin tokens ni datos
--    sensibles), para poder diagnosticar sin mirar los logs del servidor.
-- 5) whatsapp_sync_actualizado_en: fecha del último intento de sincronizar.
--
-- Idempotente. schema.sql ya incluye estos mismos cambios (alcanza con
-- `node server/scripts/aplicar-schema.js`).
-- =====================================================================

DO $$ BEGIN CREATE TYPE whatsapp_sync_estado AS ENUM ('NO_SINCRONIZADO', 'PENDIENTE', 'SINCRONIZADO', 'ERROR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS whatsapp_retailer_id VARCHAR(80);
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_whatsapp_retailer_id_key;
ALTER TABLE productos ADD CONSTRAINT productos_whatsapp_retailer_id_key UNIQUE (whatsapp_retailer_id);

ALTER TABLE productos ADD COLUMN IF NOT EXISTS whatsapp_product_id VARCHAR(80);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS whatsapp_sync_estado whatsapp_sync_estado NOT NULL DEFAULT 'NO_SINCRONIZADO';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS whatsapp_sync_error TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS whatsapp_sync_actualizado_en TIMESTAMPTZ;
