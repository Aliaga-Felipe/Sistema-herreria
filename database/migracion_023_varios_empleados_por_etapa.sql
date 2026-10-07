-- =====================================================================
-- Un atelier - Varios empleados por etapa (delta idempotente)
-- Cada etapa de un pedido indica cuántos empleados necesita
-- (empleados_necesarios) y se asigna a todos ellos
-- (pedido_etapa_empleados). La etapa le aparece a cada uno en Mis tareas
-- y cualquiera de ellos la completa. Las horas-hombre de la etapa siguen
-- siendo el total (2 empleados × 3 hs = 6 hs-hombre): la recompensa del
-- equipo no cambia. Este mismo cambio ya está en database/schema.sql:
-- alcanza con `node server/scripts/aplicar-schema.js`.
-- =====================================================================

-- Varios empleados por etapa (migracion_023). Una etapa puede necesitar
-- varios empleados trabajando juntos (empleados_necesarios): se asignan
-- todos en pedido_etapa_empleados, la etapa le aparece a cada uno en Mis
-- tareas y cualquiera de ellos la completa. horas_hombre sigue siendo el
-- TOTAL de la etapa (2 empleados × 3 hs = 6 hs-hombre), así que el reparto
-- contra la estimación y la recompensa no cambian; en las estadísticas
-- por empleado las horas de la etapa se reparten en partes iguales entre
-- sus asignados. responsable_id queda como el primer asignado (lo
-- mantiene la API, ver guardarEmpleadosEtapa en server/comun.js). Las
-- etapas anteriores pasan su responsable a la tabla nueva.
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS empleados_necesarios SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS pedido_etapas_empleados_necesarios_check;
ALTER TABLE pedido_etapas ADD CONSTRAINT pedido_etapas_empleados_necesarios_check CHECK (empleados_necesarios BETWEEN 1 AND 10);
CREATE TABLE IF NOT EXISTS pedido_etapa_empleados (
  pedido_etapa_id BIGINT NOT NULL REFERENCES pedido_etapas(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  orden SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (pedido_etapa_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_pedido_etapa_empleados_usuario ON pedido_etapa_empleados(usuario_id);
INSERT INTO pedido_etapa_empleados (pedido_etapa_id, usuario_id, orden)
SELECT pe.id, pe.responsable_id, 1 FROM pedido_etapas pe
WHERE pe.responsable_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pedido_etapa_empleados x WHERE x.pedido_etapa_id = pe.id)
ON CONFLICT DO NOTHING;

DROP VIEW IF EXISTS vista_rendimiento_empleados;
DROP VIEW IF EXISTS vista_tareas_empleado;

-- Bandeja unica de trabajo del empleado: etapas de pedido + etapas de tareas libres.
-- iniciado_en, fecha_entrega y prioridad viajan solo para etapas de pedido (las
-- tareas libres no tienen fecha de entrega). Ya no hay columna de cliente:
-- los pedidos no tienen cliente. horas_hombre es lo que vale la etapa en la
-- producción diaria; en las tareas libres sale de sus minutos.
-- asignados: TODOS los empleados de la etapa, en orden (una etapa de pedido
-- puede tener varios, ver pedido_etapa_empleados; una tarea libre tiene a
-- lo sumo uno). asignado_a es el primero, por compatibilidad: para saber
-- si una etapa es de alguien se usa "usuario = ANY(asignados)".
CREATE VIEW vista_tareas_empleado AS
SELECT 'PEDIDO'::text AS origen,
       pe.id::bigint AS id,
       pe.pedido_id::bigint AS contenedor_id,
       p.codigo::text AS referencia,
       COALESCE(pr.nombre, 'Pedido')::text AS titulo,
       pe.nombre::text AS etapa,
       pe.orden::int AS orden,
       asig.ids[1]::bigint AS asignado_a,
       pe.estado::text AS estado,
       pe.minutos_estimados::int AS minutos_estimados,
       pe.minutos_reales::int AS minutos_reales,
       pe.costo_estimado::numeric(12,2) AS costo,
       pe.semaforo AS semaforo,
       pe.completado_en AS completado_en,
       pe.observaciones::text AS observaciones,
       pe.iniciado_en AS iniciado_en,
       p.fecha_entrega AS fecha_entrega,
       p.prioridad::int AS prioridad,
       pe.horas_hombre::numeric(8,2) AS horas_hombre,
       asig.ids::bigint[] AS asignados,
       pe.empleados_necesarios::int AS empleados_necesarios
FROM pedido_etapas pe
JOIN pedidos p ON p.id = pe.pedido_id
LEFT JOIN pedido_items pi ON pi.id = pe.pedido_item_id
LEFT JOIN productos pr ON pr.id = pi.producto_id
CROSS JOIN LATERAL (
  SELECT ARRAY(SELECT pee.usuario_id FROM pedido_etapa_empleados pee
               WHERE pee.pedido_etapa_id = pe.id ORDER BY pee.orden, pee.usuario_id) AS ids
) asig
UNION ALL
SELECT 'TAREA'::text,
       te.id::bigint,
       t.id::bigint,
       ('T-' || t.id)::text,
       t.titulo::text,
       te.nombre::text,
       te.orden::int,
       t.asignado_a::bigint,
       (CASE WHEN te.realizada THEN 'COMPLETADA' ELSE 'PENDIENTE' END)::text,
       te.minutos_estimados::int,
       te.minutos_reales::int,
       te.costo::numeric(12,2),
       te.semaforo,
       te.completada_en,
       t.descripcion::text,
       NULL::timestamptz,
       NULL::date,
       NULL::int,
       ROUND(te.minutos_estimados / 60.0, 2)::numeric(8,2),
       (CASE WHEN t.asignado_a IS NULL THEN ARRAY[]::bigint[] ELSE ARRAY[t.asignado_a] END)::bigint[],
       1
FROM tarea_etapas te
JOIN tareas t ON t.id = te.tarea_id;

-- Rendimiento consolidado por empleado (base del apartado de estadisticas).
-- Cuenta cada etapa en la que participó el empleado (ver "asignados").
CREATE VIEW vista_rendimiento_empleados AS
SELECT u.id, u.nombre, u.email, u.activo,
       COUNT(v.id) FILTER (WHERE v.estado = 'COMPLETADA')::int AS completadas,
       COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA')::int AS pendientes,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'VERDE')::int AS verdes,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'AMARILLO')::int AS amarillos,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'ROJO')::int AS rojos,
       COALESCE(SUM(v.minutos_estimados) FILTER (WHERE v.estado = 'COMPLETADA'), 0)::int AS minutos_estimados,
       COALESCE(SUM(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA'), 0)::int AS minutos_reales,
       COALESCE(ROUND(AVG(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA')), 0)::int AS promedio_minutos,
       COALESCE((SELECT SUM(r.monto) FROM recompensas r WHERE r.usuario_id = u.id), 0)::numeric(12,2) AS recompensas_monto
FROM usuarios u
LEFT JOIN vista_tareas_empleado v ON u.id = ANY(v.asignados)
WHERE LOWER(u.rol::text) = 'empleado'
GROUP BY u.id;
