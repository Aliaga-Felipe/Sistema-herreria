import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, fallo } from '../comun.js'

const router = Router()

const consultaObjetivos = `SELECT o.id, o.producto_id, p.nombre AS producto, o.cantidad_objetivo, o.tipo_recompensa,
    o.valor_recompensa::float8 AS valor_recompensa, o.descripcion_recompensa, o.activo, o.creado_en, o.actualizado_en
  FROM objetivos_produccion o JOIN productos p ON p.id = o.producto_id AND NOT p.eliminado`

// -----------------------------------------------------------------------
// OBJETIVOS DE PRODUCCIÓN DIARIA (uno por producto, editable)
// -----------------------------------------------------------------------
router.get('/objetivos', auth(), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`${consultaObjetivos} ORDER BY p.nombre`)
  res.json(rows)
}))

// Alta o edición del objetivo de un producto (un objetivo por producto).
router.put('/objetivos/:productoId', auth(['admin']), asyncRoute(async (req, res) => {
  const { cantidad_objetivo, tipo_recompensa = 'monto', valor_recompensa = 0, descripcion_recompensa = '', activo = true } = req.body
  const cantidad = entero(cantidad_objetivo)
  if (!cantidad || cantidad <= 0) throw fallo('El objetivo diario debe ser una cantidad mayor a cero.')
  if (!['monto', 'libre'].includes(tipo_recompensa)) throw fallo('Tipo de recompensa inválido.')
  const valor = Math.max(0, decimal(valor_recompensa))
  if (tipo_recompensa === 'libre' && !descripcion_recompensa?.trim()) throw fallo('Describí la recompensa para este objetivo.')

  const producto = await pool.query('SELECT id FROM productos WHERE id = $1 AND NOT eliminado', [req.params.productoId])
  if (!producto.rows[0]) throw fallo('Producto no encontrado.', 404)

  const { rows } = await pool.query(
    `INSERT INTO objetivos_produccion (producto_id, cantidad_objetivo, tipo_recompensa, valor_recompensa, descripcion_recompensa, activo)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (producto_id) DO UPDATE SET cantidad_objetivo = EXCLUDED.cantidad_objetivo, tipo_recompensa = EXCLUDED.tipo_recompensa,
       valor_recompensa = EXCLUDED.valor_recompensa, descripcion_recompensa = EXCLUDED.descripcion_recompensa, activo = EXCLUDED.activo, actualizado_en = NOW()
     RETURNING id`,
    [req.params.productoId, cantidad, tipo_recompensa, valor, descripcion_recompensa?.trim() || '', Boolean(activo)]
  )
  const creado = await pool.query(`${consultaObjetivos} WHERE o.id = $1`, [rows[0].id])
  res.json(creado.rows[0])
}))

router.delete('/objetivos/:productoId', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM objetivos_produccion WHERE producto_id = $1 RETURNING id', [req.params.productoId])
  if (!rows[0]) throw fallo('Ese producto no tiene un objetivo cargado.', 404)
  res.json({ mensaje: 'Objetivo eliminado.' })
}))

// -----------------------------------------------------------------------
// REGISTRO DIARIO DE PRODUCCIÓN
// -----------------------------------------------------------------------
const consultaRegistros = `SELECT r.id, r.producto_id, p.nombre AS producto, r.fecha, r.cantidad_producida, r.objetivo_cantidad, r.cumplido,
    r.registrado_por, u.nombre AS registrado_por_nombre, r.creado_en, r.actualizado_en
  FROM registros_produccion r JOIN productos p ON p.id = r.producto_id LEFT JOIN usuarios u ON u.id = r.registrado_por`

// Lista el historial, opcionalmente acotado por rango de fechas o producto.
router.get('/registros', auth(), asyncRoute(async (req, res) => {
  const condiciones = []
  const valores = []
  if (req.query.desde) { valores.push(req.query.desde); condiciones.push(`r.fecha >= $${valores.length}`) }
  if (req.query.hasta) { valores.push(req.query.hasta); condiciones.push(`r.fecha <= $${valores.length}`) }
  if (req.query.producto_id) { valores.push(req.query.producto_id); condiciones.push(`r.producto_id = $${valores.length}`) }
  const where = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : ''
  const { rows } = await pool.query(`${consultaRegistros}${where} ORDER BY r.fecha DESC, p.nombre`, valores)
  res.json(rows)
}))

// Carga o corrige la producción de un producto en una fecha. El objetivo se
// copia del vigente al momento de registrar, así que cambiarlo más adelante
// no reescribe el cumplimiento de días ya cargados.
router.post('/registros', auth(), asyncRoute(async (req, res) => {
  const { producto_id: productoId, fecha, cantidad_producida } = req.body
  if (!productoId) throw fallo('Indicá el producto.')
  if (!fecha) throw fallo('Indicá la fecha de producción.')
  const cantidad = entero(cantidad_producida)
  if (cantidad === null || cantidad < 0) throw fallo('La cantidad producida debe ser un número mayor o igual a cero.')

  const objetivo = await pool.query('SELECT cantidad_objetivo FROM objetivos_produccion WHERE producto_id = $1 AND activo', [productoId])
  if (!objetivo.rows[0]) throw fallo('Ese producto todavía no tiene un objetivo diario cargado.')
  const objetivoCantidad = objetivo.rows[0].cantidad_objetivo
  const cumplido = cantidad >= objetivoCantidad

  const { rows } = await pool.query(
    `INSERT INTO registros_produccion (producto_id, fecha, cantidad_producida, objetivo_cantidad, cumplido, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (producto_id, fecha) DO UPDATE SET cantidad_producida = EXCLUDED.cantidad_producida,
       objetivo_cantidad = EXCLUDED.objetivo_cantidad, cumplido = EXCLUDED.cumplido, registrado_por = EXCLUDED.registrado_por, actualizado_en = NOW()
     RETURNING id`,
    [productoId, fecha, cantidad, objetivoCantidad, cumplido, req.user.id]
  )
  const creado = await pool.query(`${consultaRegistros} WHERE r.id = $1`, [rows[0].id])
  res.status(201).json(creado.rows[0])
}))

router.delete('/registros/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM registros_produccion WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Registro no encontrado.', 404)
  res.json({ mensaje: 'Registro eliminado.' })
}))

export default router
