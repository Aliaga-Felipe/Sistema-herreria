import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, fallo } from '../comun.js'

const router = Router()

const consultaPresupuestos = `SELECT pr.id, pr.cliente_id, COALESCE(c.nombre, pr.cliente_nombre) AS cliente, pr.fecha,
    pr.monto_total::float8 AS monto_total, pr.sena_monto::float8 AS sena_monto,
    (pr.monto_total - pr.sena_monto)::float8 AS restante, pr.notas, pr.pedido_id, pr.creado_en, pr.actualizado_en,
    COALESCE((SELECT json_agg(jsonb_build_object('id', it.id, 'producto_id', it.producto_id, 'descripcion', it.descripcion,
        'cantidad', it.cantidad, 'precio_unitario', it.precio_unitario::float8, 'subtotal', (it.cantidad * it.precio_unitario)::float8) ORDER BY it.id)
      FROM presupuesto_items it WHERE it.presupuesto_id = pr.id), '[]') AS items
  FROM presupuestos pr LEFT JOIN clientes c ON c.id = pr.cliente_id`

const normalizarItems = items => {
  if (!Array.isArray(items) || !items.length) throw fallo('El presupuesto necesita al menos un ítem.')
  return items.map(item => {
    if (!item?.descripcion?.trim()) throw fallo('Cada ítem necesita una descripción.')
    const cantidad = Math.max(1, Math.round(Number(item.cantidad) || 1))
    const precio = decimal(item.precio_unitario)
    if (precio < 0) throw fallo('El precio unitario no puede ser negativo.')
    return { producto_id: item.producto_id || null, descripcion: item.descripcion.trim(), cantidad, precio_unitario: precio }
  })
}

const guardarItems = async (cliente, presupuestoId, items) => {
  await cliente.query('DELETE FROM presupuesto_items WHERE presupuesto_id = $1', [presupuestoId])
  for (const item of items) {
    await cliente.query('INSERT INTO presupuesto_items (presupuesto_id, producto_id, descripcion, cantidad, precio_unitario) VALUES ($1, $2, $3, $4, $5)',
      [presupuestoId, item.producto_id, item.descripcion, item.cantidad, item.precio_unitario])
  }
}

// Lista con filtros por cliente y rango de fechas.
router.get('/', auth(['admin']), asyncRoute(async (req, res) => {
  const condiciones = []
  const valores = []
  if (req.query.cliente_id) { valores.push(req.query.cliente_id); condiciones.push(`pr.cliente_id = $${valores.length}`) }
  if (req.query.cliente) { valores.push(`%${req.query.cliente}%`); condiciones.push(`COALESCE(c.nombre, pr.cliente_nombre) ILIKE $${valores.length}`) }
  if (req.query.desde) { valores.push(req.query.desde); condiciones.push(`pr.fecha >= $${valores.length}`) }
  if (req.query.hasta) { valores.push(req.query.hasta); condiciones.push(`pr.fecha <= $${valores.length}`) }
  const where = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : ''
  const { rows } = await pool.query(`${consultaPresupuestos}${where} ORDER BY pr.fecha DESC, pr.id DESC`, valores)
  res.json(rows)
}))

router.get('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaPresupuestos} WHERE pr.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Presupuesto no encontrado.', 404)
  res.json(rows[0])
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { cliente_id: clienteId = null, cliente_nombre: clienteNombre = '', fecha, sena_monto: senaMonto = 0, notas = '', items } = req.body
  if (!clienteId && !clienteNombre?.trim()) throw fallo('Indicá el cliente del presupuesto.')
  const itemsNormalizados = normalizarItems(items)
  const montoTotal = decimal(itemsNormalizados.reduce((suma, item) => suma + item.cantidad * item.precio_unitario, 0))
  const sena = Math.max(0, decimal(senaMonto))
  if (sena > montoTotal) throw fallo('La seña no puede ser mayor al total del presupuesto.')

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const { rows } = await cliente.query(
      `INSERT INTO presupuestos (cliente_id, cliente_nombre, fecha, monto_total, sena_monto, notas, creado_por)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7) RETURNING id`,
      [clienteId, clienteId ? null : clienteNombre.trim(), fecha || null, montoTotal, sena, notas?.trim() || null, req.user.id]
    )
    await guardarItems(cliente, rows[0].id, itemsNormalizados)
    await cliente.query('COMMIT')
    const creado = await pool.query(`${consultaPresupuestos} WHERE pr.id = $1`, [rows[0].id])
    res.status(201).json(creado.rows[0])
  } catch (error) { await cliente.query('ROLLBACK'); throw error } finally { cliente.release() }
}))

router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { cliente_id: clienteId = null, cliente_nombre: clienteNombre = '', fecha, sena_monto: senaMonto = 0, notas = '', items } = req.body
  if (!clienteId && !clienteNombre?.trim()) throw fallo('Indicá el cliente del presupuesto.')
  const itemsNormalizados = normalizarItems(items)
  const montoTotal = decimal(itemsNormalizados.reduce((suma, item) => suma + item.cantidad * item.precio_unitario, 0))
  const sena = Math.max(0, decimal(senaMonto))
  if (sena > montoTotal) throw fallo('La seña no puede ser mayor al total del presupuesto.')

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const { rows } = await cliente.query(
      `UPDATE presupuestos SET cliente_id = $1, cliente_nombre = $2, fecha = COALESCE($3, fecha), monto_total = $4, sena_monto = $5, notas = $6, actualizado_en = NOW()
       WHERE id = $7 RETURNING id`,
      [clienteId, clienteId ? null : clienteNombre.trim(), fecha || null, montoTotal, sena, notas?.trim() || null, req.params.id]
    )
    if (!rows[0]) throw fallo('Presupuesto no encontrado.', 404)
    await guardarItems(cliente, rows[0].id, itemsNormalizados)
    await cliente.query('COMMIT')
    const actualizado = await pool.query(`${consultaPresupuestos} WHERE pr.id = $1`, [rows[0].id])
    res.json(actualizado.rows[0])
  } catch (error) { await cliente.query('ROLLBACK'); throw error } finally { cliente.release() }
}))

router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM presupuestos WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Presupuesto no encontrado.', 404)
  res.json({ mensaje: 'Presupuesto eliminado.' })
}))

export default router
