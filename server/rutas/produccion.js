import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, fallo } from '../comun.js'
import { guardarJornada, validarFechaDia } from '../jornadas.js'

const router = Router()

// Dos tipos de objetivo en la misma tabla: 'producto' (cantidad diaria de
// un producto) y 'pedido' (terminar un pedido puntual, se cumple cuando el
// pedido pasa a TERMINADO). El avance del pedido se calcula igual que en
// rutas/pedidos.js (etapas completadas sobre el total).
const consultaObjetivos = `SELECT o.id, o.tipo, o.producto_id, p.nombre AS producto, o.cantidad_objetivo, o.tipo_recompensa,
    o.valor_recompensa::float8 AS valor_recompensa, o.descripcion_recompensa, o.activo, o.creado_en, o.actualizado_en,
    o.pedido_id, pe.codigo AS pedido, pe.estado AS pedido_estado, pe.fecha_entrega AS pedido_fecha_entrega,
    COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE e.estado = 'COMPLETADA') / NULLIF(COUNT(*), 0))
      FROM pedido_etapas e WHERE e.pedido_id = o.pedido_id), 0)::int AS pedido_avance
  FROM objetivos_produccion o LEFT JOIN productos p ON p.id = o.producto_id LEFT JOIN pedidos pe ON pe.id = o.pedido_id`

// -----------------------------------------------------------------------
// OBJETIVOS DE PRODUCCIÓN DIARIA (uno por producto o por pedido, editable)
// -----------------------------------------------------------------------
router.get('/objetivos', auth(), asyncRoute(async (_, res) => {
  const { rows } = await pool.query(`${consultaObjetivos} ORDER BY o.tipo DESC, p.nombre, pe.codigo`)
  res.json(rows)
}))

// Alta o edición del objetivo de un pedido (un objetivo por pedido). Solo
// se pueden crear sobre pedidos abiertos; editar uno existente (activarlo o
// pausarlo) se permite aunque el pedido ya esté terminado.
router.put('/objetivos/pedido/:pedidoId', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo = true } = req.body
  const pedido = (await pool.query('SELECT id, estado FROM pedidos WHERE id = $1', [req.params.pedidoId])).rows[0]
  if (!pedido) throw fallo('Pedido no encontrado.', 404)
  const existente = (await pool.query('SELECT id FROM objetivos_produccion WHERE pedido_id = $1', [pedido.id])).rows[0]
  if (!existente && ['TERMINADO', 'CANCELADO'].includes(pedido.estado)) throw fallo('Elegí un pedido que todavía no esté terminado ni cancelado.')

  const { rows } = await pool.query(
    `INSERT INTO objetivos_produccion (tipo, pedido_id, activo) VALUES ('pedido', $1, $2)
     ON CONFLICT (pedido_id) DO UPDATE SET activo = EXCLUDED.activo, actualizado_en = NOW()
     RETURNING id`,
    [pedido.id, Boolean(activo)]
  )
  const creado = await pool.query(`${consultaObjetivos} WHERE o.id = $1`, [rows[0].id])
  res.json(creado.rows[0])
}))

router.delete('/objetivos/pedido/:pedidoId', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM objetivos_produccion WHERE pedido_id = $1 RETURNING id', [req.params.pedidoId])
  if (!rows[0]) throw fallo('Ese pedido no tiene un objetivo cargado.', 404)
  res.json({ mensaje: 'Objetivo eliminado.' })
}))

// Alta o edición del objetivo de un producto (un objetivo por producto).
// La recompensa ya no se configura desde la interfaz: las columnas de
// recompensa conservan lo que tuvieran (o su valor por defecto al crear).
router.put('/objetivos/:productoId', auth(['admin']), asyncRoute(async (req, res) => {
  const { cantidad_objetivo, activo = true } = req.body
  const cantidad = entero(cantidad_objetivo)
  if (!cantidad || cantidad <= 0) throw fallo('El objetivo diario debe ser una cantidad mayor a cero.')

  const producto = await pool.query('SELECT id FROM productos WHERE id = $1 AND NOT eliminado', [req.params.productoId])
  if (!producto.rows[0]) throw fallo('Producto no encontrado.', 404)

  const { rows } = await pool.query(
    `INSERT INTO objetivos_produccion (tipo, producto_id, cantidad_objetivo, activo)
     VALUES ('producto', $1, $2, $3)
     ON CONFLICT (producto_id) DO UPDATE SET cantidad_objetivo = EXCLUDED.cantidad_objetivo, activo = EXCLUDED.activo, actualizado_en = NOW()
     RETURNING id`,
    [req.params.productoId, cantidad, Boolean(activo)]
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
const consultaRegistros = `SELECT r.id, r.producto_id, p.nombre AS producto, r.fecha, r.cantidad_producida, r.objetivo_cantidad, r.cumplido, r.tiempo_estandar::float8 AS tiempo_estandar,
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

// Carga o corrige la producción de un producto en una fecha. El objetivo
// por producto es opcional (solo informativo); si existe se copia junto
// con las horas-hombre del producto, así que editarlos más adelante no
// reescribe días ya cargados. Después se recalcula la jornada del equipo.
router.post('/registros', auth(), asyncRoute(async (req, res) => {
  const { producto_id: productoId, fecha: fechaTexto, cantidad_producida } = req.body
  if (!productoId) throw fallo('Indicá el producto.')
  const fecha = validarFechaDia(fechaTexto)
  if (!fecha) throw fallo('Indicá la fecha de producción.')
  const cantidad = entero(cantidad_producida)
  if (cantidad === null || cantidad < 0) throw fallo('La cantidad producida debe ser un número mayor o igual a cero.')

  const producto = (await pool.query('SELECT id, horas_hombre FROM productos WHERE id = $1 AND NOT eliminado', [productoId])).rows[0]
  if (!producto) throw fallo('Producto no encontrado.', 404)
  const objetivo = await pool.query("SELECT cantidad_objetivo FROM objetivos_produccion WHERE tipo = 'producto' AND producto_id = $1 AND activo", [productoId])
  const objetivoCantidad = objetivo.rows[0]?.cantidad_objetivo ?? null
  const cumplido = objetivoCantidad !== null && cantidad >= objetivoCantidad

  const conexion = await pool.connect()
  let id
  try {
    await conexion.query('BEGIN')
    const { rows } = await conexion.query(
      `INSERT INTO registros_produccion (producto_id, fecha, cantidad_producida, objetivo_cantidad, cumplido, tiempo_estandar, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (producto_id, fecha) DO UPDATE SET cantidad_producida = EXCLUDED.cantidad_producida,
         objetivo_cantidad = EXCLUDED.objetivo_cantidad, cumplido = EXCLUDED.cumplido, tiempo_estandar = EXCLUDED.tiempo_estandar,
         registrado_por = EXCLUDED.registrado_por, actualizado_en = NOW()
       RETURNING id`,
      [productoId, fecha, cantidad, objetivoCantidad, cumplido, producto.horas_hombre, req.user.id]
    )
    id = rows[0].id
    await guardarJornada(conexion, fecha)
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  const creado = await pool.query(`${consultaRegistros} WHERE r.id = $1`, [id])
  res.status(201).json(creado.rows[0])
}))

router.delete('/registros/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    const { rows } = await conexion.query('DELETE FROM registros_produccion WHERE id = $1 RETURNING fecha::text AS fecha', [req.params.id])
    if (!rows[0]) throw fallo('Registro no encontrado.', 404)
    await guardarJornada(conexion, rows[0].fecha)
    await conexion.query('COMMIT')
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
  res.json({ mensaje: 'Registro eliminado.' })
}))

// -----------------------------------------------------------------------
// HORAS TRABAJADAS POR EMPLEADO (planilla diaria, solo el administrador)
// Solo se usan para sumar las horas totales del equipo en ese día.
// -----------------------------------------------------------------------
router.get('/horas', auth(['admin']), asyncRoute(async (req, res) => {
  const fecha = validarFechaDia(req.query.fecha)
  if (!fecha) throw fallo('Indicá la fecha con el formato AAAA-MM-DD.')
  // Empleados activos + cualquiera que ya tenga horas ese día (aunque hoy esté inactivo).
  const { rows } = await pool.query(
    `SELECT u.id AS usuario_id, u.nombre, COALESCE(h.horas, 0)::float8 AS horas
     FROM usuarios u LEFT JOIN horas_trabajadas h ON h.usuario_id = u.id AND h.fecha = $1::date
     WHERE (LOWER(u.rol::text) = 'empleado' AND u.activo) OR h.id IS NOT NULL
     ORDER BY u.nombre`, [fecha])
  res.json(rows)
}))

// Guarda la planilla completa del día: [{ usuario_id, horas }]. Horas en 0
// borran la fila de ese empleado.
router.put('/horas', auth(['admin']), asyncRoute(async (req, res) => {
  const fecha = validarFechaDia(req.body?.fecha)
  if (!fecha) throw fallo('Indicá la fecha con el formato AAAA-MM-DD.')
  const planilla = Array.isArray(req.body?.horas) ? req.body.horas : null
  if (!planilla) throw fallo('Enviá las horas de cada empleado.')
  for (const fila of planilla) {
    const horas = Number(fila.horas || 0)
    if (!fila.usuario_id) throw fallo('Falta el empleado en una de las filas.')
    if (!Number.isFinite(horas) || horas < 0 || horas > 24) throw fallo('Las horas trabajadas van de 0 a 24 por empleado.')
  }

  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')
    for (const fila of planilla) {
      const horas = decimal(fila.horas || 0)
      if (horas > 0) {
        await conexion.query(
          `INSERT INTO horas_trabajadas (usuario_id, fecha, horas, cargado_por) VALUES ($1, $2, $3, $4)
           ON CONFLICT (usuario_id, fecha) DO UPDATE SET horas = EXCLUDED.horas, cargado_por = EXCLUDED.cargado_por, actualizado_en = NOW()`,
          [fila.usuario_id, fecha, horas, req.user.id])
      } else {
        await conexion.query('DELETE FROM horas_trabajadas WHERE usuario_id = $1 AND fecha = $2', [fila.usuario_id, fecha])
      }
    }
    const jornada = await guardarJornada(conexion, fecha)
    await conexion.query('COMMIT')
    res.json(jornada)
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
}))

export default router
