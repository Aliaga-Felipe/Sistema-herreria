import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, leerConfiguracion } from '../comun.js'
import { calcularMetricas, enRango, validarFecha } from '../metricas.js'
import { fechaDeHoy, obtenerJornada } from '../jornadas.js'

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
      COALESCE(SUM(horas_hombre) FILTER (WHERE estado <> 'COMPLETADA'), 0)::float8 AS horas_pendientes
    FROM vista_tareas_empleado`)

  // Producción propuesta para hoy (Producción diaria).
  const hoy = await obtenerJornada(fechaDeHoy())
  const produccionHoy = {
    fecha: hoy.fecha, estado: hoy.estado, cumplido: hoy.cumplido,
    objetivo_horas: hoy.objetivo_horas, horas_completadas: hoy.horas_completadas, avance: hoy.avance,
    etapas_totales: hoy.etapas_totales, etapas_completadas: hoy.etapas_completadas,
    recompensa: hoy.recompensa, recompensa_al_cumplir: hoy.recompensa_al_cumplir
  }

  const catalogo = await unaFila(`SELECT
      (SELECT COUNT(*) FROM clientes)::int AS clientes,
      (SELECT COUNT(*) FROM usuarios WHERE LOWER(rol::text) = 'empleado' AND activo)::int AS empleados`)

  const metricas = await calcularMetricas()

  // Productos vendidos (los más recientes primero), incluidos los que se
  // borraron después: vienen del historial. Ni los activos ni los
  // desactivados aparecen acá.
  const vendidos = await filas(`SELECT producto_id AS id, nombre, chapita_id, eliminado, vendido_en,
      precio_vendido::float8 AS precio, costo_vendido::float8 AS costo
    FROM ventas_productos_registradas
    ORDER BY vendido_en DESC, producto_id DESC LIMIT 5`)

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
    pedidos, trabajo, catalogo, metricas, produccion_hoy: produccionHoy,
    productos_vendidos: vendidos, empleados_pendientes: empleadosPendientes, proximos_pedidos: proximosPedidos,
    configuracion: await leerConfiguracion()
  })
}))

// ---------------------------------------------------------------------
// ESTADÍSTICAS GENERALES (apartado propio, más detallado)
// "desde" / "hasta" (YYYY-MM-DD, opcionales) filtran todo lo que tiene
// fecha: ventas, cobros, etapas completadas, producciones diarias y recompensas del equipo.
// ---------------------------------------------------------------------
router.get('/generales', auth(['admin']), asyncRoute(async (req, res) => {
  const desde = validarFecha(req.query.desde)
  const hasta = validarFecha(req.query.hasta)
  const parametros = [desde, hasta]

  const metricas = await calcularMetricas({ desde, hasta })

  // Rendimiento por empleado dentro del rango: etapas y horas-hombre
  // completadas en el período (por completado_en) + lo que tiene pendiente
  // hoy. Ya no hay tiempos reales: el empleado no informa cuánto tardó.
  const rendimiento = await filas(`SELECT u.id, u.nombre, u.email, u.activo,
      COUNT(v.id) FILTER (WHERE v.estado = 'COMPLETADA' AND ${enRango('v.completado_en')})::int AS completadas,
      COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA')::int AS pendientes,
      COALESCE(SUM(v.horas_hombre) FILTER (WHERE v.estado = 'COMPLETADA' AND ${enRango('v.completado_en')}), 0)::float8 AS horas_completadas,
      COALESCE(SUM(v.horas_hombre) FILTER (WHERE v.estado <> 'COMPLETADA'), 0)::float8 AS horas_pendientes
    FROM usuarios u
    LEFT JOIN vista_tareas_empleado v ON v.asignado_a = u.id
    WHERE LOWER(u.rol::text) = 'empleado'
    GROUP BY u.id
    ORDER BY horas_completadas DESC, completadas DESC, u.nombre`, parametros)

  // Producciones diarias del período: cuántas se propusieron, cuántas se
  // terminaron completas (con recompensa) y cuántas horas-hombre sumaron.
  const produccion = await unaFila(`SELECT
      COUNT(*)::int AS dias,
      COUNT(*) FILTER (WHERE estado = 'TERMINADA')::int AS terminadas,
      COUNT(*) FILTER (WHERE estado = 'TERMINADA' AND cumplido)::int AS cumplidas,
      COUNT(*) FILTER (WHERE estado = 'ABIERTA')::int AS abiertas,
      COALESCE(SUM(objetivo_horas) FILTER (WHERE estado = 'TERMINADA'), 0)::float8 AS horas_propuestas,
      COALESCE(SUM(horas_producidas) FILTER (WHERE estado = 'TERMINADA'), 0)::float8 AS horas_completadas,
      COALESCE(SUM(recompensa) FILTER (WHERE estado = 'TERMINADA'), 0)::float8 AS recompensas
    FROM jornadas_equipo
    WHERE ${enRango('fecha')}`, parametros)

  // Ventas reales del período, una fila por evento: cada producto
  // vendido (estado VENDIDO, o borrado después de venderse) y cada item de
  // un pedido cobrado. Los productos DESACTIVADOS no son ventas.
  const ventasReales = `SELECT pr.producto_id, pr.nombre, 1 AS unidades, pr.precio_vendido AS facturado, pr.costo_vendido AS costo,
        pr.vendido_en AS fecha
      FROM ventas_productos_registradas pr WHERE ${enRango('pr.vendido_en')}
    UNION ALL
    SELECT i.producto_id, ip.nombre, i.cantidad, i.cantidad * i.precio_unitario,
        i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario), COALESCE(p.terminado_en, p.actualizado_en)
      FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id JOIN productos ip ON ip.id = i.producto_id
      WHERE p.estado = 'TERMINADO' AND ${enRango('COALESCE(p.terminado_en, p.actualizado_en)')}`

  const porProducto = await filas(`SELECT v.producto_id AS id, MAX(v.nombre) AS nombre, MAX(pr.precio_venta)::float8 AS precio_venta,
      SUM(v.unidades)::int AS unidades,
      COALESCE(SUM(v.facturado), 0)::float8 AS facturado,
      COALESCE(SUM(v.costo), 0)::float8 AS costo_estimado
    FROM (${ventasReales}) v LEFT JOIN productos pr ON pr.id = v.producto_id
    GROUP BY v.producto_id ORDER BY facturado DESC, MAX(v.nombre)`, parametros)

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
    rendimiento, produccion, por_producto: porProducto, mensual,
    configuracion: await leerConfiguracion()
  })
}))

export default router
