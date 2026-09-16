import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { pool } from '../db.js'
import { asyncRoute, auth, configuracionPorDefecto, fallo, leerConfiguracion } from '../comun.js'

const router = Router()

const guardarValor = (clave, valor) =>
  pool.query(`INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = NOW()`, [clave, valor])

router.get('/', auth(), asyncRoute(async (_, res) => {
  const { rows } = await pool.query('SELECT clave, valor, descripcion, actualizado_en FROM configuracion ORDER BY clave')
  const guardadas = new Set(rows.map(fila => fila.clave))
  const faltantes = Object.entries(configuracionPorDefecto)
    .filter(([clave]) => !guardadas.has(clave))
    .map(([clave, valor]) => ({ clave, valor, descripcion: '', actualizado_en: null }))
  res.json([...rows, ...faltantes])
}))

// Vista compacta usada por el frontend para formatear montos y explicar la fórmula.
router.get('/valores', auth(), asyncRoute(async (_, res) => res.json(await leerConfiguracion())))

router.put('/', auth(['admin']), asyncRoute(async (req, res) => {
  const valores = req.body || {}
  const claves = Object.keys(valores).filter(clave => clave in configuracionPorDefecto)
  if (!claves.length) throw fallo('No hay parámetros válidos para guardar.')

  const numericas = ['recompensa_valor_hora', 'recompensa_factor_ahorro', 'recompensa_bono_minimo', 'semaforo_tolerancia', 'costo_hora_mano_obra']
  for (const clave of claves) {
    if (numericas.includes(clave) && !(Number(valores[clave]) >= 0)) throw fallo(`El parámetro "${clave}" debe ser un número mayor o igual a cero.`)
  }
  if ('recompensa_factor_ahorro' in valores && Number(valores.recompensa_factor_ahorro) > 1) throw fallo('El factor de ahorro va de 0 a 1.')

  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    for (const clave of claves) {
      await conexion.query(`INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = NOW()`, [clave, String(valores[clave])])
    }
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  res.json(await leerConfiguracion())
}))

// -----------------------------------------------------------------------
// VIDEO DE FONDO DEL HERO (portada de la web pública)
// Un único video para todo el sitio, guardado en disco y referenciado
// desde la clave "negocio_hero_video" de la tabla configuracion.
// -----------------------------------------------------------------------
const directorioVideos = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'sitio')
fs.mkdirSync(directorioVideos, { recursive: true })

const tiposVideoPermitidos = new Set(['video/mp4', 'video/webm', 'video/ogg'])
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, directorioVideos),
    filename: (_, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.mp4'
      cb(null, `hero-${Date.now()}${extension}`)
    }
  }),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(tiposVideoPermitidos.has(file.mimetype) ? null : fallo('Formato de video no soportado. Usá MP4, WEBM u OGG.'), tiposVideoPermitidos.has(file.mimetype))
})

router.post('/video-hero', auth(['admin']), (req, res, next) => {
  uploadVideo.single('video')(req, res, error => {
    if (error) return res.status(400).json({ error: error.message || 'No se pudo subir el video. Recordá que el tamaño máximo es 40 MB.' })
    next()
  })
}, asyncRoute(async (req, res) => {
  if (!req.file) throw fallo('Adjuntá un archivo de video.')
  const anterior = await pool.query("SELECT valor FROM configuracion WHERE clave = 'negocio_hero_video'")
  const url = `/uploads/sitio/${req.file.filename}`
  await guardarValor('negocio_hero_video', url)
  if (anterior.rows[0]?.valor) fs.unlink(path.join(directorioVideos, path.basename(anterior.rows[0].valor)), () => {})
  res.json({ negocio_hero_video: url })
}))

router.delete('/video-hero', auth(['admin']), asyncRoute(async (_, res) => {
  const anterior = await pool.query("SELECT valor FROM configuracion WHERE clave = 'negocio_hero_video'")
  await guardarValor('negocio_hero_video', '')
  if (anterior.rows[0]?.valor) fs.unlink(path.join(directorioVideos, path.basename(anterior.rows[0].valor)), () => {})
  res.json({ negocio_hero_video: '' })
}))

export default router
