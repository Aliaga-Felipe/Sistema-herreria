import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, fallo, leerConfiguracion, slugify } from '../comun.js'

const router = Router()

const consultaProductos = `SELECT p.id, p.nombre, p.descripcion, p.precio_venta::float8 AS precio_venta, p.activo, p.destacado, p.slug, p.creado_en,
    p.categoria_id, c.nombre AS categoria_nombre, c.slug AS categoria_slug, p.horas_hombre::float8 AS horas_hombre, p.chapita_id,
    COALESCE(SUM(e.costo), 0)::float8 AS costo_total,
    COALESCE(SUM(e.minutos_estimados), 0)::int AS minutos_totales,
    (p.precio_venta - COALESCE(SUM(e.costo), 0))::float8 AS margen,
    COALESCE(json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'descripcion', e.descripcion, 'orden', e.orden,
      'costo', e.costo::float8, 'minutos_estimados', e.minutos_estimados) ORDER BY e.orden) FILTER (WHERE e.id IS NOT NULL), '[]') AS etapas,
    COALESCE((SELECT json_agg(jsonb_build_object('id', pi.id, 'url', pi.url, 'orden', pi.orden, 'es_principal', pi.es_principal) ORDER BY pi.orden)
      FROM producto_imagenes pi WHERE pi.producto_id = p.id), '[]') AS imagenes,
    COALESCE((SELECT SUM(pm.cantidad * m.precio_unitario) FROM producto_materiales pm JOIN materiales m ON m.id = pm.material_id WHERE pm.producto_id = p.id), 0)::float8 AS costo_materiales,
    COALESCE((SELECT json_agg(jsonb_build_object('id', pm.id, 'material_id', m.id, 'nombre', m.nombre, 'unidad_medida', m.unidad_medida,
        'precio_unitario', m.precio_unitario::float8, 'cantidad', pm.cantidad::float8, 'subtotal', (pm.cantidad * m.precio_unitario)::float8) ORDER BY m.nombre)
      FROM producto_materiales pm JOIN materiales m ON m.id = pm.material_id WHERE pm.producto_id = p.id), '[]') AS materiales
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN etapas_producto e ON e.producto_id = p.id
  GROUP BY p.id, c.nombre, c.slug`

// Agrega el desglose de costo calculado (materiales + mano de obra) a cada
// fila. Convive con costo_total (suma de costos de etapa) sin reemplazarlo:
// son dos formas de costear el producto que el admin puede comparar.
const conCostoCalculado = async filas => {
  const costoHora = Number((await leerConfiguracion()).costo_hora_mano_obra) || 0
  return filas.map(fila => {
    const costoManoObra = decimal((Number(fila.horas_hombre) || 0) * costoHora)
    return { ...fila, costo_hora_mano_obra: costoHora, costo_mano_obra: costoManoObra, costo_calculado_total: decimal(fila.costo_materiales + costoManoObra) }
  })
}

// Valida y normaliza las etapas que define el admin para un producto.
const normalizarEtapas = etapas => {
  if (!Array.isArray(etapas) || !etapas.length) throw fallo('El producto necesita al menos una etapa de fabricación.')
  return etapas.map((etapa, indice) => {
    const minutos = entero(etapa?.minutos_estimados)
    if (!etapa?.nombre?.trim()) throw fallo('Cada etapa necesita un nombre.')
    if (!minutos || minutos <= 0) throw fallo(`La etapa "${etapa.nombre}" necesita una duración estimada mayor a cero.`)
    return { nombre: etapa.nombre.trim(), descripcion: etapa.descripcion?.trim() || null, orden: indice + 1, costo: Math.max(0, decimal(etapa.costo)), minutos_estimados: minutos }
  })
}

const guardarEtapas = async (cliente, productoId, etapas) => {
  await cliente.query('DELETE FROM etapas_producto WHERE producto_id = $1', [productoId])
  for (const etapa of etapas) {
    await cliente.query('INSERT INTO etapas_producto (producto_id, nombre, descripcion, orden, costo, minutos_estimados) VALUES ($1, $2, $3, $4, $5, $6)',
      [productoId, etapa.nombre, etapa.descripcion, etapa.orden, etapa.costo, etapa.minutos_estimados])
  }
}

// Valida y normaliza los materiales que el admin asocia a un producto
// (opcional: un producto puede no tener materiales cargados todavía).
const normalizarMateriales = materiales => {
  if (!Array.isArray(materiales)) return []
  const vistos = new Set()
  return materiales.filter(item => item?.material_id).map(item => {
    if (vistos.has(String(item.material_id))) throw fallo('No repitas el mismo material en la lista.')
    vistos.add(String(item.material_id))
    const cantidad = decimal(item.cantidad)
    if (cantidad <= 0) throw fallo('Cada material necesita una cantidad mayor a cero.')
    return { material_id: item.material_id, cantidad }
  })
}

const guardarMateriales = async (cliente, productoId, materiales) => {
  await cliente.query('DELETE FROM producto_materiales WHERE producto_id = $1', [productoId])
  for (const item of materiales) {
    await cliente.query('INSERT INTO producto_materiales (producto_id, material_id, cantidad) VALUES ($1, $2, $3)',
      [productoId, item.material_id, item.cantidad])
  }
}

// Genera un slug único a partir del nombre. Si ya existe (por ejemplo dos
// productos "Mesa ratona") agrega un sufijo numérico hasta que sea único.
const generarSlugUnico = async (cliente, nombre, idExcluir = null) => {
  const base = slugify(nombre) || 'producto'
  let slug = base
  let sufijo = 2
  while (true) {
    const { rows } = await cliente.query(
      idExcluir ? 'SELECT 1 FROM productos WHERE slug = $1 AND id <> $2' : 'SELECT 1 FROM productos WHERE slug = $1',
      idExcluir ? [slug, idExcluir] : [slug]
    )
    if (!rows[0]) return slug
    slug = `${base}-${sufijo}`
    sufijo += 1
  }
}

// El ID de pieza identifica el producto en la chapita vintage de la web
// pública ("PC N° 001", etc). Es opcional y de uso libre (números o
// letras), se recorta y se limita a 20 caracteres para que entre en la
// columna. La unicidad real la garantiza la restricción UNIQUE de la
// base (productos_id_pieza_key, ver migracion_008_id_pieza.sql): acá
// sólo se normaliza el valor, no se valida que esté libre.
const normalizarIdPieza = idPieza => {
  const valor = idPieza?.toString().trim() || ''
  if (!valor) return null
  if (valor.length > 20) throw fallo('El ID de pieza no puede superar los 20 caracteres.')
  return valor
}

const validarCategoria = async categoriaId => {
  if (categoriaId === null || categoriaId === undefined || categoriaId === '') return null
  const { rows } = await pool.query('SELECT id FROM categorias WHERE id = $1', [categoriaId])
  if (!rows[0]) throw fallo('La categoría seleccionada no existe.')
  return categoriaId
}

router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivos = req.query.activos === 'true'
  const { rows } = await pool.query(`${consultaProductos}${soloActivos ? ' HAVING p.activo' : ''} ORDER BY p.nombre`)
  res.json(await conCostoCalculado(rows))
}))

router.get('/:id', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaProductos} HAVING p.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  res.json((await conCostoCalculado(rows))[0])
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', precio_venta, etapas, categoria_id = null, destacado = false, horas_hombre = 0, materiales = [], chapita_id = null } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del producto.')
  const precio = decimal(precio_venta)
  if (precio <= 0) throw fallo('El precio de venta debe ser mayor a cero.')
  const horasHombre = Math.max(0, decimal(horas_hombre))
  const chapitaId = chapita_id?.toString().trim() || null
  const normalizadas = normalizarEtapas(etapas)
  const materialesNormalizados = normalizarMateriales(materiales)
  const categoriaValida = await validarCategoria(categoria_id)
  const idPieza = normalizarIdPieza(id_pieza)

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const slug = await generarSlugUnico(cliente, nombre.trim())
    const { rows } = await cliente.query(
      'INSERT INTO productos (nombre, descripcion, precio_venta, categoria_id, slug, destacado, horas_hombre, chapita_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [nombre.trim(), descripcion?.trim() || null, precio, categoriaValida, slug, Boolean(destacado), horasHombre, chapitaId]
    )
    await guardarEtapas(cliente, rows[0].id, normalizadas)
    await guardarMateriales(cliente, rows[0].id, materialesNormalizados)
    await cliente.query('COMMIT')
    const creado = await pool.query(`${consultaProductos} HAVING p.id = $1`, [rows[0].id])
    res.status(201).json((await conCostoCalculado(creado.rows))[0])
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505' && error.constraint === 'productos_id_pieza_key') throw fallo(`El ID de pieza "${idPieza}" ya existe. Elegí otro ID.`, 409)
    throw error
  } finally { cliente.release() }
}))

router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', precio_venta, etapas, categoria_id = null, destacado = false, horas_hombre = 0, materiales = [], chapita_id = null } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del producto.')
  const precio = decimal(precio_venta)
  if (precio <= 0) throw fallo('El precio de venta debe ser mayor a cero.')
  const horasHombre = Math.max(0, decimal(horas_hombre))
  const chapitaId = chapita_id?.toString().trim() || null
  const normalizadas = normalizarEtapas(etapas)
  const materialesNormalizados = normalizarMateriales(materiales)
  const categoriaValida = await validarCategoria(categoria_id)
  const idPieza = normalizarIdPieza(id_pieza)

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const actual = await cliente.query('SELECT nombre, slug FROM productos WHERE id = $1', [req.params.id])
    if (!actual.rows[0]) throw fallo('Producto no encontrado.', 404)
    // Sólo regenera el slug si cambió el nombre, para no romper enlaces ya compartidos.
    const slug = actual.rows[0].nombre === nombre.trim() && actual.rows[0].slug
      ? actual.rows[0].slug
      : await generarSlugUnico(cliente, nombre.trim(), req.params.id)

    const { rows } = await cliente.query(
      'UPDATE productos SET nombre = $1, descripcion = $2, precio_venta = $3, categoria_id = $4, slug = $5, destacado = $6, horas_hombre = $7, chapita_id = $8, actualizado_en = NOW() WHERE id = $9 RETURNING id',
      [nombre.trim(), descripcion?.trim() || null, precio, categoriaValida, slug, Boolean(destacado), horasHombre, chapitaId, req.params.id]
    )
    if (!rows[0]) throw fallo('Producto no encontrado.', 404)
    // Los pedidos ya generados guardan copia de nombre, costo y minutos,
    // así que reescribir las etapas no altera la producción en curso.
    await guardarEtapas(cliente, rows[0].id, normalizadas)
    await guardarMateriales(cliente, rows[0].id, materialesNormalizados)
    await cliente.query('COMMIT')
    const actualizado = await pool.query(`${consultaProductos} HAVING p.id = $1`, [rows[0].id])
    res.json((await conCostoCalculado(actualizado.rows))[0])
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505' && error.constraint === 'productos_id_pieza_key') throw fallo(`El ID de pieza "${idPieza}" ya existe. Elegí otro ID.`, 409)
    throw error
  } finally { cliente.release() }
}))

router.patch('/:id/activo', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  const { rows } = await pool.query('UPDATE productos SET activo = $1, actualizado_en = NOW() WHERE id = $2 RETURNING id, nombre, activo', [activo, req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  res.json(rows[0])
}))

// Si el producto ya se usó en un pedido se desactiva en lugar de borrarse,
// para no perder el historial de producción.
router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const usos = await pool.query('SELECT 1 FROM pedido_items WHERE producto_id = $1 LIMIT 1', [req.params.id])
  if (usos.rows[0]) {
    const { rows } = await pool.query('UPDATE productos SET activo = FALSE, actualizado_en = NOW() WHERE id = $1 RETURNING id', [req.params.id])
    if (!rows[0]) throw fallo('Producto no encontrado.', 404)
    return res.json({ mensaje: 'El producto tiene pedidos asociados: se desactivó en lugar de borrarse.', desactivado: true })
  }
  const { rows } = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  res.json({ mensaje: 'Producto eliminado.', desactivado: false })
}))

// -----------------------------------------------------------------------
// GALERÍA DE IMÁGENES
// Los archivos se guardan en disco (server/uploads/productos) y se sirven
// como estáticos desde /uploads (ver server/index.js). Sólo se guarda la
// URL relativa en la base, nunca el archivo en sí.
// -----------------------------------------------------------------------
const directorioUploads = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'productos')
fs.mkdirSync(directorioUploads, { recursive: true })

const tiposPermitidos = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, directorioUploads),
    filename: (_, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`)
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(tiposPermitidos.has(file.mimetype) ? null : fallo('Formato de imagen no soportado. Usá JPG, PNG, WEBP o GIF.'), tiposPermitidos.has(file.mimetype))
})

const listarImagenes = async productoId => {
  const { rows } = await pool.query('SELECT id, url, orden, es_principal FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden', [productoId])
  return rows
}

router.post('/:id/imagenes', auth(['admin']), (req, res, next) => {
  upload.single('imagen')(req, res, error => {
    if (error) return res.status(400).json({ error: error.message || 'No se pudo subir la imagen.' })
    next()
  })
}, asyncRoute(async (req, res) => {
  const producto = await pool.query('SELECT id FROM productos WHERE id = $1', [req.params.id])
  if (!producto.rows[0]) throw fallo('Producto no encontrado.', 404)
  if (!req.file) throw fallo('Adjuntá un archivo de imagen.')

  const url = `/uploads/productos/${req.file.filename}`
  const existentes = await pool.query('SELECT COUNT(*)::int AS total, COALESCE(MAX(orden), 0)::int AS max_orden FROM producto_imagenes WHERE producto_id = $1', [req.params.id])
  const esPrimera = existentes.rows[0].total === 0
  const { rows } = await pool.query(
    'INSERT INTO producto_imagenes (producto_id, url, orden, es_principal) VALUES ($1, $2, $3, $4) RETURNING id, url, orden, es_principal',
    [req.params.id, url, existentes.rows[0].max_orden + 1, esPrimera]
  )
  res.status(201).json({ imagen: rows[0], imagenes: await listarImagenes(req.params.id) })
}))

router.patch('/:id/imagenes/:imagenId/principal', auth(['admin']), asyncRoute(async (req, res) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const objetivo = await cliente.query('SELECT id FROM producto_imagenes WHERE id = $1 AND producto_id = $2', [req.params.imagenId, req.params.id])
    if (!objetivo.rows[0]) throw fallo('Imagen no encontrada.', 404)
    await cliente.query('UPDATE producto_imagenes SET es_principal = FALSE WHERE producto_id = $1', [req.params.id])
    await cliente.query('UPDATE producto_imagenes SET es_principal = TRUE WHERE id = $1', [req.params.imagenId])
    await cliente.query('COMMIT')
  } catch (error) { await cliente.query('ROLLBACK'); throw error } finally { cliente.release() }
  res.json({ imagenes: await listarImagenes(req.params.id) })
}))

router.delete('/:id/imagenes/:imagenId', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM producto_imagenes WHERE id = $1 AND producto_id = $2 RETURNING url, es_principal', [req.params.imagenId, req.params.id])
  if (!rows[0]) throw fallo('Imagen no encontrada.', 404)

  // Borra el archivo físico sin interrumpir la respuesta si ya no existe.
  const archivo = path.join(directorioUploads, path.basename(rows[0].url))
  fs.unlink(archivo, () => {})

  // Si la imagen borrada era la principal, promueve a la siguiente en orden.
  if (rows[0].es_principal) {
    const restante = await pool.query('SELECT id FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden LIMIT 1', [req.params.id])
    if (restante.rows[0]) await pool.query('UPDATE producto_imagenes SET es_principal = TRUE WHERE id = $1', [restante.rows[0].id])
  }
  res.json({ imagenes: await listarImagenes(req.params.id) })
}))

export default router
