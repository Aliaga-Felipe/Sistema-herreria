import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, esAdmin, fallo, leerConfiguracion, sincronizarPedido } from '../comun.js'

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
        'costo_produccion', (i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario))::float8) ORDER BY i.id), '[]')
      FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id WHERE i.pedido_id = p.id) AS items,
    (SELECT COALESCE(json_agg(json_build_object('id', e.id, 'pedido_item_id', e.pedido_item_id, 'nombre', e.nombre,
        'orden', e.orden, 'estado', e.estado,
        'minutos_estimados', e.minutos_estimados, 'minutos_reales', e.minutos_reales, 'semaforo', e.semaforo,
        'responsable_id', e.responsable_id, 'responsable', u.nombre, 'completado_en', e.completado_en,
        'observaciones', e.observaciones) ORDER BY e.pedido_item_id, e.orden), '[]')
      FROM pedido_etapas e LEFT JOIN usuarios u ON u.id = e.responsable_id WHERE e.pedido_id = p.id) AS etapas,
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
// TAREAS DEL PEDIDO
// Las tareas (etapas de producción) pertenecen al PEDIDO, no al producto:
// se definen al crear el pedido, una lista por cada producto del pedido, y
// se guardan en pedido_etapas (una fila por tarea, con su propio nombre,
// orden y tiempo estimado). Dos pedidos del mismo producto pueden tener
// tareas distintas y editarlas nunca modifica el producto. Desde ahí siguen
// funcionando igual que antes: se asignan en Tareas, el empleado las
// completa en Mis tareas, generan semáforo/recompensas y definen el avance,
// el estado del pedido y los gastos de producción de las estadísticas.
// ---------------------------------------------------------------------

// Valida la lista de tareas de un producto del pedido. Los minutos que
// llegan son POR UNIDAD (como se cargan en el formulario) y se multiplican
// por la cantidad del producto.
const normalizarTareas = (tareas, nombreProducto) => {
  if (!Array.isArray(tareas) || !tareas.length) throw fallo(`Agregá al menos una tarea para "${nombreProducto}".`)
  return tareas.map((tarea, indice) => {
    const nombre = tarea?.nombre?.toString().trim()
    if (!nombre) throw fallo(`Cada tarea de "${nombreProducto}" necesita un nombre.`)
    if (nombre.length > 120) throw fallo('El nombre de una tarea no puede superar los 120 caracteres.')
    const minutos = Math.max(0, entero(tarea?.minutos_estimados) || 0)
    return { nombre, orden: indice + 1, minutos_por_unidad: minutos }
  })
}

// Tareas sugeridas para un producto al armar un pedido nuevo: las del
// último pedido de ese producto (minutos por unidad) o, si nunca se pidió,
// las etapas que tenía cargadas antes de que las tareas pasaran al pedido
// (tabla etapas_producto, sólo lectura). Es una ayuda para no tipear de
// nuevo: el admin las puede cambiar libremente para este pedido.
router.get('/tareas-sugeridas', auth(['admin']), asyncRoute(async (req, res) => {
  const productoId = req.query.producto_id
  if (!productoId) throw fallo('Indicá el producto.')
  const ultimo = await pool.query(
    `SELECT i.id, i.cantidad FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id
     WHERE i.producto_id = $1 AND EXISTS (SELECT 1 FROM pedido_etapas e WHERE e.pedido_item_id = i.id)
     ORDER BY p.creado_en DESC, i.id DESC LIMIT 1`, [productoId])
  if (ultimo.rows[0]) {
    const { rows } = await pool.query(
      `SELECT nombre, GREATEST(0, ROUND(minutos_estimados::numeric / $2))::int AS minutos_estimados
       FROM pedido_etapas WHERE pedido_item_id = $1 ORDER BY orden, id`, [ultimo.rows[0].id, Math.max(1, ultimo.rows[0].cantidad)])
    return res.json({ origen: 'ultimo_pedido', tareas: rows })
  }
  const { rows } = await pool.query('SELECT nombre, minutos_estimados FROM etapas_producto WHERE producto_id = $1 ORDER BY orden', [productoId])
  res.json({ origen: rows.length ? 'producto_anterior' : 'ninguno', tareas: rows })
}))

router.get('/:id', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  if (!esAdmin(req.user.rol) && !rows[0].etapas.some(etapa => String(etapa.responsable_id) === String(req.user.id))) throw fallo('No tenés permisos sobre este pedido.', 403)
  res.json(rows[0])
}))

// Crea el pedido, sus productos y las tareas de cada producto.
//
// PRECIO: ya no se pide en el formulario. Cada ítem toma el precio de venta
// que tiene el producto al momento de crear el pedido (una foto: editar el
// producto después no cambia pedidos ya creados). Si el cuerpo trae un
// precio, se ignora.
//
// COSTO: materiales + mano de obra por unidad, calculados igual que en
// conCostoCalculado() de server/rutas/productos.js y copiados a
// pedido_items.costo_materiales_unitario / costo_mano_obra_unitario.
//
// TAREAS: vienen en items[].tareas (ver normalizarTareas) y se guardan en
// pedido_etapas para ESTE pedido; el producto no se toca.
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

      const tareas = normalizarTareas(item?.tareas, producto.nombre)
      const costoMaterialesUnitario = decimal(producto.costo_materiales)
      const costoManoObraUnitario = decimal((Number(producto.horas_hombre) || 0) * costoHora)

      const itemId = (await conexion.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, costo_materiales_unitario, costo_mano_obra_unitario)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [pedido.id, producto.id, cantidad, decimal(producto.precio_venta), costoMaterialesUnitario, costoManoObraUnitario])).rows[0].id

      // Las tareas nacen sin responsable: se asignan después, tarea por
      // tarea, desde la sección Tareas.
      for (const tarea of tareas) {
        await conexion.query(
          `INSERT INTO pedido_etapas (pedido_id, pedido_item_id, nombre, orden, minutos_estimados, responsable_id)
           VALUES ($1, $2, $3, $4, $5, NULL)`,
          [pedido.id, itemId, tarea.nombre, tarea.orden, tarea.minutos_por_unidad * cantidad])
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

// La asignación de empleados a etapas ya NO se hace desde Pedidos: la
// sección Pedidos es solo informativa. Las etapas se asignan desde Tareas
// (PATCH /api/tareas/asignadas/:origen/:id/asignar, ver rutas/tareas.js).

// ---------------------------------------------------------------------
// EDITAR LAS TAREAS DE UN PEDIDO YA CREADO
// Se puede agregar una tarea a un producto del pedido, y renombrar, cambiar
// el tiempo o quitar una tarea que todavía no se completó. Las completadas
// no se tocan (ya tienen tiempo real, semáforo y recompensa). Después de
// cada cambio se recalcula el estado del pedido (sincronizarPedido).
// ---------------------------------------------------------------------
const responderPedido = async (res, id) => {
  const { rows } = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [id])
  res.json(rows[0])
}

router.post('/:id/items/:itemId/tareas', auth(['admin']), asyncRoute(async (req, res) => {
  const nombre = req.body?.nombre?.toString().trim()
  if (!nombre) throw fallo('Indicá el nombre de la tarea.')
  if (nombre.length > 120) throw fallo('El nombre de una tarea no puede superar los 120 caracteres.')
  const minutos = Math.max(0, entero(req.body?.minutos_estimados) || 0)
  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const item = (await conexion.query('SELECT i.id FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id WHERE i.id = $1 AND i.pedido_id = $2 FOR UPDATE OF p',
      [req.params.itemId, req.params.id])).rows[0]
    if (!item) throw fallo('Producto del pedido no encontrado.', 404)
    await conexion.query(
      `INSERT INTO pedido_etapas (pedido_id, pedido_item_id, nombre, orden, minutos_estimados, responsable_id)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(orden), 0) + 1 FROM pedido_etapas WHERE pedido_item_id = $2), $4, NULL)`,
      [req.params.id, item.id, nombre, minutos])
    await sincronizarPedido(conexion, req.params.id)
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  await responderPedido(res, req.params.id)
}))

router.patch('/:id/tareas/:tareaId', auth(['admin']), asyncRoute(async (req, res) => {
  const nombre = req.body?.nombre === undefined ? null : req.body.nombre?.toString().trim()
  if (nombre !== null && !nombre) throw fallo('La tarea necesita un nombre.')
  const minutos = req.body?.minutos_estimados === undefined ? null : Math.max(0, entero(req.body.minutos_estimados) || 0)
  const { rows } = await pool.query(
    `UPDATE pedido_etapas SET nombre = COALESCE($1, nombre), minutos_estimados = COALESCE($2::int, minutos_estimados)
     WHERE id = $3 AND pedido_id = $4 AND estado <> 'COMPLETADA' RETURNING id`,
    [nombre, minutos, req.params.tareaId, req.params.id])
  if (!rows[0]) throw fallo('Tarea no encontrada o ya completada.', 404)
  await responderPedido(res, req.params.id)
}))

router.delete('/:id/tareas/:tareaId', auth(['admin']), asyncRoute(async (req, res) => {
  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const tarea = (await conexion.query('SELECT id, pedido_item_id, estado FROM pedido_etapas WHERE id = $1 AND pedido_id = $2 FOR UPDATE',
      [req.params.tareaId, req.params.id])).rows[0]
    if (!tarea) throw fallo('Tarea no encontrada.', 404)
    if (tarea.estado === 'COMPLETADA') throw fallo('No se puede quitar una tarea ya completada.')
    const restantes = (await conexion.query('SELECT COUNT(*)::int AS total FROM pedido_etapas WHERE pedido_item_id = $1', [tarea.pedido_item_id])).rows[0].total
    if (restantes <= 1) throw fallo('Cada producto del pedido necesita al menos una tarea.')
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
