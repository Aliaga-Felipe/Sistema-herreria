import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo, slugify } from '../comun.js'
import { sincronizarEnSegundoPlano } from '../meta-whatsapp.js'

const router = Router()

const consultaCategorias = `SELECT c.id, c.nombre, c.slug, c.descripcion, c.orden, c.activo, c.imagen_url, c.creado_en,
    COUNT(p.id)::int AS productos_total
  FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id AND NOT p.eliminado
  GROUP BY c.id`

// Categorías: las tres base (Mesas, Mesitas ratoneras, Fogoneros, ver
// CATEGORIAS_PRODUCTO en server/comun.js) se crean con el esquema y el
// administrador puede crear categorías nuevas desde el panel. Todas, base o
// no, se pueden renombrar y eliminar: database/schema.sql solo las inserta
// en una base sin categorías, así que aplicar el esquema no deshace esos
// cambios. Al
// eliminar una categoría con productos, primero se pasan a otra (para que
// ningún producto publicado quede sin categoría).

// Requiere sesión (cualquier rol) para listar, igual que el resto del panel.
router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivas = req.query.activas === 'true'
  const { rows } = await pool.query(`${consultaCategorias}${soloActivas ? ' HAVING c.activo' : ''} ORDER BY c.orden, c.nombre`)
  res.json(rows)
}))

// Normaliza el nombre de una categoría (sin espacios de más) y calcula su
// slug. No se permiten nombres vacíos ni repetidos (sin distinguir
// mayúsculas, minúsculas ni acentos: "Sillas" y "sillás" son la misma
// categoría, porque generarían la misma URL). `excluirId` deja afuera a la
// propia categoría cuando se renombra.
async function validarNombre(valor, excluirId = null) {
  const nombre = String(valor ?? '').trim().replace(/\s+/g, ' ')
  if (!nombre) throw fallo('Escribí el nombre de la categoría.')
  if (nombre.length > 120) throw fallo('El nombre de la categoría puede tener hasta 120 caracteres.')
  const slug = slugify(nombre).slice(0, 140)
  if (!slug) throw fallo('El nombre de la categoría tiene que incluir al menos una letra o un número.')

  const repetida = await pool.query(
    'SELECT nombre FROM categorias WHERE (slug = $1 OR LOWER(nombre) = LOWER($2)) AND ($3::bigint IS NULL OR id <> $3) LIMIT 1',
    [slug, nombre, excluirId]
  )
  if (repetida.rows[0]) throw fallo(`Ya existe la categoría "${repetida.rows[0].nombre}".`, 409)
  return { nombre, slug }
}

// Alta de categoría: solo el nombre (validado con validarNombre). Se
// agrega al final del orden y visible en la web.
router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, slug } = await validarNombre(req.body?.nombre)
  const { rows } = await pool.query(
    `INSERT INTO categorias (nombre, slug, orden, activo)
     VALUES ($1, $2, COALESCE((SELECT MAX(orden) FROM categorias), 0) + 1, TRUE)
     RETURNING id`,
    [nombre, slug]
  )
  const creada = await pool.query(`${consultaCategorias} HAVING c.id = $1`, [rows[0].id])
  res.status(201).json(creada.rows[0])
}))

// Edición: nombre (opcional; si viene se valida igual que en el alta y se
// recalcula el slug), descripción y orden. Los campos que no vienen en el
// body no se tocan.
router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion, orden } = req.body ?? {}
  const actual = await pool.query('SELECT id FROM categorias WHERE id = $1', [req.params.id])
  if (!actual.rows[0]) throw fallo('Categoría no encontrada.', 404)
  const renombre = nombre === undefined ? null : await validarNombre(nombre, actual.rows[0].id)

  const { rows } = await pool.query(
    `UPDATE categorias SET
        nombre = COALESCE($1, nombre),
        slug = COALESCE($2, slug),
        descripcion = CASE WHEN $3 THEN $4 ELSE descripcion END,
        orden = CASE WHEN $5 THEN $6 ELSE orden END
      WHERE id = $7 RETURNING id`,
    [renombre?.nombre ?? null, renombre?.slug ?? null,
      descripcion !== undefined, String(descripcion ?? '').trim() || null,
      orden !== undefined, Number(orden) || 0, actual.rows[0].id]
  )
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

// -----------------------------------------------------------------------
// ELIMINAR CATEGORÍA
// Si no tiene productos (sin contar los eliminados) se borra directo. Si
// tiene, `reasignar_a` (id de otra categoría) es obligatorio: en una misma
// transacción se pasan los productos a esa categoría y después se borra
// esta. Así ningún producto publicado queda sin categoría (la FK es
// ON DELETE SET NULL, que solo alcanza a los eliminados). La foto de la
// categoría se borra del disco.
// -----------------------------------------------------------------------
router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const reasignarA = req.body?.reasignar_a ?? null
  const cliente = await pool.connect()
  let categoria
  let movidos = []
  try {
    await cliente.query('BEGIN')
    // FOR UPDATE: dos borrados simultáneos (o un alta de producto en el
    // medio) no dejan productos apuntando a una categoría que ya no existe.
    const actual = await cliente.query('SELECT id, nombre, imagen_url FROM categorias WHERE id = $1 FOR UPDATE', [req.params.id])
    categoria = actual.rows[0]
    if (!categoria) throw fallo('Categoría no encontrada.', 404)
    if (Number((await cliente.query('SELECT COUNT(*) FROM categorias')).rows[0].count) <= 1) throw fallo('No se puede eliminar la única categoría: los productos publicados necesitan una.')

    const total = Number((await cliente.query('SELECT COUNT(*) FROM productos WHERE categoria_id = $1 AND NOT eliminado', [categoria.id])).rows[0].count)
    let destino = null
    if (total > 0) {
      if (reasignarA === null || reasignarA === '') throw fallo(`La categoría "${categoria.nombre}" tiene ${total === 1 ? '1 producto' : `${total} productos`}. Elegí a qué categoría pasarlos antes de eliminarla.`)
      if (String(reasignarA) === String(categoria.id)) throw fallo('Elegí una categoría distinta de la que se elimina.')
      destino = (await cliente.query('SELECT id, nombre FROM categorias WHERE id = $1 FOR UPDATE', [Number(reasignarA) || 0])).rows[0]
      if (!destino) throw fallo('La categoría a la que se pasan los productos no existe.')
      // Se mueven también los productos eliminados (no se cuentan en el
      // mensaje ni se sincronizan), para que conserven una categoría válida.
      movidos = (await cliente.query(
        'UPDATE productos SET categoria_id = $1 WHERE categoria_id = $2 RETURNING id, eliminado, whatsapp_retailer_id',
        [destino.id, categoria.id]
      )).rows
    }
    await cliente.query('DELETE FROM categorias WHERE id = $1', [categoria.id])
    await cliente.query('COMMIT')

    borrarArchivo(categoria.imagen_url)
    // Los que estaban en el catálogo de WhatsApp se vuelven a sincronizar,
    // igual que al guardar un producto (ver rutas/productos.js).
    for (const producto of movidos) if (!producto.eliminado && producto.whatsapp_retailer_id) sincronizarEnSegundoPlano(producto.id)

    const cantidad = movidos.filter(producto => !producto.eliminado).length
    res.json({
      mensaje: cantidad
        ? `Categoría "${categoria.nombre}" eliminada. ${cantidad === 1 ? 'Se movió 1 producto' : `Se movieron ${cantidad} productos`} a "${destino.nombre}".`
        : `Categoría "${categoria.nombre}" eliminada.`,
      productos_movidos: cantidad
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    throw error
  } finally {
    cliente.release()
  }
}))

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
