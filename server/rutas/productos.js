import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, fallo } from '../comun.js'

const router = Router()

const consultaProductos = `SELECT p.id, p.nombre, p.descripcion, p.precio_venta::float8 AS precio_venta, p.activo, p.creado_en,
    COALESCE(SUM(e.costo), 0)::float8 AS costo_total,
    COALESCE(SUM(e.minutos_estimados), 0)::int AS minutos_totales,
    (p.precio_venta - COALESCE(SUM(e.costo), 0))::float8 AS margen,
    COALESCE(json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'descripcion', e.descripcion, 'orden', e.orden,
      'costo', e.costo::float8, 'minutos_estimados', e.minutos_estimados) ORDER BY e.orden) FILTER (WHERE e.id IS NOT NULL), '[]') AS etapas
  FROM productos p LEFT JOIN etapas_producto e ON e.producto_id = p.id
  GROUP BY p.id`

// Valida y normaliza las etapas que define el admin para un producto.
const normalizarEtapas = etapas => {
  if (!Array.isArray(etapas) || !etapas.length) throw fallo('El producto necesita al menos una etapa de fabricación.')
  return etapas.map((etapa, indice) => {
    const minutos = entero(etapa?.minutos_estimados)
    if (!etapa?.nombre?.trim()) throw fallo('Cada etapa necesita un nombre.')
    if (!minutos || minutos <= 0) throw fallo(`La etapa "${etapa.nombre}" necesita una duración estimada mayor a cero.`)
    return { nombre: etapa.nombre.trim(), descripcion: etapa.descripcion?.trim() || null, orden: indice + 1, costo: Math.max(0, decimal(etapa.costo)), minutos_estimados: minutos }
  })
}

const guardarEtapas = async (cliente, productoId, etapas) => {
  await cliente.query('DELETE FROM etapas_producto WHERE producto_id = $1', [productoId])
  for (const etapa of etapas) {
    await cliente.query('INSERT INTO etapas_producto (producto_id, nombre, descripcion, orden, costo, minutos_estimados) VALUES ($1, $2, $3, $4, $5, $6)',
      [productoId, etapa.nombre, etapa.descripcion, etapa.orden, etapa.costo, etapa.minutos_estimados])
  }
}

router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivos = req.query.activos === 'true'
  const { rows } = await pool.query(`${consultaProductos}${soloActivos ? ' HAVING p.activo' : ''} ORDER BY p.nombre`)
  res.json(rows)
}))

router.get('/:id', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaProductos} HAVING p.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  res.json(rows[0])
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', precio_venta, etapas } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del producto.')
  const precio = decimal(precio_venta)
  if (precio <= 0) throw fallo('El precio de venta debe ser mayor a cero.')
  const normalizadas = normalizarEtapas(etapas)

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const { rows } = await cliente.query('INSERT INTO productos (nombre, descripcion, precio_venta) VALUES ($1, $2, $3) RETURNING id', [nombre.trim(), descripcion?.trim() || null, precio])
    await guardarEtapas(cliente, rows[0].id, normalizadas)
    await cliente.query('COMMIT')
    const creado = await pool.query(`${consultaProductos} HAVING p.id = $1`, [rows[0].id])
    res.status(201).json(creado.rows[0])
  } catch (error) { await cliente.query('ROLLBACK'); throw error } finally { cliente.release() }
}))

router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', precio_venta, etapas } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del producto.')
  const precio = decimal(precio_venta)
  if (precio <= 0) throw fallo('El precio de venta debe ser mayor a cero.')
  const normalizadas = normalizarEtapas(etapas)

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const { rows } = await cliente.query('UPDATE productos SET nombre = $1, descripcion = $2, precio_venta = $3, actualizado_en = NOW() WHERE id = $4 RETURNING id',
      [nombre.trim(), descripcion?.trim() || null, precio, req.params.id])
    if (!rows[0]) throw fallo('Producto no encontrado.', 404)
    // Los pedidos ya generados guardan copia de nombre, costo y minutos,
    // así que reescribir las etapas no altera la producción en curso.
    await guardarEtapas(cliente, rows[0].id, normalizadas)
    await cliente.query('COMMIT')
    const actualizado = await pool.query(`${consultaProductos} HAVING p.id = $1`, [rows[0].id])
    res.json(actualizado.rows[0])
  } catch (error) { await cliente.query('ROLLBACK'); throw error } finally { cliente.release() }
}))

router.patch('/:id/activo', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  const { rows } = await pool.query('UPDATE productos SET activo = $1, actualizado_en = NOW() WHERE id = $2 RETURNING id, nombre, activo', [activo, req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  res.json(rows[0])
}))

// Si el producto ya se usó en un pedido se desactiva en lugar de borrarse,
// para no perder el historial de producción.
router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const usos = await pool.query('SELECT 1 FROM pedido_items WHERE producto_id = $1 LIMIT 1', [req.params.id])
  if (usos.rows[0]) {
    const { rows } = await pool.query('UPDATE productos SET activo = FALSE, actualizado_en = NOW() WHERE id = $1 RETURNING id', [req.params.id])
    if (!rows[0]) throw fallo('Producto no encontrado.', 404)
    return res.json({ mensaje: 'El producto tiene pedidos asociados: se desactivó en lugar de borrarse.', desactivado: true })
  }
  const { rows } = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  res.json({ mensaje: 'Producto eliminado.', desactivado: false })
}))

export default router
