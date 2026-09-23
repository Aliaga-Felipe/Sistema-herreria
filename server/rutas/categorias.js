import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { pool } from '../db.js'
import { SLUGS_CATEGORIAS_PRODUCTO, asyncRoute, auth, fallo } from '../comun.js'

const router = Router()

const consultaCategorias = `SELECT c.id, c.nombre, c.slug, c.descripcion, c.orden, c.activo, c.imagen_url, c.creado_en,
    COUNT(p.id)::int AS productos_total
  FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id
  GROUP BY c.id`

// Las categorías son una lista fija (Mesas, Mesitas ratoneras, Fogoneros, ver
// CATEGORIAS_PRODUCTO en server/comun.js): no se crean, renombran ni
// borran desde la API. Solo se puede editar su descripción, orden,
// visibilidad y foto.
const categoriasFijas = 'Las categorías de producto son fijas (Mesas, Mesitas ratoneras y Fogoneros): no se pueden crear ni eliminar.'

// Requiere sesión (cualquier rol) para listar, igual que el resto del panel.
router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivas = req.query.activas === 'true'
  const { rows } = await pool.query(`${consultaCategorias}${soloActivas ? ' HAVING c.activo' : ''} ORDER BY c.orden, c.nombre`)
  res.json(rows.filter(categoria => SLUGS_CATEGORIAS_PRODUCTO.includes(categoria.slug)))
}))

router.post('/', auth(['admin']), asyncRoute(async () => {
  throw fallo(categoriasFijas)
}))

// El nombre y el slug no cambian (lista fija): se ignoran si vienen.
router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { descripcion = '', orden = 0 } = req.body
  const { rows } = await pool.query(
    'UPDATE categorias SET descripcion = $1, orden = $2 WHERE id = $3 RETURNING id',
    [descripcion?.trim() || null, Number(orden) || 0, req.params.id]
  )
  if (!rows[0]) throw fallo('Categoría no encontrada.', 404)
  const actualizada = await pool.query(`${consultaCategorias} HAVING c.id = $1`, [rows[0].id])
  res.json(actualizada.rows[0])
}))

router.patch('/:id/activo', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  const { rows } = await pool.query('UPDATE categorias SET activo = $1 WHERE id = $2 RETURNING id, nombre, activo', [activo, req.params.id])
  if (!rows[0]) throw fallo('Categoría no encontrada.', 404)
  res.json(rows[0])
}))

router.delete('/:id', auth(['admin']), asyncRoute(async () => {
  throw fallo(categoriasFijas)
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
