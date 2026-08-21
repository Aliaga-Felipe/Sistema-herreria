import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { pool } from './db.js'

const app = express()
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json())
const secret = process.env.JWT_SECRET || 'solo_para_desarrollo_cambiar_este_secreto'

const auth = (roles = []) => (req, res, next) => {
  try { const user = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), secret); if (roles.length && !roles.includes(user.rol)) return res.status(403).json({ error: 'Sin permisos' }); req.user = user; next() }
  catch { res.status(401).json({ error: 'Sesión no válida' }) }
}
app.post('/api/auth/iniciar-sesion', async (req, res) => {
  const { email, contrasena } = req.body
  const { rows } = await pool.query('SELECT id, nombre, email, contrasena_hash, rol, activo FROM usuarios WHERE email = $1', [email])
  const user = rows[0]
  if (!user?.activo || !(await bcrypt.compare(contrasena, user.contrasena_hash))) return res.status(401).json({ error: 'Credenciales incorrectas' })
  res.json({ token: jwt.sign({ id: user.id, rol: user.rol, nombre: user.nombre }, secret, { expiresIn: '8h' }), usuario: { id: user.id, nombre: user.nombre, rol: user.rol } })
})
app.post('/api/auth/recuperar', async (req, res) => {
  const { email } = req.body; const { rows } = await pool.query("SELECT id FROM usuarios WHERE email = $1 AND rol = 'ADMIN'", [email])
  if (rows[0]) { const token = crypto.randomBytes(32).toString('hex'); await pool.query('INSERT INTO recuperaciones_contrasena (usuario_id, token_hash, vence_en) VALUES ($1, $2, NOW() + INTERVAL \'15 minutes\')', [rows[0].id, await bcrypt.hash(token, 10)]); /* En producción: enviar token mediante proveedor de correo */ }
  res.json({ mensaje: 'Si existe una cuenta administradora, se enviaron las instrucciones.' })
})
app.get('/api/productos', auth(), async (_, res) => res.json((await pool.query('SELECT * FROM productos WHERE activo ORDER BY nombre')).rows))
app.post('/api/productos', auth(['ADMIN']), async (req, res) => { const { nombre, descripcion, etapas = [] } = req.body; const client = await pool.connect(); try { await client.query('BEGIN'); const { rows } = await client.query('INSERT INTO productos (nombre, descripcion) VALUES ($1,$2) RETURNING id', [nombre, descripcion]); for (const [i, etapa] of etapas.entries()) await client.query('INSERT INTO etapas_producto (producto_id, nombre, orden) VALUES ($1,$2,$3)', [rows[0].id, etapa.nombre, i + 1]); await client.query('COMMIT'); res.status(201).json({ id: rows[0].id }) } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() } })
app.get('/api/pedidos', auth(), async (_, res) => res.json((await pool.query('SELECT * FROM vista_pedidos_activos')).rows))
app.post('/api/usuarios', auth(['ADMIN']), async (req,res) => { const { nombre,email,contrasena,rol='EMPLEADO' }=req.body; const hash=await bcrypt.hash(contrasena,12); const { rows }=await pool.query('INSERT INTO usuarios(nombre,email,contrasena_hash,rol) VALUES($1,$2,$3,$4) RETURNING id,nombre,email,rol',[nombre,email,hash,rol]); res.status(201).json(rows[0]) })
app.listen(process.env.PORT || 3001, () => console.log('API de El Atelier lista'))
