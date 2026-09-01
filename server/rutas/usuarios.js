import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo, rolLiteral } from '../comun.js'

const router = Router()
const seleccion = 'id, nombre, email, telefono, LOWER(rol::text) AS rol, activo, creado_en'

router.get('/', auth(['admin']), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`SELECT ${seleccion} FROM usuarios ORDER BY creado_en DESC`)
  res.json(rows)
}))

// Los empleados solo necesitan la lista para ver quién más trabaja en un pedido.
router.get('/empleados', auth(), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`SELECT id, nombre, email FROM usuarios WHERE LOWER(rol::text) = 'empleado' AND activo ORDER BY nombre`)
  res.json(rows)
}))

// Alta de empleados hecha por el administrador.
router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, email, telefono = null, contrasena, rol = 'empleado' } = req.body
  if (!nombre?.trim() || !email?.trim() || !contrasena || contrasena.length < 8) throw fallo('Completá nombre, correo y una contraseña de al menos 8 caracteres.')
  if (!['admin', 'empleado'].includes(rol)) throw fallo('Rol inválido.')
  const hash = await bcrypt.hash(contrasena, 12)
  const { rows } = await pool.query(`INSERT INTO usuarios (nombre, email, telefono, contrasena_hash, rol)
    VALUES ($1, LOWER($2), $3, $4, ${rolLiteral('$5')}) RETURNING ${seleccion}`,
    [nombre.trim(), email.trim(), telefono?.trim() || null, hash, rol])
  res.status(201).json(rows[0])
}))

router.patch('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, email, telefono } = req.body
  const { rows } = await pool.query(`UPDATE usuarios SET
      nombre = COALESCE(NULLIF($1, ''), nombre),
      email = COALESCE(LOWER(NULLIF($2, '')), email),
      telefono = COALESCE($3, telefono),
      actualizado_en = NOW()
    WHERE id = $4 RETURNING ${seleccion}`, [nombre?.trim() || '', email?.trim() || '', telefono ?? null, req.params.id])
  if (!rows[0]) throw fallo('Usuario no encontrado.', 404)
  res.json(rows[0])
}))

router.patch('/:id/rol', auth(['admin']), asyncRoute(async (req, res) => {
  const { rol } = req.body
  if (!['admin', 'empleado'].includes(rol)) throw fallo('Rol inválido.')
  const { rows } = await pool.query(`UPDATE usuarios SET rol = ${rolLiteral('$1')}, actualizado_en = NOW()
    WHERE id = $2 RETURNING ${seleccion}`, [rol, req.params.id])
  if (!rows[0]) throw fallo('Usuario no encontrado.', 404)
  res.json(rows[0])
}))

// Alta/baja lógica: nunca se borra al usuario para no perder su historial.
router.patch('/:id/activo', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  if (String(req.user.id) === String(req.params.id) && !activo) throw fallo('No podés desactivar tu propia cuenta.')
  const { rows } = await pool.query(`UPDATE usuarios SET activo = $1, actualizado_en = NOW() WHERE id = $2 RETURNING ${seleccion}`, [activo, req.params.id])
  if (!rows[0]) throw fallo('Usuario no encontrado.', 404)
  res.json(rows[0])
}))

// El admin restablece la clave de un empleado que la perdió.
router.patch('/:id/contrasena', auth(['admin']), asyncRoute(async (req, res) => {
  const { contrasena } = req.body
  if (!contrasena || contrasena.length < 8) throw fallo('La contraseña debe tener al menos 8 caracteres.')
  const { rows } = await pool.query('UPDATE usuarios SET contrasena_hash = $1, actualizado_en = NOW() WHERE id = $2 RETURNING id', [await bcrypt.hash(contrasena, 12), req.params.id])
  if (!rows[0]) throw fallo('Usuario no encontrado.', 404)
  res.json({ mensaje: 'Contraseña restablecida.' })
}))

export default router
