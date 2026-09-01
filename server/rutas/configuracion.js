import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, configuracionPorDefecto, fallo, leerConfiguracion } from '../comun.js'

const router = Router()

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

  const numericas = ['recompensa_valor_hora', 'recompensa_factor_ahorro', 'recompensa_bono_minimo', 'semaforo_tolerancia']
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

export default router
