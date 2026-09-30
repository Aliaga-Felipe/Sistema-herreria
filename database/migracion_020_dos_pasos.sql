-- =====================================================================
-- Migración 020: verificación en dos pasos por email (tabla codigos_acceso).
-- Idempotente y ya incluida en database/schema.sql.
-- =====================================================================
-- ---------------------------------------------------------------------
-- VERIFICACIÓN EN DOS PASOS (código por email al iniciar sesión)
-- Cada inicio de sesión con contraseña correcta crea un "desafío": un código
-- de 6 dígitos que se manda por email. El código NUNCA se guarda: sólo su
-- hash HMAC con una sal propia. Vence a los 10 minutos, se usa una sola vez
-- (usado_en), admite 5 intentos y como mucho 3 envíos por desafío. Los
-- controles viven en server/rutas/autenticacion.js. Se borran solos al día.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS codigos_acceso (
  id BIGSERIAL PRIMARY KEY,
  desafio_id VARCHAR(64) NOT NULL UNIQUE,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash VARCHAR(64) NOT NULL,
  sal VARCHAR(32) NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  intentos SMALLINT NOT NULL DEFAULT 0,
  envios SMALLINT NOT NULL DEFAULT 1,
  ultimo_envio_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_codigos_acceso_usuario ON codigos_acceso(usuario_id, creado_en);
