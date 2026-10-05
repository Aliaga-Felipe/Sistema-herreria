import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, fallo } from '../comun.js'
import { fechaDeHoy as hoy, listarJornadas, obtenerJornada, parametrosVigentes, validarFechaDia } from '../jornadas.js'

const router = Router()

// -----------------------------------------------------------------------
// RECOMPENSA POR EQUIPO
// Un único monto por día para todo el taller (ver server/recompensa-equipo.js).
// Leer está abierto a cualquier usuario; el valor hora-hombre y el % de
// premio solo los cambia un administrador. El objetivo del día no se
// carga acá: son las horas-hombre de las etapas propuestas en Producción
// diaria, y la recompensa se paga cuando el admin la marca como terminada
// con todo completado (ver rutas/produccion.js y server/jornadas.js).
// -----------------------------------------------------------------------
const fechaParametro = valor => {
  const fecha = validarFechaDia(valor)
  if (!fecha) throw fallo('La fecha debe tener el formato AAAA-MM-DD.')
  return fecha
}

// Historial de días: los terminados con su resultado guardado y los
// abiertos calculados en vivo.
router.get('/equipo', auth(), asyncRoute(async (req, res) => {
  res.json(await listarJornadas({ desde: validarFechaDia(req.query.desde), hasta: validarFechaDia(req.query.hasta) }))
}))

// Desglose de un día: etapas propuestas, avance, si se cumplió y recompensa.
router.get('/equipo/dia/:fecha', auth(), asyncRoute(async (req, res) => {
  res.json(await obtenerJornada(fechaParametro(req.params.fecha)))
}))

// Valor hora-hombre y % de premio: vigente + historial de cambios.
router.get('/parametros', auth(), asyncRoute(async (_, res) => {
  const vigente = await parametrosVigentes(pool, hoy())
  const { rows } = await pool.query(
    `SELECT h.id, h.vigente_desde::text AS vigente_desde, h.valor_hora::float8 AS valor_hora, h.porcentaje_premio::float8 AS porcentaje_premio,
       u.nombre AS creado_por, h.creado_en
     FROM parametros_recompensa_historial h LEFT JOIN usuarios u ON u.id = h.creado_por ORDER BY h.vigente_desde DESC, h.id DESC`)
  res.json({ vigente, historial: rows })
}))

// Cada cambio agrega una fila al historial, vigente desde hoy. Los días
// ya terminados conservan el valor con el que se cerraron; los abiertos
// toman el vigente en su fecha.
router.put('/parametros', auth(['admin']), asyncRoute(async (req, res) => {
  const actual = await parametrosVigentes(pool, hoy())
  const { valor_hora: valorHora = actual.valor_hora, porcentaje_premio: porcentajePremio = actual.porcentaje_premio } = req.body || {}
  const valor = Number(valorHora)
  const porcentaje = Number(porcentajePremio)
  if (!Number.isFinite(valor) || valor < 0) throw fallo('El valor de la hora-hombre debe ser un número mayor o igual a cero.')
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) throw fallo('El porcentaje de premio va de 0 a 100.')

  await pool.query(
    'INSERT INTO parametros_recompensa_historial (vigente_desde, valor_hora, porcentaje_premio, creado_por) VALUES ($1, $2, $3, $4)',
    [hoy(), decimal(valor), decimal(porcentaje), req.user.id])
  res.json(await parametrosVigentes(pool, hoy()))
}))

// -----------------------------------------------------------------------
// HISTORIAL ANTERIOR (solo lectura)
// Bonos individuales del sistema viejo (semáforo en verde y bonos
// manuales). Ya no se generan ni se editan; se muestran como referencia.
// -----------------------------------------------------------------------
router.get('/historial-individual', auth(['admin']), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`SELECT r.id, u.nombre AS empleado, p.codigo AS pedido, r.monto::float8 AS monto, r.motivo, r.automatica, r.otorgado_en
    FROM recompensas r LEFT JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN pedidos p ON p.id = r.pedido_id
    ORDER BY r.otorgado_en DESC`)
  res.json(rows)
}))

export default router
