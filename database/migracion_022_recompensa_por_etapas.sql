-- Migración 022: selección de etapas por jornada para el premio del equipo.
-- Idempotente. Este cambio también está incluido en database/schema.sql.
CREATE TABLE IF NOT EXISTS produccion_diaria_etapas (
  fecha DATE NOT NULL,
  pedido_etapa_id BIGINT NOT NULL REFERENCES pedido_etapas(id) ON DELETE CASCADE,
  horas_hombre NUMERIC(8,2) NOT NULL CHECK (horas_hombre > 0),
  PRIMARY KEY (fecha, pedido_etapa_id)
);
CREATE INDEX IF NOT EXISTS idx_produccion_diaria_etapas_etapa ON produccion_diaria_etapas(pedido_etapa_id);
