CREATE TYPE rol_usuario AS ENUM ('ADMIN', 'EMPLEADO');
CREATE TYPE estado_pedido AS ENUM ('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO');
CREATE TYPE estado_etapa AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'BLOQUEADA');

CREATE TABLE usuarios (
  id BIGSERIAL PRIMARY KEY, nombre VARCHAR(120) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL,
  contrasena_hash TEXT NOT NULL, rol rol_usuario NOT NULL DEFAULT 'EMPLEADO', activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE recuperaciones_contrasena (
  id BIGSERIAL PRIMARY KEY, usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL, usado_en TIMESTAMPTZ, vence_en TIMESTAMPTZ NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE equipos (id BIGSERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL, activo BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE equipo_integrantes (equipo_id BIGINT REFERENCES equipos(id) ON DELETE CASCADE, usuario_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE, PRIMARY KEY(equipo_id, usuario_id));
CREATE TABLE productos (id BIGSERIAL PRIMARY KEY, nombre VARCHAR(160) NOT NULL, descripcion TEXT, activo BOOLEAN NOT NULL DEFAULT TRUE, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE etapas_producto (id BIGSERIAL PRIMARY KEY, producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE, nombre VARCHAR(120) NOT NULL, descripcion TEXT, orden SMALLINT NOT NULL CHECK(orden > 0), puntos_recompensa INTEGER NOT NULL DEFAULT 0 CHECK(puntos_recompensa >= 0), UNIQUE(producto_id, orden));
CREATE TABLE clientes (id BIGSERIAL PRIMARY KEY, nombre VARCHAR(150) NOT NULL, telefono VARCHAR(40), email VARCHAR(255), direccion TEXT);
CREATE TABLE pedidos (id BIGSERIAL PRIMARY KEY, codigo VARCHAR(30) UNIQUE NOT NULL, cliente_id BIGINT REFERENCES clientes(id), producto_id BIGINT NOT NULL REFERENCES productos(id), equipo_id BIGINT REFERENCES equipos(id), cantidad INTEGER NOT NULL DEFAULT 1 CHECK(cantidad > 0), estado estado_pedido NOT NULL DEFAULT 'PENDIENTE', prioridad SMALLINT NOT NULL DEFAULT 0, fecha_entrega DATE, notas TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), terminado_en TIMESTAMPTZ);
CREATE TABLE pedido_etapas (id BIGSERIAL PRIMARY KEY, pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE, etapa_producto_id BIGINT NOT NULL REFERENCES etapas_producto(id), responsable_id BIGINT REFERENCES usuarios(id), estado estado_etapa NOT NULL DEFAULT 'PENDIENTE', iniciado_en TIMESTAMPTZ, completado_en TIMESTAMPTZ, observaciones TEXT, UNIQUE(pedido_id, etapa_producto_id));
CREATE TABLE recompensas (id BIGSERIAL PRIMARY KEY, pedido_id BIGINT NOT NULL REFERENCES pedidos(id), equipo_id BIGINT NOT NULL REFERENCES equipos(id), puntos INTEGER NOT NULL CHECK(puntos > 0), monto NUMERIC(12,2), motivo TEXT NOT NULL, otorgado_por BIGINT REFERENCES usuarios(id), otorgado_en TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX idx_pedidos_estado ON pedidos(estado); CREATE INDEX idx_pedido_etapas_responsable ON pedido_etapas(responsable_id, estado);

CREATE VIEW vista_pedidos_activos AS
SELECT p.id,p.codigo,p.estado,p.fecha_entrega, pr.nombre AS producto, c.nombre AS cliente,
 ROUND(100.0 * COUNT(pe.id) FILTER (WHERE pe.estado='COMPLETADA') / NULLIF(COUNT(pe.id),0)) AS avance
FROM pedidos p JOIN productos pr ON pr.id=p.producto_id LEFT JOIN clientes c ON c.id=p.cliente_id LEFT JOIN pedido_etapas pe ON pe.pedido_id=p.id
WHERE p.estado IN ('PENDIENTE','EN_PRODUCCION','PAUSADO') GROUP BY p.id,pr.nombre,c.nombre;
