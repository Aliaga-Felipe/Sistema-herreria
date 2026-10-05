import jwt from 'jsonwebtoken'
import { pool } from './db.js'

// Secreto con el que se firman las sesiones (JWT). En producción es
// OBLIGATORIO definirlo en .env: si falta o es uno de los valores de ejemplo,
// el servidor no arranca (un secreto conocido permitiría falsificar sesiones).
const SECRETO_DESARROLLO = 'solo_para_desarrollo_cambiar_este_secreto'
const SECRETOS_DE_EJEMPLO = [SECRETO_DESARROLLO, 'reemplazar_por_un_secreto_largo_y_unico', 'cambiar_este_secreto', 'secret', 'changeme']
export const enProduccion = process.env.NODE_ENV === 'production'
if (enProduccion && (!process.env.JWT_SECRET || SECRETOS_DE_EJEMPLO.includes(process.env.JWT_SECRET))) {
  throw new Error('Falta JWT_SECRET en .env (o es el valor de ejemplo). Generá uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"')
}
if (enProduccion && process.env.JWT_SECRET.length < 32) console.warn('[seguridad] JWT_SECRET es corto (menos de 32 caracteres): conviene uno más largo.')
export const secret = process.env.JWT_SECRET || SECRETO_DESARROLLO
export const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
export const normalizedRole = rol => String(rol).toLowerCase()
export const sign = user => jwt.sign({ id: user.id, rol: normalizedRole(user.rol), nombre: user.nombre }, secret, { expiresIn: '8h' })
export const auth = (roles = []) => async (req, res, next) => {
  let user
  try {
    const cabecera = req.headers.authorization || ''
    user = jwt.verify(cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '', secret, { algorithms: ['HS256'] })
  } catch { return res.status(401).json({ error: 'Sesión no válida o vencida.' }) }

  // El rol y el estado de la cuenta se leen SIEMPRE de la base, no del token:
  // así una cuenta desactivada o eliminada pierde el acceso de inmediato y un
  // cambio de rol se aplica al instante (antes valían hasta 8 horas).
  try {
    const { rows } = await pool.query('SELECT nombre, LOWER(rol::text) AS rol, activo FROM usuarios WHERE id = $1', [user.id])
    if (!rows[0]?.activo) return res.status(401).json({ error: 'Sesión no válida o vencida.' })
    user.rol = normalizedRole(rows[0].rol)
    user.nombre = rows[0].nombre
  } catch (error) { return next(error) }

  // "super_admin" es el nivel máximo de permisos del sistema: supera
  // cualquier comprobación de rol hecha acá, sin excepción. Esta es la
  // función centralizada de permisos (todas las rutas pasan por acá), así
  // que este único bypass alcanza para darle acceso a toda la aplicación.
  if (roles.length && user.rol !== 'super_admin' && !roles.includes(user.rol)) return res.status(403).json({ error: 'No tenés permisos para esta acción.' })
  req.user = user
  next()
}

// Helper compartido: ¿este rol tiene la visión/permisos de nivel
// administrativo de una ruta (ve y gestiona todo, no solo lo propio)?
// "admin" y "super_admin" lo cumplen los dos.
export const esAdmin = rol => rol === 'admin' || rol === 'super_admin'

// El enum rol_usuario puede estar en minúscula o mayúscula según cómo se creó la base.
export const rolLiteral = parametro => `(SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = ${parametro})`
export const fallo = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status })
export const entero = valor => { const numero = Number(valor); return Number.isFinite(numero) ? Math.round(numero) : null }
export const decimal = valor => { const numero = Number(valor); return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0 }

// ---------------------------------------------------------------------
// VALIDACIÓN DE DATOS DE CONTACTO
// Se usan tanto al crear/editar un cliente (server/rutas/clientes.js) como
// al cargar un cliente nuevo desde el alta de un pedido (server/rutas/
// pedidos.js). Los dos campos son opcionales: solo se valida el formato
// cuando vienen completos, nunca que estén presentes.
// ---------------------------------------------------------------------
const patronTelefono = /^[0-9+()\-\s]{6,20}$/
const patronEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarTelefono(valor) {
  const texto = (valor || '').trim()
  if (texto && !patronTelefono.test(texto)) throw fallo('El teléfono no es válido. Usá solo números, espacios, +, - y paréntesis.')
  return texto || null
}

export function validarEmail(valor) {
  const texto = (valor || '').trim().toLowerCase()
  if (texto && !patronEmail.test(texto)) throw fallo('El email no es válido. Ej: nombre@dominio.com')
  return texto || null
}

// ---------------------------------------------------------------------
// CONFIGURACIÓN
// ---------------------------------------------------------------------
export const configuracionPorDefecto = {
  semaforo_tolerancia: '0.1',
  moneda: 'ARS',
  negocio_nombre: 'Un atelier',
  negocio_rubro: 'Herrería de diseño',
  negocio_eslogan: 'Un galpón de objetos con historia',
  negocio_descripcion: 'Cuidamos lo que el tiempo dejó en cada objeto y construimos con materiales que todavía tienen mucho por contar.',
  negocio_whatsapp: '',
  negocio_email: '',
  negocio_telefono: '',
  negocio_direccion: '',
  negocio_instagram: '',
  negocio_facebook: '',
  negocio_horario: '',
  negocio_hero_video: '',
  negocio_nosotros_imagen: '',
  costo_hora_mano_obra: '0'
}

// Claves de configuración seguras para exponer en la web pública. El
// resto (semáforo, costeo, etc.) es información
// interna del taller y nunca debe salir por /api/publico.
export const clavesConfiguracionPublica = [
  'negocio_nombre', 'negocio_rubro', 'negocio_eslogan', 'negocio_descripcion', 'negocio_whatsapp',
  'negocio_email', 'negocio_telefono', 'negocio_direccion', 'negocio_instagram',
  'negocio_facebook', 'negocio_horario', 'negocio_hero_video', 'negocio_nosotros_imagen', 'moneda'
]

// Categorías BASE de producto: database/schema.sql garantiza que estas tres
// existan siempre. Además, el administrador puede crear categorías nuevas
// desde el panel (POST /api/categorias), que se guardan en la misma tabla
// `categorias` y ya no se borran. La categoría de un producto es opcional.
export const CATEGORIAS_PRODUCTO = [
  { slug: 'mesas', nombre: 'Mesas' },
  { slug: 'mesitas-ratoneras', nombre: 'Mesitas ratoneras' },
  { slug: 'fogoneros', nombre: 'Fogoneros' }
]
export const SLUGS_CATEGORIAS_PRODUCTO = CATEGORIAS_PRODUCTO.map(categoria => categoria.slug)

// Genera un slug URL-friendly a partir de un texto (nombre de producto o
// categoría), sin acentos ni caracteres especiales.
export const slugify = texto =>
  String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 180)

export async function leerConfiguracion(cliente = pool) {
  const { rows } = await cliente.query('SELECT clave, valor FROM configuracion')
  return { ...configuracionPorDefecto, ...Object.fromEntries(rows.map(fila => [fila.clave, fila.valor])) }
}

// El semáforo de rendimiento (tiempo real contra estimado) se dejó de
// calcular: el empleado ya no informa cuánto tardó, solo completa la etapa.
// Las etapas cerradas antes conservan su semáforo como historial.

// Recalcula el estado de un pedido según el avance de sus etapas.
export async function sincronizarPedido(cliente, pedidoId) {
  const { rows } = await cliente.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE estado = 'COMPLETADA')::int AS completadas,
            COUNT(*) FILTER (WHERE estado <> 'PENDIENTE')::int AS iniciadas
     FROM pedido_etapas WHERE pedido_id = $1`, [pedidoId])
  const { total, completadas, iniciadas } = rows[0]
  const estadoActual = (await cliente.query('SELECT estado FROM pedidos WHERE id = $1', [pedidoId])).rows[0]?.estado
  if (['CANCELADO', 'PAUSADO'].includes(estadoActual)) return estadoActual

  const estado = total && completadas === total ? 'TERMINADO' : iniciadas ? 'EN_PRODUCCION' : 'PENDIENTE'
  await cliente.query(
    `UPDATE pedidos SET estado = $1::estado_pedido, actualizado_en = NOW(),
       terminado_en = CASE WHEN $1 = 'TERMINADO' THEN COALESCE(terminado_en, NOW()) ELSE NULL END
     WHERE id = $2`, [estado, pedidoId])
  return estado
}
