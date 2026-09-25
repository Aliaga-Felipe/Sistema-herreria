import { pool } from './db.js'

// =====================================================================
// MÉTRICAS DE NEGOCIO (fuente única de verdad)
// Panel de control (GET /estadisticas/resumen) y Estadísticas
// (GET /estadisticas/generales) calculan el dinero con ESTA función, así
// que los dos muestran siempre los mismos números con los mismos criterios.
//
// REAL (lo que efectivamente ocurrió, filtrado por la fecha del evento):
//   * Venta de producto: un producto se vende cuando se desactiva o se
//     elimina (productos.vendido_en, precio_vendido, costo_vendido: los
//     mantiene el trigger productos_registrar_venta, ver schema.sql).
//   * Pedido cobrado: pedido TERMINADO (fecha: terminado_en).
//   * Gastos de producción: costo de cada etapa de pedido COMPLETADA (el
//     costo del item del pedido se reparte en partes iguales entre sus
//     etapas; fecha: completado_en) + costo de las etapas de tareas libres
//     realizadas + costo de los productos vendidos.
//   * Recompensas pagadas (fecha: otorgado_en).
//
// EN CURSO (pedidos abiertos, filtrados por fecha de creación):
//   * Ingresos de pedidos PENDIENTE / EN_PRODUCCION / PAUSADO y el costo de
//     las etapas que les faltan completar.
//
// PROYECTADO (supone que se vende todo el stock activo):
//   * Stock: productos activos a su precio_venta, menos su costo unitario.
//     Es el estado actual del catálogo, por eso no depende del rango.
//   * Ganancia proyectada = ganancia neta real + margen de pedidos en curso
//     + margen del stock activo.
//
// Un mismo producto nunca está a la vez en el stock y en las ventas
// (restricción productos_venta_coherente), así que no se cuenta dos veces.
// =====================================================================

const ESTADOS_ABIERTOS = `('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO')`

// Filtro de rango sobre una columna de fecha. $1 = desde, $2 = hasta
// (ambas opcionales, formato YYYY-MM-DD, "hasta" inclusive).
export const enRango = columna => `($1::date IS NULL OR ${columna} >= $1::date) AND ($2::date IS NULL OR ${columna} < ($2::date + 1))`

// Costo de UNA etapa de pedido: el costo de producción del item
// (cantidad × (materiales + mano de obra), copiado al crear el pedido) se
// reparte en partes iguales entre las etapas de ese item. Se suma además
// costo_estimado, que sólo tiene valor en pedidos viejos (antes el costo
// se cargaba por etapa y los items quedaban en 0).
const costoEtapaSql = `COALESCE(pe.costo_estimado, 0)
  + COALESCE(i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario)
      / NULLIF((SELECT COUNT(*) FROM pedido_etapas x WHERE x.pedido_item_id = pe.pedido_item_id), 0), 0)`

const numero = valor => Math.round((Number(valor) || 0) * 100) / 100

export const validarFecha = valor => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null)

export async function calcularMetricas({ desde = null, hasta = null } = {}, db = pool) {
  const rango = [validarFecha(desde), validarFecha(hasta)]
  const fila = async sql => (await db.query(sql, rango)).rows[0]

  // --- Productos: estado actual del catálogo + ventas del período -------
  const productos = await fila(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE activo)::int AS activos,
      COUNT(*) FILTER (WHERE NOT activo)::int AS vendidos,
      COUNT(*) FILTER (WHERE NOT activo AND ${enRango('vendido_en')})::int AS vendidos_periodo,
      COALESCE(SUM(precio_vendido) FILTER (WHERE NOT activo AND ${enRango('vendido_en')}), 0)::float8 AS ingresos_vendidos,
      COALESCE(SUM(costo_vendido) FILTER (WHERE NOT activo AND ${enRango('vendido_en')}), 0)::float8 AS costo_vendidos,
      COALESCE(SUM(precio_venta) FILTER (WHERE activo), 0)::float8 AS ingresos_stock,
      COALESCE(SUM(costo_unitario_producto(id, horas_hombre, costo_producto)) FILTER (WHERE activo), 0)::float8 AS costo_stock,
      COUNT(*) FILTER (WHERE activo AND precio_venta <= 0)::int AS activos_sin_precio
    FROM productos`)

  // --- Pedidos ----------------------------------------------------------
  const pedidos = await fila(`SELECT
      COUNT(*) FILTER (WHERE p.estado = 'TERMINADO' AND ${enRango('COALESCE(p.terminado_en, p.actualizado_en)')})::int AS cobrados,
      COALESCE(SUM(t.total) FILTER (WHERE p.estado = 'TERMINADO' AND ${enRango('COALESCE(p.terminado_en, p.actualizado_en)')}), 0)::float8 AS ingresos_cobrados,
      COUNT(*) FILTER (WHERE p.estado IN ${ESTADOS_ABIERTOS} AND ${enRango('p.creado_en')})::int AS abiertos,
      COALESCE(SUM(t.total) FILTER (WHERE p.estado IN ${ESTADOS_ABIERTOS} AND ${enRango('p.creado_en')}), 0)::float8 AS ingresos_en_curso
    FROM pedidos p
    LEFT JOIN LATERAL (SELECT COALESCE(SUM(i.cantidad * i.precio_unitario), 0) AS total FROM pedido_items i WHERE i.pedido_id = p.id) t ON TRUE`)

  // --- Gastos de etapas -------------------------------------------------
  const etapas = await fila(`SELECT
      COALESCE(SUM(${costoEtapaSql}) FILTER (WHERE pe.estado = 'COMPLETADA' AND ${enRango('pe.completado_en')}), 0)::float8 AS pedidos_completadas,
      COALESCE(SUM(${costoEtapaSql}) FILTER (WHERE pe.estado <> 'COMPLETADA' AND p.estado IN ${ESTADOS_ABIERTOS} AND ${enRango('p.creado_en')}), 0)::float8 AS pedidos_pendientes
    FROM pedido_etapas pe
    JOIN pedidos p ON p.id = pe.pedido_id
    LEFT JOIN pedido_items i ON i.id = pe.pedido_item_id`)

  const tareas = await fila(`SELECT COALESCE(SUM(te.costo) FILTER (WHERE te.realizada AND ${enRango('te.completada_en')}), 0)::float8 AS completadas
    FROM tarea_etapas te`)

  const recompensas = await fila(`SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(monto), 0)::float8 AS monto
    FROM recompensas WHERE ${enRango('otorgado_en')}`)

  // --- Armado -----------------------------------------------------------
  const ingresosReales = numero(productos.ingresos_vendidos + pedidos.ingresos_cobrados)
  const gastosProduccion = numero(etapas.pedidos_completadas + tareas.completadas + productos.costo_vendidos)
  const gastosReales = numero(gastosProduccion + recompensas.monto)
  const gananciaReal = numero(ingresosReales - gastosReales)

  const margenEnCurso = numero(pedidos.ingresos_en_curso - etapas.pedidos_pendientes)
  const margenStock = numero(productos.ingresos_stock - productos.costo_stock)

  return {
    rango: { desde: rango[0], hasta: rango[1] },
    productos: {
      total: productos.total,
      activos: productos.activos,
      vendidos: productos.vendidos,
      vendidos_periodo: productos.vendidos_periodo,
      activos_sin_precio: productos.activos_sin_precio
    },
    pedidos: { cobrados: pedidos.cobrados, abiertos: pedidos.abiertos },
    real: {
      ingresos_productos: numero(productos.ingresos_vendidos),
      ingresos_pedidos: numero(pedidos.ingresos_cobrados),
      ingresos: ingresosReales,
      gastos_etapas_pedidos: numero(etapas.pedidos_completadas),
      gastos_tareas: numero(tareas.completadas),
      costo_productos_vendidos: numero(productos.costo_vendidos),
      gastos_produccion: gastosProduccion,
      recompensas: numero(recompensas.monto),
      recompensas_cantidad: recompensas.cantidad,
      gastos: gastosReales,
      ganancia: gananciaReal
    },
    en_curso: {
      ingresos: numero(pedidos.ingresos_en_curso),
      gastos_pendientes: numero(etapas.pedidos_pendientes),
      margen: margenEnCurso
    },
    proyectado: {
      ingresos_stock: numero(productos.ingresos_stock),
      gastos_stock: numero(productos.costo_stock),
      margen_stock: margenStock,
      // Totales proyectados: lo real + lo que falta cobrar de pedidos
      // abiertos + la venta de todo el stock activo.
      ingresos: numero(ingresosReales + pedidos.ingresos_en_curso + productos.ingresos_stock),
      gastos: numero(gastosReales + etapas.pedidos_pendientes + productos.costo_stock),
      ganancia: numero(gananciaReal + margenEnCurso + margenStock)
    }
  }
}
