-- =====================================================================
-- Migración 015: objetivo "Terminar un pedido específico" en Producción
-- diaria (ver server/rutas/produccion.js y src/panel-produccion.jsx).
--
-- Si ya ejecutaste schema.sql con esta versión no hace falta correrla
-- aparte. Para bases existentes, aplicala una sola vez.
-- =====================================================================

-- objetivos_produccion admite dos tipos: 'producto' (cantidad diaria de
-- un producto, el de siempre) y 'pedido' (terminar un pedido puntual).
-- El objetivo de pedido no tiene producto ni cantidad: se cumple cuando
-- el pedido pasa a TERMINADO. Las columnas de recompensa quedan por
-- compatibilidad, pero la interfaz ya no las pide.
ALTER TABLE objetivos_produccion ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'producto';
ALTER TABLE objetivos_produccion ADD COLUMN IF NOT EXISTS pedido_id BIGINT UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE;
ALTER TABLE objetivos_produccion ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE objetivos_produccion ALTER COLUMN cantidad_objetivo DROP NOT NULL;
ALTER TABLE objetivos_produccion DROP CONSTRAINT IF EXISTS objetivos_produccion_tipo_check;
ALTER TABLE objetivos_produccion ADD CONSTRAINT objetivos_produccion_tipo_check CHECK (
  (tipo = 'producto' AND producto_id IS NOT NULL AND cantidad_objetivo IS NOT NULL)
  OR (tipo = 'pedido' AND pedido_id IS NOT NULL)
);
