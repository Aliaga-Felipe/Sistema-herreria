import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo, rolLiteral, sign } from '../comun.js'

const router = Router()

// El alta pública siempre crea empleados. El primer admin se carga a mano
// en la base y desde ahí da de alta al resto (ver rutas/usuarios.js).
router.post('/registro', asyncRoute(async (req, res) => {
  const { nombre, email, contrasena } = req.body
  if (!nombre?.trim() || !email?.trim() || !contrasena || contrasena.length < 8) throw fallo('Completá nombre, correo y una contraseña de al menos 8 caracteres.')
  const hash = await bcrypt.hash(contrasena, 12)
  const { rows } = await pool.query(`INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
    VALUES ($1, LOWER($2), $3, ${rolLiteral("'empleado'")})
    RETURNING id, nombre, email, LOWER(rol::text) AS rol`, [nombre.trim(), email.trim(), hash])
  res.status(201).json({ usuario: rows[0], mensaje: 'Cuenta creada como empleado.' })
}))

router.post('/iniciar-sesion', asyncRoute(async (req, res) => {
  const { email, contrasena } = req.body
  const { rows } = await pool.query('SELECT id, nombre, email, contrasena_hash, LOWER(rol::text) AS rol, activo FROM usuarios WHERE email = LOWER($1)', [email || ''])
  const usuario = rows[0]
  if (!usuario?.activo || !(await bcrypt.compare(contrasena || '', usuario.contrasena_hash))) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })
  res.json({ token: sign(usuario), usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } })
}))

router.get('/sesion', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, email, LOWER(rol::text) AS rol FROM usuarios WHERE id = $1 AND activo', [req.user.id])
  if (!rows[0]) return res.status(401).json({ error: 'La cuenta ya no está activa.' })
  res.json({ usuario: rows[0] })
}))

// Cambio de contraseña de la propia cuenta.
router.patch('/contrasena', auth(), asyncRoute(async (req, res) => {
  const { contrasena_actual: actual, contrasena_nueva: nueva } = req.body
  if (!nueva || nueva.length < 8) throw fallo('La contraseña nueva debe tener al menos 8 caracteres.')
  const { rows } = await pool.query('SELECT contrasena_hash FROM usuarios WHERE id = $1', [req.user.id])
  if (!rows[0] || !(await bcrypt.compare(actual || '', rows[0].contrasena_hash))) throw fallo('La contraseña actual no es correcta.', 401)
  await pool.query('UPDATE usuarios SET contrasena_hash = $1, actualizado_en = NOW() WHERE id = $2', [await bcrypt.hash(nueva, 12), req.user.id])
  res.json({ mensaje: 'Contraseña actualizada.' })
}))

export default router
