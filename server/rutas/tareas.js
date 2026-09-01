import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, calcularSemaforo, decimal, entero, fallo, leerConfiguracion, registrarRecompensa, sincronizarPedido } from '../comun.js'

const router = Router()
const etapasFijas = [{ nombre: 'Preparación', minutos: 30 }, { nombre: 'Ejecución', minutos: 120 }, { nombre: 'Control de calidad', minutos: 20 }]

const consultaTareas = `SELECT t.id, t.titulo, t.descripcion, t.estado, t.asignado_a, t.creado_en, t.finalizada_en,
    COALESCE(json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'orden', e.orden,
      'minutos_estimados', e.minutos_estimados, 'minutos_reales', e.minutos_reales, 'semaforo', e.semaforo,
      'costo', e.costo::float8, 'realizada', e.realizada, 'completada_en', e.completada_en) ORDER BY e.orden)
      FILTER (WHERE e.id IS NOT NULL), '[]') AS etapas,
    json_build_object('id', u.id, 'nombre', u.nombre, 'email', u.email) AS asignado
  FROM tareas t JOIN usuarios u ON u.id = t.asignado_a LEFT JOIN tarea_etapas e ON e.tarea_id = t.id`
const agrupadoTareas = ' GROUP BY t.id, u.id ORDER BY t.creado_en DESC'

router.get('/', auth(), asyncRoute(async (req, res) => {
  const admin = req.user.rol === 'admin'
  const { rows } = await pool.query(`${consultaTareas}${admin ? '' : ' WHERE t.asignado_a = $1'}${agrupadoTareas}`, admin ? [] : [req.user.id])
  res.json(rows)
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { titulo, descripcion = '', asignado_a, etapas = [] } = req.body
  if (!titulo?.trim() || !asignado_a) throw fallo('Indicá el título y el empleado asignado.')
  const definidas = etapas.length ? etapas : etapasFijas.map(etapa => ({ nombre: etapa.nombre, minutos_estimados: etapa.minutos }))
  if (definidas.some(etapa => !etapa?.nombre?.trim() || !entero(etapa.minutos_estimados) || entero(etapa.minutos_estimados) <= 0)) throw fallo('Cada etapa debe tener nombre y un tiempo estimado mayor a cero.')

  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const empleado = await conexion.query("SELECT id FROM usuarios WHERE id = $1 AND LOWER(rol::text) = 'empleado' AND activo", [asignado_a])
    if (!empleado.rows[0]) throw fallo('El usuario asignado debe ser un empleado activo.')
    const tarea = await conexion.query("INSERT INTO tareas (titulo, descripcion, asignado_a, creado_por, estado) VALUES ($1, $2, $3, $4, 'PENDIENTE') RETURNING id", [titulo.trim(), descripcion.trim(), asignado_a, req.user.id])
    for (const [indice, etapa] of definidas.entries()) {
      await conexion.query('INSERT INTO tarea_etapas (tarea_id, nombre, orden, minutos_estimados, costo) VALUES ($1, $2, $3, $4, $5)',
        [tarea.rows[0].id, etapa.nombre.trim(), indice + 1, entero(etapa.minutos_estimados), Math.max(0, decimal(etapa.costo))])
    }
    await conexion.query('COMMIT')
    res.status(201).json({ id: tarea.rows[0].id })
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
}))

router.patch('/:id/estado', auth(), asyncRoute(async (req, res) => {
  const { estado } = req.body
  if (!['PENDIENTE', 'EN_PROGRESO', 'REALIZADA'].includes(estado)) throw fallo('Estado inválido.')
  if (estado === 'REALIZADA') {
    const pendientes = await pool.query('SELECT COUNT(*)::int AS pendientes FROM tarea_etapas WHERE tarea_id = $1 AND NOT realizada', [req.params.id])
    if (pendientes.rows[0].pendientes) throw fallo('Completá todas las etapas antes de finalizar la tarea.')
  }
  const propia = req.user.rol === 'admin' ? '' : ' AND asignado_a = $3'
  const valores = req.user.rol === 'admin' ? [estado, req.params.id] : [estado, req.params.id, req.user.id]
  const { rows } = await pool.query(`UPDATE tareas SET estado = $1, actualizada_en = NOW(),
    finalizada_en = CASE WHEN $1 = 'REALIZADA' THEN COALESCE(finalizada_en, NOW()) ELSE NULL END
    WHERE id = $2${propia} RETURNING id, estado`, valores)
  if (!rows[0]) throw fallo('Tarea no encontrada.', 404)
  res.json(rows[0])
}))

// Marcar/desmarcar una etapa de tarea libre. Acepta minutos_reales para
// calcular el semáforo igual que en las etapas de pedido.
router.patch('/:tareaId/etapas/:etapaId', auth(), asyncRoute(async (req, res) => {
  const { realizada, minutos_reales: minutosReales } = req.body
  if (typeof realizada !== 'boolean') throw fallo('El campo realizada debe ser booleano.')
  if (!realizada) {
    const propia = req.user.rol === 'admin' ? '' : ' AND t.asignado_a = $3'
    const valores = req.user.rol === 'admin' ? [req.params.etapaId, req.params.tareaId] : [req.params.etapaId, req.params.tareaId, req.user.id]
    const { rows } = await pool.query(`UPDATE tarea_etapas e SET realizada = FALSE, completada_en = NULL, minutos_reales = NULL, semaforo = NULL
      FROM tareas t WHERE e.id = $1 AND e.tarea_id = $2 AND t.id = e.tarea_id${propia} RETURNING e.id`, valores)
    if (!rows[0]) throw fallo('Etapa no encontrada o sin permisos.', 404)
    await pool.query('DELETE FROM recompensas WHERE tarea_etapa_id = $1', [req.params.etapaId])
    return res.json({ id: rows[0].id, realizada: false })
  }
  res.json(await completarEtapaTarea({ etapaId: req.params.etapaId, tareaId: req.params.tareaId, minutosReales, usuario: req.user }))
}))

// ---------------------------------------------------------------------
// BANDEJA UNIFICADA DEL EMPLEADO
// Reúne las etapas de pedido y las de tareas libres asignadas a la persona.
// ---------------------------------------------------------------------
router.get('/asignadas/mias', auth(), asyncRoute(async (req, res) => {
  const empleadoId = req.user.rol === 'admin' && req.query.empleado_id ? req.query.empleado_id : req.user.id
  const admin = req.user.rol === 'admin' && req.query.todas === 'true'
  const { rows } = await pool.query(`SELECT v.*, u.nombre AS responsable
    FROM vista_tareas_empleado v LEFT JOIN usuarios u ON u.id = v.asignado_a
    ${admin ? '' : 'WHERE v.asignado_a = $1'}
    ORDER BY (v.estado = 'COMPLETADA'), v.contenedor_id, v.orden`, admin ? [] : [empleadoId])
  res.json(rows)
}))

// Marca una etapa como iniciada (sirve para medir el tiempo transcurrido).
router.patch('/asignadas/:origen/:id/iniciar', auth(), asyncRoute(async (req, res) => {
  if (req.params.origen !== 'PEDIDO') return res.json({ mensaje: 'Las tareas libres no registran inicio.' })
  const propia = req.user.rol === 'admin' ? '' : ' AND responsable_id = $2'
  const valores = req.user.rol === 'admin' ? [req.params.id] : [req.params.id, req.user.id]
  const { rows } = await pool.query(`UPDATE pedido_etapas SET estado = 'EN_PROGRESO', iniciado_en = COALESCE(iniciado_en, NOW())
    WHERE id = $1 AND estado <> 'COMPLETADA'${propia} RETURNING id, iniciado_en, estado`, valores)
  if (!rows[0]) throw fallo('Etapa no encontrada o sin permisos.', 404)
  await sincronizarPedido(pool, (await pool.query('SELECT pedido_id FROM pedido_etapas WHERE id = $1', [req.params.id])).rows[0].pedido_id)
  res.json(rows[0])
}))

// Cierre de la etapa: el empleado informa cuánto tardó realmente y el
// sistema devuelve el semáforo y la recompensa generada, si corresponde.
router.patch('/asignadas/:origen/:id/completar', auth(), asyncRoute(async (req, res) => {
  const { minutos_reales: minutosReales, observaciones = null } = req.body
  const minutos = entero(minutosReales)
  if (!minutos || minutos <= 0) throw fallo('Indicá cuántos minutos te llevó completar la etapa.')

  if (req.params.origen === 'TAREA') {
    return res.json(await completarEtapaTarea({ etapaId: req.params.id, minutosReales: minutos, usuario: req.user }))
  }
  if (req.params.origen !== 'PEDIDO') throw fallo('Origen de tarea desconocido.')

  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const propia = req.user.rol === 'admin' ? '' : ' AND responsable_id = $2'
    const etapa = (await conexion.query(`SELECT id, pedido_id, nombre, responsable_id, minutos_estimados FROM pedido_etapas WHERE id = $1${propia} FOR UPDATE`,
      req.user.rol === 'admin' ? [req.params.id] : [req.params.id, req.user.id])).rows[0]
    if (!etapa) throw fallo('Etapa no encontrada o sin permisos.', 404)

    const config = await leerConfiguracion(conexion)
    const resultado = calcularSemaforo(etapa.minutos_estimados, minutos, config)
    await conexion.query(`UPDATE pedido_etapas SET estado = 'COMPLETADA', minutos_reales = $1, semaforo = $2::semaforo_rendimiento,
      completado_en = NOW(), iniciado_en = COALESCE(iniciado_en, NOW()), observaciones = COALESCE($3, observaciones) WHERE id = $4`,
      [minutos, resultado.semaforo, observaciones, etapa.id])

    const recompensa = await registrarRecompensa(conexion, {
      usuarioId: etapa.responsable_id, pedidoId: etapa.pedido_id, pedidoEtapaId: etapa.id,
      motivo: `Etapa "${etapa.nombre}" terminada ${resultado.minutos_ahorrados} min antes de lo estimado.`, resultado
    })
    const estadoPedido = await sincronizarPedido(conexion, etapa.pedido_id)
    await conexion.query('COMMIT')
    res.json({ id: etapa.id, origen: 'PEDIDO', estado: 'COMPLETADA', minutos_reales: minutos, ...resultado, recompensa, estado_pedido: estadoPedido })
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
}))

// Cierre de una etapa de tarea libre, con el mismo cálculo de semáforo.
async function completarEtapaTarea({ etapaId, tareaId = null, minutosReales, usuario }) {
  const minutos = entero(minutosReales)
  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const propia = usuario.rol === 'admin' ? '' : ' AND t.asignado_a = $2'
    const etapa = (await conexion.query(`SELECT e.id, e.tarea_id, e.nombre, e.minutos_estimados, t.asignado_a
      FROM tarea_etapas e JOIN tareas t ON t.id = e.tarea_id WHERE e.id = $1${propia}`,
      usuario.rol === 'admin' ? [etapaId] : [etapaId, usuario.id])).rows[0]
    if (!etapa || (tareaId && String(etapa.tarea_id) !== String(tareaId))) throw fallo('Etapa no encontrada o sin permisos.', 404)

    const config = await leerConfiguracion(conexion)
    const resultado = calcularSemaforo(etapa.minutos_estimados, minutos, config)
    await conexion.query(`UPDATE tarea_etapas SET realizada = TRUE, completada_en = NOW(), minutos_reales = $1, semaforo = $2::semaforo_rendimiento WHERE id = $3`,
      [minutos || null, resultado.semaforo, etapa.id])

    const recompensa = await registrarRecompensa(conexion, {
      usuarioId: etapa.asignado_a, tareaEtapaId: etapa.id,
      motivo: `Etapa "${etapa.nombre}" terminada ${resultado.minutos_ahorrados} min antes de lo estimado.`, resultado
    })

    // Si ya no quedan etapas pendientes, la tarea pasa a REALIZADA.
    const pendientes = (await conexion.query('SELECT COUNT(*)::int AS pendientes FROM tarea_etapas WHERE tarea_id = $1 AND NOT realizada', [etapa.tarea_id])).rows[0].pendientes
    await conexion.query(`UPDATE tareas SET estado = $1::estado_tarea, actualizada_en = NOW(),
      finalizada_en = CASE WHEN $1 = 'REALIZADA' THEN COALESCE(finalizada_en, NOW()) ELSE NULL END WHERE id = $2`,
      [pendientes ? 'EN_PROGRESO' : 'REALIZADA', etapa.tarea_id])

    await conexion.query('COMMIT')
    return { id: etapa.id, origen: 'TAREA', realizada: true, estado: 'COMPLETADA', minutos_reales: minutos, ...resultado, recompensa, etapas_pendientes: pendientes }
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
}

export default router
