CREATE TYPE rol_usuario AS ENUM ('admin', 'empleado');
CREATE TYPE estado_tarea AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'REALIZADA');

CREATE TABLE usuarios (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  contrasena_hash TEXT NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'empleado',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tareas (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(180) NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  estado estado_tarea NOT NULL DEFAULT 'PENDIENTE',
  asignado_a BIGINT NOT NULL REFERENCES usuarios(id),
  creado_por BIGINT NOT NULL REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tarea_etapas (
  id BIGSERIAL PRIMARY KEY,
  tarea_id BIGINT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  orden SMALLINT NOT NULL CHECK (orden > 0),
  minutos_estimados INTEGER NOT NULL CHECK (minutos_estimados > 0),
  realizada BOOLEAN NOT NULL DEFAULT FALSE,
  completada_en TIMESTAMPTZ,
  UNIQUE(tarea_id, orden)
);

CREATE INDEX idx_tareas_asignado_estado ON tareas(asignado_a, estado);
CREATE INDEX idx_tarea_etapas_tarea ON tarea_etapas(tarea_id, orden);

-- El registro público siempre crea empleados. Para otorgar el primer admin:
-- UPDATE usuarios SET rol = 'admin' WHERE email = 'tu-correo@ejemplo.com';
