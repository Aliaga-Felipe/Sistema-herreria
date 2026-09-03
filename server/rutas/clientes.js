import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo } from '../comun.js'

const router = Router()
const seleccion = 'id, nombre, telefono, email, direccion, notas, creado_en'

router.get('/', auth(), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`SELECT c.id, c.nombre, c.telefono, c.email, c.direccion, c.notas, c.creado_en,
      (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id)::int AS pedidos
    FROM clientes c ORDER BY c.nombre`)
  res.json(rows)
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`INSERT INTO clientes (nombre, telefono, email, direccion, notas) VALUES ($1, $2, $3, $4, $5) RETURNING ${seleccion}`, datos(req.body))
  res.status(201).json(rows[0])
}))

router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`UPDATE clientes SET nombre = $1, telefono = $2, email = $3, direccion = $4, notas = $5 WHERE id = $6 RETURNING ${seleccion}`, [...datos(req.body), req.params.id])
  if (!rows[0]) throw fallo('Cliente no encontrado.', 404)
  res.json(rows[0])
}))

function datos({ nombre, telefono, email, direccion, notas }) {
  if (!nombre?.trim()) throw fallo('El cliente necesita al menos un nombre.')
  return [nombre.trim(), telefono?.trim() || null, email?.trim()?.toLowerCase() || null, direccion?.trim() || null, notas?.trim() || null]
}

export default router
