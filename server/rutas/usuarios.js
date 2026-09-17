import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo, rolLiteral } from '../comun.js'

const router = Router()
const seleccion = 'id, nombre, email, telefono, LOWER(rol::text) AS rol, activo, creado_en'

// Gestión de usuarios: "admin" y "super_admin" ven la lista y pueden
// crear cuentas, pero un "admin" común tiene permisos acotados en las
// rutas de abajo (solo puede restablecer la clave de un empleado, y solo
// puede asignar el rol "empleado" -al crear o al cambiar el rol-, nunca
// "admin"). "super_admin" tiene permiso total.
//
// Para un "admin" común, las cuentas "super_admin" son invisibles: no
// aparecen en este listado (y por lo tanto tampoco se cuentan en las
// estadísticas del panel, que se calculan sobre esta misma lista). Son
// una cuenta "fantasma" para cualquiera que no sea super_admin. Un
// "super_admin" sí ve todas las cuentas, incluidas otras super_admin.
router.get('/', auth(['admin', 'super_admin']), asyncRoute(async (req, res) => {
  const filtro = req.user.rol === 'super_admin' ? '' : `WHERE LOWER(rol::text) <> 'super_admin'`
  const { rows } = await pool.query(`SELECT ${seleccion} FROM usuarios ${filtro} ORDER BY creado_en DESC`)
  res.json(rows)
}))

// Los empleados solo necesitan la lista para ver quién más trabaja en un pedido.
router.get('/empleados', auth(), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`SELECT id, nombre, email FROM usuarios WHERE LOWER(rol::text) = 'empleado' AND activo ORDER BY nombre`)
  res.json(rows)
}))

// Alta de cuentas: la única forma de crear usuarios en todo el sistema
// (no existe registro público, ver rutas/autenticacion.js). La pueden
// usar "admin" y "super_admin"; "empleado" no tiene acceso a esta ruta.
router.post('/', auth(['admin', 'super_admin']), asyncRoute(async (req, res) => {
  const { nombre, email, contrasena, rol = 'empleado' } = req.body
  if (!nombre?.trim() || !email?.trim() || !contrasena || contrasena.length < 8) throw fallo('Completá nombre, correo y una contraseña de al menos 8 caracteres.')
  if (!['admin', 'empleado'].includes(rol)) throw fallo('Rol inválido.')
  // Un "admin" común solo puede crear cuentas de empleado: no puede
  // asignar el rol "admin" al crear (misma regla que en PATCH /:id/rol).
  if (req.user.rol === 'admin' && rol !== 'empleado') throw fallo('No tenés permisos para crear una cuenta con rol de administrador.', 403)
  const hash = await bcrypt.hash(contrasena, 12)
  const { rows } = await pool.query(`INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
    VALUES ($1, LOWER($2), $3, ${rolLiteral('$4')}) RETURNING ${seleccion}`,
    [nombre.trim(), email.trim(), hash, rol])
  res.status(201).json(rows[0])
}))

router.patch('/:id', auth(['super_admin']), asyncRoute(async (req, res) => {
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

router.patch('/:id/rol', auth(['admin', 'super_admin']), asyncRoute(async (req, res) => {
  const { rol } = req.body
  if (!['admin', 'empleado'].includes(rol)) throw fallo('Rol inválido.')
  // Un "admin" común solo puede asignar el rol "empleado": nunca puede
  // ascender a nadie a "admin". Eso es exclusivo de "super_admin".
  if (req.user.rol === 'admin' && rol !== 'empleado') throw fallo('No tenés permisos para asignar el rol de administrador.', 403)

  const objetivo = await pool.query('SELECT LOWER(rol::text) AS rol FROM usuarios WHERE id = $1', [req.params.id])
  if (!objetivo.rows[0]) throw fallo('Usuario no encontrado.', 404)
  // A una cuenta "super_admin" no se le toca el rol si quien lo pide es un
  // "admin" común. Un "super_admin" sí puede (tiene permiso total).
  if (req.user.rol !== 'super_admin' && objetivo.rows[0].rol === 'super_admin') throw fallo('El rol de una cuenta super_admin no se cambia desde acá.', 403)

  const { rows } = await pool.query(`UPDATE usuarios SET rol = ${rolLiteral('$1')}, actualizado_en = NOW()
    WHERE id = $2 RETURNING ${seleccion}`, [rol, req.params.id])
  res.json(rows[0])
}))

// Alta/baja lógica: nunca se borra al usuario para no perder su historial.
// Exclusiva de "super_admin" (no fue pedida para "admin").
router.patch('/:id/activo', auth(['super_admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  if (String(req.user.id) === String(req.params.id) && !activo) throw fallo('No podés desactivar tu propia cuenta.')
  const { rows } = await pool.query(`UPDATE usuarios SET activo = $1, actualizado_en = NOW() WHERE id = $2 RETURNING ${seleccion}`, [activo, req.params.id])
  if (!rows[0]) throw fallo('Usuario no encontrado.', 404)
  res.json(rows[0])
}))

// Restablecer contraseña: "super_admin" puede hacerlo con cualquier
// cuenta; un "admin" común solo puede restablecer la de un empleado.
router.patch('/:id/contrasena', auth(['admin', 'super_admin']), asyncRoute(async (req, res) => {
  const { contrasena } = req.body
  if (!contrasena || contrasena.length < 8) throw fallo('La contraseña debe tener al menos 8 caracteres.')

  if (req.user.rol === 'admin') {
    const objetivo = await pool.query('SELECT LOWER(rol::text) AS rol FROM usuarios WHERE id = $1', [req.params.id])
    if (!objetivo.rows[0]) throw fallo('Usuario no encontrado.', 404)
    if (objetivo.rows[0].rol !== 'empleado') throw fallo('Solo podés restablecer la contraseña de una cuenta de empleado.', 403)
  }

  const { rows } = await pool.query('UPDATE usuarios SET contrasena_hash = $1, actualizado_en = NOW() WHERE id = $2 RETURNING id', [await bcrypt.hash(contrasena, 12), req.params.id])
  if (!rows[0]) throw fallo('Usuario no encontrado.', 404)
  res.json({ mensaje: 'Contraseña restablecida.' })
}))

export default router
