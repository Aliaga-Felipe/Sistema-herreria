import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, fallo } from '../comun.js'
import { agregarEtapas, eliminarJornada, listarJornadas, obtenerJornada, quitarEtapa, reabrirJornada, terminarJornada, validarFechaDia } from '../jornadas.js'

const router = Router()

// -----------------------------------------------------------------------
// PRODUCCIÓN DIARIA
// La producción de un día es la lista de etapas de pedidos propuestas para
// esa fecha (ver server/jornadas.js). Cualquier usuario la puede consultar
// (los empleados ven qué se espera del día); solo un administrador la arma,
// la verifica y la marca como terminada.
//
// Reemplaza a los objetivos diarios por producto y a la carga de unidades
// producidas: esas tablas quedaron solo como historial.
// -----------------------------------------------------------------------
const fechaParametro = valor => {
  const fecha = validarFechaDia(valor)
  if (!fecha) throw fallo('La fecha debe tener el formato AAAA-MM-DD.')
  return fecha
}

// Corre una operación de jornadas.js en una transacción y responde con el
// desglose actualizado del día.
const enTransaccion = async (res, fecha, operacion) => {
  const conexion = await pool.connect()
  let extra
  try {
    await conexion.query('BEGIN')
    extra = await operacion(conexion)
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  res.json({ ...(await obtenerJornada(fecha)), ...extra })
}

// Historial de días con producción (los terminados con su resultado
// guardado, los abiertos calculados en vivo). "desde"/"hasta" opcionales.
router.get('/jornadas', auth(), asyncRoute(async (req, res) => {
  res.json(await listarJornadas({ desde: validarFechaDia(req.query.desde), hasta: validarFechaDia(req.query.hasta) }))
}))

router.get('/jornada/:fecha', auth(), asyncRoute(async (req, res) => {
  res.json(await obtenerJornada(fechaParametro(req.params.fecha)))
}))

// Agrega a la producción del día un pedido completo ({ pedido_id }), un
// producto de un pedido ({ pedido_item_id }) o etapas sueltas ({ etapas }).
router.post('/jornada/:fecha/etapas', auth(['admin']), asyncRoute(async (req, res) => {
  const fecha = fechaParametro(req.params.fecha)
  const { pedido_id: pedidoId, pedido_item_id: pedidoItemId, etapas } = req.body || {}
  await enTransaccion(res, fecha, conexion => agregarEtapas(conexion, fecha, { pedido_id: pedidoId, pedido_item_id: pedidoItemId, etapas }, req.user.id))
}))

router.delete('/jornada/:fecha/etapas/:etapaId', auth(['admin']), asyncRoute(async (req, res) => {
  const fecha = fechaParametro(req.params.fecha)
  await enTransaccion(res, fecha, conexion => quitarEtapa(conexion, fecha, req.params.etapaId))
}))

router.delete('/jornada/:fecha', auth(['admin']), asyncRoute(async (req, res) => {
  const fecha = fechaParametro(req.params.fecha)
  await enTransaccion(res, fecha, conexion => eliminarJornada(conexion, fecha))
}))

// El admin verificó lo hecho y da por terminada la producción del día: se
// guarda el resultado y, si se completó todo lo propuesto, la recompensa.
router.post('/jornada/:fecha/terminar', auth(['admin']), asyncRoute(async (req, res) => {
  const fecha = fechaParametro(req.params.fecha)
  await enTransaccion(res, fecha, conexion => terminarJornada(conexion, fecha, req.user.id))
}))

router.post('/jornada/:fecha/reabrir', auth(['admin']), asyncRoute(async (req, res) => {
  const fecha = fechaParametro(req.params.fecha)
  await enTransaccion(res, fecha, conexion => reabrirJornada(conexion, fecha))
}))

export default router
