-- =====================================================================
-- Migracion 003 - Detalle ampliado de tareas (fecha de inicio, fecha de
-- entrega y prioridad en la bandeja de "Tareas de producción")
--
-- El panel de Tareas del admin pasó de tabla a tarjetas + modal de
-- detalle. El modal muestra fecha de inicio, fecha de entrega y
-- prioridad cuando existen: estas tres columnas ya vivían en
-- pedido_etapas / pedidos, pero la vista vista_tareas_empleado no las
-- exponía. Esta migración solo agrega columnas al final de la vista
-- (no borra ni renombra nada), así que es segura sobre una base en uso.
--
-- vista_rendimiento_empleados se apoya en vista_tareas_empleado, así que
-- hay que soltarla y recrearla igual que en schema.sql (sin cambios en
-- su definición) para poder recrear la vista de tareas debajo.
--
-- Ejecutar con:  psql -d atelier_herreria -f database/migracion_003_detalle_tareas.sql
-- Es idempotente: se puede correr mas de una vez sin efectos adversos.
-- También queda aplicada si en cambio se vuelve a correr database/schema.sql
-- completo (es idempotente y ya incluye esta definición de la vista).
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS vista_rendimiento_empleados;
DROP VIEW IF EXISTS vista_tareas_empleado;

CREATE VIEW vista_tareas_empleado AS
SELECT 'PEDIDO'::text AS origen,
       pe.id::bigint AS id,
       pe.pedido_id::bigint AS contenedor_id,
       p.codigo::text AS referencia,
       COALESCE(pr.nombre, 'Pedido')::text AS titulo,
       pe.nombre::text AS etapa,
       pe.orden::int AS orden,
       pe.responsable_id::bigint AS asignado_a,
       pe.estado::text AS estado,
       pe.minutos_estimados::int AS minutos_estimados,
       pe.minutos_reales::int AS minutos_reales,
       pe.costo_estimado::numeric(12,2) AS costo,
       pe.semaforo AS semaforo,
       pe.completado_en AS completado_en,
       COALESCE(c.nombre, 'Sin cliente')::text AS cliente,
       pe.observaciones::text AS observaciones,
       pe.iniciado_en AS iniciado_en,
       p.fecha_entrega AS fecha_entrega,
       p.prioridad::int AS prioridad
FROM pedido_etapas pe
JOIN pedidos p ON p.id = pe.pedido_id
LEFT JOIN pedido_items pi ON pi.id = pe.pedido_item_id
LEFT JOIN productos pr ON pr.id = pi.producto_id
LEFT JOIN clientes c ON c.id = p.cliente_id
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
       'Trabajo interno'::text,
       t.descripcion::text,
       NULL::timestamptz,
       NULL::date,
       NULL::int
FROM tarea_etapas te
JOIN tareas t ON t.id = te.tarea_id;

-- Sin cambios respecto de schema.sql: se recrea tal cual porque dependía
-- de la vista anterior y DROP la eliminó de paso.
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
LEFT JOIN vista_tareas_empleado v ON v.asignado_a = u.id
WHERE LOWER(u.rol::text) = 'empleado'
GROUP BY u.id;

COMMIT;
