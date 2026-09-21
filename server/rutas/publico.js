import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, clavesConfiguracionPublica, fallo, leerConfiguracion } from '../comun.js'

const router = Router()

// -----------------------------------------------------------------------
// API PÚBLICA DEL CATÁLOGO
// Sin autenticación: sólo lee la misma tabla `productos` que administra el
// sistema interno, filtrando siempre por `activo = true` y sin exponer
// nunca costos ni etapas de fabricación (eso es información interna).
// -----------------------------------------------------------------------

const columnasPublicas = `p.id, p.nombre, p.descripcion, p.precio_venta::float8 AS precio_venta, p.slug, p.destacado, p.id_pieza, p.creado_en,
    c.id AS categoria_id, c.nombre AS categoria_nombre, c.slug AS categoria_slug,
    (SELECT pi.url FROM producto_imagenes pi WHERE pi.producto_id = p.id ORDER BY pi.es_principal DESC, pi.orden LIMIT 1) AS imagen_principal`

const ordenPermitido = {
  novedades: 'p.creado_en DESC',
  precio_asc: 'p.precio_venta ASC',
  precio_desc: 'p.precio_venta DESC',
  nombre: 'p.nombre ASC'
}

router.get('/productos', asyncRoute(async (req, res) => {
  const condiciones = ['p.activo = TRUE']
  const valores = []

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
     WHERE p.slug = $1 AND p.activo = TRUE`,
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
         WHERE p.categoria_id = $1 AND p.activo = TRUE AND p.id <> $2 ORDER BY p.creado_en DESC LIMIT 4`,
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
             WHERE p2.categoria_id = c.id AND p2.activo = TRUE ORDER BY pi.es_principal DESC, pi.orden LIMIT 1)
        ) AS imagen,
        COUNT(p.id) FILTER (WHERE p.activo)::int AS productos_total
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

export default router
