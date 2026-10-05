import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, esAdmin, fallo, leerConfiguracion, sincronizarPedido } from '../comun.js'
import { validarRepartoHoras } from '../recompensa-equipo.js'

const router = Router()
const estadosPedido = ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO']

// Los pedidos ya no tienen cliente: no se guardan ni se devuelven datos de
// cliente (la columna pedidos.cliente_id se eliminó, ver schema.sql).
const consultaPedidos = `SELECT p.id, p.codigo, p.estado, p.prioridad, p.fecha_entrega, p.notas, p.creado_en, p.terminado_en,
    (SELECT COALESCE(json_agg(json_build_object('id', i.id, 'producto_id', i.producto_id, 'producto', pr.nombre,
        'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario::float8,
        'subtotal', (i.cantidad * i.precio_unitario)::float8,
        'costo_materiales_unitario', i.costo_materiales_unitario::float8,
        'costo_mano_obra_unitario', i.costo_mano_obra_unitario::float8,
        'costo_materiales', (i.cantidad * i.costo_materiales_unitario)::float8,
        'costo_mano_obra', (i.cantidad * i.costo_mano_obra_unitario)::float8,
        'costo_produccion', (i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario))::float8,
        -- Horas-hombre del producto en este pedido: la suma de sus etapas.
        'horas_hombre', COALESCE((SELECT SUM(e.horas_hombre) FROM pedido_etapas e WHERE e.pedido_item_id = i.id), 0)::float8,
        'horas_completadas', COALESCE((SELECT SUM(e.horas_hombre) FROM pedido_etapas e WHERE e.pedido_item_id = i.id AND e.estado = 'COMPLETADA'), 0)::float8
      ) ORDER BY i.id), '[]')
      FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id WHERE i.pedido_id = p.id) AS items,
    -- "jornada": fecha de la producción diaria abierta en la que está
    -- propuesta la etapa (null si no está en ninguna).
    (SELECT COALESCE(json_agg(json_build_object('id', e.id, 'pedido_item_id', e.pedido_item_id, 'nombre', e.nombre,
        'orden', e.orden, 'estado', e.estado, 'horas_hombre', e.horas_hombre::float8,
        'minutos_estimados', e.minutos_estimados, 'minutos_reales', e.minutos_reales, 'semaforo', e.semaforo,
        'responsable_id', e.responsable_id, 'responsable', u.nombre, 'completado_en', e.completado_en,
        'observaciones', e.observaciones,
        'jornada', (SELECT je.fecha::text FROM jornada_etapas je JOIN jornadas_equipo j ON j.fecha = je.fecha
                    WHERE je.pedido_etapa_id = e.id AND j.estado = 'ABIERTA' ORDER BY je.fecha LIMIT 1)) ORDER BY e.pedido_item_id, e.orden), '[]')
      FROM pedido_etapas e LEFT JOIN usuarios u ON u.id = e.responsable_id WHERE e.pedido_id = p.id) AS etapas,
    COALESCE((SELECT SUM(e.horas_hombre) FROM pedido_etapas e WHERE e.pedido_id = p.id), 0)::float8 AS horas_hombre,
    COALESCE((SELECT SUM(i.cantidad * i.precio_unitario) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS total,
    -- Costo de producción del pedido = materiales + mano de obra, copiados del
    -- costo calculado del producto al momento de crear el pedido (ver POST /).
    -- Ya no se suma el costo de las etapas: ese campo quedó solo para
    -- compatibilidad (ver migracion_009_costo_producto_medidas_historia.sql).
    COALESCE((SELECT SUM(i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario)) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS costo_estimado,
    COALESCE((SELECT SUM(i.cantidad * i.costo_materiales_unitario) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS costo_materiales_total,
    COALESCE((SELECT SUM(i.cantidad * i.costo_mano_obra_unitario) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS costo_mano_obra_total,
    (SELECT COUNT(*) FROM pedido_etapas e WHERE e.pedido_id = p.id)::int AS etapas_totales,
    (SELECT COUNT(*) FROM pedido_etapas e WHERE e.pedido_id = p.id AND e.estado = 'COMPLETADA')::int AS etapas_completadas,
    COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE e.estado = 'COMPLETADA') / NULLIF(COUNT(*), 0))
      FROM pedido_etapas e WHERE e.pedido_id = p.id), 0)::int AS avance
  FROM pedidos p`

// El empleado solo ve los pedidos donde tiene alguna etapa a cargo.
const filtroEmpleado = ' WHERE EXISTS (SELECT 1 FROM pedido_etapas e WHERE e.pedido_id = p.id AND e.responsable_id = $1)'

router.get('/', auth(), asyncRoute(async (req, res) => {
  const admin = esAdmin(req.user.rol)
  const { rows } = await pool.query(`${consultaPedidos}${admin ? '' : filtroEmpleado} ORDER BY p.prioridad DESC, p.creado_en DESC`, admin ? [] : [req.user.id])
  res.json(rows)
}))

// ---------------------------------------------------------------------
// ETAPAS DEL PEDIDO (horas-hombre y empleado)
// Las etapas pertenecen al PEDIDO, no al producto: se definen al crear el
// pedido, una lista por cada producto, y se guardan en pedido_etapas. Para
// cada producto el admin estima sus horas-hombre (se propone las del
// producto) y las reparte entre sus etapas, cada una con su empleado: la
// suma de las etapas tiene que ser igual a la estimación. Las horas se
// cargan POR UNIDAD y se multiplican por la cantidad del producto.
//
// Desde ahí la etapa es la unidad de trabajo de todo el sistema: el
// empleado la ve en Mis tareas y la completa, se propone en la Producción
// diaria y sus horas-hombre son las que paga la recompensa del equipo.
// ---------------------------------------------------------------------

// Horas con dos decimales a minutos (para las pantallas que muestran duraciones).
const aMinutos = horas => Math.round((Number(horas) || 0) * 60)

// Todos los responsables tienen que ser empleados activos.
async function validarEmpleados(db, ids) {
  const unicos = [...new Set(ids.map(String))]
  if (!unicos.length) return
  const { rows } = await db.query(
    "SELECT id FROM usuarios WHERE id = ANY($1::bigint[]) AND LOWER(rol::text) = 'empleado' AND activo", [unicos])
  if (rows.length !== unicos.length) throw fallo('Cada etapa tiene que quedar asignada a un empleado activo.')
}

// Valida las etapas de un producto del pedido contra sus horas-hombre
// estimadas (las dos POR UNIDAD).
const normalizarEtapas = (etapas, nombreProducto, horasEstimadas) => {
  if (!Array.isArray(etapas) || !etapas.length) throw fallo(`Agregá al menos una etapa para "${nombreProducto}".`)
  const normalizadas = etapas.map((etapa, indice) => {
    const nombre = etapa?.nombre?.toString().trim()
    if (!nombre) throw fallo(`Cada etapa de "${nombreProducto}" necesita un nombre.`)
    if (nombre.length > 120) throw fallo('El nombre de una etapa no puede superar los 120 caracteres.')
    const horas = decimal(etapa?.horas_hombre)
    if (!(horas > 0)) throw fallo(`La etapa "${nombre}" de "${nombreProducto}" necesita sus horas-hombre (mayores a cero).`)
    if (!/^\d+$/.test(String(etapa?.responsable_id ?? ''))) throw fallo(`Asigná un empleado a la etapa "${nombre}" de "${nombreProducto}".`)
    return { nombre, orden: indice + 1, horas_por_unidad: horas, responsable_id: String(etapa.responsable_id) }
  })
  const reparto = validarRepartoHoras(horasEstimadas, normalizadas.map(etapa => etapa.horas_por_unidad))
  if (!(reparto.estimadas > 0)) throw fallo(`Indicá las horas-hombre estimadas para terminar "${nombreProducto}".`)
  if (!reparto.coincide) {
    throw fallo(`Las etapas de "${nombreProducto}" suman ${reparto.suma} hs y las horas-hombre estimadas son ${reparto.estimadas} hs: tienen que coincidir.`)
  }
  return normalizadas
}

// Etapas sugeridas para un producto al armar un pedido nuevo: las del
// último pedido de ese producto (horas por unidad y empleado, si sigue
// activo) o, si nunca se pidió, las etapas que tenía cargadas antes de que
// pasaran al pedido (tabla etapas_producto, sólo lectura). Es una ayuda
// para no tipear de nuevo: el admin las puede cambiar libremente.
router.get('/tareas-sugeridas', auth(['admin']), asyncRoute(async (req, res) => {
  const productoId = req.query.producto_id
  if (!productoId) throw fallo('Indicá el producto.')
  const ultimo = await pool.query(
    `SELECT i.id, i.cantidad FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id
     WHERE i.producto_id = $1 AND EXISTS (SELECT 1 FROM pedido_etapas e WHERE e.pedido_item_id = i.id)
     ORDER BY p.creado_en DESC, i.id DESC LIMIT 1`, [productoId])
  if (ultimo.rows[0]) {
    const { rows } = await pool.query(
      `SELECT e.nombre, ROUND(e.horas_hombre / $2, 2)::float8 AS horas_hombre,
         CASE WHEN u.activo AND LOWER(u.rol::text) = 'empleado' THEN e.responsable_id END AS responsable_id
       FROM pedido_etapas e LEFT JOIN usuarios u ON u.id = e.responsable_id
       WHERE e.pedido_item_id = $1 ORDER BY e.orden, e.id`, [ultimo.rows[0].id, Math.max(1, ultimo.rows[0].cantidad)])
    return res.json({ origen: 'ultimo_pedido', tareas: rows })
  }
  const { rows } = await pool.query(
    'SELECT nombre, ROUND(minutos_estimados / 60.0, 2)::float8 AS horas_hombre, NULL AS responsable_id FROM etapas_producto WHERE producto_id = $1 ORDER BY orden', [productoId])
  res.json({ origen: rows.length ? 'producto_anterior' : 'ninguno', tareas: rows })
}))

router.get('/:id', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  if (!esAdmin(req.user.rol) && !rows[0].etapas.some(etapa => String(etapa.responsable_id) === String(req.user.id))) throw fallo('No tenés permisos sobre este pedido.', 403)
  res.json(rows[0])
}))

// Crea el pedido, sus productos y las etapas de cada producto.
//
// PRECIO: ya no se pide en el formulario. Cada ítem toma el precio de venta
// que tiene el producto al momento de crear el pedido (una foto: editar el
// producto después no cambia pedidos ya creados). Si el cuerpo trae un
// precio, se ignora.
//
// COSTO: materiales + mano de obra por unidad (horas-hombre estimadas en
// ESTE pedido × costo por hora), copiados a
// pedido_items.costo_materiales_unitario / costo_mano_obra_unitario.
//
// ETAPAS: items[].horas_hombre es la estimación por unidad e items[].tareas
// sus etapas ({ nombre, horas_hombre, responsable_id }, ver
// normalizarEtapas). Se guardan en pedido_etapas para ESTE pedido, ya
// asignadas; el producto no se toca.
router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { items = [], fecha_entrega = null, prioridad = 0, notas = '' } = req.body
  if (!Array.isArray(items) || !items.length) throw fallo('El pedido necesita al menos un producto.')

  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')

    const costoHora = Number((await leerConfiguracion(conexion)).costo_hora_mano_obra) || 0

    const pedido = (await conexion.query(
      'INSERT INTO pedidos (fecha_entrega, prioridad, notas, creado_por) VALUES ($1, $2, $3, $4) RETURNING id, codigo',
      [fecha_entrega || null, entero(prioridad) || 0, notas?.trim() || null, req.user.id])).rows[0]

    // Primero se validan todos los productos y etapas, después se escribe.
    const preparados = []
    for (const item of items) {
      const cantidad = entero(item?.cantidad) || 1
      if (cantidad <= 0) throw fallo('La cantidad de cada producto debe ser mayor a cero.')
      // Sólo productos disponibles (activos): uno vendido o eliminado no
      // se puede volver a pedir.
      const producto = (await conexion.query(
        `SELECT p.id, p.nombre, p.precio_venta, p.horas_hombre,
            COALESCE((SELECT SUM(pm.precio_unitario * pm.cantidad) FROM producto_materiales pm WHERE pm.producto_id = p.id), 0) AS costo_materiales
         FROM productos p WHERE p.id = $1 AND p.activo AND NOT p.eliminado`, [item?.producto_id])).rows[0]
      if (!producto) throw fallo('Alguno de los productos seleccionados no existe o ya no está disponible.')

      const horasEstimadas = decimal(item?.horas_hombre)
      const etapas = normalizarEtapas(item?.tareas, producto.nombre, horasEstimadas)
      preparados.push({ producto, cantidad, horasEstimadas, etapas })
    }
    await validarEmpleados(conexion, preparados.flatMap(item => item.etapas.map(etapa => etapa.responsable_id)))

    for (const { producto, cantidad, horasEstimadas, etapas } of preparados) {
      const costoMaterialesUnitario = decimal(producto.costo_materiales)
      const costoManoObraUnitario = decimal(horasEstimadas * costoHora)

      const itemId = (await conexion.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, costo_materiales_unitario, costo_mano_obra_unitario)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [pedido.id, producto.id, cantidad, decimal(producto.precio_venta), costoMaterialesUnitario, costoManoObraUnitario])).rows[0].id

      // Cada etapa nace asignada a su empleado, con sus horas-hombre totales
      // (por unidad × cantidad).
      for (const etapa of etapas) {
        const horas = decimal(etapa.horas_por_unidad * cantidad)
        await conexion.query(
          `INSERT INTO pedido_etapas (pedido_id, pedido_item_id, nombre, orden, horas_hombre, minutos_estimados, responsable_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [pedido.id, itemId, etapa.nombre, etapa.orden, horas, aMinutos(horas), etapa.responsable_id])
      }
    }

    await conexion.query('COMMIT')
    const creado = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [pedido.id])
    res.status(201).json(creado.rows[0])
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
}))

router.patch('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { estado, prioridad, fecha_entrega, notas } = req.body
  if (estado !== undefined && !estadosPedido.includes(estado)) throw fallo('Estado de pedido inválido.')
  const { rows } = await pool.query(`UPDATE pedidos SET
      estado = COALESCE($1::estado_pedido, estado),
      prioridad = COALESCE($2::smallint, prioridad),
      fecha_entrega = COALESCE($3::date, fecha_entrega),
      notas = COALESCE($4, notas),
      terminado_en = CASE WHEN $1 = 'TERMINADO' THEN COALESCE(terminado_en, NOW()) WHEN $1 IS NULL THEN terminado_en ELSE NULL END,
      actualizado_en = NOW()
    WHERE id = $5 RETURNING id`, [estado ?? null, prioridad ?? null, fecha_entrega || null, notas ?? null, req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  const actualizado = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [req.params.id])
  res.json(actualizado.rows[0])
}))

// Cada etapa se asigna al crear el pedido. Para reasignarla después se usa
// la sección Tareas (PATCH /api/tareas/asignadas/:origen/:id/asignar, ver
// rutas/tareas.js).

// ---------------------------------------------------------------------
// EDITAR LAS ETAPAS DE UN PEDIDO YA CREADO
// Se puede agregar una etapa a un producto del pedido, y renombrar, cambiar
// las horas o quitar una etapa que todavía no se completó. Las horas-hombre
// del producto en el pedido son siempre la suma de sus etapas, así que
// agregar o quitar una etapa cambia esa estimación. Las completadas no se
// tocan. Si la etapa está propuesta en una producción diaria abierta, el
// cambio se ve ahí al instante; las producciones terminadas no cambian.
// Después de cada cambio se recalcula el estado del pedido.
// ---------------------------------------------------------------------
const responderPedido = async (res, id) => {
  const { rows } = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [id])
  res.json(rows[0])
}

// Nueva etapa: { nombre, horas_hombre (por unidad), responsable_id }.
router.post('/:id/items/:itemId/tareas', auth(['admin']), asyncRoute(async (req, res) => {
  const nombre = req.body?.nombre?.toString().trim()
  if (!nombre) throw fallo('Indicá el nombre de la etapa.')
  if (nombre.length > 120) throw fallo('El nombre de una etapa no puede superar los 120 caracteres.')
  const horasPorUnidad = decimal(req.body?.horas_hombre)
  if (!(horasPorUnidad > 0)) throw fallo('Indicá las horas-hombre de la etapa (mayores a cero).')
  const responsable = String(req.body?.responsable_id ?? '')
  if (!/^\d+$/.test(responsable)) throw fallo('Asigná un empleado a la etapa.')
  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const item = (await conexion.query('SELECT i.id, i.cantidad FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id WHERE i.id = $1 AND i.pedido_id = $2 FOR UPDATE OF p',
      [req.params.itemId, req.params.id])).rows[0]
    if (!item) throw fallo('Producto del pedido no encontrado.', 404)
    await validarEmpleados(conexion, [responsable])
    const horas = decimal(horasPorUnidad * (Number(item.cantidad) || 1))
    await conexion.query(
      `INSERT INTO pedido_etapas (pedido_id, pedido_item_id, nombre, orden, horas_hombre, minutos_estimados, responsable_id)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(orden), 0) + 1 FROM pedido_etapas WHERE pedido_item_id = $2), $4, $5, $6)`,
      [req.params.id, item.id, nombre, horas, aMinutos(horas), responsable])
    await sincronizarPedido(conexion, req.params.id)
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  await responderPedido(res, req.params.id)
}))

// Corrige una etapa pendiente: { nombre?, horas_hombre? (total de la etapa) }.
router.patch('/:id/tareas/:tareaId', auth(['admin']), asyncRoute(async (req, res) => {
  const nombre = req.body?.nombre === undefined ? null : req.body.nombre?.toString().trim()
  if (nombre !== null && !nombre) throw fallo('La etapa necesita un nombre.')
  const horas = req.body?.horas_hombre === undefined ? null : decimal(req.body.horas_hombre)
  if (horas !== null && !(horas > 0)) throw fallo('Las horas-hombre de la etapa tienen que ser mayores a cero.')
  const { rows } = await pool.query(
    `UPDATE pedido_etapas SET nombre = COALESCE($1, nombre), horas_hombre = COALESCE($2::numeric, horas_hombre),
       minutos_estimados = COALESCE($3::int, minutos_estimados)
     WHERE id = $4 AND pedido_id = $5 AND estado <> 'COMPLETADA' RETURNING id`,
    [nombre, horas, horas === null ? null : aMinutos(horas), req.params.tareaId, req.params.id])
  if (!rows[0]) throw fallo('Etapa no encontrada o ya completada.', 404)
  await responderPedido(res, req.params.id)
}))

router.delete('/:id/tareas/:tareaId', auth(['admin']), asyncRoute(async (req, res) => {
  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const tarea = (await conexion.query('SELECT id, pedido_item_id, estado FROM pedido_etapas WHERE id = $1 AND pedido_id = $2 FOR UPDATE',
      [req.params.tareaId, req.params.id])).rows[0]
    if (!tarea) throw fallo('Etapa no encontrada.', 404)
    if (tarea.estado === 'COMPLETADA') throw fallo('No se puede quitar una etapa ya completada.')
    const restantes = (await conexion.query('SELECT COUNT(*)::int AS total FROM pedido_etapas WHERE pedido_item_id = $1', [tarea.pedido_item_id])).rows[0].total
    if (restantes <= 1) throw fallo('Cada producto del pedido necesita al menos una etapa.')
    await conexion.query('DELETE FROM pedido_etapas WHERE id = $1', [tarea.id])
    await sincronizarPedido(conexion, req.params.id)
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  await responderPedido(res, req.params.id)
}))

router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM pedidos WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  res.json({ mensaje: 'Pedido eliminado.' })
}))

// Reabre un pedido que se había marcado como terminado a mano.
router.post('/:id/sincronizar', auth(['admin']), asyncRoute(async (req, res) => {
  const estado = await sincronizarPedido(pool, req.params.id)
  res.json({ estado })
}))

export default router
