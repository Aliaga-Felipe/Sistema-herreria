import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, fallo } from '../comun.js'

const router = Router()

const consultaRecompensas = `SELECT r.id, r.usuario_id, u.nombre AS empleado, r.pedido_id, p.codigo AS pedido,
    r.pedido_etapa_id, r.tarea_etapa_id, r.puntos, r.monto::float8 AS monto, r.motivo, r.semaforo,
    r.minutos_estimados, r.minutos_reales, r.minutos_ahorrados, r.automatica, r.otorgado_en
  FROM recompensas r LEFT JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN pedidos p ON p.id = r.pedido_id`

router.get('/', auth(), asyncRoute(async (req, res) => {
  const admin = req.user.rol === 'admin'
  const { rows } = await pool.query(`${consultaRecompensas}${admin ? '' : ' WHERE r.usuario_id = $1'} ORDER BY r.otorgado_en DESC`, admin ? [] : [req.user.id])
  res.json(rows)
}))

// Resumen por empleado: cuántos semáforos de cada color y cuánto acumuló.
router.get('/ranking', auth(), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`SELECT id, nombre, completadas, verdes, amarillos, rojos,
      promedio_minutos, minutos_estimados, minutos_reales, recompensas_monto::float8 AS recompensas_monto
    FROM vista_rendimiento_empleados ORDER BY recompensas_monto DESC, verdes DESC, nombre`)
  res.json(rows)
}))

// Bono manual del admin, por fuera del cálculo automático.
router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { usuario_id: usuario, pedido_id: pedido = null, monto, puntos = 0, motivo } = req.body
  if (!usuario) throw fallo('Indicá a qué empleado corresponde la recompensa.')
  if (!motivo?.trim()) throw fallo('Escribí el motivo de la recompensa.')
  const importe = decimal(monto)
  if (importe <= 0) throw fallo('El monto debe ser mayor a cero.')
  const { rows } = await pool.query(
    `INSERT INTO recompensas (usuario_id, pedido_id, puntos, monto, motivo, otorgado_por, automatica)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING id`,
    [usuario, pedido || null, Math.max(0, entero(puntos) || 0), importe, motivo.trim(), req.user.id])
  const creada = await pool.query(`${consultaRecompensas} WHERE r.id = $1`, [rows[0].id])
  res.status(201).json(creada.rows[0])
}))

router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM recompensas WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Recompensa no encontrada.', 404)
  res.json({ mensaje: 'Recompensa eliminada.' })
}))

export default router
