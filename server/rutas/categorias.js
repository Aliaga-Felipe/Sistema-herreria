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
  FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id AND NOT p.eliminado
  GROUP BY c.id`

// Categorías: además de las tres base (Mesas, Mesitas ratoneras,
// Fogoneros, ver CATEGORIAS_PRODUCTO en server/comun.js), el administrador
// puede CREAR categorías nuevas desde el panel. Por ahora no se renombran
// ni se borran desde la API (solo se puede editar su descripción, orden,
// visibilidad y foto).
const categoriasSinBorrado = 'Las categorías no se pueden eliminar.'

// Requiere sesión (cualquier rol) para listar, igual que el resto del panel.
router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivas = req.query.activas === 'true'
  const { rows } = await pool.query(`${consultaCategorias}${soloActivas ? ' HAVING c.activo' : ''} ORDER BY c.orden, c.nombre`)
  res.json(rows)
}))

// Alta de categoría: solo el nombre. No se permiten nombres vacíos ni
// repetidos (sin distinguir mayúsculas, minúsculas ni acentos: "Sillas" y
// "sillás" son la misma categoría, porque generarían la misma URL). Se
// agrega al final del orden y visible en la web.
router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim().replace(/\s+/g, ' ')
  if (!nombre) throw fallo('Escribí el nombre de la categoría.')
  if (nombre.length > 120) throw fallo('El nombre de la categoría puede tener hasta 120 caracteres.')
  const slug = slugify(nombre).slice(0, 140)
  if (!slug) throw fallo('El nombre de la categoría tiene que incluir al menos una letra o un número.')

  const repetida = await pool.query('SELECT nombre FROM categorias WHERE slug = $1 OR LOWER(nombre) = LOWER($2) LIMIT 1', [slug, nombre])
  if (repetida.rows[0]) throw fallo(`Ya existe la categoría "${repetida.rows[0].nombre}".`, 409)

  const { rows } = await pool.query(
    `INSERT INTO categorias (nombre, slug, orden, activo)
     VALUES ($1, $2, COALESCE((SELECT MAX(orden) FROM categorias), 0) + 1, TRUE)
     RETURNING id`,
    [nombre, slug]
  )
  const creada = await pool.query(`${consultaCategorias} HAVING c.id = $1`, [rows[0].id])
  res.status(201).json(creada.rows[0])
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
  throw fallo(categoriasSinBorrado)
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
