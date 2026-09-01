/**
 * Prueba de humo del flujo completo contra la API.
 * Crea un admin temporal, un empleado, un producto, un pedido, cierra una
 * etapa rápido y otra lenta, revisa el semáforo, las recompensas y las
 * estadísticas, y al final borra todo lo que creó.
 *
 * Uso:  node database/prueba-humo.mjs [http://localhost:3001]
 */
import 'dotenv/config'
import bcrypt from 'bcrypt'
import { pool } from '../server/db.js'

const BASE = (process.argv[2] || 'http://localhost:3001') + '/api'
const marca = `humo_${Date.now()}`
const ok = (etiqueta, condicion, extra = '') => {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${etiqueta}${extra ? ` → ${extra}` : ''}`)
  if (!condicion) process.exitCode = 1
}

async function llamar(ruta, opciones = {}, token) {
  const respuesta = await fetch(BASE + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opciones.headers },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) throw new Error(`${ruta} → ${respuesta.status} ${datos.error || ''}`)
  return datos
}

const creados = { usuarios: [], productos: [], pedidos: [] }

try {
  // --- admin temporal -------------------------------------------------
  const hash = await bcrypt.hash('ClaveDePrueba123', 12)
  const admin = (await pool.query(
    `INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
     VALUES ('Admin de prueba', $1, $2,
       (SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = 'admin'))
     RETURNING id`, [`${marca}_admin@prueba.local`, hash])).rows[0]
  creados.usuarios.push(admin.id)

  const sesion = await llamar('/auth/iniciar-sesion', { method: 'POST', cuerpo: { email: `${marca}_admin@prueba.local`, contrasena: 'ClaveDePrueba123' } })
  ok('login del admin', sesion.usuario.rol === 'admin')
  const token = sesion.token

  // --- alta de empleado hecha por el admin ----------------------------
  const empleado = await llamar('/usuarios', { method: 'POST', cuerpo: { nombre: 'Empleado de prueba', email: `${marca}_emp@prueba.local`, contrasena: 'ClaveDePrueba123' } }, token)
  creados.usuarios.push(empleado.id)
  ok('el admin crea un empleado', empleado.rol === 'empleado' && empleado.activo)

  const sesionEmpleado = await llamar('/auth/iniciar-sesion', { method: 'POST', cuerpo: { email: `${marca}_emp@prueba.local`, contrasena: 'ClaveDePrueba123' } })
  const tokenEmpleado = sesionEmpleado.token
  ok('el empleado puede iniciar sesión', Boolean(tokenEmpleado))

  let prohibido = false
  try { await llamar('/usuarios', {}, tokenEmpleado) } catch (error) { prohibido = error.message.includes('403') }
  ok('el empleado no accede a la gestión de usuarios', prohibido)

  // --- producto con etapas --------------------------------------------
  const producto = await llamar('/productos', { method: 'POST', cuerpo: {
    nombre: `Portón ${marca}`, descripcion: 'Producto de prueba', precio_venta: 400000,
    etapas: [
      { nombre: 'Corte', costo: 30000, minutos_estimados: 120 },
      { nombre: 'Soldadura', costo: 50000, minutos_estimados: 240 },
      { nombre: 'Pintura', costo: 20000, minutos_estimados: 60 }
    ]
  } }, token)
  creados.productos.push(producto.id)
  ok('producto creado con precio y etapas', producto.etapas.length === 3 && producto.precio_venta === 400000)
  ok('costo y margen calculados', producto.costo_total === 100000 && producto.margen === 300000, `costo ${producto.costo_total} margen ${producto.margen}`)

  // --- pedido con dos unidades y etapas asignadas ----------------------
  const asignaciones = Object.fromEntries(producto.etapas.map(etapa => [etapa.id, empleado.id]))
  const pedido = await llamar('/pedidos', { method: 'POST', cuerpo: {
    cliente: { nombre: `Cliente ${marca}`, telefono: '11 5555-5555', direccion: 'Av. Siempreviva 742', notas: 'Timbre 3' },
    fecha_entrega: '2026-12-01', prioridad: 1, notas: 'Pedido de prueba',
    items: [{ producto_id: producto.id, cantidad: 2, asignaciones }]
  } }, token)
  creados.pedidos.push(pedido.id)
  ok('pedido creado con código automático', /^PED-\d{5}$/.test(pedido.codigo), pedido.codigo)
  ok('etapas desplegadas por item', pedido.etapas.length === 3)
  ok('cantidad multiplica costo y tiempo', pedido.etapas[0].minutos_estimados === 240 && pedido.etapas[0].costo_estimado === 60000)
  ok('total del pedido', pedido.total === 800000, String(pedido.total))
  ok('datos del cliente guardados', pedido.cliente.telefono === '11 5555-5555' && pedido.cliente.direccion === 'Av. Siempreviva 742')

  // --- bandeja del empleado -------------------------------------------
  const bandeja = await llamar('/tareas/asignadas/mias', {}, tokenEmpleado)
  ok('el empleado ve sus etapas asignadas', bandeja.length === 3, `${bandeja.length} etapas`)

  const corte = bandeja.find(tarea => tarea.etapa === 'Corte')
  const soldadura = bandeja.find(tarea => tarea.etapa === 'Soldadura')
  const pintura = bandeja.find(tarea => tarea.etapa === 'Pintura')

  await llamar(`/tareas/asignadas/PEDIDO/${corte.id}/iniciar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)

  // 240 estimados → 150 reales: bien por debajo, tiene que dar verde.
  const rapido = await llamar(`/tareas/asignadas/PEDIDO/${corte.id}/completar`, { method: 'PATCH', cuerpo: { minutos_reales: 150, observaciones: 'Sin contratiempos' } }, tokenEmpleado)
  ok('semáforo verde al terminar antes', rapido.semaforo === 'VERDE', `${rapido.minutos_reales}/${rapido.minutos_estimados} min`)
  ok('recompensa automática generada', rapido.recompensa && rapido.recompensa.monto > 0, `$${rapido.recompensa?.monto}`)
  // (240-150)/60 * 2500 * 0.5 = 1875
  ok('monto según la fórmula configurada', Number(rapido.recompensa.monto) === 1875, String(rapido.recompensa.monto))
  ok('el pedido pasó a producción', rapido.estado_pedido === 'EN_PRODUCCION', rapido.estado_pedido)

  // 480 estimados → 500 reales: se pasa más del 10%, tiene que dar rojo.
  const lento = await llamar(`/tareas/asignadas/PEDIDO/${soldadura.id}/completar`, { method: 'PATCH', cuerpo: { minutos_reales: 600 } }, tokenEmpleado)
  ok('semáforo rojo al pasarse', lento.semaforo === 'ROJO', `${lento.minutos_reales}/${lento.minutos_estimados} min`)
  ok('sin recompensa en rojo', !lento.recompensa)

  // 120 estimados → 118 reales: dentro del ±10%, amarillo.
  const promedio = await llamar(`/tareas/asignadas/PEDIDO/${pintura.id}/completar`, { method: 'PATCH', cuerpo: { minutos_reales: 118 } }, tokenEmpleado)
  ok('semáforo amarillo dentro del promedio', promedio.semaforo === 'AMARILLO', `${promedio.minutos_reales}/${promedio.minutos_estimados} min`)
  ok('el pedido se cerró solo al completar todas las etapas', promedio.estado_pedido === 'TERMINADO', promedio.estado_pedido)

  let sinTiempo = false
  try { await llamar(`/tareas/asignadas/PEDIDO/${corte.id}/completar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado) } catch { sinTiempo = true }
  ok('no se puede cerrar una etapa sin informar el tiempo', sinTiempo)

  // --- avance del pedido ----------------------------------------------
  const pedidoFinal = await llamar(`/pedidos/${pedido.id}`, {}, token)
  ok('avance del pedido al 100%', pedidoFinal.avance === 100 && pedidoFinal.estado === 'TERMINADO')

  // --- recompensas -----------------------------------------------------
  const misRecompensas = await llamar('/recompensas', {}, tokenEmpleado)
  ok('el empleado ve solo sus recompensas', misRecompensas.length === 1 && String(misRecompensas[0].usuario_id) === String(empleado.id))

  const ranking = await llamar('/recompensas/ranking', {}, token)
  const fila = ranking.find(persona => String(persona.id) === String(empleado.id))
  ok('ranking con el reparto de semáforos', fila.verdes === 1 && fila.amarillos === 1 && fila.rojos === 1, JSON.stringify(fila))

  // --- configuración editable ------------------------------------------
  const config = await llamar('/configuracion', { method: 'PUT', cuerpo: { recompensa_valor_hora: '4000' } }, token)
  ok('el admin edita la fórmula de recompensas', config.recompensa_valor_hora === '4000')
  await llamar('/configuracion', { method: 'PUT', cuerpo: { recompensa_valor_hora: '2500' } }, token)

  // --- estadísticas -----------------------------------------------------
  const resumen = await llamar('/estadisticas/resumen', {}, token)
  ok('resumen del panel con pedidos terminados', resumen.pedidos.terminados >= 1)
  ok('resumen con productos más vendidos', resumen.mas_vendidos.some(item => String(item.id) === String(producto.id)))
  ok('resumen con conteo de semáforos', resumen.trabajo.verdes >= 1 && resumen.trabajo.rojos >= 1)

  const generales = await llamar('/estadisticas/generales', {}, token)
  ok('ingresos cobrados del pedido terminado', generales.ingresos.cobrados >= 800000, String(generales.ingresos.cobrados))
  ok('gastos de producción registrados', generales.gastos.produccion_ejecutada >= 200000, String(generales.gastos.produccion_ejecutada))
  ok('recompensas contadas como gasto', generales.gastos.recompensas >= 1875, String(generales.gastos.recompensas))
  ok('ganancia neta = ingresos - gastos', Math.round(generales.ganancia.neta) === Math.round(generales.ingresos.cobrados - generales.gastos.total))
  ok('rendimiento por empleado', generales.rendimiento.some(persona => String(persona.id) === String(empleado.id) && persona.completadas === 3))
  ok('rentabilidad por producto', generales.por_producto.some(item => String(item.id) === String(producto.id)))

  // --- baja lógica de usuarios -------------------------------------------
  const desactivado = await llamar(`/usuarios/${empleado.id}/activo`, { method: 'PATCH', cuerpo: { activo: false } }, token)
  ok('el admin desactiva una cuenta', desactivado.activo === false)
  let bloqueado = false
  try { await llamar('/auth/iniciar-sesion', { method: 'POST', cuerpo: { email: `${marca}_emp@prueba.local`, contrasena: 'ClaveDePrueba123' } }) } catch { bloqueado = true }
  ok('la cuenta desactivada no puede entrar', bloqueado)
} catch (error) {
  process.exitCode = 1
  console.error('\n FALLA no controlada:', error.message)
} finally {
  // --- limpieza ----------------------------------------------------------
  for (const id of creados.pedidos) await pool.query('DELETE FROM pedidos WHERE id = $1', [id])
  await pool.query('DELETE FROM clientes WHERE nombre LIKE $1', [`Cliente ${marca}%`])
  for (const id of creados.productos) await pool.query('DELETE FROM productos WHERE id = $1', [id])
  await pool.query('DELETE FROM recompensas WHERE usuario_id = ANY($1)', [creados.usuarios])
  for (const id of creados.usuarios) await pool.query('DELETE FROM usuarios WHERE id = $1', [id])
  await pool.end()
  console.log(process.exitCode ? '\nLa prueba de humo encontró fallas.' : '\nPrueba de humo completa. Datos de prueba eliminados.')
}
