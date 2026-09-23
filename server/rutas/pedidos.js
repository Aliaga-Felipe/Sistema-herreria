import { Router } from 'express'
import { pool } from '../db.js'
import { asyncRoute, auth, decimal, entero, esAdmin, fallo, leerConfiguracion, sincronizarPedido } from '../comun.js'

const router = Router()
const estadosPedido = ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO']

// Los pedidos ya no tienen cliente: no se guardan ni se devuelven datos de
// cliente (la columna pedidos.cliente_id se eliminó, ver schema.sql).
const consultaPedidos = `SELECT p.id, p.codigo, p.estado, p.prioridad, p.fecha_entrega, p.notas, p.creado_en, p.terminado_en,
    (SELECT COALESCE(json_agg(json_build_object('id', i.id, 'producto_id', i.producto_id, 'producto', pr.nombre,
        'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario::float8,
        'subtotal', (i.cantidad * i.precio_unitario)::float8,
        'costo_materiales_unitario', i.costo_materiales_unitario::float8,
        'costo_mano_obra_unitario', i.costo_mano_obra_unitario::float8,
        'costo_materiales', (i.cantidad * i.costo_materiales_unitario)::float8,
        'costo_mano_obra', (i.cantidad * i.costo_mano_obra_unitario)::float8,
        'costo_produccion', (i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario))::float8) ORDER BY i.id), '[]')
      FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id WHERE i.pedido_id = p.id) AS items,
    (SELECT COALESCE(json_agg(json_build_object('id', e.id, 'pedido_item_id', e.pedido_item_id, 'nombre', e.nombre,
        'orden', e.orden, 'estado', e.estado,
        'minutos_estimados', e.minutos_estimados, 'minutos_reales', e.minutos_reales, 'semaforo', e.semaforo,
        'responsable_id', e.responsable_id, 'responsable', u.nombre, 'completado_en', e.completado_en,
        'observaciones', e.observaciones) ORDER BY e.pedido_item_id, e.orden), '[]')
      FROM pedido_etapas e LEFT JOIN usuarios u ON u.id = e.responsable_id WHERE e.pedido_id = p.id) AS etapas,
    COALESCE((SELECT SUM(i.cantidad * i.precio_unitario) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS total,
    -- Costo de producción del pedido = materiales + mano de obra, copiados del
    -- costo calculado del producto al momento de crear el pedido (ver POST /).
    -- Ya no se suma el costo de las etapas: ese campo quedó solo para
    -- compatibilidad (ver migracion_009_costo_producto_medidas_historia.sql).
    COALESCE((SELECT SUM(i.cantidad * (i.costo_materiales_unitario + i.costo_mano_obra_unitario)) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS costo_estimado,
    COALESCE((SELECT SUM(i.cantidad * i.costo_materiales_unitario) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS costo_materiales_total,
    COALESCE((SELECT SUM(i.cantidad * i.costo_mano_obra_unitario) FROM pedido_items i WHERE i.pedido_id = p.id), 0)::float8 AS costo_mano_obra_total,
    (SELECT COUNT(*) FROM pedido_etapas e WHERE e.pedido_id = p.id)::int AS etapas_totales,
    (SELECT COUNT(*) FROM pedido_etapas e WHERE e.pedido_id = p.id AND e.estado = 'COMPLETADA')::int AS etapas_completadas,
    COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE e.estado = 'COMPLETADA') / NULLIF(COUNT(*), 0))
      FROM pedido_etapas e WHERE e.pedido_id = p.id), 0)::int AS avance
  FROM pedidos p`

// El empleado solo ve los pedidos donde tiene alguna etapa a cargo.
const filtroEmpleado = ' WHERE EXISTS (SELECT 1 FROM pedido_etapas e WHERE e.pedido_id = p.id AND e.responsable_id = $1)'

router.get('/', auth(), asyncRoute(async (req, res) => {
  const admin = esAdmin(req.user.rol)
  const { rows } = await pool.query(`${consultaPedidos}${admin ? '' : filtroEmpleado} ORDER BY p.prioridad DESC, p.creado_en DESC`, admin ? [] : [req.user.id])
  res.json(rows)
}))

router.get('/:id', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  if (!esAdmin(req.user.rol) && !rows[0].etapas.some(etapa => String(etapa.responsable_id) === String(req.user.id))) throw fallo('No tenés permisos sobre este pedido.', 403)
  res.json(rows[0])
}))

// Crea el pedido, sus items y despliega una etapa de trabajo por cada
// etapa del producto. La duración se copia del catálogo y se multiplica
// por la cantidad pedida, de modo que editar el producto más tarde no
// altera lo que ya está en producción.
//
// El costo de producción de cada item (materiales + mano de obra) se
// calcula igual que en conCostoCalculado() de server/rutas/productos.js y
// se copia por unidad a pedido_items.costo_materiales_unitario /
// costo_mano_obra_unitario: es una FOTO del costo del producto al momento
// de crear el pedido, para que editar el producto después no altere el
// costo de pedidos ya creados. El costo por etapa (etapas_producto.costo)
// ya no se usa para esto: ese campo quedó solo por compatibilidad.
router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { items = [], fecha_entrega = null, prioridad = 0, notas = '' } = req.body
  if (!Array.isArray(items) || !items.length) throw fallo('El pedido necesita al menos un producto.')

  const conexion = await pool.connect()
  try {
    await conexion.query('BEGIN')

    const costoHora = Number((await leerConfiguracion(conexion)).costo_hora_mano_obra) || 0

    const pedido = (await conexion.query(
      'INSERT INTO pedidos (fecha_entrega, prioridad, notas, creado_por) VALUES ($1, $2, $3, $4) RETURNING id, codigo',
      [fecha_entrega || null, entero(prioridad) || 0, notas?.trim() || null, req.user.id])).rows[0]

    for (const item of items) {
      const cantidad = entero(item?.cantidad) || 1
      if (cantidad <= 0) throw fallo('La cantidad de cada producto debe ser mayor a cero.')
      const producto = (await conexion.query('SELECT id, nombre, precio_venta, horas_hombre FROM productos WHERE id = $1', [item?.producto_id])).rows[0]
      if (!producto) throw fallo('Alguno de los productos seleccionados no existe.')

      // La sección Materiales se eliminó: los pedidos nuevos ya no suman
      // costo de materiales. La columna se mantiene (en 0) para no alterar
      // el costo guardado de pedidos anteriores.
      const costoMaterialesUnitario = 0
      const costoManoObraUnitario = decimal((Number(producto.horas_hombre) || 0) * costoHora)

      const precio = item.precio_unitario === undefined || item.precio_unitario === null ? Number(producto.precio_venta) : decimal(item.precio_unitario)
      const itemId = (await conexion.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, costo_materiales_unitario, costo_mano_obra_unitario)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [pedido.id, producto.id, cantidad, precio, costoMaterialesUnitario, costoManoObraUnitario])).rows[0].id

      const etapas = (await conexion.query('SELECT id, nombre, orden, minutos_estimados FROM etapas_producto WHERE producto_id = $1 ORDER BY orden', [producto.id])).rows
      if (!etapas.length) throw fallo(`El producto "${producto.nombre}" no tiene etapas de fabricación cargadas.`)

      // Las etapas nacen sin responsable: se asignan después, etapa por
      // etapa, desde la sección Tareas (el pedido no asigna empleados).
      for (const etapa of etapas) {
        await conexion.query(
          `INSERT INTO pedido_etapas (pedido_id, pedido_item_id, etapa_producto_id, nombre, orden, minutos_estimados, responsable_id)
           VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
          [pedido.id, itemId, etapa.id, etapa.nombre, etapa.orden, etapa.minutos_estimados * cantidad])
      }
    }

    await conexion.query('COMMIT')
    const creado = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [pedido.id])
    res.status(201).json(creado.rows[0])
  } catch (error) { await conexion.query('ROLLBACK'); throw error } finally { conexion.release() }
}))

router.patch('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { estado, prioridad, fecha_entrega, notas } = req.body
  if (estado !== undefined && !estadosPedido.includes(estado)) throw fallo('Estado de pedido inválido.')
  const { rows } = await pool.query(`UPDATE pedidos SET
      estado = COALESCE($1::estado_pedido, estado),
      prioridad = COALESCE($2::smallint, prioridad),
      fecha_entrega = COALESCE($3::date, fecha_entrega),
      notas = COALESCE($4, notas),
      terminado_en = CASE WHEN $1 = 'TERMINADO' THEN COALESCE(terminado_en, NOW()) WHEN $1 IS NULL THEN terminado_en ELSE NULL END,
      actualizado_en = NOW()
    WHERE id = $5 RETURNING id`, [estado ?? null, prioridad ?? null, fecha_entrega || null, notas ?? null, req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  const actualizado = await pool.query(`${consultaPedidos} WHERE p.id = $1`, [req.params.id])
  res.json(actualizado.rows[0])
}))

// La asignación de empleados a etapas ya NO se hace desde Pedidos: la
// sección Pedidos es solo informativa. Las etapas se asignan desde Tareas
// (PATCH /api/tareas/asignadas/:origen/:id/asignar, ver rutas/tareas.js).

router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM pedidos WHERE id = $1 RETURNING id', [req.params.id])
  if (!rows[0]) throw fallo('Pedido no encontrado.', 404)
  res.json({ mensaje: 'Pedido eliminado.' })
}))

// Reabre un pedido que se había marcado como terminado a mano.
router.post('/:id/sincronizar', auth(['admin']), asyncRoute(async (req, res) => {
  const estado = await sincronizarPedido(pool, req.params.id)
  res.json({ estado })
}))

export default router
