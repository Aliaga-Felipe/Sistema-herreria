import { Router } from 'express'
import { pool } from '../db.js'
import { SLUGS_CATEGORIAS_PRODUCTO, asyncRoute, clavesConfiguracionPublica, fallo, leerConfiguracion, validarEmail, validarTelefono } from '../comun.js'
import { enviarConsulta } from '../correo.js'

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
  precio_asc: 'p.precio_venta ASC',
  precio_desc: 'p.precio_venta DESC',
  nombre: 'p.nombre ASC'
}

router.get('/productos', asyncRoute(async (req, res) => {
  const condiciones = [productoVisible('p')]
  const valores = []

  // Filtro por categoría (opcional). Sin categoría elegida se listan todos
  // los productos activos, incluidos los que no tienen categoría. Se
  // combina con la búsqueda (q), el orden y la paginación.
  if (req.query.categoria) {
    valores.push(req.query.categoria)
    condiciones.push(`c.slug = $${valores.length}`)
  }
  if (req.query.q) {
    valores.push(`%${req.query.q.trim()}%`)
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
      WHERE c.activo = TRUE AND c.slug = ANY($1::text[])
      GROUP BY c.id
      ORDER BY c.orden, c.nombre`,
    [SLUGS_CATEGORIAS_PRODUCTO]
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
router.post('/contacto', asyncRoute(async (req, res) => {
  const { nombre, email, telefono = '', asunto, mensaje } = req.body || {}
  if (!nombre?.trim()) throw fallo('Indicá tu nombre.')
  if (!asunto?.trim()) throw fallo('Indicá el asunto de tu consulta.')
  if (!mensaje?.trim()) throw fallo('Escribí tu mensaje.')
  const emailValidado = validarEmail(email)
  if (!emailValidado) throw fallo('Indicá un correo electrónico válido.')
  const telefonoValidado = validarTelefono(telefono)

  const [receptor, completa] = await Promise.all([
    pool.query("SELECT valor FROM configuracion WHERE clave = 'mail_receptor_consultas'"),
    leerConfiguracion()
  ])
  const destino = receptor.rows[0]?.valor?.trim() || completa.negocio_email?.trim() || null
  if (!destino) throw fallo('El taller todavía no configuró un correo para recibir consultas. Probá escribir por WhatsApp mientras tanto.', 503)

  await enviarConsulta({ nombre: nombre.trim(), email: emailValidado, telefono: telefonoValidado, asunto: asunto.trim(), mensaje: mensaje.trim() }, destino)
  res.json({ mensaje: 'Consulta enviada correctamente.' })
}))

export default router
