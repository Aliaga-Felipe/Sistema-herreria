import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { pool } from './db.js'


const app = express()
const port = process.env.PORT || 3001
const secret = process.env.JWT_SECRET || 'solo_para_desarrollo_cambiar_este_secreto'
const etapasFijas = [{ nombre: 'Preparación', minutos: 30 }, { nombre: 'Ejecución', minutos: 120 }, { nombre: 'Control de calidad', minutos: 20 }]
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json())
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const normalizedRole = rnodemodulenew URL => String(rol).toLowerCase()
const sign = user => jwt.sign({ id: user.id, rol: normalizedRole(user.rol), nombre: user.nombre }, secret, { expiresIn: '8h' })
const auth = (roles = []) => (req, res, next) => {
  try {
    const user = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), secret)
    user.rol = normalizedRole(user.rol)
    if (roles.length && !roles.includes(user.rol)) return res.status(403).json({ error: 'No tenés permisos para esta acción.' })
    req.user = user; next()
  } catch { res.status(401).json({ error: 'Sesión no válida o vencida.' }) }
}

app.post('/api/auth/registro', asyncRoute(async (req, res) => {
  const { nombre, email, contrasena } = req.body
  if (!nombre?.trim() || !email?.trim() || !contrasena || contrasena.length < 8) return res.status(400).json({ error: 'Completá nombre, correo y una contraseña de al menos 8 caracteres.' })
  const hash = await bcrypt.hash(contrasena, 12)
  const { rows } = await pool.query(`INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
    VALUES ($1, LOWER($2), $3, (SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = 'empleado'))
    RETURNING id, nombre, email, LOWER(rol::text) AS rol`, [nombre.trim(), email.trim(), hash])
  res.status(201).json({ usuario: rows[0], mensaje: 'Cuenta creada como empleado.' })
}))
app.post('/api/auth/iniciar-sesion', asyncRoute(async (req, res) => {
  const { email, contrasena } = req.body
  const { rows } = await pool.query('SELECT id, nombre, email, contrasena_hash, LOWER(rol::text) AS rol, activo FROM usuarios WHERE email = LOWER($1)', [email || ''])
  const usuario = rows[0]
  if (!usuario?.activo || !(await bcrypt.compare(contrasena || '', usuario.contrasena_hash))) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })
  res.json({ token: sign(usuario), usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } })
}))
app.get('/api/auth/sesion', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, email, LOWER(rol::text) AS rol FROM usuarios WHERE id = $1 AND activo', [req.user.id])
  if (!rows[0]) return res.status(401).json({ error: 'La cuenta ya no está activa.' })
  res.json({ usuario: rows[0] })
}))

app.get('/api/usuarios', auth(['admin']), asyncRoute(async (_, res) => {
  const { rows } = await pool.query('SELECT id, nombre, email, LOWER(rol::text) AS rol, activo, creado_en FROM usuarios ORDER BY creado_en DESC')
  res.json(rows)
}))
app.patch('/api/usuarios/:id/rol', auth(['admin']), asyncRoute(async (req, res) => {
  const { rol } = req.body
  if (!['admin', 'empleado'].includes(rol)) return res.status(400).json({ error: 'Rol inválido.' })
  const { rows } = await pool.query(`UPDATE usuarios SET rol = (SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = $1), actualizado_en = NOW()
    WHERE id = $2 RETURNING id, nombre, email, LOWER(rol::text) AS rol, activo`, [rol, req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' })
  res.json(rows[0])
}))

const taskQuery = `SELECT t.id, t.titulo, t.descripcion, t.estado, t.asignado_a, t.creado_en,
  json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'orden', e.orden, 'minutos_estimados', e.minutos_estimados, 'realizada', e.realizada) ORDER BY e.orden) AS etapas,
  json_build_object('id', u.id, 'nombre', u.nombre, 'email', u.email) AS asignado
  FROM tareas t JOIN usuarios u ON u.id = t.asignado_a JOIN tarea_etapas e ON e.tarea_id = t.id`
const groupTaskQuery = ' GROUP BY t.id, u.id ORDER BY t.creado_en DESC'
app.get('/api/tareas', auth(), asyncRoute(async (req, res) => {
  const admin = req.user.rol === 'admin'
  const result = await pool.query(`${taskQuery}${admin ? '' : ' WHERE t.asignado_a = $1'}${groupTaskQuery}`, admin ? [] : [req.user.id])
  res.json(result.rows)
}))
app.post('/api/tareas', auth(['admin']), asyncRoute(async (req, res) => {
  const { titulo, descripcion = '', asignado_a, etapas = [] } = req.body
  if (!titulo?.trim() || !asignado_a) return res.status(400).json({ error: 'Indicá el título y el empleado asignado.' })
  const etapasProducto = etapas.length ? etapas : etapasFijas.map(etapa => ({ nombre: etapa.nombre, minutos_estimados: etapa.minutos }))
  if (!etapasProducto.length || etapasProducto.some(etapa => !etapa?.nombre?.trim() || !Number.isFinite(Number(etapa.minutos_estimados)) || Number(etapa.minutos_estimados) <= 0)) return res.status(400).json({ error: 'Cada etapa debe tener nombre y un tiempo estimado mayor a cero.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const employee = await client.query("SELECT id FROM usuarios WHERE id = $1 AND LOWER(rol::text) = 'empleado' AND activo", [asignado_a])
    if (!employee.rows[0]) throw Object.assign(new Error('El usuario asignado debe ser un empleado activo.'), { status: 400 })
    const task = await client.query("INSERT INTO tareas (titulo, descripcion, asignado_a, creado_por, estado) VALUES ($1, $2, $3, $4, 'PENDIENTE') RETURNING id", [titulo.trim(), descripcion.trim(), asignado_a, req.user.id])
    for (const [index, etapa] of etapasProducto.entries()) {
      await client.query('INSERT INTO tarea_etapas (tarea_id, nombre, orden, minutos_estimados) VALUES ($1, $2, $3, $4)', [task.rows[0].id, etapa.nombre.trim(), index + 1, Number(etapa.minutos_estimados)])
    }
    await client.query('COMMIT')
    res.status(201).json({ id: task.rows[0].id })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}))
app.patch('/api/tareas/:id/estado', auth(), asyncRoute(async (req, res) => {
  const { estado } = req.body
  if (!['PENDIENTE', 'EN_PROGRESO', 'REALIZADA'].includes(estado)) return res.status(400).json({ error: 'Estado inválido.' })
  if (estado === 'REALIZADA') {
    const stages = await pool.query('SELECT COUNT(*)::int AS pendientes FROM tarea_etapas WHERE tarea_id = $1 AND NOT realizada', [req.params.id])
    if (stages.rows[0].pendientes) return res.status(400).json({ error: 'Completá todas las etapas antes de finalizar la tarea.' })
  }
  const owner = req.user.rol === 'admin' ? '' : ' AND asignado_a = $3'
  const values = req.user.rol === 'admin' ? [estado, req.params.id] : [estado, req.params.id, req.user.id]
  const { rows } = await pool.query(`UPDATE tareas SET estado = $1, actualizada_en = NOW() WHERE id = $2${owner} RETURNING id, estado`, values)
  if (!rows[0]) return res.status(404).json({ error: 'Tarea no encontrada.' })
  res.json(rows[0])
}))
app.patch('/api/tareas/:tareaId/etapas/:etapaId', auth(), asyncRoute(async (req, res) => {
  const { realizada } = req.body
  if (typeof realizada !== 'boolean') return res.status(400).json({ error: 'El campo realizada debe ser booleano.' })
  const owner = req.user.rol === 'admin' ? '' : ' AND t.asignado_a = $4'
  const values = req.user.rol === 'admin' ? [realizada, req.params.etapaId, req.params.tareaId] : [realizada, req.params.etapaId, req.params.tareaId, req.user.id]
  const { rows } = await pool.query(`UPDATE tarea_etapas e SET realizada = $1, completada_en = CASE WHEN $1 THEN NOW() ELSE NULL END FROM tareas t WHERE e.id = $2 AND e.tarea_id = $3 AND t.id = e.tarea_id${owner} RETURNING e.id`, values)
  if (!rows[0]) return res.status(404).json({ error: 'Etapa no encontrada o sin permisos.' })
  res.json({ id: rows[0].id, realizada })
}))

app.use((error, _, res, __) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' })
  res.status(error.status || 500).json({ error: error.message || 'Ocurrió un error inesperado.' })
})
app.listen(port, () => console.log(`API de El Atelier lista en el puerto ${port}`))
