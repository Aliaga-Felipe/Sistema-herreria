import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, fallo } from '../comun.js'

const router = Router()

const consultaMateriales = `SELECT id, nombre, unidad_medida, precio_unitario::float8 AS precio_unitario, activo, creado_en, actualizado_en FROM materiales`

router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivos = req.query.activos === 'true'
  const { rows } = await pool.query(`${consultaMateriales}${soloActivos ? ' WHERE activo' : ''} ORDER BY nombre`)
  res.json(rows)
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, unidad_medida = 'unidad', precio_unitario } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del material.')
  const precio = decimal(precio_unitario)
  if (precio < 0) throw fallo('El precio no puede ser negativo.')
  const { rows } = await pool.query(
    'INSERT INTO materiales (nombre, unidad_medida, precio_unitario) VALUES ($1, $2, $3) RETURNING id',
    [nombre.trim(), unidad_medida?.trim() || 'unidad', precio]
  )
  const creado = await pool.query(`${consultaMateriales} WHERE id = $1`, [rows[0].id])
  res.status(201).json(creado.rows[0])
}))

router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, unidad_medida = 'unidad', precio_unitario } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del material.')
  const precio = decimal(precio_unitario)
  if (precio < 0) throw fallo('El precio no puede ser negativo.')
  const { rows } = await pool.query(
    'UPDATE materiales SET nombre = $1, unidad_medida = $2, precio_unitario = $3, actualizado_en = NOW() WHERE id = $4 RETURNING id',
    [nombre.trim(), unidad_medida?.trim() || 'unidad', precio, req.params.id]
  )
  if (!rows[0]) throw fallo('Material no encontrado.', 404)
  const actualizado = await pool.query(`${consultaMateriales} WHERE id = $1`, [rows[0].id])
  res.json(actualizado.rows[0])
}))

router.patch('/:id/activo', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  const { rows } = await pool.query('UPDATE materiales SET activo = $1, actualizado_en = NOW() WHERE id = $2 RETURNING id', [activo, req.params.id])
  if (!rows[0]) throw fallo('Material no encontrado.', 404)
  const actualizado = await pool.query(`${consultaMateriales} WHERE id = $1`, [rows[0].id])
  res.json(actualizado.rows[0])
}))

// Si el material ya está asociado a algún producto se desactiva en lugar de
// borrarse, para no invalidar el costo calculado de productos existentes.
router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const usos = await pool.query('SELECT 1 FROM producto_materiales WHERE material_id = $1 LIMIT 1', [req.params.id])
  if (usos.rows[0]) {
    const { rows } = await pool.query('UPDATE materiales SET activo = FALSE, actualizado_en = NOW() WHERE id = $1 RETURNING id', [req.params.id])
    if (!rows[0]) throw fallo('Material no encontrado.', 404)
    return res.json({ mensaje: 'El material está en uso en productos: se desactivó en lugar de borrarse.', desactivado: true })
  }
  const { rows } = await pool.query('DELETE FROM materiales WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Material no encontrado.', 404)
  res.json({ mensaje: 'Material eliminado.', desactivado: false })
}))

export default router
