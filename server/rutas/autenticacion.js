import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo, secret, sign } from '../comun.js'
import { crearLimitador, generarCodigo, generarIdDesafio, generarSal, hashCodigo, igualesSeguro, validarContrasenaNueva } from '../seguridad.js'
import { enviarCodigoAcceso } from '../correo.js'

const router = Router()

// No existe alta pública: las cuentas se crean únicamente desde el panel
// (Usuarios), por un "admin" o "super_admin" (ver rutas/usuarios.js). El
// primer super_admin se carga a mano con server/scripts/crear-admin.js.

// -----------------------------------------------------------------------
// INICIO DE SESIÓN CON VERIFICACIÓN EN DOS PASOS (código por email)
//
//  1. POST /iniciar-sesion   correo + contraseña. Si son correctas NO se
//     entrega la sesión: se crea un "desafío", se manda un código de 6
//     dígitos al correo de la cuenta y se devuelve sólo el id del desafío.
//  2. POST /verificar-codigo id del desafío + código. Recién acá, si el
//     código es correcto, el backend firma la sesión (JWT).
//  3. POST /reenviar-codigo  pide un código nuevo (con espera y tope).
//
// El código dura 10 minutos, es de un solo uso, admite 5 intentos y sólo se
// guarda su hash con sal (tabla codigos_acceso). Nunca viaja al frontend ni
// se escribe en los logs. Toda la validación es del backend.
//
// DOS_PASOS_OBLIGATORIO=false (en .env) es una salida de emergencia para
// cuando el correo saliente no está configurado: apaga el segundo paso. Por
// defecto está activo.
// -----------------------------------------------------------------------
const MAX_INTENTOS = 5
const VIDA_CODIGO_MIN = 10
const MAX_ENVIOS = 3
const ESPERA_REENVIO_SEG = 60
const MAX_DESAFIOS_POR_HORA = 5

const dosPasosActivo = () => process.env.DOS_PASOS_OBLIGATORIO !== 'false'
if (!dosPasosActivo()) console.warn('[seguridad] DOS_PASOS_OBLIGATORIO=false: la verificación en dos pasos está DESACTIVADA.')

// Límites por IP y por correo contra adivinar contraseñas o inundar de mails.
const limiteLoginIp = crearLimitador({ ventanaMs: 15 * 60_000, max: 30, mensaje: 'Demasiados intentos de ingreso desde esta conexión. Esperá unos minutos y probá de nuevo.' })
const limiteLoginCorreo = crearLimitador({ ventanaMs: 15 * 60_000, max: 8, mensaje: 'Demasiados intentos con esta cuenta. Esperá unos minutos y probá de nuevo.' })
const limiteCodigoIp = crearLimitador({ ventanaMs: 15 * 60_000, max: 40, mensaje: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' })
const limiteClave = crearLimitador({ ventanaMs: 15 * 60_000, max: 5, mensaje: 'Demasiados intentos de cambio de contraseña. Esperá unos minutos.' })

// Se compara contra un hash falso cuando la cuenta no existe, para que el
// tiempo de respuesta no delate qué correos están registrados.
const HASH_FALSO = bcrypt.hashSync('cuenta-inexistente', 12)

const texto = (valor, max) => (typeof valor === 'string' ? valor.slice(0, max) : '')
const enmascarar = email => {
  const [usuario, dominio = ''] = email.split('@')
  return `${usuario.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, usuario.length - 2)))}@${dominio}`
}
const CODIGO_INVALIDO = 'El código venció o ya no es válido. Volvé a iniciar sesión.'
const sesionPara = usuario => ({ token: sign(usuario), usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } })

router.post('/iniciar-sesion', limiteLoginIp.middleware(), asyncRoute(async (req, res) => {
  const email = texto(req.body?.email, 254).trim().toLowerCase()
  const contrasena = texto(req.body?.contrasena, 200)
  limiteLoginCorreo.exigir(email || req.ip)

  const { rows } = await pool.query('SELECT id, nombre, email, contrasena_hash, LOWER(rol::text) AS rol, activo FROM usuarios WHERE email = LOWER($1)', [email])
  const usuario = rows[0]
  const coincide = await bcrypt.compare(contrasena, usuario?.contrasena_hash || HASH_FALSO)
  if (!usuario?.activo || !coincide) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })

  if (!dosPasosActivo()) { limiteLoginCorreo.limpiar(email); return res.json(sesionPara(usuario)) }

  // Tope de códigos pedidos por cuenta: evita usar el sistema para llenar de
  // mails el correo de alguien.
  const { rows: [reciente] } = await pool.query(`SELECT COUNT(*)::int AS total FROM codigos_acceso WHERE usuario_id = $1 AND creado_en > NOW() - INTERVAL '1 hour'`, [usuario.id])
  if (reciente.total >= MAX_DESAFIOS_POR_HORA) throw fallo('Ya se enviaron varios códigos a este correo. Esperá un rato antes de pedir otro.', 429)
  pool.query(`DELETE FROM codigos_acceso WHERE creado_en < NOW() - INTERVAL '1 day'`).catch(() => {})

  const codigo = generarCodigo()
  const sal = generarSal()
  const desafioId = generarIdDesafio()
  await pool.query(`INSERT INTO codigos_acceso (desafio_id, usuario_id, codigo_hash, sal, expira_en)
    VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)`, [desafioId, usuario.id, hashCodigo(codigo, sal, secret), sal, String(VIDA_CODIGO_MIN)])
  try {
    await enviarCodigoAcceso(usuario.email, codigo, VIDA_CODIGO_MIN)
  } catch (error) {
    await pool.query('DELETE FROM codigos_acceso WHERE desafio_id = $1', [desafioId])
    throw error
  }
  res.json({ requiere_2fa: true, desafio_id: desafioId, email_enmascarado: enmascarar(usuario.email), expira_en_seg: VIDA_CODIGO_MIN * 60, reenvio_en_seg: ESPERA_REENVIO_SEG })
}))

router.post('/verificar-codigo', limiteCodigoIp.middleware(), asyncRoute(async (req, res) => {
  const desafioId = texto(req.body?.desafio_id, 64)
  const codigo = texto(req.body?.codigo, 12).replace(/\s/g, '')
  if (!/^\d{6}$/.test(codigo)) throw fallo('El código tiene 6 números.')

  // Cada intento se cuenta ANTES de comparar y en una sola sentencia atómica:
  // así, aunque lleguen muchas solicitudes en paralelo, no se pueden probar
  // más de MAX_INTENTOS códigos por desafío.
  const { rows: [intento] } = await pool.query(`UPDATE codigos_acceso SET intentos = intentos + 1
    WHERE desafio_id = $1 AND usado_en IS NULL AND intentos < $2 AND expira_en > NOW()
    RETURNING id, usuario_id, codigo_hash, sal, intentos`, [desafioId, MAX_INTENTOS])
  if (!intento) throw fallo(CODIGO_INVALIDO, 401)

  if (!igualesSeguro(hashCodigo(codigo, intento.sal, secret), intento.codigo_hash)) {
    const quedan = MAX_INTENTOS - intento.intentos
    if (quedan <= 0) {
      await pool.query('UPDATE codigos_acceso SET usado_en = NOW() WHERE id = $1', [intento.id])
      throw fallo('Superaste el máximo de intentos. Volvé a iniciar sesión para recibir un código nuevo.', 401)
    }
    throw fallo(`Código incorrecto. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`, 401)
  }

  // Un solo uso: el UPDATE sólo tiene efecto una vez, aunque se envíe el
  // mismo código dos veces a la vez.
  const { rowCount } = await pool.query('UPDATE codigos_acceso SET usado_en = NOW() WHERE id = $1 AND usado_en IS NULL', [intento.id])
  if (!rowCount) throw fallo(CODIGO_INVALIDO, 401)
  // Cualquier otro código pendiente de esa cuenta queda anulado.
  await pool.query('UPDATE codigos_acceso SET usado_en = NOW() WHERE usuario_id = $1 AND usado_en IS NULL', [intento.usuario_id])

  const { rows: [usuario] } = await pool.query('SELECT id, nombre, email, LOWER(rol::text) AS rol, activo FROM usuarios WHERE id = $1', [intento.usuario_id])
  if (!usuario?.activo) throw fallo(CODIGO_INVALIDO, 401)
  limiteLoginCorreo.limpiar(usuario.email.toLowerCase())
  res.json(sesionPara(usuario))
}))

router.post('/reenviar-codigo', limiteCodigoIp.middleware(), asyncRoute(async (req, res) => {
  const desafioId = texto(req.body?.desafio_id, 64)
  const codigo = generarCodigo()
  const sal = generarSal()
  // Un código nuevo reemplaza al anterior (deja de valer) y reinicia los
  // intentos; hay espera entre envíos y un tope de envíos por desafío.
  const { rows: [nuevo] } = await pool.query(`UPDATE codigos_acceso c SET codigo_hash = $2, sal = $3, intentos = 0, envios = envios + 1,
      ultimo_envio_en = NOW(), expira_en = NOW() + ($4 || ' minutes')::interval
    FROM usuarios u
    WHERE c.desafio_id = $1 AND u.id = c.usuario_id AND u.activo AND c.usado_en IS NULL AND c.envios < $5
      AND c.expira_en > NOW() - INTERVAL '30 minutes' AND c.ultimo_envio_en <= NOW() - ($6 || ' seconds')::interval
    RETURNING u.email`, [desafioId, hashCodigo(codigo, sal, secret), sal, String(VIDA_CODIGO_MIN), MAX_ENVIOS, String(ESPERA_REENVIO_SEG)])
  if (!nuevo) {
    const { rows: [previo] } = await pool.query('SELECT envios, usado_en, ultimo_envio_en FROM codigos_acceso WHERE desafio_id = $1', [desafioId])
    if (!previo || previo.usado_en) throw fallo(CODIGO_INVALIDO, 401)
    if (previo.envios >= MAX_ENVIOS) throw fallo('Ya reenviamos el código varias veces. Volvé a iniciar sesión.', 429)
    throw fallo(`Esperá ${ESPERA_REENVIO_SEG} segundos entre un envío y otro.`, 429)
  }
  await enviarCodigoAcceso(nuevo.email, codigo, VIDA_CODIGO_MIN)
  res.json({ mensaje: 'Te enviamos un código nuevo.', expira_en_seg: VIDA_CODIGO_MIN * 60, reenvio_en_seg: ESPERA_REENVIO_SEG })
}))

router.get('/sesion', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, email, LOWER(rol::text) AS rol FROM usuarios WHERE id = $1 AND activo', [req.user.id])
  if (!rows[0]) return res.status(401).json({ error: 'La cuenta ya no está activa.' })
  res.json({ usuario: rows[0] })
}))

// Cambio de contraseña de la propia cuenta.
router.patch('/contrasena', auth(), asyncRoute(async (req, res) => {
  limiteClave.exigir(String(req.user.id))
  const actual = texto(req.body?.contrasena_actual, 200)
  const nueva = req.body?.contrasena_nueva
  validarContrasenaNueva(nueva)
  const { rows } = await pool.query('SELECT contrasena_hash FROM usuarios WHERE id = $1', [req.user.id])
  if (!rows[0] || !(await bcrypt.compare(actual, rows[0].contrasena_hash))) throw fallo('La contraseña actual no es correcta.', 401)
  if (nueva === actual) throw fallo('La contraseña nueva tiene que ser distinta de la actual.')
  await pool.query('UPDATE usuarios SET contrasena_hash = $1, actualizado_en = NOW() WHERE id = $2', [await bcrypt.hash(nueva, 12), req.user.id])
  limiteClave.limpiar(String(req.user.id))
  res.json({ mensaje: 'Contraseña actualizada.' })
}))

export default router
