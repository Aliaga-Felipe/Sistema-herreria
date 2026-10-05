/**
 * Prueba de humo del flujo completo contra la API.
 * Crea un admin temporal, un empleado y productos; arma un pedido con sus
 * horas-hombre repartidas en etapas asignadas, propone el trabajo en la
 * producción diaria, el empleado completa las etapas, el admin verifica y
 * termina el día, y revisa la recompensa del equipo y las estadísticas. Al
 * final borra todo lo que creó.
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

  // --- pedido: horas-hombre estimadas repartidas en etapas con empleado ----
  // El precio NO se manda: sale del producto (si viene, se ignora). Para
  // cada producto se estiman sus horas-hombre (por unidad) y se reparten en
  // etapas, cada una con su empleado: la suma tiene que coincidir.
  const costoHora = Number((await pool.query("SELECT valor FROM configuracion WHERE clave = 'costo_hora_mano_obra'")).rows[0]?.valor) || 0
  const etapasSilla = [
    { nombre: 'Corte', horas_hombre: 1, responsable_id: empleado.id },
    { nombre: 'Soldadura', horas_hombre: 2, responsable_id: empleado.id },
    { nombre: 'Pintura', horas_hombre: 1, responsable_id: empleado.id }
  ]
  const rechazo = async cuerpo => {
    try { await llamar('/pedidos', { method: 'POST', cuerpo }, token); return null } catch (error) { return error.message }
  }

  const sinEtapas = await rechazo({ items: [{ producto_id: producto.id, cantidad: 1, horas_hombre: 4 }] })
  ok('un pedido sin etapas se rechaza con un mensaje claro', /al menos una etapa/i.test(sinEtapas || ''), sinEtapas)
  const noSuma = await rechazo({ items: [{ producto_id: producto.id, cantidad: 1, horas_hombre: 5, tareas: etapasSilla }] })
  ok('las etapas tienen que sumar las horas-hombre estimadas', /suman 4 hs .* 5 hs/i.test(noSuma || ''), noSuma)
  const sinEmpleado = await rechazo({ items: [{ producto_id: producto.id, cantidad: 1, horas_hombre: 4, tareas: [{ nombre: 'Corte', horas_hombre: 4 }] }] })
  ok('cada etapa necesita un empleado', /asigná un empleado/i.test(sinEmpleado || ''), sinEmpleado)
  const conAdmin = await rechazo({ items: [{ producto_id: producto.id, cantidad: 1, horas_hombre: 4, tareas: [{ nombre: 'Corte', horas_hombre: 4, responsable_id: admin.id }] }] })
  ok('el responsable tiene que ser un empleado activo', /empleado activo/i.test(conAdmin || ''), conAdmin)

  const pedido = await llamar('/pedidos', { method: 'POST', cuerpo: {
    fecha_entrega: '2026-12-01', prioridad: 1, notas: 'Pedido de prueba',
    items: [{ producto_id: producto.id, cantidad: 2, precio_unitario: 1, horas_hombre: 4, tareas: etapasSilla }]
  } }, token)
  creados.pedidos.push(pedido.id)
  ok('pedido creado con código automático', /^PED-\d{5}$/.test(pedido.codigo), pedido.codigo)
  ok('etapas del pedido creadas', pedido.etapas.length === 3 && pedido.etapas.map(etapa => etapa.nombre).join() === 'Corte,Soldadura,Pintura')
  ok('las etapas nacen asignadas a su empleado', pedido.etapas.every(etapa => String(etapa.responsable_id) === String(empleado.id)))
  ok('la cantidad multiplica las horas-hombre de cada etapa', pedido.etapas.map(etapa => etapa.horas_hombre).join() === '2,4,2'
    && pedido.etapas[1].minutos_estimados === 240, pedido.etapas.map(etapa => etapa.horas_hombre).join())
  ok('las horas-hombre del producto en el pedido son la suma de sus etapas', pedido.items[0].horas_hombre === 8 && pedido.horas_hombre === 8)
  ok('la mano de obra sale de las horas-hombre estimadas en el pedido',
    pedido.items[0].costo_produccion === 2 * (100000 + 4 * costoHora), `${pedido.items[0].costo_produccion} (hora ${costoHora})`)
  ok('el precio sale del producto (el del cuerpo se ignora)', pedido.total === 800000, String(pedido.total))
  ok('el pedido no guarda datos de cliente', !('cliente' in pedido))

  // Otro pedido del MISMO producto con etapas distintas: no se mezclan y
  // el producto no cambia.
  const otro = await llamar('/pedidos', { method: 'POST', cuerpo: {
    items: [{ producto_id: producto.id, cantidad: 1, horas_hombre: 2, tareas: [
      { nombre: 'Diseño', horas_hombre: 0.5, responsable_id: empleado.id },
      { nombre: 'Instalación', horas_hombre: 1.5, responsable_id: empleado.id }
    ] }]
  } }, token)
  creados.pedidos.push(otro.id)
  ok('dos pedidos del mismo producto tienen etapas distintas', otro.etapas.map(etapa => etapa.nombre).join() === 'Diseño,Instalación'
    && (await llamar(`/pedidos/${pedido.id}`, {}, token)).etapas.length === 3)
  const sugeridas = await llamar(`/pedidos/tareas-sugeridas?producto_id=${producto.id}`, {}, token)
  ok('las etapas sugeridas salen del último pedido (horas por unidad y empleado)',
    sugeridas.tareas.map(tarea => `${tarea.nombre}:${tarea.horas_hombre}:${tarea.responsable_id}`).join() === `Diseño:0.5:${empleado.id},Instalación:1.5:${empleado.id}`,
    JSON.stringify(sugeridas.tareas))
  const conExtra = await llamar(`/pedidos/${otro.id}/items/${otro.items[0].id}/tareas`, { method: 'POST', cuerpo: { nombre: 'Embalaje', horas_hombre: 0.25, responsable_id: empleado.id } }, token)
  ok('se agrega una etapa a un pedido ya creado', conExtra.etapas.length === 3 && conExtra.etapas[2].nombre === 'Embalaje' && conExtra.etapas[2].orden === 3)
  ok('agregar una etapa suma sus horas al producto del pedido', conExtra.items[0].horas_hombre === 2.25, String(conExtra.items[0].horas_hombre))
  const sinExtra = await llamar(`/pedidos/${otro.id}/tareas/${conExtra.etapas[2].id}`, { method: 'DELETE' }, token)
  ok('se quita una etapa pendiente del pedido', sinExtra.etapas.length === 2 && sinExtra.items[0].horas_hombre === 2)
  const productoIntacto = await llamar(`/productos/${producto.id}`, {}, token)
  ok('el producto no se modifica al configurar etapas', !('etapas' in productoIntacto) && productoIntacto.precio_venta === 400000)

  // --- bandeja del empleado -------------------------------------------
  const bandeja = (await llamar('/tareas/asignadas/mias', {}, tokenEmpleado)).filter(tarea => String(tarea.contenedor_id) === String(pedido.id))
  ok('el empleado ve sus etapas asignadas sin que nadie las asigne aparte', bandeja.length === 3, `${bandeja.length} etapas`)
  const corte = bandeja.find(tarea => tarea.etapa === 'Corte')
  const soldadura = bandeja.find(tarea => tarea.etapa === 'Soldadura')
  const pintura = bandeja.find(tarea => tarea.etapa === 'Pintura')
  ok('la bandeja muestra las horas-hombre de cada etapa', soldadura.horas_hombre === 4)

  // --- producción diaria ------------------------------------------------
  // Fechas lejanas para no tocar días reales.
  const dia = '2001-01-01'
  const rutaDia = fecha => `/produccion/jornada/${fecha}`
  const agregar = (fecha, cuerpo, conToken = token) => llamar(`${rutaDia(fecha)}/etapas`, { method: 'POST', cuerpo }, conToken)
  const fallaCon = async promesa => { try { await promesa; return null } catch (error) { return error.message } }

  ok('un día sin producción está sin planificar', (await llamar(rutaDia(dia), {}, token)).estado === 'SIN_PLANIFICAR')
  ok('el empleado no puede armar la producción del día', /403/.test(await fallaCon(agregar(dia, { etapas: [corte.id] }, tokenEmpleado)) || ''))

  // Se puede proponer una etapa suelta, un producto o un pedido completo.
  const soloCorte = await agregar(dia, { etapas: [corte.id] })
  ok('se propone una etapa suelta', soloCorte.estado === 'ABIERTA' && soloCorte.etapas_totales === 1 && soloCorte.objetivo_horas === 2)
  const conProducto = await agregar(dia, { pedido_item_id: pedido.items[0].id })
  ok('se propone un producto completo (sin repetir lo que ya estaba)', conProducto.agregadas === 2 && conProducto.etapas_totales === 3 && conProducto.objetivo_horas === 8
    && conProducto.omitidas.length === 1, JSON.stringify({ agregadas: conProducto.agregadas, omitidas: conProducto.omitidas }))
  const repetido = await fallaCon(agregar(dia, { pedido_id: pedido.id }))
  ok('proponer de nuevo lo mismo se rechaza explicando por qué', /ya está en la producción de este día/i.test(repetido || ''), repetido)
  const enOtroDia = await fallaCon(agregar('2001-01-02', { etapas: [corte.id] }))
  ok('una etapa no puede estar en dos producciones abiertas', /ya está en la producción del 01\/01\/2001/i.test(enOtroDia || ''), enOtroDia)
  ok('el día sigue sin planificar si no se agregó nada', (await llamar(rutaDia('2001-01-02'), {}, token)).estado === 'SIN_PLANIFICAR')

  const bandejaConDia = (await llamar('/tareas/asignadas/mias', {}, tokenEmpleado)).filter(tarea => String(tarea.contenedor_id) === String(pedido.id))
  ok('el empleado ve qué etapas están en la producción del día', bandejaConDia.every(tarea => tarea.jornada === dia))
  ok('el pedido muestra en qué producción está cada etapa', (await llamar(`/pedidos/${pedido.id}`, {}, token)).etapas.every(etapa => etapa.jornada === dia))

  // --- el empleado completa las etapas (sin informar tiempo) ------------
  await llamar(`/tareas/asignadas/PEDIDO/${corte.id}/iniciar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)
  const cierre = await llamar(`/tareas/asignadas/PEDIDO/${corte.id}/completar`, { method: 'PATCH', cuerpo: { observaciones: 'Sin contratiempos' } }, tokenEmpleado)
  ok('el empleado completa una etapa sin decir cuánto tardó', cierre.estado === 'COMPLETADA' && cierre.estado_pedido === 'EN_PRODUCCION', JSON.stringify(cierre))
  ok('ya no se genera semáforo', !('semaforo' in cierre))
  ok('una etapa completada no se completa dos veces', /ya está completada/i.test(await fallaCon(llamar(`/tareas/asignadas/PEDIDO/${corte.id}/completar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)) || ''))

  const aMedias = await llamar(rutaDia(dia), {}, tokenEmpleado)
  ok('a medio día: avance en horas-hombre y todavía sin recompensa', aMedias.horas_completadas === 2 && aMedias.avance === 25 && !aMedias.cumplido && aMedias.recompensa === 0,
    JSON.stringify({ completadas: aMedias.horas_completadas, avance: aMedias.avance }))

  await llamar(`/tareas/asignadas/PEDIDO/${soldadura.id}/completar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)
  const ultima = await llamar(`/tareas/asignadas/PEDIDO/${pintura.id}/completar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)
  ok('el pedido se cierra solo al completar todas sus etapas', ultima.estado_pedido === 'TERMINADO', ultima.estado_pedido)

  // --- el admin verifica y termina la producción del día -----------------
  ok('el empleado no puede reabrir etapas', /403/.test(await fallaCon(llamar(`/tareas/asignadas/PEDIDO/${pintura.id}/reabrir`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)) || ''))
  const reabierta = await llamar(`/tareas/asignadas/PEDIDO/${pintura.id}/reabrir`, { method: 'PATCH', cuerpo: {} }, token)
  ok('al verificar, el admin puede reabrir una etapa mal terminada', reabierta.estado === 'PENDIENTE' && (await llamar(`/pedidos/${pedido.id}`, {}, token)).estado === 'EN_PRODUCCION')
  ok('con una etapa reabierta el día no está cumplido', !(await llamar(rutaDia(dia), {}, token)).cumplido)
  await llamar(`/tareas/asignadas/PEDIDO/${pintura.id}/completar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)

  ok('el empleado no puede terminar la producción del día', /403/.test(await fallaCon(llamar(`${rutaDia(dia)}/terminar`, { method: 'POST', cuerpo: {} }, tokenEmpleado)) || ''))
  const terminada = await llamar(`${rutaDia(dia)}/terminar`, { method: 'POST', cuerpo: {} }, token)
  const valorHora = terminada.valor_hora
  const esperada = Math.round(8 * valorHora * (terminada.porcentaje_premio / 100) * 100) / 100
  ok('producción terminada y cumplida', terminada.estado === 'TERMINADA' && terminada.cumplido && terminada.terminada_por === 'Admin de prueba')
  ok('recompensa = horas-hombre estimadas × valor hora × % premio', terminada.recompensa === esperada, `$${terminada.recompensa} (esperado $${esperada})`)
  ok('una producción terminada ya no se modifica', /ya está terminada/i.test(await fallaCon(llamar(`${rutaDia(dia)}/etapas/${corte.id}`, { method: 'DELETE' }, token)) || ''))
  ok('una etapa ya pagada no se puede reabrir', /ya se pagó/i.test(await fallaCon(llamar(`/tareas/asignadas/PEDIDO/${pintura.id}/reabrir`, { method: 'PATCH', cuerpo: {} }, token)) || ''))

  const metricasDia = async () => (await llamar(`/estadisticas/generales?desde=${dia}&hasta=${dia}`, {}, token)).metricas
  ok('la recompensa del equipo cuenta como gasto', (await metricasDia()).real.recompensas === esperada)

  // Reabrir el día anula la recompensa hasta que se vuelva a terminar.
  const reabierto = await llamar(`${rutaDia(dia)}/reabrir`, { method: 'POST', cuerpo: {} }, token)
  ok('el admin puede reabrir una producción terminada', reabierto.estado === 'ABIERTA' && (await metricasDia()).real.recompensas === 0)
  await llamar(`${rutaDia(dia)}/terminar`, { method: 'POST', cuerpo: {} }, token)

  // Cambiar el valor hora después no reescribe un día terminado.
  ok('el empleado no puede cambiar el valor hora', /403/.test(await fallaCon(llamar('/recompensas/parametros', { method: 'PUT', cuerpo: { valor_hora: 1 } }, tokenEmpleado)) || ''))
  const nuevos = await llamar('/recompensas/parametros', { method: 'PUT', cuerpo: { valor_hora: valorHora + 1000, porcentaje_premio: 50 } }, token)
  ok('el admin cambia valor hora y % premio', nuevos.valor_hora === valorHora + 1000 && nuevos.porcentaje_premio === 50)
  const sinCambio = await llamar(`/recompensas/equipo/dia/${dia}`, {}, token)
  ok('el valor nuevo no recalcula días terminados', sinCambio.valor_hora === valorHora && sinCambio.recompensa === esperada, `$${sinCambio.recompensa}`)
  const guardada = (await pool.query('SELECT objetivo_detalle FROM jornadas_equipo WHERE fecha = $1', [dia])).rows[0]
  ok('el día terminado guarda la copia de sus etapas', guardada.objetivo_detalle.length === 3 && guardada.objetivo_detalle.every(etapa => etapa.estado === 'COMPLETADA'))

  // --- un día que no se completa no paga -------------------------------
  const tercero = '2001-01-03'
  await agregar(tercero, { pedido_id: otro.id })
  await llamar(`/tareas/asignadas/PEDIDO/${otro.etapas[0].id}/completar`, { method: 'PATCH', cuerpo: {} }, tokenEmpleado)
  const incompleta = await llamar(`${rutaDia(tercero)}/terminar`, { method: 'POST', cuerpo: {} }, token)
  ok('si falta una etapa, la producción se termina sin recompensa', incompleta.estado === 'TERMINADA' && !incompleta.cumplido && incompleta.recompensa === 0)
  const cuarto = '2001-01-04'
  const siguiente = await agregar(cuarto, { pedido_id: otro.id })
  ok('lo que quedó pendiente se puede proponer otro día', siguiente.etapas_totales === 1 && siguiente.etapas[0].nombre === 'Instalación')
  await llamar(`${rutaDia(cuarto)}/etapas/${otro.etapas[1].id}`, { method: 'DELETE' }, token)
  ok('al quitar la última etapa el día vuelve a estar sin planificar', (await llamar(rutaDia(cuarto), {}, token)).estado === 'SIN_PLANIFICAR')

  const historial = await llamar(`/recompensas/equipo?desde=${dia}&hasta=${cuarto}`, {}, token)
  ok('el historial lista los días terminados con su resultado', historial.length === 2 && historial.some(fila => fila.fecha === dia && fila.cumplido) && historial.some(fila => fila.fecha === tercero && !fila.cumplido))

  // --- estadísticas -----------------------------------------------------
  // Las métricas de dinero salen de server/metricas.js y son las mismas en
  // el Panel de control (resumen) y en Estadísticas (generales).
  const resumen = await llamar('/estadisticas/resumen', {}, token)
  ok('resumen del panel con pedidos terminados', resumen.pedidos.terminados >= 1)
  ok('resumen con la producción de hoy', resumen.produccion_hoy && ['SIN_PLANIFICAR', 'ABIERTA', 'TERMINADA'].includes(resumen.produccion_hoy.estado))

  const generales = await llamar('/estadisticas/generales', {}, token)
  const m = generales.metricas
  ok('panel y estadísticas muestran los mismos números', JSON.stringify(resumen.metricas) === JSON.stringify(m))
  ok('ingresos cobrados del pedido terminado', m.real.ingresos_pedidos >= 800000, String(m.real.ingresos_pedidos))
  ok('gastos de producción de etapas completadas', m.real.gastos_etapas_pedidos > 0, String(m.real.gastos_etapas_pedidos))
  ok('ganancia neta = ingresos - gastos', Math.round(m.real.ganancia) === Math.round(m.real.ingresos - m.real.gastos))
  ok('rendimiento por empleado en horas-hombre', generales.rendimiento.some(persona => String(persona.id) === String(empleado.id) && persona.completadas === 4 && persona.horas_completadas === 8.5),
    JSON.stringify(generales.rendimiento.find(persona => String(persona.id) === String(empleado.id))))
  const periodo = (await llamar(`/estadisticas/generales?desde=${dia}&hasta=${cuarto}`, {}, token)).produccion
  ok('estadísticas de producción diaria del período', periodo.dias === 2 && periodo.cumplidas === 1 && periodo.recompensas === esperada, JSON.stringify(periodo))
  ok('rentabilidad por producto', generales.por_producto.some(item => String(item.id) === String(producto.id)))

  // --- venta de productos: activo = proyección, vendido = venta ----------
  const precioPublicado = Number(productoPublicado.precio_venta)
  ok('el producto activo entra en la proyección', m.productos.activos >= 1 && m.proyectado.ingresos_stock >= precioPublicado)
  await llamar(`/productos/${productoPublicado.id}/vender`, { method: 'POST', cuerpo: {} }, token)
  const trasVenta = (await llamar('/estadisticas/generales', {}, token)).metricas
  ok('al venderlo pasa a vendido', trasVenta.productos.vendidos === m.productos.vendidos + 1 && trasVenta.productos.activos === m.productos.activos - 1)
  ok('su precio pasa de proyectado a cobrado', Math.round(trasVenta.real.ingresos_productos - m.real.ingresos_productos) === Math.round(precioPublicado)
    && Math.round(m.proyectado.ingresos_stock - trasVenta.proyectado.ingresos_stock) === Math.round(precioPublicado))
  ok('los ingresos proyectados totales no cambian (no se duplica)', Math.round(trasVenta.proyectado.ingresos) === Math.round(m.proyectado.ingresos))
  await llamar(`/productos/${productoPublicado.id}`, { method: 'DELETE' }, token)
  const trasBorrar = (await llamar('/estadisticas/generales', {}, token)).metricas
  ok('eliminar un producto vendido conserva la venta', trasBorrar.productos.vendidos === trasVenta.productos.vendidos
    && Math.round(trasBorrar.real.ingresos_productos) === Math.round(trasVenta.real.ingresos_productos))
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const futuro = (await llamar(`/estadisticas/generales?desde=${manana}`, {}, token)).metricas
  ok('el filtro de fechas deja afuera la venta de hoy', futuro.real.ingresos === 0 && futuro.productos.vendidos_periodo === 0)
  const conPedidos = await fallaCon(llamar(`/productos/${producto.id}`, { method: 'DELETE' }, token))
  ok('un producto con pedidos no se puede eliminar', /409/.test(conPedidos || ''), conPedidos)

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
  await pool.query("DELETE FROM jornadas_equipo WHERE fecha BETWEEN '2001-01-01' AND '2001-01-04'")
  await pool.query('DELETE FROM historial_ventas_productos WHERE producto_id_original = ANY($1)', [creados.productos])
  await pool.query('DELETE FROM parametros_recompensa_historial WHERE creado_por = ANY($1)', [creados.usuarios])
  for (const id of creados.usuarios) await pool.query('DELETE FROM usuarios WHERE id = $1', [id])
  await pool.end()
  console.log(process.exitCode ? '\nLa prueba de humo encontró fallas.' : '\nPrueba de humo completa. Datos de prueba eliminados.')
}
