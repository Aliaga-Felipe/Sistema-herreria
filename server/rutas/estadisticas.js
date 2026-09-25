import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, leerConfiguracion } from '../comun.js'
import { calcularMetricas, enRango, validarFecha } from '../metricas.js'

const router = Router()
const unaFila = async (sql, valores = []) => (await pool.query(sql, valores)).rows[0]
const filas = async (sql, valores = []) => (await pool.query(sql, valores)).rows

// Todo el dinero (real, en curso y proyectado) sale de calcularMetricas
// (server/metricas.js): Panel de control y Estadísticas usan exactamente
// los mismos criterios. Ver ahí la explicación de cada número.

// ---------------------------------------------------------------------
// RESUMEN DEL PANEL PRINCIPAL
// Todo lo que el admin necesita ver de un vistazo al entrar (sin rango de
// fechas: acumulado histórico + estado actual).
// ---------------------------------------------------------------------
router.get('/resumen', auth(['admin']), asyncRoute(async (_, res) => {
  const pedidos = await unaFila(`SELECT
      COUNT(*)::int AS totales,
      COUNT(*) FILTER (WHERE estado IN ('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO'))::int AS abiertos,
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
      (SELECT COUNT(*) FROM clientes)::int AS clientes,
      (SELECT COUNT(*) FROM usuarios WHERE LOWER(rol::text) = 'empleado' AND activo)::int AS empleados`)

  const metricas = await calcularMetricas()

  // Productos vendidos = productos desactivados o eliminados (los más
  // recientes primero). Un producto activo nunca aparece acá.
  const vendidos = await filas(`SELECT id, nombre, chapita_id, eliminado, vendido_en,
      precio_vendido::float8 AS precio, costo_vendido::float8 AS costo
    FROM productos WHERE NOT activo
    ORDER BY vendido_en DESC, id DESC LIMIT 5`)

  const empleadosPendientes = await filas(`SELECT u.id, u.nombre,
      COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA')::int AS pendientes,
      COUNT(v.id) FILTER (WHERE v.estado = 'COMPLETADA')::int AS completadas
    FROM usuarios u LEFT JOIN vista_tareas_empleado v ON v.asignado_a = u.id
    WHERE LOWER(u.rol::text) = 'empleado' AND u.activo
    GROUP BY u.id HAVING COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA') > 0
    ORDER BY pendientes DESC LIMIT 6`)

  const proximosPedidos = await filas(`SELECT id, codigo, estado, fecha_entrega, avance, etapas_totales, etapas_completadas
    FROM vista_pedidos_activos WHERE estado IN ('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO')
    ORDER BY prioridad DESC, fecha_entrega NULLS LAST, creado_en LIMIT 6`)

  res.json({
    pedidos, trabajo, catalogo, metricas,
    productos_vendidos: vendidos, empleados_pendientes: empleadosPendientes, proximos_pedidos: proximosPedidos,
    configuracion: await leerConfiguracion()
  })
}))

// ---------------------------------------------------------------------
// ESTADÍSTICAS GENERALES (apartado propio, más detallado)
// "desde" / "hasta" (YYYY-MM-DD, opcionales) filtran todo lo que tiene
// fecha: ventas, cobros, etapas completadas, recompensas y semáforos.
// ---------------------------------------------------------------------
router.get('/generales', auth(['admin']), asyncRoute(async (req, res) => {
  const desde = validarFecha(req.query.desde)
  const hasta = validarFecha(req.query.hasta)
  const parametros = [desde, hasta]

  const metricas = await calcularMetricas({ desde, hasta })

  // Rendimiento por empleado dentro del rango: etapas completadas en el
  // período (por completado_en) + lo que tiene pendiente hoy.
  const rendimiento = await filas(`SELECT u.id, u.nombre, u.email, u.activo,
      COUNT(v.id) FILTER (WHERE v.estado = 'COMPLETADA' AND ${enRango('v.completado_en')})::int AS completadas,
      COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA')::int AS pendientes,
      COUNT(v.id) FILTER (WHERE v.semaforo = 'VERDE' AND ${enRango('v.completado_en')})::int AS verdes,
      COUNT(v.id) FILTER (WHERE v.semaforo = 'AMARILLO' AND ${enRango('v.completado_en')})::int AS amarillos,
      COUNT(v.id) FILTER (WHERE v.semaforo = 'ROJO' AND ${enRango('v.completado_en')})::int AS rojos,
      COALESCE(SUM(v.minutos_estimados) FILTER (WHERE v.estado = 'COMPLETADA' AND ${enRango('v.completado_en')}), 0)::int AS minutos_estimados,
      COALESCE(SUM(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA' AND ${enRango('v.completado_en')}), 0)::int AS minutos_reales,
      COALESCE(ROUND(AVG(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA' AND ${enRango('v.completado_en')})), 0)::int AS promedio_minutos,
      COALESCE((SELECT SUM(r.monto) FROM recompensas r WHERE r.usuario_id = u.id AND ${enRango('r.otorgado_en')}), 0)::float8 AS recompensas_monto
    FROM usuarios u
    LEFT JOIN vista_tareas_empleado v ON v.asignado_a = u.id
    WHERE LOWER(u.rol::text) = 'empleado'
    GROUP BY u.id
    ORDER BY completadas DESC, u.nombre`, parametros)
  for (const empleado of rendimiento) {
    empleado.eficiencia = empleado.minutos_estimados > 0 ? Math.round((100 * empleado.minutos_reales) / empleado.minutos_estimados) : null
  }

  // Reparto del semáforo de las etapas cerradas dentro del rango.
  const semaforo = await unaFila(`SELECT
      COUNT(*) FILTER (WHERE semaforo = 'VERDE')::int AS verdes,
      COUNT(*) FILTER (WHERE semaforo = 'AMARILLO')::int AS amarillos,
      COUNT(*) FILTER (WHERE semaforo = 'ROJO')::int AS rojos,
      COUNT(*) FILTER (WHERE semaforo IS NULL)::int AS sin_medir,
      COALESCE(SUM(minutos_estimados), 0)::int AS minutos_estimados,
      COALESCE(SUM(minutos_reales), 0)::int AS minutos_reales
    FROM vista_tareas_empleado
    WHERE estado = 'COMPLETADA' AND ${enRango('completado_en')}`, parametros)

  // Ventas reales del período, una fila por evento: cada producto
  // vendido (desactivado/eliminado) y cada item de un pedido cobrado.
  const ventasReales = `SELECT pr.id AS producto_id, 1 AS unidades, pr.precio_vendido AS facturado, pr.costo_vendido AS costo,
        pr.vendido_en AS fecha
      FROM productos pr WHERE NOT pr.activo AND ${enRango('pr.vendido_en')}
    UNION ALL
    SELECT i.producto_id, i.cantidad, i.cantidad * i.precio_unitario,
        i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario), COALESCE(p.terminado_en, p.actualizado_en)
      FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id
      WHERE p.estado = 'TERMINADO' AND ${enRango('COALESCE(p.terminado_en, p.actualizado_en)')}`

  const porProducto = await filas(`SELECT pr.id, pr.nombre, pr.precio_venta::float8 AS precio_venta,
      SUM(v.unidades)::int AS unidades,
      COALESCE(SUM(v.facturado), 0)::float8 AS facturado,
      COALESCE(SUM(v.costo), 0)::float8 AS costo_estimado
    FROM (${ventasReales}) v JOIN productos pr ON pr.id = v.producto_id
    GROUP BY pr.id ORDER BY facturado DESC, pr.nombre`, parametros)

  // Facturación cobrada por mes (ventas de productos + pedidos cobrados).
  const mensual = await filas(`SELECT to_char(date_trunc('month', v.fecha), 'YYYY-MM') AS periodo,
      SUM(v.unidades)::int AS unidades,
      COUNT(*)::int AS ventas,
      COALESCE(SUM(v.facturado), 0)::float8 AS facturado
    FROM (${ventasReales}) v
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, parametros)

  res.json({
    rango: { desde, hasta },
    metricas,
    rendimiento, semaforo, por_producto: porProducto, mensual,
    configuracion: await leerConfiguracion()
  })
}))

export default router
