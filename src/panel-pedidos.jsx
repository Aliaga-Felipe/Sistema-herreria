import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, dinero, etiquetaPrioridad, fecha, horas, hoyLocal, porcentaje, precioVenta, sumarHoras, useData } from './api.js'
import { Actions, Badge, CampoNumero, Empty, EtiquetaJornada, Heading, Modal, Progress, useAviso } from './ui.jsx'
import { ProductoModal, construirCuerpoProducto, sugerirIdPieza } from './panel-productos.jsx'

const estadosPedido = ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO']
// Cada producto del pedido lleva sus horas-hombre estimadas (por unidad)
// repartidas en etapas, cada una con su empleado (ver "ETAPAS DEL PEDIDO"
// en server/rutas/pedidos.js). El precio no se pide: el backend toma el
// precio de venta del producto.
const etapaVacia = () => ({ nombre: '', horas_hombre: '', responsable_id: '' })
const itemVacio = (productoId = '') => ({ producto_id: productoId, cantidad: 1, horas_hombre: '', tareas: [etapaVacia()] })

// Un pedido admite trabajo nuevo en la producción diaria si está en curso
// y tiene etapas pendientes que todavía no están propuestas en ningún día.
const enCurso = pedido => ['PENDIENTE', 'EN_PRODUCCION'].includes(pedido.estado)
const pendientesSinProponer = etapas => etapas.filter(etapa => etapa.estado !== 'COMPLETADA' && !etapa.jornada)

// Orden de la lista de pedidos: por prioridad, % de avance, fecha de
// entrega o estado, ascendente o descendente. Se ordena por pedido (no por
// fila de producto) para que los productos de un mismo pedido no se
// separen entre sí.
const opcionesOrden = [
  { valor: 'prioridad', etiqueta: 'Prioridad' },
  { valor: 'avance', etiqueta: '% completado' },
  { valor: 'fecha_entrega', etiqueta: 'Fecha de entrega' },
  { valor: 'estado', etiqueta: 'Estado' }
]

const comparadoresOrden = {
  prioridad: (a, b) => (a.prioridad || 0) - (b.prioridad || 0),
  avance: (a, b) => (a.avance || 0) - (b.avance || 0),
  fecha_entrega: (a, b) => {
    const ta = a.fecha_entrega ? new Date(a.fecha_entrega).getTime() : Infinity
    const tb = b.fecha_entrega ? new Date(b.fecha_entrega).getTime() : Infinity
    return ta - tb
  },
  estado: (a, b) => estadosPedido.indexOf(a.estado) - estadosPedido.indexOf(b.estado)
}

export default function PanelPedidos({ intencion, limpiarIntencion }) {
  const pedidos = useData('/pedidos')
  const productos = useData('/productos')
  const categorias = useData('/categorias')
  const empleados = useData('/usuarios/empleados')
  const configuracion = useData('/configuracion/valores', {})
  const { mostrar, nodo } = useAviso()
  // false (cerrado), true (pedido vacío) o { producto_id } (desde Productos).
  const [creando, setCreando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [filtro, setFiltro] = useState('ACTIVOS')
  const [ordenPor, setOrdenPor] = useState('prioridad')
  const [ordenDir, setOrdenDir] = useState('desc')

  // Accesos directos: 'nuevo' (Panel de control) o { accion: 'nuevo',
  // producto_id } (botón "Crear pedido" de un producto).
  useEffect(() => {
    if (intencion === 'nuevo') { setCreando(true); limpiarIntencion?.() }
    else if (intencion?.accion === 'nuevo') { setCreando({ producto_id: String(intencion.producto_id) }); limpiarIntencion?.() }
  }, [intencion])

  const crear = async pedido => {
    await api.post('/pedidos', pedido, pedidos.token)
    setCreando(false)
    await pedidos.load()
    mostrar('Pedido creado: sus etapas ya están asignadas. Proponelo en Producción diaria cuando se vaya a trabajar.')
  }

  // Edición de las etapas de un pedido ya creado (desde el detalle).
  const editarTareas = async (accion, pedido, datos) => {
    try {
      const ruta = accion === 'agregar'
        ? api.post(`/pedidos/${pedido.id}/items/${datos.itemId}/tareas`, datos.tarea, pedidos.token)
        : api.del(`/pedidos/${pedido.id}/tareas/${datos.tareaId}`, pedidos.token)
      const actualizado = await ruta
      setDetalle(actualizado)
      await pedidos.load()
      mostrar(accion === 'agregar' ? 'Etapa agregada al pedido.' : 'Etapa quitada del pedido.')
      return true
    } catch (error) { mostrar(error.message, 'error'); return false }
  }

  // Propone el pedido completo o un producto en la producción de hoy (ver
  // POST /produccion/jornada/:fecha/etapas). Las etapas completadas o ya
  // propuestas se omiten solas.
  const aProduccionDeHoy = async (pedido, seleccion) => {
    try {
      const resultado = await api.post(`/produccion/jornada/${hoyLocal()}/etapas`, seleccion, pedidos.token)
      setDetalle(await api.get(`/pedidos/${pedido.id}`, pedidos.token))
      await pedidos.load()
      mostrar(`${resultado.agregadas === 1 ? 'Se agregó 1 etapa' : `Se agregaron ${resultado.agregadas} etapas`} a la producción de hoy.`)
    } catch (error) { mostrar(error.message, 'error') }
  }

  // Crea un producto nuevo sin salir del alta de pedido (ver "+ Crear
  // producto nuevo" en PedidoModal): misma lógica que PanelProductos.guardar,
  // reutilizada vía construirCuerpoProducto para no duplicarla.
  const crearProducto = async producto => {
    const cuerpo = construirCuerpoProducto(producto)
    const creado = await api.post('/productos', cuerpo, productos.token)
    await productos.load()
    return creado
  }

  const cambiarEstado = async (pedido, estado) => {
    try {
      const actualizado = await api.patch(`/pedidos/${pedido.id}`, { estado }, pedidos.token)
      setDetalle(actualizado)
      await pedidos.load()
      mostrar(`Pedido ${pedido.codigo} marcado como ${estado.toLowerCase().replace('_', ' ')}.`)
    } catch (error) { mostrar(error.message, 'error') }
  }

  const eliminar = async pedido => {
    if (!window.confirm(`¿Eliminar el pedido ${pedido.codigo}? Se borran también sus etapas (y se quitan de la producción diaria).`)) return
    try {
      await api.del(`/pedidos/${pedido.id}`, pedidos.token)
      setDetalle(null)
      await pedidos.load()
      mostrar('Pedido eliminado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const visibles = pedidos.data.filter(pedido =>
    filtro === 'TODOS' ? true : filtro === 'ACTIVOS' ? ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO'].includes(pedido.estado) : pedido.estado === filtro)

  const visiblesOrdenados = [...visibles].sort((a, b) => {
    const resultado = comparadoresOrden[ordenPor](a, b)
    return ordenDir === 'desc' ? -resultado : resultado
  })

  // Una fila por producto del pedido: cada producto tiene su propio avance
  // de etapas y su propio subtotal.
  const filas = visiblesOrdenados.flatMap(pedido => pedido.items.map(item => {
    const etapasItem = pedido.etapas
      .filter(etapa => String(etapa.pedido_item_id) === String(item.id))
      .sort((a, b) => a.orden - b.orden)
    const completadas = etapasItem.filter(etapa => etapa.estado === 'COMPLETADA').length
    return { clave: `${pedido.id}-${item.id}`, pedido, item, etapasItem, completadas }
  }))

  return (
    <>
      <Heading kicker="Trabajo comprometido" title="Pedidos" text="Cada pedido agrupa uno o más productos. Cada producto lleva sus horas-hombre estimadas, repartidas en etapas con su empleado; de acá el trabajo pasa a la Producción diaria.">
        <div className="actions">
          <select className="filter" value={filtro} onChange={event => setFiltro(event.target.value)}>
            <option value="ACTIVOS">Activos</option>
            <option value="TODOS">Todos</option>
            {estadosPedido.map(estado => <option key={estado} value={estado}>{estado.replace('_', ' ')}</option>)}
          </select>
          <select className="filter" value={ordenPor} onChange={event => setOrdenPor(event.target.value)} title="Ordenar por">
            {opcionesOrden.map(opcion => <option key={opcion.valor} value={opcion.valor}>Ordenar: {opcion.etiqueta}</option>)}
          </select>
          <button type="button" className="filter" onClick={() => setOrdenDir(ordenDir === 'desc' ? 'asc' : 'desc')} title="Cambiar dirección del orden">
            {ordenDir === 'desc' ? '↓ Descendente' : '↑ Ascendente'}
          </button>
          <button className="primary" onClick={() => setCreando(true)}>+ Nuevo pedido</button>
        </div>
      </Heading>

      {nodo}

      {pedidos.loading ? <p>Cargando pedidos...</p> : pedidos.error ? <p className="form-error">{pedidos.error}</p> : filas.length ? (
        <section className="orders-card">
          <div className="order-head pedidos-head">
            <span>Producto</span><span>Cantidad</span><span>Etapas</span><span>Prioridad</span><span>Entrega</span><span>Cumplimiento</span><span>Total</span>
          </div>

          {filas.map(fila => {
            // Avance en horas-hombre: lo que vale cada etapa en la producción diaria.
            const avanceItem = fila.item.horas_hombre > 0
              ? porcentaje(fila.item.horas_completadas, fila.item.horas_hombre)
              : porcentaje(fila.completadas, fila.etapasItem.length)
            return (
              <div className="order-row pedidos-row" key={fila.clave} onClick={() => setDetalle(fila.pedido)}>
                <div className="product">
                  <div className="product-thumb">▦</div>
                  <div>
                    <b>{fila.item.producto}</b>
                    <small>{fila.pedido.codigo}</small>
                  </div>
                </div>

                <div className="cantidad-cell"><b>{fila.item.cantidad}</b></div>

                <div className="etapas-cell">
                  <b>{fila.completadas}/{fila.etapasItem.length}</b>
                  <small className="muted"> · {horas(fila.item.horas_hombre)}</small>
                </div>

                <div className="prioridad-cell"><span className={`prioridad ${etiquetaPrioridad(fila.pedido.prioridad).toLowerCase()}`}>{etiquetaPrioridad(fila.pedido.prioridad)}</span></div>

                <div><em className="stage">{fecha(fila.pedido.fecha_entrega)}</em></div>

                <div className="progress-cell"><b>{avanceItem}%</b><Progress value={avanceItem} /></div>

                <div className="total-cell"><b>{dinero(fila.item.subtotal)}</b></div>
              </div>
            )
          })}
        </section>
      ) : (
        <Empty title="No hay pedidos en esta vista" text="Creá un pedido eligiendo productos del catálogo, sus horas-hombre y sus etapas." action={() => setCreando(true)} label="Crear pedido" />
      )}

      {creando && !productos.loading && (
        <PedidoModal
          productos={productos.data.filter(producto => producto.activo)}
          productosExistentes={productos.data}
          categorias={categorias.data}
          empleados={empleados.data}
          productoInicial={creando?.producto_id || ''}
          costoHora={Number(configuracion.data.costo_hora_mano_obra) || 0}
          token={productos.token}
          crearProducto={crearProducto}
          close={() => setCreando(false)}
          save={crear}
        />
      )}

      {detalle && (
        <DetallePedido
          pedido={detalle}
          empleados={empleados.data}
          close={() => setDetalle(null)}
          onEstado={cambiarEstado}
          onEliminar={eliminar}
          onTareas={editarTareas}
          onProduccion={aProduccionDeHoy}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------
// SELECTOR DE FECHA (Día → Mes → Año)
// Tres combos en ese orden en vez del selector nativo del navegador, que
// en la mayoría de los sistemas muestra mes/día/año. El valor que entra y
// sale sigue siendo un string ISO "AAAA-MM-DD" (lo que ya espera el
// backend), así que no cambia nada fuera de este componente.
// ---------------------------------------------------------------------
const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function SelectorFecha({ value, onChange }) {
  // Día, mes y año se guardan como estado propio (no derivado del string
  // ISO compuesto): mientras falta elegir alguno de los tres, la fecha
  // completa todavía no existe (onChange('') no le llega nada al padre),
  // pero el combo que sí se eligió tiene que seguir mostrando su valor en
  // vez de volver a "Día"/"Mes"/"Año" en cada render.
  const inicial = value ? value.split('-').map(Number) : [null, null, null]
  const [anio, setAnio] = useState(inicial[0])
  const [mes, setMes] = useState(inicial[1])
  const [dia, setDia] = useState(inicial[2])
  const anioActual = new Date().getFullYear()
  const anios = Array.from({ length: 8 }, (_, indice) => anioActual - 1 + indice)

  const actualizar = (campo, valor) => {
    const partes = { anio, mes, dia, [campo]: valor }
    if (campo === 'anio') setAnio(valor)
    else if (campo === 'mes') setMes(valor)
    else setDia(valor)
    onChange(partes.anio && partes.mes && partes.dia
      ? `${partes.anio}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`
      : '')
  }

  return (
    <div className="fecha-selector">
      <select value={dia || ''} onChange={event => actualizar('dia', Number(event.target.value) || null)}>
        <option value="">Día</option>
        {Array.from({ length: 31 }, (_, indice) => indice + 1).map(valor => <option key={valor} value={valor}>{valor}</option>)}
      </select>
      <select value={mes || ''} onChange={event => actualizar('mes', Number(event.target.value) || null)}>
        <option value="">Mes</option>
        {nombresMeses.map((nombre, indice) => <option key={nombre} value={indice + 1}>{nombre}</option>)}
      </select>
      <select value={anio || ''} onChange={event => actualizar('anio', Number(event.target.value) || null)}>
        <option value="">Año</option>
        {anios.map(valor => <option key={valor} value={valor}>{valor}</option>)}
      </select>
    </div>
  )
}

// Estado del reparto de las horas-hombre estimadas de un producto entre
// sus etapas (la misma regla que valida el backend: tienen que coincidir).
function estadoReparto(item) {
  const estimadas = Math.round((Number(item.horas_hombre) || 0) * 100) / 100
  const suma = sumarHoras(item.tareas.map(etapa => etapa.horas_hombre))
  const diferencia = Math.round((estimadas - suma) * 100) / 100
  return { estimadas, suma, diferencia, coincide: estimadas > 0 && Math.abs(diferencia) < 0.01 }
}

function RepartoHoras({ item, onUsarSuma }) {
  const { estimadas, suma, diferencia, coincide } = estadoReparto(item)
  const cantidad = Number(item.cantidad) || 1
  if (coincide) {
    return (
      <p className="stage-total positivo">
        ✓ Las etapas suman {horas(suma)}, igual que la estimación{cantidad > 1 ? ` · ${horas(suma * cantidad)} en total (${cantidad} unidades)` : ''}.
      </p>
    )
  }
  return (
    <p className="stage-total negativo">
      {estimadas > 0
        ? `Las etapas suman ${horas(suma)} de ${horas(estimadas)} estimadas: ${diferencia > 0 ? `faltan repartir ${horas(diferencia)}` : `se pasan ${horas(-diferencia)}`}.`
        : `Indicá las horas-hombre estimadas por unidad (las etapas suman ${horas(suma)}).`}
      {suma > 0 && <button type="button" className="add-stage reparto-usar" onClick={() => onUsarSuma(suma)}>Usar {horas(suma)} como estimación</button>}
    </p>
  )
}

// Grilla de etapas: nombre, horas por unidad, empleado y quitar.
function FilaEtapa({ numero, etapa, empleados, onCambiar, onQuitar }) {
  return (
    <div className="etapa-hh-grid-row">
      <small>{numero}</small>
      <input value={etapa.nombre} onChange={event => onCambiar('nombre', event.target.value)} placeholder="Ej. Corte, Soldadura, Pintura" maxLength={120} />
      <CampoNumero min="0" step="0.25" value={etapa.horas_hombre} onChange={valor => onCambiar('horas_hombre', valor)} placeholder="0" title="Horas-hombre por unidad" />
      <select value={etapa.responsable_id} onChange={event => onCambiar('responsable_id', event.target.value)} title="Empleado que hace la etapa">
        <option value="">Empleado…</option>
        {empleados.map(empleado => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
      </select>
      {onQuitar ? <button type="button" onClick={onQuitar} title="Quitar etapa">×</button> : <span />}
    </div>
  )
}

// ---------------------------------------------------------------------
// ALTA DE PEDIDO
// Por cada producto: cantidad, horas-hombre estimadas por unidad (se
// propone las del producto) y sus ETAPAS, cada una con sus horas y su
// empleado. Las etapas tienen que sumar la estimación. Ni precio ni
// presupuesto: el precio sale del producto (lo copia el backend) y el
// costo/ganancia se ven después en el detalle del pedido.
// ---------------------------------------------------------------------
function PedidoModal({ productos, productosExistentes, categorias, empleados, productoInicial, costoHora, token, crearProducto, close, save }) {
  const [items, setItems] = useState([itemVacio(productoInicial)])
  const [entrega, setEntrega] = useState('')
  const [prioridad, setPrioridad] = useState(0)
  const [notas, setNotas] = useState('')
  const [creandoProductoPara, setCreandoProductoPara] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Cualquier cambio borra el error anterior (se vuelve a validar al guardar).
  const cambiarItem = (indice, cambios) => {
    setError('')
    setItems(actuales => actuales.map((item, posicion) => (posicion === indice ? { ...item, ...cambios } : item)))
  }

  const cambiarEtapa = (indice, posicionEtapa, campo, valor) => {
    setError('')
    setItems(actuales => actuales.map((item, posicion) => (posicion === indice
      ? { ...item, tareas: item.tareas.map((etapa, cual) => (cual === posicionEtapa ? { ...etapa, [campo]: valor } : etapa)) }
      : item)))
  }

  const detalleProducto = id => productosExistentes.find(producto => String(producto.id) === String(id))

  // Al elegir un producto se proponen sus horas-hombre y las etapas del
  // último pedido de ese producto (con sus empleados), si hay. Nunca pisa
  // lo que el usuario ya cargó. Todo es editable y propio de este pedido.
  const elegirProducto = async (indice, productoId) => {
    const producto = detalleProducto(productoId)
    setItems(actuales => actuales.map((item, posicion) => (posicion === indice
      ? { ...item, producto_id: productoId, horas_hombre: item.horas_hombre === '' && Number(producto?.horas_hombre) > 0 ? producto.horas_hombre : item.horas_hombre }
      : item)))
    if (!productoId) return
    try {
      const sugeridas = await api.get(`/pedidos/tareas-sugeridas?producto_id=${productoId}`, token)
      if (!sugeridas.tareas.length) return
      setItems(actuales => actuales.map((item, posicion) => (posicion === indice && item.tareas.every(etapa => !etapa.nombre.trim())
        ? {
            ...item,
            tareas: sugeridas.tareas.map(etapa => ({ nombre: etapa.nombre, horas_hombre: etapa.horas_hombre || '', responsable_id: etapa.responsable_id ? String(etapa.responsable_id) : '' })),
            horas_hombre: item.horas_hombre === '' ? sumarHoras(sugeridas.tareas.map(etapa => etapa.horas_hombre)) || '' : item.horas_hombre
          }
        : item)))
    } catch { /* sin sugerencias: se cargan a mano */ }
  }

  // Desde Productos ("Crear pedido") el producto ya viene elegido.
  useEffect(() => { if (productoInicial) elegirProducto(0, productoInicial) }, [])

  const enviar = async event => {
    event.preventDefault()
    const validos = items.filter(item => item.producto_id)
    if (!validos.length) return setError('Elegí al menos un producto.')
    for (const item of validos) {
      const nombre = detalleProducto(item.producto_id)?.nombre || 'el producto'
      const etapas = item.tareas.filter(etapa => etapa.nombre.trim() || etapa.horas_hombre !== '' || etapa.responsable_id)
      if (!etapas.length) return setError(`Agregá al menos una etapa para "${nombre}".`)
      if (etapas.some(etapa => !etapa.nombre.trim())) return setError(`Cada etapa de "${nombre}" necesita un nombre.`)
      if (etapas.some(etapa => !(Number(etapa.horas_hombre) > 0))) return setError(`Cada etapa de "${nombre}" necesita sus horas-hombre.`)
      if (etapas.some(etapa => !etapa.responsable_id)) return setError(`Asigná un empleado a cada etapa de "${nombre}".`)
      const reparto = estadoReparto({ ...item, tareas: etapas })
      if (!(reparto.estimadas > 0)) return setError(`Indicá las horas-hombre estimadas para terminar "${nombre}".`)
      if (!reparto.coincide) return setError(`Las etapas de "${nombre}" suman ${horas(reparto.suma)} y las horas-hombre estimadas son ${horas(reparto.estimadas)}: tienen que coincidir.`)
    }
    setBusy(true); setError('')
    try {
      await save({
        fecha_entrega: entrega || null,
        prioridad: Number(prioridad) || 0,
        notas,
        items: validos.map(item => ({
          producto_id: item.producto_id,
          cantidad: Number(item.cantidad) || 1,
          horas_hombre: Number(item.horas_hombre),
          tareas: item.tareas
            .filter(etapa => etapa.nombre.trim())
            .map(etapa => ({ nombre: etapa.nombre.trim(), horas_hombre: Number(etapa.horas_hombre), responsable_id: etapa.responsable_id }))
        }))
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!productos.length) {
    return (
      <Modal title="Nuevo pedido" close={close}>
        <Empty title="Primero creá un producto" text="Los pedidos se arman con productos del catálogo; las etapas se definen en cada pedido." action={close} label="Entendido" />
      </Modal>
    )
  }

  return (
    <Modal title="Nuevo pedido" subtitle="Elegí los productos, estimá sus horas-hombre y repartilas en etapas, cada una con el empleado que la hace." close={close} ancho="760px">
      <form onSubmit={enviar}>
        <div className="form-grid">
          <label>Fecha de entrega
            <SelectorFecha value={entrega} onChange={setEntrega} />
          </label>

          <label>Prioridad
            <select value={prioridad} onChange={event => setPrioridad(event.target.value)}>
              <option value="0">Normal</option>
              <option value="1">Alta</option>
              <option value="2">Urgente</option>
            </select>
          </label>
        </div>

        {!empleados.length && <p className="notice">Todavía no hay empleados activos: cada etapa se asigna a un empleado. Crealos en Usuarios.</p>}

        <div className="stage-edit">
          <div>
            <b>Productos del pedido</b>
            <span>Elegí el producto y la cantidad; el precio se toma del producto. Si el producto todavía no existe, se puede crear sin salir de acá.</span>
          </div>

          {items.map((item, indice) => {
            const producto = detalleProducto(item.producto_id)
            return (
              <div className="item-bloque" key={indice}>
                <div className="item-linea">
                  <select required value={item.producto_id} onChange={event => elegirProducto(indice, event.target.value)}>
                    <option value="">Seleccionar producto</option>
                    {productos.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.nombre} — {precioVenta(opcion.precio_venta)}</option>)}
                  </select>
                  <input min="1" type="number" value={item.cantidad} onChange={event => cambiarItem(indice, { cantidad: event.target.value })} title="Cantidad" />
                  <button type="button" onClick={() => setItems(items.filter((_, posicion) => posicion !== indice))}>×</button>
                </div>

                <button type="button" className="add-stage nuevo-producto-inline" onClick={() => setCreandoProductoPara(indice)}>+ Crear producto nuevo</button>

                {producto && (
                  <div className="item-tareas">
                    <label className="item-horas">Horas-hombre estimadas para terminar una unidad
                      <CampoNumero min="0" step="0.25" value={item.horas_hombre} onChange={valor => cambiarItem(indice, { horas_hombre: valor })} placeholder="Ej. 4" />
                    </label>

                    <div>
                      <b>Etapas</b>
                      <span className="muted"> · repartí esas horas entre las etapas y asigná quién hace cada una.</span>
                    </div>

                    <div className="etapa-hh-grid-head">
                      <small>#</small><small>Etapa</small><small>Horas/u</small><small>Empleado</small><small />
                    </div>

                    {item.tareas.map((etapa, posicionEtapa) => (
                      <FilaEtapa
                        key={posicionEtapa}
                        numero={posicionEtapa + 1}
                        etapa={etapa}
                        empleados={empleados}
                        onCambiar={(campo, valor) => cambiarEtapa(indice, posicionEtapa, campo, valor)}
                        onQuitar={() => cambiarItem(indice, { tareas: item.tareas.filter((_, cual) => cual !== posicionEtapa) })}
                      />
                    ))}

                    <button type="button" className="add-stage" onClick={() => cambiarItem(indice, { tareas: [...item.tareas, etapaVacia()] })}>+ Agregar etapa</button>
                    <RepartoHoras item={item} onUsarSuma={suma => cambiarItem(indice, { horas_hombre: suma })} />
                  </div>
                )}
              </div>
            )
          })}

          <button type="button" className="add-stage" onClick={() => setItems([...items, itemVacio()])}>+ Agregar producto</button>
        </div>

        <label>Notas del pedido<textarea value={notas} onChange={event => setNotas(event.target.value)} placeholder="Detalles de fabricación, condiciones de pago, etc." /></label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Crear pedido" busy={busy} />
      </form>

      {/* Portal: ProductoModal trae su propio <form>, y anidarlo dentro del
          <form> de este modal sería HTML inválido (un <form> no puede
          contener otro). Se monta aparte, directo en <body>. */}
      {creandoProductoPara !== null && createPortal(
        <ProductoModal
          producto={{ chapita_id: sugerirIdPieza(productosExistentes) }}
          productosExistentes={productosExistentes}
          categorias={categorias}
          costoHora={costoHora}
          token={token}
          close={() => setCreandoProductoPara(null)}
          save={async nuevoProducto => {
            const creado = await crearProducto(nuevoProducto)
            setItems(actuales => actuales.map((item, posicion) => (posicion === creandoProductoPara
              ? { ...item, horas_hombre: Number(creado.horas_hombre) > 0 ? creado.horas_hombre : item.horas_hombre }
              : item)))
            elegirProducto(creandoProductoPara, String(creado.id))
            setCreandoProductoPara(null)
          }}
        />,
        document.body
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------
// DETALLE DEL PEDIDO
// Muestra el avance de las etapas de cada producto (con su empleado, sus
// horas-hombre y si están propuestas en la producción diaria), permite
// agregar o quitar etapas pendientes y proponer el pedido completo o un
// producto en la producción de hoy. Para reasignar una etapa se usa Tareas.
// ---------------------------------------------------------------------
function DetallePedido({ pedido, empleados, close, onEstado, onEliminar, onTareas, onProduccion }) {
  const ganancia = pedido.total - pedido.costo_estimado
  const hoy = hoyLocal()
  const [nuevas, setNuevas] = useState({})
  const nuevaDe = itemId => nuevas[itemId] || etapaVacia()
  const cambiarNueva = (itemId, campo, valor) => setNuevas({ ...nuevas, [itemId]: { ...nuevaDe(itemId), [campo]: valor } })
  const sinProponer = pendientesSinProponer(pedido.etapas)
  const admiteProduccion = enCurso(pedido)

  const agregar = async item => {
    const etapa = nuevaDe(item.id)
    if (!etapa.nombre.trim() || !(Number(etapa.horas_hombre) > 0) || !etapa.responsable_id) return
    // Las horas se cargan por unidad, igual que al crear el pedido.
    const ok = await onTareas('agregar', pedido, {
      itemId: item.id,
      tarea: { nombre: etapa.nombre.trim(), horas_hombre: Number(etapa.horas_hombre), responsable_id: etapa.responsable_id }
    })
    if (ok) setNuevas({ ...nuevas, [item.id]: etapaVacia() })
  }

  return (
    <Modal title={`Pedido ${pedido.codigo}`} subtitle={`${pedido.avance}% completado · ${pedido.etapas_completadas} de ${pedido.etapas_totales} etapas · ${horas(pedido.horas_hombre)}`} close={close} ancho="780px">
      <div className="detalle-pedido">
        <section className="detalle-bloque">
          <b>Estado y entrega</b>
          <label className="status-control">
            Estado del pedido
            <select value={pedido.estado} onChange={event => onEstado(pedido, event.target.value)}>
              {estadosPedido.map(estado => <option key={estado} value={estado}>{estado.replace('_', ' ')}</option>)}
            </select>
          </label>
          <small>Entrega: {fecha(pedido.fecha_entrega)}</small>
        </section>

        <section className="detalle-bloque">
          <b>Producción diaria</b>
          {admiteProduccion && sinProponer.length ? (
            <>
              <small>{sinProponer.length} etapas pendientes ({horas(sumarHoras(sinProponer.map(etapa => etapa.horas_hombre)))}) sin proponer.</small>
              <button type="button" className="secondary" onClick={() => onProduccion(pedido, { pedido_id: pedido.id })}>Pedido completo a la producción de hoy</button>
            </>
          ) : (
            <small>{admiteProduccion ? 'Todas las etapas pendientes ya están propuestas.' : 'El pedido no está en curso.'}</small>
          )}
        </section>
      </div>

      <Progress value={pedido.avance} />

      <p className="stage-total">
        Precio de venta {dinero(pedido.total)} ·{pedido.costo_materiales_total > 0 ? ` Materiales ${dinero(pedido.costo_materiales_total)} ·` : ''} Mano de obra {dinero(pedido.costo_mano_obra_total)} ·
        <b> Costo de producción {dinero(pedido.costo_estimado)}</b> ·
        <b className={ganancia >= 0 ? ' positivo' : ' negativo'}> Ganancia {dinero(ganancia)}</b>
      </p>

      {pedido.items.map(item => {
        const gananciaItem = item.subtotal - item.costo_produccion
        const etapasItem = pedido.etapas.filter(etapa => String(etapa.pedido_item_id) === String(item.id))
        const proponibles = pendientesSinProponer(etapasItem)
        return (
          <section className="detalle-item" key={item.id}>
            <div className="detalle-item-head">
              <b>{item.cantidad}× {item.producto} · {horas(item.horas_hombre)}{item.horas_completadas > 0 ? ` (${horas(item.horas_completadas)} hechas)` : ''}</b>
              <span>
                {admiteProduccion && proponibles.length > 0 && pedido.items.length > 1 && (
                  <button type="button" className="add-stage en-linea" onClick={() => onProduccion(pedido, { pedido_item_id: item.id })}>+ A la producción de hoy</button>
                )}
                {dinero(item.subtotal)}
              </span>
            </div>

            <p className="stage-total">
              {item.costo_materiales > 0 ? `Materiales ${dinero(item.costo_materiales)} · ` : ''}Mano de obra {dinero(item.costo_mano_obra)} ·
              <b> Costo producción {dinero(item.costo_produccion)}</b> ·
              <b className={gananciaItem >= 0 ? ' positivo' : ' negativo'}> Ganancia {dinero(gananciaItem)}</b>
            </p>

            <div className="etapas-tabla">
              {etapasItem.map(etapa => (
                <div className="etapa-fila etapa-fila-editable" key={etapa.id}>
                  <span className="etapa-nombre">{etapa.orden}. {etapa.nombre}</span>
                  <Badge estado={etapa.estado} />
                  <span className="etapa-tiempo">{horas(etapa.horas_hombre)}</span>
                  <span><EtiquetaJornada fecha={etapa.jornada} hoy={hoy} /></span>
                  <span className="etapa-responsable" title="Para reasignarla, usá la sección Tareas">{etapa.responsable || 'Sin asignar'}</span>
                  {etapa.estado !== 'COMPLETADA' && etapasItem.length > 1
                    ? <button type="button" title="Quitar esta etapa del pedido" onClick={() => window.confirm(`¿Quitar la etapa "${etapa.nombre}" de este pedido? Sus ${horas(etapa.horas_hombre)} se restan de la estimación del producto.`) && onTareas('quitar', pedido, { tareaId: etapa.id })}>×</button>
                    : <span />}
                </div>
              ))}
            </div>

            <FilaEtapa
              numero="+"
              etapa={nuevaDe(item.id)}
              empleados={empleados}
              onCambiar={(campo, valor) => cambiarNueva(item.id, campo, valor)}
            />
            <button type="button" className="add-stage" onClick={() => agregar(item)}>+ Agregar esta etapa (suma sus horas a la estimación)</button>
          </section>
        )
      })}

      {pedido.notas && <p className="form-note">Notas: {pedido.notas}</p>}

      <div className="form-actions">
        <button type="button" className="danger-link" onClick={() => onEliminar(pedido)}>Eliminar pedido</button>
        <button type="button" className="primary" onClick={close}>Cerrar</button>
      </div>
    </Modal>
  )
}
