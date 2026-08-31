CREATE TYPE rol_usuario AS ENUM ('admin', 'empleado');
CREATE TYPE estado_tarea AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'REALIZADA');

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  contrasena_hash TEXT NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'empleado',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), 
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tareas (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(180) NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  estado estado_tarea NOT NULL DEFAULT 'PENDIENTE',
  asignado_a BIGINT NOT NULL REFERENCES usuarios(id),
  creado_por BIGINT NOT NULL REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tarea_etapas (
  id BIGSERIAL PRIMARY KEY,
  tarea_id BIGINT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  orden SMALLINT NOT NULL CHECK (orden > 0),
  minutos_estimados INTEGER NOT NULL CHECK (minutos_estimados > 0),
  realizada BOOLEAN NOT NULL DEFAULT FALSE,
  completada_en TIMESTAMPTZ,
  UNIQUE(tarea_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_tareas_asignado_estado ON tareas(asignado_a, estado);
CREATE INDEX IF NOT EXISTS idx_tarea_etapas_tarea ON tarea_etapas(tarea_id, orden);

-- El registro público siempre crea empleados. Para otorgar el primer admin:
-- UPDATE usuarios SET rol = 'admin' WHERE email = 'tu-correo@ejemplo.com';



CREATE TYPE  rol_usuario AS ENUM ('ADMIN', 'EMPLEADO');
CREATE TYPE estado_pedido AS ENUM ('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO');
CREATE TYPE estado_etapa AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA');

CREATE TABLE IF NOT EXISTS recuperaciones_contrasena (
  id BIGSERIAL PRIMARY KEY, usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL, usado_en TIMESTAMPTZ, vence_en TIMESTAMPTZ NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS equipos (id BIGSERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL, activo BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS equipo_integrantes (equipo_id BIGINT REFERENCES equipos(id) ON DELETE CASCADE, usuario_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE, PRIMARY KEY(equipo_id, usuario_id));
CREATE TABLE IF NOT EXISTS productos (id BIGSERIAL PRIMARY KEY, nombre VARCHAR(160) NOT NULL, descripcion TEXT, activo BOOLEAN NOT NULL DEFAULT TRUE, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS etapas_producto (id BIGSERIAL PRIMARY KEY, producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE, nombre VARCHAR(120) NOT NULL, descripcion TEXT, orden SMALLINT NOT NULL CHECK(orden > 0), puntos_recompensa INTEGER NOT NULL DEFAULT 0 CHECK(puntos_recompensa >= 0), UNIQUE(producto_id, orden));
CREATE TABLE IF NOT EXISTS clientes (id BIGSERIAL PRIMARY KEY, nombre VARCHAR(150) NOT NULL, telefono VARCHAR(40), email VARCHAR(255), direccion TEXT);
CREATE TABLE IF NOT EXISTS pedidos (id BIGSERIAL PRIMARY KEY, codigo VARCHAR(30) UNIQUE NOT NULL, cliente_id BIGINT REFERENCES clientes(id), producto_id BIGINT NOT NULL REFERENCES productos(id), equipo_id BIGINT REFERENCES equipos(id), cantidad INTEGER NOT NULL DEFAULT 1 CHECK(cantidad > 0), estado estado_pedido NOT NULL DEFAULT 'PENDIENTE', prioridad SMALLINT NOT NULL DEFAULT 0, fecha_entrega DATE, notas TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), terminado_en TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS pedido_etapas (id BIGSERIAL PRIMARY KEY, pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE, etapa_producto_id BIGINT NOT NULL REFERENCES etapas_producto(id), responsable_id BIGINT REFERENCES usuarios(id), estado estado_etapa NOT NULL DEFAULT 'PENDIENTE', iniciado_en TIMESTAMPTZ, completado_en TIMESTAMPTZ, observaciones TEXT, UNIQUE(pedido_id, etapa_producto_id));
CREATE TABLE IF NOT EXISTS recompensas (id BIGSERIAL PRIMARY KEY, pedido_id BIGINT NOT NULL REFERENCES pedidos(id), equipo_id BIGINT NOT NULL REFERENCES equipos(id), puntos INTEGER NOT NULL CHECK(puntos > 0), monto NUMERIC(12,2), motivo TEXT NOT NULL, otorgado_por BIGINT REFERENCES usuarios(id), otorgado_en TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado); CREATE INDEX IF NOT EXISTS idx_pedido_etapas_responsable ON pedido_etapas(responsable_id, estado);

CREATE VIEW vista_pedidos_activos AS
SELECT p.id,p.codigo,p.estado,p.fecha_entrega, pr.nombre AS producto, c.nombre AS cliente,
 ROUND(100.0 * COUNT(pe.id) FILTER (WHERE pe.estado='COMPLETADA') / NULLIF(COUNT(pe.id),0)) AS avance
FROM pedidos p JOIN productos pr ON pr.id=p.producto_id LEFT JOIN clientes c ON c.id=p.cliente_id LEFT JOIN pedido_etapas pe ON pe.pedido_id=p.id
WHERE p.estado IN ('PENDIENTE','EN_PRODUCCION','PAUSADO') GROUP BY p.id,pr.nombre,c.nombre;