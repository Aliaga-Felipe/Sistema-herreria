-- =====================================================================
-- El Atelier - Migración 011
-- 1) "Publicar en la web" (productos.publicado): un producto sólo se ve en
--    la web pública si está marcado (y activo). Los productos que ya
--    existían conservan su visibilidad actual; los nuevos nacen sin
--    publicar.
-- 2) Categorías de producto fijas: Mesas, Mesitas ratoneras y Fogoneros (las
--    variantes anteriores se renombran; cualquier
--    otra se elimina y sus productos quedan sin categoría).
-- 3) Pedidos sin cliente: se elimina pedidos.cliente_id y los clientes que
--    sólo estaban asociados a pedidos (los usados por presupuestos se
--    conservan). Se recrean las vistas que usaban el cliente del pedido.
-- ATENCIÓN: el punto 3 borra datos de clientes de forma permanente.
-- Idempotente. schema.sql ya incluye estos mismos cambios (alcanza con
-- `node server/scripts/aplicar-schema.js`).
-- =====================================================================

-- "Publicar en la web": un producto sólo aparece en la web pública si el
-- admin marcó esta opción (y además está activo). Sin marcar, sigue
-- disponible en el panel pero oculto al público. Al agregar la columna por
-- primera vez, los productos que ya existían conservan su visibilidad
-- actual (publicado = activo); los productos nuevos nacen sin publicar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'publicado'
  ) THEN
    ALTER TABLE productos ADD COLUMN publicado BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE productos SET publicado = activo;
  END IF;
END $$;

DROP VIEW IF EXISTS vista_rendimiento_empleados;
DROP VIEW IF EXISTS vista_tareas_empleado;
DROP VIEW IF EXISTS vista_pedidos_activos;

-- PEDIDOS SIN CLIENTE
-- Los pedidos ya no guardan ni muestran datos de cliente. En bases que
-- todavía tienen pedidos.cliente_id se borran los clientes que sólo
-- estaban asociados a pedidos (los usados por algún presupuesto se
-- conservan) y se elimina la columna. Va después de borrar las vistas
-- porque éstas dependían de la columna.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pedidos' AND column_name = 'cliente_id'
  ) THEN
    CREATE TEMP TABLE clientes_de_pedidos ON COMMIT DROP AS
      SELECT DISTINCT cliente_id AS id FROM pedidos WHERE cliente_id IS NOT NULL;
    ALTER TABLE pedidos DROP COLUMN cliente_id;
    DELETE FROM clientes
    WHERE id IN (SELECT id FROM clientes_de_pedidos)
      AND id NOT IN (SELECT cliente_id FROM presupuestos WHERE cliente_id IS NOT NULL);
  END IF;
END $$;

-- Avance de cada pedido segun las etapas de sus productos.
CREATE VIEW vista_pedidos_activos AS
SELECT p.id, p.codigo, p.estado, p.prioridad, p.fecha_entrega, p.creado_en,
       COUNT(pe.id)::int AS etapas_totales,
       COUNT(pe.id) FILTER (WHERE pe.estado = 'COMPLETADA')::int AS etapas_completadas,
       COALESCE(ROUND(100.0 * COUNT(pe.id) FILTER (WHERE pe.estado = 'COMPLETADA') / NULLIF(COUNT(pe.id), 0)), 0)::int AS avance
FROM pedidos p
LEFT JOIN pedido_etapas pe ON pe.pedido_id = p.id
GROUP BY p.id;

-- Bandeja unica de trabajo del empleado: etapas de pedido + etapas de tareas libres.
-- iniciado_en, fecha_entrega y prioridad viajan solo para etapas de pedido (las
-- tareas libres no tienen fecha de entrega). Ya no hay columna de cliente:
-- los pedidos no tienen cliente.
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
       pe.observaciones::text AS observaciones,
       pe.iniciado_en AS iniciado_en,
       p.fecha_entrega AS fecha_entrega,
       p.prioridad::int AS prioridad
FROM pedido_etapas pe
JOIN pedidos p ON p.id = pe.pedido_id
LEFT JOIN pedido_items pi ON pi.id = pe.pedido_item_id
LEFT JOIN productos pr ON pr.id = pi.producto_id
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
       NULL::int
FROM tarea_etapas te
JOIN tareas t ON t.id = te.tarea_id;

-- Rendimiento consolidado por empleado (base del apartado de estadisticas).
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

-- ---------------------------------------------------------------------
-- CATEGORIAS DE PRODUCTO (lista fija)
-- Las categorías disponibles son exactamente tres, en español: Mesas,
-- Mesitas ratoneras y Fogoneros (mismos slugs que usa CATEGORIAS_PRODUCTO
-- en server/comun.js). La categoría es opcional en un borrador y
-- obligatoria para publicar en la web. Las variantes anteriores (Tables /
-- Coffee Tables / Fire Pits, Mesas ratonas) se renombran para conservar los
-- productos que ya tenían asignados. Cualquier otra categoría se elimina y
-- sus productos quedan "sin categoría" (y, por lo tanto, sin publicar).
-- ---------------------------------------------------------------------
UPDATE categorias SET slug = 'mesas'
WHERE id = (SELECT id FROM categorias WHERE slug IN ('tables') ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM categorias WHERE slug = 'mesas');
UPDATE categorias SET slug = 'mesitas-ratoneras'
WHERE id = (SELECT id FROM categorias WHERE slug IN ('coffee-tables', 'mesas-ratonas') ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM categorias WHERE slug = 'mesitas-ratoneras');
UPDATE categorias SET slug = 'fogoneros'
WHERE id = (SELECT id FROM categorias WHERE slug IN ('fire-pits') ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM categorias WHERE slug = 'fogoneros');

INSERT INTO categorias (nombre, slug, descripcion, orden, activo) VALUES
  ('Mesas', 'mesas', 'Mesas de hierro y madera para comedor y exterior.', 1, TRUE),
  ('Mesitas ratoneras', 'mesitas-ratoneras', 'Mesitas ratoneras y de centro en hierro y madera.', 2, TRUE),
  ('Fogoneros', 'fogoneros', 'Fogoneros de hierro para exterior.', 3, TRUE)
ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, activo = TRUE;

-- Un producto sin categoría no puede estar publicado: si todavía existe la
-- columna "publicado", los que pierden la categoría pasan a borrador.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'publicado'
  ) THEN
    UPDATE productos SET categoria_id = NULL, publicado = FALSE
    WHERE categoria_id IN (SELECT id FROM categorias WHERE slug NOT IN ('mesas', 'mesitas-ratoneras', 'fogoneros'));
  ELSE
    UPDATE productos SET categoria_id = NULL
    WHERE categoria_id IN (SELECT id FROM categorias WHERE slug NOT IN ('mesas', 'mesitas-ratoneras', 'fogoneros'));
  END IF;
END $$;
DELETE FROM categorias WHERE slug NOT IN ('mesas', 'mesitas-ratoneras', 'fogoneros');

