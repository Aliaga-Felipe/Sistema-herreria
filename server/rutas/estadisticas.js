import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, leerConfiguracion } from '../comun.js'

const router = Router()
const unaFila = async (sql, valores = []) => (await pool.query(sql, valores)).rows[0]
const filas = async (sql, valores = []) => (await pool.query(sql, valores)).rows

// ---------------------------------------------------------------------
// RESUMEN DEL PANEL PRINCIPAL
// Todo lo que el admin necesita ver de un vistazo al entrar.
// ---------------------------------------------------------------------
router.get('/resumen', auth(['admin']), asyncRoute(async (_, res) => {
  const pedidos = await unaFila(`SELECT
      COUNT(*)::int AS totales,
      COUNT(*) FILTER (WHERE estado IN ('PENDIENTE', 'EN_PRODUCCION'))::int AS activos,
      COUNT(*) FILTER (WHERE estado = 'TERMINADO')::int AS terminados,
      COUNT(*) FILTER (WHERE estado = 'PAUSADO')::int AS pausados,
      COUNT(*) FILTER (WHERE fecha_entrega < CURRENT_DATE AND estado NOT IN ('TERMINADO', 'CANCELADO'))::int AS atrasados
    FROM pedidos`)

  const trabajo = await unaFila(`SELECT
      COUNT(*)::int AS etapas_totales,
      COUNT(*) FILTER (WHERE estado = 'COMPLETADA')::int AS completadas,
      COUNT(*) FILTER (WHERE estado <> 'COMPLETADA')::int AS pendientes,
      COUNT(*) FILTER (WHERE estado <> 'COMPLETADA' AND asignado_a IS NULL)::int AS sin_asignar,
      COUNT(*) FILTER (WHERE semaforo = 'VERDE')::int AS verdes,
      COUNT(*) FILTER (WHERE semaforo = 'AMARILLO')::int AS amarillos,
      COUNT(*) FILTER (WHERE semaforo = 'ROJO')::int AS rojos
    FROM vista_tareas_empleado`)

  const catalogo = await unaFila(`SELECT
      (SELECT COUNT(*) FROM productos WHERE activo)::int AS productos_activos,
      (SELECT COUNT(*) FROM clientes)::int AS clientes,
      (SELECT COUNT(*) FROM usuarios WHERE LOWER(rol::text) = 'empleado' AND activo)::int AS empleados`)

  const dinero = await unaFila(`SELECT
      COALESCE((SELECT SUM(i.cantidad * i.precio_unitario) FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id
        WHERE p.estado = 'TERMINADO'), 0)::float8 AS ingresos,
      COALESCE((SELECT SUM(e.costo_estimado) FROM pedido_etapas e WHERE e.estado = 'COMPLETADA'), 0)::float8 AS costos,
      COALESCE((SELECT SUM(monto) FROM recompensas), 0)::float8 AS recompensas`)

  // Los más vendidos se miden por unidades pedidas, no por cantidad de pedidos.
  const masVendidos = await filas(`SELECT pr.id, pr.nombre, SUM(i.cantidad)::int AS unidades,
      SUM(i.cantidad * i.precio_unitario)::float8 AS facturado
    FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id JOIN pedidos p ON p.id = i.pedido_id
    WHERE p.estado <> 'CANCELADO'
    GROUP BY pr.id ORDER BY unidades DESC, facturado DESC LIMIT 5`)

  const empleadosPendientes = await filas(`SELECT u.id, u.nombre,
      COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA')::int AS pendientes,
      COUNT(v.id) FILTER (WHERE v.estado = 'COMPLETADA')::int AS completadas
    FROM usuarios u LEFT JOIN vista_tareas_empleado v ON v.asignado_a = u.id
    WHERE LOWER(u.rol::text) = 'empleado' AND u.activo
    GROUP BY u.id HAVING COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA') > 0
    ORDER BY pendientes DESC LIMIT 6`)

  const proximosPedidos = await filas(`SELECT id, codigo, estado, cliente, fecha_entrega, avance, etapas_totales, etapas_completadas
    FROM vista_pedidos_activos WHERE estado IN ('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO')
    ORDER BY prioridad DESC, fecha_entrega NULLS LAST, creado_en LIMIT 6`)

  res.json({
    pedidos, trabajo, catalogo,
    dinero: { ...dinero, ganancia: dinero.ingresos - dinero.costos - dinero.recompensas },
    mas_vendidos: masVendidos, empleados_pendientes: empleadosPendientes, proximos_pedidos: proximosPedidos,
    configuracion: await leerConfiguracion()
  })
}))

// ---------------------------------------------------------------------
// ESTADÍSTICAS GENERALES (apartado propio, más detallado)
// ---------------------------------------------------------------------
router.get('/generales', auth(['admin']), asyncRoute(async (req, res) => {
  const desde = req.query.desde || null
  const hasta = req.query.hasta || null
  const rangoPedidos = 'WHERE ($1::date IS NULL OR p.creado_en >= $1) AND ($2::date IS NULL OR p.creado_en < ($2::date + 1))'
  const parametros = [desde, hasta]

  const ingresos = await unaFila(`SELECT
      COALESCE(SUM(i.cantidad * i.precio_unitario) FILTER (WHERE p.estado = 'TERMINADO'), 0)::float8 AS cobrados,
      COALESCE(SUM(i.cantidad * i.precio_unitario) FILTER (WHERE p.estado NOT IN ('TERMINADO', 'CANCELADO')), 0)::float8 AS en_curso,
      COALESCE(SUM(i.cantidad * i.precio_unitario) FILTER (WHERE p.estado <> 'CANCELADO'), 0)::float8 AS facturado
    FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id ${rangoPedidos}`, parametros)

  const gastos = await unaFila(`SELECT
      COALESCE((SELECT SUM(e.costo_estimado) FROM pedido_etapas e JOIN pedidos p ON p.id = e.pedido_id
        ${rangoPedidos} AND e.estado = 'COMPLETADA'), 0)::float8 AS produccion_ejecutada,
      COALESCE((SELECT SUM(e.costo_estimado) FROM pedido_etapas e JOIN pedidos p ON p.id = e.pedido_id
        ${rangoPedidos} AND e.estado <> 'COMPLETADA'), 0)::float8 AS produccion_pendiente,
      COALESCE((SELECT SUM(r.monto) FROM recompensas r
        WHERE ($1::date IS NULL OR r.otorgado_en >= $1) AND ($2::date IS NULL OR r.otorgado_en < ($2::date + 1))), 0)::float8 AS recompensas`, parametros)

  const rendimiento = await filas(`SELECT id, nombre, email, activo, completadas, pendientes, verdes, amarillos, rojos,
      minutos_estimados, minutos_reales, promedio_minutos, recompensas_monto::float8 AS recompensas_monto,
      CASE WHEN minutos_estimados > 0 THEN ROUND(100.0 * minutos_reales / minutos_estimados)::int ELSE NULL END AS eficiencia
    FROM vista_rendimiento_empleados ORDER BY completadas DESC, nombre`)

  const semaforo = await unaFila(`SELECT
      COUNT(*) FILTER (WHERE semaforo = 'VERDE')::int AS verdes,
      COUNT(*) FILTER (WHERE semaforo = 'AMARILLO')::int AS amarillos,
      COUNT(*) FILTER (WHERE semaforo = 'ROJO')::int AS rojos,
      COUNT(*) FILTER (WHERE estado = 'COMPLETADA' AND semaforo IS NULL)::int AS sin_medir,
      COALESCE(SUM(minutos_estimados) FILTER (WHERE estado = 'COMPLETADA'), 0)::int AS minutos_estimados,
      COALESCE(SUM(minutos_reales) FILTER (WHERE estado = 'COMPLETADA'), 0)::int AS minutos_reales
    FROM vista_tareas_empleado`)

  const porProducto = await filas(`SELECT pr.id, pr.nombre, pr.precio_venta::float8 AS precio_venta,
      SUM(i.cantidad)::int AS unidades,
      SUM(i.cantidad * i.precio_unitario)::float8 AS facturado,
      COALESCE((SELECT SUM(e.costo) FROM etapas_producto e WHERE e.producto_id = pr.id), 0)::float8 * SUM(i.cantidad) AS costo_estimado
    FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id JOIN pedidos p ON p.id = i.pedido_id
    ${rangoPedidos} AND p.estado <> 'CANCELADO'
    GROUP BY pr.id ORDER BY facturado DESC`, parametros)

  const mensual = await filas(`SELECT to_char(date_trunc('month', p.creado_en), 'YYYY-MM') AS periodo,
      COUNT(DISTINCT p.id)::int AS pedidos,
      COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'TERMINADO')::int AS terminados,
      COALESCE(SUM(i.cantidad * i.precio_unitario), 0)::float8 AS facturado
    FROM pedidos p LEFT JOIN pedido_items i ON i.pedido_id = p.id
    ${rangoPedidos}
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, parametros)

  const gastoTotal = gastos.produccion_ejecutada + gastos.recompensas
  res.json({
    rango: { desde, hasta },
    ingresos, gastos: { ...gastos, total: gastoTotal },
    ganancia: { neta: ingresos.cobrados - gastoTotal, proyectada: ingresos.facturado - gastoTotal - gastos.produccion_pendiente },
    rendimiento, semaforo, por_producto: porProducto, mensual,
    configuracion: await leerConfiguracion()
  })
}))

export default router
