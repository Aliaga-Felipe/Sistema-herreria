import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo, slugify } from '../comun.js'

const router = Router()

const consultaCategorias = `SELECT c.id, c.nombre, c.slug, c.descripcion, c.orden, c.activo, c.imagen_url, c.creado_en,
    COUNT(p.id)::int AS productos_total
  FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id
  GROUP BY c.id`

const generarSlugUnico = async (cliente, nombre, idExcluir = null) => {
  const base = slugify(nombre) || 'categoria'
  let slug = base
  let sufijo = 2
  while (true) {
    const { rows } = await cliente.query(
      idExcluir ? 'SELECT 1 FROM categorias WHERE slug = $1 AND id <> $2' : 'SELECT 1 FROM categorias WHERE slug = $1',
      idExcluir ? [slug, idExcluir] : [slug]
    )
    if (!rows[0]) return slug
    slug = `${base}-${sufijo}`
    sufijo += 1
  }
}

// Requiere sesión (cualquier rol) para listar, igual que el resto del panel.
router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivas = req.query.activas === 'true'
  const { rows } = await pool.query(`${consultaCategorias}${soloActivas ? ' HAVING c.activo' : ''} ORDER BY c.orden, c.nombre`)
  res.json(rows)
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', orden = 0 } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre de la categoría.')

  const cliente = await pool.connect()
  try {
    const slug = await generarSlugUnico(cliente, nombre.trim())
    const { rows } = await cliente.query(
      'INSERT INTO categorias (nombre, slug, descripcion, orden) VALUES ($1, $2, $3, $4) RETURNING id',
      [nombre.trim(), slug, descripcion?.trim() || null, Number(orden) || 0]
    )
    const creada = await pool.query(`${consultaCategorias} HAVING c.id = $1`, [rows[0].id])
    res.status(201).json(creada.rows[0])
  } finally { cliente.release() }
}))

router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', orden = 0 } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre de la categoría.')

  const cliente = await pool.connect()
  try {
    const actual = await cliente.query('SELECT nombre, slug FROM categorias WHERE id = $1', [req.params.id])
    if (!actual.rows[0]) throw fallo('Categoría no encontrada.', 404)
    const slug = actual.rows[0].nombre === nombre.trim() && actual.rows[0].slug
      ? actual.rows[0].slug
      : await generarSlugUnico(cliente, nombre.trim(), req.params.id)

    const { rows } = await cliente.query(
      'UPDATE categorias SET nombre = $1, slug = $2, descripcion = $3, orden = $4 WHERE id = $5 RETURNING id',
      [nombre.trim(), slug, descripcion?.trim() || null, Number(orden) || 0, req.params.id]
    )
    if (!rows[0]) throw fallo('Categoría no encontrada.', 404)
    const actualizada = await pool.query(`${consultaCategorias} HAVING c.id = $1`, [rows[0].id])
    res.json(actualizada.rows[0])
  } finally { cliente.release() }
}))

router.patch('/:id/activo', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  const { rows } = await pool.query('UPDATE categorias SET activo = $1 WHERE id = $2 RETURNING id, nombre, activo', [activo, req.params.id])
  if (!rows[0]) throw fallo('Categoría no encontrada.', 404)
  res.json(rows[0])
}))

// Si tiene productos asociados se desactiva en lugar de borrarse, para no
// dejar productos huérfanos ni romper enlaces /productos?categoria=slug.
router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const usos = await pool.query('SELECT 1 FROM productos WHERE categoria_id = $1 LIMIT 1', [req.params.id])
  if (usos.rows[0]) {
    const { rows } = await pool.query('UPDATE categorias SET activo = FALSE WHERE id = $1 RETURNING id', [req.params.id])
    if (!rows[0]) throw fallo('Categoría no encontrada.', 404)
    return res.json({ mensaje: 'La categoría tiene productos asociados: se desactivó en lugar de borrarse.', desactivada: true })
  }
  const { rows } = await pool.query('DELETE FROM categorias WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Categoría no encontrada.', 404)
  res.json({ mensaje: 'Categoría eliminada.', desactivada: false })
}))

// -----------------------------------------------------------------------
// FOTO DE LA CATEGORÍA
// Una sola imagen por categoría, guardada en disco y servida desde
// /uploads (igual mecanismo que las fotos de productos).
// -----------------------------------------------------------------------
const directorioUploads = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'categorias')
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

const borrarArchivo = url => { if (url) fs.unlink(path.join(directorioUploads, path.basename(url)), () => {}) }

router.post('/:id/imagen', auth(['admin']), (req, res, next) => {
  upload.single('imagen')(req, res, error => {
    if (error) return res.status(400).json({ error: error.message || 'No se pudo subir la imagen.' })
    next()
  })
}, asyncRoute(async (req, res) => {
  const categoria = await pool.query('SELECT id, imagen_url FROM categorias WHERE id = $1', [req.params.id])
  if (!categoria.rows[0]) throw fallo('Categoría no encontrada.', 404)
  if (!req.file) throw fallo('Adjuntá un archivo de imagen.')

  const url = `/uploads/categorias/${req.file.filename}`
  await pool.query('UPDATE categorias SET imagen_url = $1 WHERE id = $2', [url, req.params.id])
  borrarArchivo(categoria.rows[0].imagen_url)
  res.json({ imagen_url: url })
}))

router.delete('/:id/imagen', auth(['admin']), asyncRoute(async (req, res) => {
  const categoria = await pool.query('SELECT imagen_url FROM categorias WHERE id = $1', [req.params.id])
  if (!categoria.rows[0]) throw fallo('Categoría no encontrada.', 404)
  await pool.query('UPDATE categorias SET imagen_url = NULL WHERE id = $1', [req.params.id])
  borrarArchivo(categoria.rows[0].imagen_url)
  res.json({ imagen_url: null })
}))

export default router
