import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, fallo, sincronizarPedido } from '../comun.js'

const router = Router()
const estadosPedido = ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO']

const consultaPedidos = `SELECT p.id, p.codigo, p.estado, p.prioridad, p.fecha_entrega, p.notas, p.creado_en, p.terminado_en,
    CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'nombre', c.nombre, 'telefono', c.telefono,
      'email', c.email, 'direccion', c.direccion, 'notas', c.notas) END AS cliente,
    (SELECT COALESCE(json_agg(json_build_object('id', i.id, 'producto_id', i.producto_id, 'producto', pr.nombre,
        'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario::float8,
        'subtotal', (i.cantidad * i.precio_unitario)::float8) ORDER BY i.id), '[]')
      FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id WHERE i.pedido_id = p.id) AS items,
    (SELECT COALESCE(json_agg(json_build_object('id', e.id, 'pedido_item_id', e.pedido_item_id, 'nombre', e.nombre,
        'orden', e.orden, 'estado', e.estado, 'costo_estimado', e.costo_estimado::float8,
        'minutos_estimados', e.minutos_estimados, 'minutos_reales', e.minutos_reales, 'semaforo', e.semaforo,
        'responsable_id', e.responsable_id, 'responsable', u.nombre, 'completado_en', e.completado_en,
        'observaciones', e.observaciones) ORDER BY e.pedido_item_id, e.orden), '[]')
      FROM pedido_etapas e LEFT JOIN usuarios u ON u.id = e.responsable_id WHERE e.pedido_id = p.id) AS etapas,
    COALESCE((SELECT SUM(i.cantidad * i.precio_unitario) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS total,
    COALESCE((SELECT SUM(e.costo_estimado) FROM pedido_etapas e WHERE e.pedido_id = p.id), 0)::float8 AS costo_estimado,
    (SELECT COUNT(*) FROM pedido_etapas e WHERE e.pedido_id = p.id)::int AS etapas_totales,
    (SELECT COUNT(*) FROM pedido_etapas e WHERE e.pedido_id = p.id AND e.estado = 'COMPLETADA')::int AS etapas_completadas,
    COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE e.estado = 'COMPLETADA') / NULLIF(COUNT(*), 0))
      FROM pedido_etapas e WHERE e.pedido_id = p.id), 0)::int AS avance
  FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id`

// El empleado solo ve los pedidos donde tiene alguna etapa a cargo.
const filtroEmpleado = ' WHERE EXISTS (SELECT 1 FROM pedido_etapas e WHERE e.pedido_id = p.id AND e.responsable_id = $1)'

router.get('/', auth(), asyncRoute(async (req, res) => {
  const admin = req.user.rol === 'admin'
  const { rows } = await pool.query(`${consultaPedidos}${admin ? '' : filtroEmpleado} ORDER BY p.prioridad DESC, p.creado_en DESC`, admin ? [] : [req.user.id])
  res.json(rows)
}))

router.get('/:id', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  if (req.user.rol !== 'admin' && !rows[0].etapas.some(etapa => String(etapa.responsable_id) === String(req.user.id))) throw fallo('No tenés permisos sobre este pedido.', 403)
  res.json(rows[0])
}))

// Crea el pedido, sus items y despliega una etapa de trabajo por cada
// etapa del producto. El costo y la duración se copian del catálogo y se
// multiplican por la cantidad pedida, de modo que editar el producto más
// tarde no altera lo que ya está en producción.
router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { cliente_id = null, cliente = null, items = [], fecha_entrega = null, prioridad = 0, notas = '' } = req.body
  if (!Array.isArray(items) || !items.length) throw fallo('El pedido necesita al menos un producto.')
  if (!cliente_id && !cliente?.nombre?.trim()) throw fallo('Indicá el cliente del pedido.')

  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')

    const clienteId = cliente_id || (await conexion.query(
      'INSERT INTO clientes (nombre, telefono, email, direccion, notas) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [cliente.nombre.trim(), cliente.telefono?.trim() || null, cliente.email?.trim()?.toLowerCase() || null, cliente.direccion?.trim() || null, cliente.notas?.trim() || null])).rows[0].id

    const pedido = (await conexion.query(
      'INSERT INTO pedidos (cliente_id, fecha_entrega, prioridad, notas, creado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id, codigo',
      [clienteId, fecha_entrega || null, entero(prioridad) || 0, notas?.trim() || null, req.user.id])).rows[0]

    for (const item of items) {
      const cantidad = entero(item?.cantidad) || 1
      if (cantidad <= 0) throw fallo('La cantidad de cada producto debe ser mayor a cero.')
      const producto = (await conexion.query('SELECT id, nombre, precio_venta FROM productos WHERE id = $1', [item?.producto_id])).rows[0]
      if (!producto) throw fallo('Alguno de los productos seleccionados no existe.')

      const precio = item.precio_unitario === undefined || item.precio_unitario === null ? Number(producto.precio_venta) : decimal(item.precio_unitario)
      const itemId = (await conexion.query('INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4) RETURNING id',
        [pedido.id, producto.id, cantidad, precio])).rows[0].id

      const etapas = (await conexion.query('SELECT id, nombre, orden, costo, minutos_estimados FROM etapas_producto WHERE producto_id = $1 ORDER BY orden', [producto.id])).rows
      if (!etapas.length) throw fallo(`El producto "${producto.nombre}" no tiene etapas de fabricación cargadas.`)

      // asignaciones: { [etapa_producto_id]: usuario_id } definido por el admin al crear el pedido.
      const asignaciones = item.asignaciones || {}
      for (const etapa of etapas) {
        const responsable = asignaciones[etapa.id] || asignaciones[String(etapa.id)] || null
        await conexion.query(
          `INSERT INTO pedido_etapas (pedido_id, pedido_item_id, etapa_producto_id, nombre, orden, costo_estimado, minutos_estimados, responsable_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [pedido.id, itemId, etapa.id, etapa.nombre, etapa.orden, decimal(Number(etapa.costo) * cantidad), etapa.minutos_estimados * cantidad, responsable || null])
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

// Asigna (o libera) el empleado responsable de una etapa del pedido.
router.patch('/:id/etapas/:etapaId/asignar', auth(['admin']), asyncRoute(async (req, res) => {
  const { responsable_id: responsable = null } = req.body
  if (responsable) {
    const empleado = await pool.query("SELECT id FROM usuarios WHERE id = $1 AND LOWER(rol::text) = 'empleado' AND activo", [responsable])
    if (!empleado.rows[0]) throw fallo('El responsable debe ser un empleado activo.')
  }
  const { rows } = await pool.query('UPDATE pedido_etapas SET responsable_id = $1 WHERE id = $2 AND pedido_id = $3 RETURNING id, responsable_id', [responsable, req.params.etapaId, req.params.id])
  if (!rows[0]) throw fallo('Etapa no encontrada.', 404)
  res.json(rows[0])
}))

// Asignación masiva: mismo responsable para varias etapas de un pedido.
router.patch('/:id/asignaciones', auth(['admin']), asyncRoute(async (req, res) => {
  const { asignaciones = {} } = req.body
  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    for (const [etapaId, responsable] of Object.entries(asignaciones)) {
      await conexion.query('UPDATE pedido_etapas SET responsable_id = $1 WHERE id = $2 AND pedido_id = $3', [responsable || null, etapaId, req.params.id])
    }
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  const actualizado = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [req.params.id])
  if (!actualizado.rows[0]) throw fallo('Pedido no encontrado.', 404)
  res.json(actualizado.rows[0])
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
