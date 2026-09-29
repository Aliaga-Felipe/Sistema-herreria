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
       (SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = 'super_admin'))
     RETURNING id`, [`${marca}_admin@prueba.local`, hash])).rows[0]
  creados.usuarios.push(admin.id)

  const sesion = await llamar('/auth/iniciar-sesion', { method: 'POST', cuerpo: { email: `${marca}_admin@prueba.local`, contrasena: 'ClaveDePrueba123' } })
  ok('login del admin', ['admin', 'super_admin'].includes(sesion.usuario.rol))
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

  // --- producto (sin tareas: las tareas se definen en cada pedido) ------
  const producto = await llamar('/productos', { method: 'POST', cuerpo: {
    nombre: `Portón ${marca}`, descripcion: 'Producto de prueba', historia: 'Historia de prueba', precio_venta: 400000,
    materiales: [{ nombre: 'Hierro', precio_unitario: 50000, cantidad: 2 }]
  } }, token)
  creados.productos.push(producto.id)
  ok('producto creado con precio y sin tareas', producto.precio_venta === 400000 && !('etapas' in producto))
  ok('costo y margen calculados', producto.costo_calculado_total === 100000 && producto.margen === 300000, `costo ${producto.costo_calculado_total} margen ${producto.margen}`)

  // --- integración con el catálogo de WhatsApp (ver server/meta-whatsapp.js) ---
  // No se hace ninguna llamada real a Meta: en este entorno de prueba
  // WHATSAPP_SYNC_ENABLED no está en "true", así que la sincronización se
  // omite. Lo que se prueba es que un producto borrador nace con el estado
  // correcto, que reintentar sin la integración habilitada da un error
  // claro (y no rompe nada) y que publicar un producto completo con
  // categoría no falla aunque intente sincronizar en segundo plano.
  ok('producto borrador nace sin sincronizar', producto.whatsapp_sync_estado === 'NO_SINCRONIZADO', producto.whatsapp_sync_estado)

  let reintentoSinHabilitar = null
  try { await llamar(`/productos/${producto.id}/whatsapp/reintentar`, { method: 'POST', cuerpo: {} }, token) }
  catch (error) { reintentoSinHabilitar = error.message }
  ok('reintentar sin la integración habilitada da un error claro (no crashea)', Boolean(reintentoSinHabilitar) && /habilitada|400/i.test(reintentoSinHabilitar), reintentoSinHabilitar)

  const categoriaMesas = (await pool.query("SELECT id FROM categorias WHERE slug = 'mesas' LIMIT 1")).rows[0]
  const productoPublicado = await llamar('/productos', { method: 'POST', cuerpo: {
    nombre: `Mesa publicada ${marca}`, descripcion: 'Mesa de prueba', historia: 'Historia de prueba', precio_venta: 250000,
    categoria_id: categoriaMesas?.id || null, chapita_id: `H${Date.now()}`.slice(0, 20), publicado: true
  } }, token)
  creados.productos.push(productoPublicado.id)
  ok('producto publicado se guarda igual aunque WhatsApp esté apagado', productoPublicado.publicado === true)
  ok('el guardado no se rompe por la sincronización en segundo plano', productoPublicado.whatsapp_sync_estado === 'NO_SINCRONIZADO', productoPublicado.whatsapp_sync_estado)

  // --- pedido con dos unidades ------------------------------------------
  // El precio NO se manda: sale del producto (si viene, se ignora). Las
  // tareas se definen para este pedido, con minutos por unidad.
  let sinTareas = null
  try { await llamar('/pedidos', { method: 'POST', cuerpo: { items: [{ producto_id: producto.id, cantidad: 1 }] } }, token) }
  catch (error) { sinTareas = error.message }
  ok('un pedido sin tareas se rechaza con un mensaje claro', /al menos una tarea/i.test(sinTareas || ''), sinTareas)

  const pedido = await llamar('/pedidos', { method: 'POST', cuerpo: {
    fecha_entrega: '2026-12-01', prioridad: 1, notas: 'Pedido de prueba',
    items: [{ producto_id: producto.id, cantidad: 2, precio_unitario: 1, tareas: [
      { nombre: 'Corte', minutos_estimados: 120 },
      { nombre: 'Soldadura', minutos_estimados: 240 },
      { nombre: 'Pintura', minutos_estimados: 60 }
    ] }]
  } }, token)
  creados.pedidos.push(pedido.id)
  ok('pedido creado con código automático', /^PED-\d{5}$/.test(pedido.codigo), pedido.codigo)
  ok('tareas del pedido creadas', pedido.etapas.length === 3 && pedido.etapas.map(etapa => etapa.nombre).join() === 'Corte,Soldadura,Pintura')
  ok('cantidad multiplica tiempo y costo', pedido.etapas[0].minutos_estimados === 240 && pedido.items[0].costo_produccion === 200000)
  ok('el precio sale del producto (el del cuerpo se ignora)', pedido.total === 800000, String(pedido.total))
  ok('el pedido no guarda datos de cliente', !('cliente' in pedido))

  // Otro pedido del MISMO producto con tareas distintas: no se mezclan y
  // el producto no cambia.
  const otro = await llamar('/pedidos', { method: 'POST', cuerpo: {
    items: [{ producto_id: producto.id, cantidad: 1, tareas: [{ nombre: 'Diseño', minutos_estimados: 30 }, { nombre: 'Instalación', minutos_estimados: 90 }] }]
  } }, token)
  creados.pedidos.push(otro.id)
  ok('dos pedidos del mismo producto tienen tareas distintas', otro.etapas.map(etapa => etapa.nombre).join() === 'Diseño,Instalación'
    && (await llamar(`/pedidos/${pedido.id}`, {}, token)).etapas.length === 3)
  const sugeridas = await llamar(`/pedidos/tareas-sugeridas?producto_id=${producto.id}`, {}, token)
  ok('las tareas sugeridas salen del último pedido (minutos por unidad)', sugeridas.tareas.map(tarea => `${tarea.nombre}:${tarea.minutos_estimados}`).join() === 'Diseño:30,Instalación:90')
  const conExtra = await llamar(`/pedidos/${otro.id}/items/${otro.items[0].id}/tareas`, { method: 'POST', cuerpo: { nombre: 'Embalaje', minutos_estimados: 15 } }, token)
  ok('se agrega una tarea a un pedido ya creado', conExtra.etapas.length === 3 && conExtra.etapas[2].nombre === 'Embalaje' && conExtra.etapas[2].orden === 3)
  const sinExtra = await llamar(`/pedidos/${otro.id}/tareas/${conExtra.etapas[2].id}`, { method: 'DELETE' }, token)
  ok('se quita una tarea pendiente del pedido', sinExtra.etapas.length === 2)
  const productoIntacto = await llamar(`/productos/${producto.id}`, {}, token)
  ok('el producto no se modifica al configurar tareas', !('etapas' in productoIntacto) && productoIntacto.precio_venta === 400000)
  await llamar(`/pedidos/${otro.id}`, { method: 'DELETE' }, token)

  ok('las etapas del pedido nacen sin asignar', pedido.etapas.every(etapa => !etapa.responsable_id))
  for (const etapa of pedido.etapas) {
    await llamar(`/tareas/asignadas/PEDIDO/${etapa.id}/asignar`, { method: 'PATCH', cuerpo: { responsable_id: empleado.id } }, token)
  }

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
  // Las métricas de dinero salen de server/metricas.js y son las mismas en
  // el Panel de control (resumen) y en Estadísticas (generales).
  const resumen = await llamar('/estadisticas/resumen', {}, token)
  ok('resumen del panel con pedidos terminados', resumen.pedidos.terminados >= 1)
  ok('resumen con conteo de semáforos', resumen.trabajo.verdes >= 1 && resumen.trabajo.rojos >= 1)

  const generales = await llamar('/estadisticas/generales', {}, token)
  const m = generales.metricas
  ok('panel y estadísticas muestran los mismos números', JSON.stringify(resumen.metricas) === JSON.stringify(m))
  ok('ingresos cobrados del pedido terminado', m.real.ingresos_pedidos >= 800000, String(m.real.ingresos_pedidos))
  ok('gastos de producción de etapas completadas', m.real.gastos_etapas_pedidos > 0, String(m.real.gastos_etapas_pedidos))
  ok('recompensas contadas como gasto', m.real.recompensas >= 1875, String(m.real.recompensas))
  ok('ganancia neta = ingresos - gastos', Math.round(m.real.ganancia) === Math.round(m.real.ingresos - m.real.gastos))
  ok('rendimiento por empleado', generales.rendimiento.some(persona => String(persona.id) === String(empleado.id) && persona.completadas === 3))
  ok('rentabilidad por producto', generales.por_producto.some(item => String(item.id) === String(producto.id)))

  // --- venta de productos: activo = proyección, desactivado = vendido ----
  const precioProducto = Number(producto.precio_venta)
  ok('el producto activo entra en la proyección y no figura como vendido',
    m.productos.activos >= 1 && m.proyectado.ingresos_stock >= precioProducto)
  await llamar(`/productos/${producto.id}/activo`, { method: 'PATCH', cuerpo: { activo: false } }, token)
  const trasVenta = (await llamar('/estadisticas/generales', {}, token)).metricas
  ok('al desactivarlo pasa a vendido', trasVenta.productos.vendidos === m.productos.vendidos + 1 && trasVenta.productos.activos === m.productos.activos - 1)
  ok('su precio pasa de proyectado a cobrado', Math.round(trasVenta.real.ingresos_productos - m.real.ingresos_productos) === Math.round(precioProducto)
    && Math.round(m.proyectado.ingresos_stock - trasVenta.proyectado.ingresos_stock) === Math.round(precioProducto))
  ok('los ingresos proyectados totales no cambian (no se duplica)', Math.round(trasVenta.proyectado.ingresos) === Math.round(m.proyectado.ingresos))
  await llamar(`/productos/${producto.id}/activo`, { method: 'PATCH', cuerpo: { activo: false } }, token)
  await llamar(`/productos/${producto.id}`, { method: 'DELETE' }, token)
  const trasBorrar = (await llamar('/estadisticas/generales', {}, token)).metricas
  ok('desactivar dos veces y después eliminar no duplica la venta', trasBorrar.productos.vendidos === trasVenta.productos.vendidos
    && Math.round(trasBorrar.real.ingresos_productos) === Math.round(trasVenta.real.ingresos_productos))
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const futuro = (await llamar(`/estadisticas/generales?desde=${manana}`, {}, token)).metricas
  ok('el filtro de fechas deja afuera la venta de hoy', futuro.real.ingresos === 0 && futuro.productos.vendidos_periodo === 0)

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
  for (const id of creados.productos) await pool.query('DELETE FROM productos WHERE id = $1', [id])
  await pool.query('DELETE FROM recompensas WHERE usuario_id = ANY($1)', [creados.usuarios])
  for (const id of creados.usuarios) await pool.query('DELETE FROM usuarios WHERE id = $1', [id])
  await pool.end()
  console.log(process.exitCode ? '\nLa prueba de humo encontró fallas.' : '\nPrueba de humo completa. Datos de prueba eliminados.')
}
