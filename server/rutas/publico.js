import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, clavesConfiguracionPublica, fallo, leerConfiguracion, validarEmail, validarTelefono } from '../comun.js'
import { enviarConsulta } from '../correo.js'
import { crearLimitador, limpiarTexto, textoDeConsulta } from '../seguridad.js'
import crypto from 'crypto'

const router = Router()

// -----------------------------------------------------------------------
// API PÚBLICA DEL CATÁLOGO
// Sin autenticación: sólo lee la misma tabla `productos` que administra el
// sistema interno, filtrando siempre por productos VISIBLES (activo y
// marcados como "Publicar en la web", ver productoVisible) y sin exponer
// nunca costos ni etapas de fabricación (eso es información interna).
// -----------------------------------------------------------------------

const columnasPublicas = `p.id, p.nombre, p.descripcion, p.precio_venta::float8 AS precio_venta, p.slug, p.destacado, p.creado_en, p.chapita_id,
    p.medidas, p.historia,
    c.id AS categoria_id, c.nombre AS categoria_nombre, c.slug AS categoria_slug,
    (SELECT pi.url FROM producto_imagenes pi WHERE pi.producto_id = p.id ORDER BY pi.es_principal DESC, pi.orden LIMIT 1) AS imagen_principal`

// Un producto se ve en la web pública sólo si está activo Y el admin marcó
// "Publicar en la web" (productos.publicado). Se usa en todas las consultas
// públicas: listado, destacados, detalle, relacionados y categorías.
const productoVisible = alias => `${alias}.activo = TRUE AND ${alias}.publicado = TRUE`

const ordenPermitido = {
  novedades: 'p.creado_en DESC',
  // Los productos sin precio ("Consultar precio") van siempre al final.
  precio_asc: 'p.precio_venta ASC NULLS LAST',
  precio_desc: 'p.precio_venta DESC NULLS LAST',
  nombre: 'p.nombre ASC'
}

router.get('/productos', asyncRoute(async (req, res) => {
  const condiciones = [productoVisible('p')]
  const valores = []

  // Filtro por categoría (opcional). Sin categoría elegida se listan todos
  // los productos activos, incluidos los que no tienen categoría. Se
  // combina con la búsqueda (q), el orden y la paginación.
  const categoria = textoDeConsulta(req.query.categoria).slice(0, 120)
  const busqueda = textoDeConsulta(req.query.q).trim().slice(0, 100)
  if (categoria) {
    valores.push(categoria)
    condiciones.push(`c.slug = $${valores.length}`)
  }
  if (busqueda) {
    // Los comodines de LIKE escritos por el visitante se escapan: se busca el texto tal cual.
    valores.push(`%${busqueda.replace(/[\\%_]/g, '\\$&')}%`)
    condiciones.push(`(p.nombre ILIKE $${valores.length} OR p.descripcion ILIKE $${valores.length})`)
  }
  if (req.query.destacados === 'true') condiciones.push('p.destacado = TRUE')

  const orden = ordenPermitido[req.query.orden] || ordenPermitido.novedades
  const limite = Math.min(48, Math.max(1, Number(req.query.limite) || 24))
  const pagina = Math.max(1, Number(req.query.pagina) || 1)
  const offset = (pagina - 1) * limite

  const total = await pool.query(
    `SELECT COUNT(*)::int AS total FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE ${condiciones.join(' AND ')}`,
    valores
  )

  valores.push(limite, offset)
  const { rows } = await pool.query(
    `SELECT ${columnasPublicas} FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE ${condiciones.join(' AND ')} ORDER BY ${orden} LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores
  )

  res.json({ productos: rows, total: total.rows[0].total, pagina, limite, paginas: Math.max(1, Math.ceil(total.rows[0].total / limite)) })
}))

router.get('/productos/:slug', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${columnasPublicas} FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE p.slug = $1 AND ${productoVisible('p')}`,
    [req.params.slug]
  )
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)

  const imagenes = await pool.query(
    'SELECT id, url, orden, es_principal FROM producto_imagenes WHERE producto_id = $1 ORDER BY es_principal DESC, orden',
    [rows[0].id]
  )
  // Productos relacionados: misma categoría, excluyendo el actual.
  const relacionados = rows[0].categoria_id
    ? await pool.query(
        `SELECT ${columnasPublicas} FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
         WHERE p.categoria_id = $1 AND ${productoVisible('p')} AND p.id <> $2 ORDER BY p.creado_en DESC LIMIT 4`,
        [rows[0].categoria_id, rows[0].id]
      )
    : { rows: [] }

  res.json({ ...rows[0], imagenes: imagenes.rows, relacionados: relacionados.rows })
}))

router.get('/categorias', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, c.slug, c.descripcion, c.orden,
        COALESCE(c.imagen_url,
          (SELECT pi.url FROM productos p2 JOIN producto_imagenes pi ON pi.producto_id = p2.id
             WHERE p2.categoria_id = c.id AND ${productoVisible('p2')} ORDER BY pi.es_principal DESC, pi.orden LIMIT 1)
        ) AS imagen,
        COUNT(p.id) FILTER (WHERE ${productoVisible('p')})::int AS productos_total
      FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id
      WHERE c.activo = TRUE
      GROUP BY c.id
      ORDER BY c.orden, c.nombre`
  )
  res.json(rows)
}))

// Sólo las claves seguras de `configuracion` (nombre del negocio, WhatsApp,
// redes, moneda). Los parámetros internos de recompensas nunca se exponen.
router.get('/configuracion', asyncRoute(async (_, res) => {
  const completa = await leerConfiguracion()
  res.json(Object.fromEntries(clavesConfiguracionPublica.map(clave => [clave, completa[clave] || ''])))
}))

// -----------------------------------------------------------------------
// FORMULARIO DE CONTACTO
// Sin autenticación (cualquier visitante de la web puede escribir), pero
// SIN exponer nunca el correo receptor al frontend: se resuelve acá,
// server-side, contra la tabla `configuracion` (clave
// "mail_receptor_consultas", exclusiva de super_admin para
// ver/editar — ver GET/PUT /api/configuracion/mail-receptor). Si todavía
// no se configuró un receptor dedicado, se usa negocio_email como
// respaldo para que el formulario funcione desde el primer momento.
// -----------------------------------------------------------------------
// PROTECCIÓN CONTRA SPAM Y ABUSO (el formulario es público y manda mails):
//  - Límite por IP: 3 consultas ENVIADAS cada 10 minutos y 10 por día (un
//    error de tipeo al completar el formulario no gasta ese cupo), y un tope
//    más amplio de 30 solicitudes de cualquier tipo cada 10 minutos.
//  - Límite global: 60 consultas por hora, para no agotar el correo saliente
//    aunque el ataque venga de muchas IP.
//  - Honeypot: el campo oculto "sitio_web" lo llenan los bots y no las personas;
//    si viene lleno se responde "ok" sin enviar nada (el bot no se entera).
//  - Tiempo mínimo: una persona tarda más de 2,5 segundos en completar el
//    formulario; una solicitud directa a la API o un bot, no.
//  - Validación estricta y limpieza de cada campo (sin HTML, sin saltos de
//    línea en nombre/asunto: evita inyección de cabeceras del mail).
//  - Rechazo de mensajes con muchos enlaces y de duplicados (doble clic o
//    reenvío del mismo texto en la última hora).
//  Se evaluó un CAPTCHA y por ahora NO hace falta: estas medidas frenan el
//  abuso sin molestar a quien escribe. Si algún día llega spam, el siguiente
//  paso sería agregar Cloudflare Turnstile (gratis y casi invisible).
const limiteContactoSolicitudes = crearLimitador({ ventanaMs: 10 * 60_000, max: 30, mensaje: 'Demasiadas solicitudes. Esperá unos minutos antes de intentar de nuevo.' })
const limiteContactoCorto = crearLimitador({ ventanaMs: 10 * 60_000, max: 3, mensaje: 'Ya enviaste varias consultas. Esperá unos minutos antes de mandar otra, o escribinos por WhatsApp.' })
const limiteContactoDia = crearLimitador({ ventanaMs: 24 * 60 * 60_000, max: 10, mensaje: 'Alcanzaste el máximo de consultas por día. Escribinos por WhatsApp.' })
const limiteContactoGlobal = crearLimitador({ ventanaMs: 60 * 60_000, max: 60, mensaje: 'Estamos recibiendo muchas consultas en este momento. Probá de nuevo más tarde o escribinos por WhatsApp.' })
const recientes = new Map() // huella de la consulta -> hora del envío (evita duplicados)
const TIEMPO_MINIMO_MS = 2500

router.post('/contacto', asyncRoute(async (req, res) => {
  const cuerpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  // Honeypot: si un bot llenó el campo trampa, se finge éxito y no se hace nada.
  if (typeof cuerpo.sitio_web === 'string' && cuerpo.sitio_web.trim()) return res.json({ mensaje: 'Consulta enviada correctamente.' })

  limiteContactoSolicitudes.exigir(req.ip)

  const tiempo = Number(cuerpo.tiempo_carga)
  if (!Number.isFinite(tiempo)) throw fallo('No pudimos validar el formulario. Recargá la página e intentá de nuevo.')
  if (tiempo < TIEMPO_MINIMO_MS) throw fallo('Enviaste el formulario demasiado rápido. Revisá tus datos y probá de nuevo.')

  const nombre = limpiarTexto(cuerpo.nombre, { max: 100 })
  const asunto = limpiarTexto(cuerpo.asunto, { max: 150 })
  const mensaje = limpiarTexto(cuerpo.mensaje, { max: 3000, multilinea: true })
  if (nombre.length < 2) throw fallo('Indicá tu nombre.')
  if (asunto.length < 3) throw fallo('Indicá el asunto de tu consulta.')
  if (mensaje.length < 10) throw fallo('Escribí tu mensaje (al menos 10 caracteres).')
  if (typeof cuerpo.email !== 'string' || cuerpo.email.length > 254) throw fallo('Indicá un correo electrónico válido.')
  const emailValidado = validarEmail(limpiarTexto(cuerpo.email, { max: 254 }))
  if (!emailValidado) throw fallo('Indicá un correo electrónico válido.')
  const telefonoValidado = validarTelefono(limpiarTexto(cuerpo.telefono, { max: 20 }))
  if ((mensaje.match(/https?:\/\/|www\./gi) || []).length > 2) throw fallo('Tu mensaje tiene demasiados enlaces. Escribinos sin ellos o por WhatsApp.')

  const huella = crypto.createHash('sha256').update(`${emailValidado}|${asunto}|${mensaje}`).digest('hex')
  const ahora = Date.now()
  for (const [clave, momento] of recientes) if (ahora - momento > 60 * 60_000) recientes.delete(clave)
  if (recientes.has(huella)) throw fallo('Ya recibimos esta consulta. Te vamos a responder a la brevedad.', 409)

  // Recién acá, con una consulta válida y no repetida, se cuenta contra los
  // cupos de envío.
  limiteContactoCorto.exigir(req.ip)
  limiteContactoDia.exigir(req.ip)
  limiteContactoGlobal.exigir('global')

  const [receptor, completa] = await Promise.all([
    pool.query("SELECT valor FROM configuracion WHERE clave = 'mail_receptor_consultas'"),
    leerConfiguracion()
  ])
  const destino = receptor.rows[0]?.valor?.trim() || completa.negocio_email?.trim() || null
  if (!destino) throw fallo('El taller todavía no configuró un correo para recibir consultas. Probá escribir por WhatsApp mientras tanto.', 503)

  recientes.set(huella, ahora)
  try {
    await enviarConsulta({ nombre, email: emailValidado, telefono: telefonoValidado, asunto, mensaje }, destino)
  } catch (error) {
    recientes.delete(huella) // si el envío falló, que pueda reintentar
    throw error
  }
  res.json({ mensaje: 'Consulta enviada correctamente.' })
}))

export default router
