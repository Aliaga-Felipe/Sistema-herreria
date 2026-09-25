import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, dinero, duracion, etiquetaPrioridad, fecha, porcentaje, precioVenta, useData } from './api.js'
import { Actions, Badge, Empty, Heading, Modal, Progress, Semaforo, useAviso } from './ui.jsx'
import { ProductoModal, construirCuerpoProducto, sugerirIdPieza } from './panel-productos.jsx'

const estadosPedido = ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO']
// Cada producto del pedido lleva su propia lista de tareas (ver
// "TAREAS DEL PEDIDO" en server/rutas/pedidos.js). El precio no se pide:
// el backend toma el precio de venta del producto.
const tareaVacia = () => ({ nombre: '', minutos_estimados: '' })
const itemVacio = () => ({ producto_id: '', cantidad: 1, tareas: [tareaVacia()] })

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
  const configuracion = useData('/configuracion/valores', {})
  const { mostrar, nodo } = useAviso()
  const [creando, setCreando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [filtro, setFiltro] = useState('ACTIVOS')
  const [ordenPor, setOrdenPor] = useState('prioridad')
  const [ordenDir, setOrdenDir] = useState('desc')

  useEffect(() => {
    if (intencion === 'nuevo') { setCreando(true); limpiarIntencion?.() }
  }, [intencion])

  const crear = async pedido => {
    await api.post('/pedidos', pedido, pedidos.token)
    setCreando(false)
    await pedidos.load()
    mostrar('Pedido creado con sus tareas de producción.')
  }

  // Edición de las tareas de un pedido ya creado (desde el detalle).
  const editarTareas = async (accion, pedido, datos) => {
    try {
      const ruta = accion === 'agregar'
        ? api.post(`/pedidos/${pedido.id}/items/${datos.itemId}/tareas`, datos.tarea, pedidos.token)
        : api.del(`/pedidos/${pedido.id}/tareas/${datos.tareaId}`, pedidos.token)
      const actualizado = await ruta
      setDetalle(actualizado)
      await pedidos.load()
      mostrar(accion === 'agregar' ? 'Tarea agregada al pedido.' : 'Tarea quitada del pedido.')
      return true
    } catch (error) { mostrar(error.message, 'error'); return false }
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
    if (!window.confirm(`¿Eliminar el pedido ${pedido.codigo}? Se borran también sus etapas.`)) return
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
  // de etapas y su propio subtotal. La sección es solo informativa: los
  // pedidos/productos no se asignan a empleados (las etapas se asignan
  // desde Tareas), por eso no hay columna de empleado.
  const filas = visiblesOrdenados.flatMap(pedido => pedido.items.map(item => {
    const etapasItem = pedido.etapas
      .filter(etapa => String(etapa.pedido_item_id) === String(item.id))
      .sort((a, b) => a.orden - b.orden)
    const actual = etapasItem.find(etapa => etapa.estado !== 'COMPLETADA') || null
    const completadas = etapasItem.filter(etapa => etapa.estado === 'COMPLETADA').length
    return { clave: `${pedido.id}-${item.id}`, pedido, item, etapasItem, actual, completadas }
  }))

  return (
    <>
      <Heading kicker="Trabajo comprometido" title="Pedidos" text="Cada pedido agrupa uno o más productos, cada uno con sus propias tareas de producción, y refleja su avance según esas tareas.">
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
            const avanceItem = porcentaje(fila.completadas, fila.etapasItem.length)
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
        <Empty title="No hay pedidos en esta vista" text="Creá un pedido eligiendo productos del catálogo y definiendo sus tareas." action={() => setCreando(true)} label="Crear pedido" />
      )}

      {creando && (
        <PedidoModal
          productos={productos.data.filter(producto => producto.activo)}
          productosExistentes={productos.data}
          categorias={categorias.data}
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
          close={() => setDetalle(null)}
          onEstado={cambiarEstado}
          onEliminar={eliminar}
          onTareas={editarTareas}
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

// ---------------------------------------------------------------------
// ALTA DE PEDIDO
// Por cada producto: cantidad y sus TAREAS de producción para este pedido.
// Ni precio ni presupuesto: el precio sale del producto (lo copia el
// backend) y el costo/ganancia se ven después en el detalle del pedido.
// ---------------------------------------------------------------------
function PedidoModal({ productos, productosExistentes, categorias, costoHora, token, crearProducto, close, save }) {
  const [items, setItems] = useState([itemVacio()])
  const [entrega, setEntrega] = useState('')
  const [prioridad, setPrioridad] = useState(0)
  const [notas, setNotas] = useState('')
  const [creandoProductoPara, setCreandoProductoPara] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarItem = (indice, cambios) =>
    setItems(actuales => actuales.map((item, posicion) => (posicion === indice ? { ...item, ...cambios } : item)))

  const cambiarTarea = (indice, posicionTarea, campo, valor) =>
    setItems(actuales => actuales.map((item, posicion) => (posicion === indice
      ? { ...item, tareas: item.tareas.map((tarea, cual) => (cual === posicionTarea ? { ...tarea, [campo]: valor } : tarea)) }
      : item)))

  const detalleProducto = id => productos.find(producto => String(producto.id) === String(id))

  // Al elegir un producto se proponen tareas (las del último pedido de ese
  // producto, si hay). Sólo si todavía no se escribió ninguna tarea: nunca
  // pisa lo que el usuario ya cargó. Son editables y propias de este pedido.
  const elegirProducto = async (indice, productoId) => {
    cambiarItem(indice, { producto_id: productoId })
    if (!productoId) return
    const vacias = items[indice]?.tareas.every(tarea => !tarea.nombre.trim())
    if (!vacias) return
    try {
      const sugeridas = await api.get(`/pedidos/tareas-sugeridas?producto_id=${productoId}`, token)
      if (sugeridas.tareas.length) {
        setItems(actuales => actuales.map((item, posicion) => (posicion === indice && item.tareas.every(tarea => !tarea.nombre.trim())
          ? { ...item, tareas: sugeridas.tareas.map(tarea => ({ nombre: tarea.nombre, minutos_estimados: tarea.minutos_estimados || '' })) }
          : item)))
      }
    } catch { /* sin sugerencias: se cargan a mano */ }
  }

  const enviar = async event => {
    event.preventDefault()
    const validos = items.filter(item => item.producto_id)
    if (!validos.length) return setError('Elegí al menos un producto.')
    for (const item of validos) {
      const nombre = detalleProducto(item.producto_id)?.nombre || 'el producto'
      const tareas = item.tareas.filter(tarea => tarea.nombre.trim() || tarea.minutos_estimados !== '')
      if (!tareas.length) return setError(`Agregá al menos una tarea para "${nombre}".`)
      if (tareas.some(tarea => !tarea.nombre.trim())) return setError(`Cada tarea de "${nombre}" necesita un nombre.`)
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
          tareas: item.tareas
            .filter(tarea => tarea.nombre.trim())
            .map(tarea => ({ nombre: tarea.nombre.trim(), minutos_estimados: Number(tarea.minutos_estimados) || 0 }))
        }))
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!productos.length) {
    return (
      <Modal title="Nuevo pedido" close={close}>
        <Empty title="Primero creá un producto" text="Los pedidos se arman con productos del catálogo; las tareas se definen en cada pedido." action={close} label="Entendido" />
      </Modal>
    )
  }

  return (
    <Modal title="Nuevo pedido" subtitle="Elegí los productos y definí las tareas de este pedido. Los empleados se asignan después, desde Tareas." close={close} ancho="720px">
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

        <div className="stage-edit">
          <div>
            <b>Productos del pedido</b>
            <span>Elegí el producto y la cantidad; el precio se toma del producto. Si el producto todavía no existe, se puede crear sin salir de acá.</span>
          </div>

          {items.map((item, indice) => {
            const producto = detalleProducto(item.producto_id)
            const cantidad = Number(item.cantidad) || 1
            const minutosTotal = item.tareas.reduce((total, tarea) => total + (Number(tarea.minutos_estimados) || 0), 0) * cantidad
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
                    <div>
                      <b>Tareas</b>
                      <span className="muted"> · propias de este pedido: se asignan en Tareas y miden el semáforo.</span>
                    </div>

                    <div className="etapa-grid-head">
                      <small>#</small><small>Tarea</small><small>Min. por unidad</small><small />
                    </div>

                    {item.tareas.map((tarea, posicionTarea) => (
                      <div className="etapa-grid-row" key={posicionTarea}>
                        <small>{posicionTarea + 1}</small>
                        <input value={tarea.nombre} onChange={event => cambiarTarea(indice, posicionTarea, 'nombre', event.target.value)} placeholder="Ej. Corte, Soldadura, Pintura" maxLength={120} />
                        <input min="0" type="number" value={tarea.minutos_estimados} onChange={event => cambiarTarea(indice, posicionTarea, 'minutos_estimados', event.target.value)} placeholder="0" />
                        <button type="button" onClick={() => cambiarItem(indice, { tareas: item.tareas.filter((_, cual) => cual !== posicionTarea) })}>×</button>
                      </div>
                    ))}

                    <button type="button" className="add-stage" onClick={() => cambiarItem(indice, { tareas: [...item.tareas, tareaVacia()] })}>+ Agregar tarea</button>
                    <p className="stage-total">{item.tareas.length} tareas · Tiempo estimado {duracion(minutosTotal)}{cantidad > 1 ? ` (${cantidad} unidades)` : ''}</p>
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
// Muestra el avance de las tareas de cada producto y permite agregar o
// quitar tareas pendientes de ESTE pedido. Acá no se asignan empleados:
// eso se hace únicamente desde la sección Tareas.
// ---------------------------------------------------------------------
function DetallePedido({ pedido, close, onEstado, onEliminar, onTareas }) {
  const ganancia = pedido.total - pedido.costo_estimado
  const [nuevas, setNuevas] = useState({})
  const nuevaDe = itemId => nuevas[itemId] || tareaVacia()
  const cambiarNueva = (itemId, campo, valor) => setNuevas({ ...nuevas, [itemId]: { ...nuevaDe(itemId), [campo]: valor } })

  const agregar = async item => {
    const tarea = nuevaDe(item.id)
    if (!tarea.nombre.trim()) return
    // El tiempo se carga por unidad, igual que al crear el pedido.
    const ok = await onTareas('agregar', pedido, {
      itemId: item.id,
      tarea: { nombre: tarea.nombre.trim(), minutos_estimados: (Number(tarea.minutos_estimados) || 0) * (Number(item.cantidad) || 1) }
    })
    if (ok) setNuevas({ ...nuevas, [item.id]: tareaVacia() })
  }

  return (
    <Modal title={`Pedido ${pedido.codigo}`} subtitle={`${pedido.avance}% completado · ${pedido.etapas_completadas} de ${pedido.etapas_totales} etapas`} close={close} ancho="760px">
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
      </div>

      <Progress value={pedido.avance} />

      <p className="stage-total">
        Precio de venta {dinero(pedido.total)} ·{pedido.costo_materiales_total > 0 ? ` Materiales ${dinero(pedido.costo_materiales_total)} ·` : ''} Mano de obra {dinero(pedido.costo_mano_obra_total)} ·
        <b> Costo de producción {dinero(pedido.costo_estimado)}</b> ·
        <b className={ganancia >= 0 ? ' positivo' : ' negativo'}> Ganancia {dinero(ganancia)}</b>
      </p>

      {pedido.items.map(item => {
        const gananciaItem = item.subtotal - item.costo_produccion
        return (
          <section className="detalle-item" key={item.id}>
            <div className="detalle-item-head">
              <b>{item.cantidad}× {item.producto}</b>
              <span>{dinero(item.subtotal)}</span>
            </div>

            <p className="stage-total">
              {item.costo_materiales > 0 ? `Materiales ${dinero(item.costo_materiales)} · ` : ''}Mano de obra {dinero(item.costo_mano_obra)} ·
              <b> Costo producción {dinero(item.costo_produccion)}</b> ·
              <b className={gananciaItem >= 0 ? ' positivo' : ' negativo'}> Ganancia {dinero(gananciaItem)}</b>
            </p>

            <div className="etapas-tabla">
              {pedido.etapas.filter(etapa => String(etapa.pedido_item_id) === String(item.id)).map((etapa, _, delItem) => (
                <div className="etapa-fila etapa-fila-editable" key={etapa.id}>
                  <span className="etapa-nombre">{etapa.orden}. {etapa.nombre}</span>
                  <Badge estado={etapa.estado} />
                  <span className="etapa-tiempo">
                    {duracion(etapa.minutos_estimados)}
                    {etapa.minutos_reales ? <b> → {duracion(etapa.minutos_reales)}</b> : null}
                  </span>
                  <Semaforo valor={etapa.semaforo} compacto />
                  <span className="etapa-responsable" title="La asignación se gestiona desde Tareas">{etapa.responsable || 'Sin asignar'}</span>
                  {etapa.estado !== 'COMPLETADA' && delItem.length > 1
                    ? <button type="button" title="Quitar esta tarea del pedido" onClick={() => window.confirm(`¿Quitar la tarea "${etapa.nombre}" de este pedido?`) && onTareas('quitar', pedido, { tareaId: etapa.id })}>×</button>
                    : <span />}
                </div>
              ))}
            </div>

            <div className="etapa-grid-row">
              <small>+</small>
              <input value={nuevaDe(item.id).nombre} onChange={event => cambiarNueva(item.id, 'nombre', event.target.value)} placeholder="Nueva tarea para este producto" maxLength={120} />
              <input min="0" type="number" value={nuevaDe(item.id).minutos_estimados} onChange={event => cambiarNueva(item.id, 'minutos_estimados', event.target.value)} placeholder="Min/u" title="Minutos por unidad" />
              <button type="button" title="Agregar tarea" onClick={() => agregar(item)}>✓</button>
            </div>
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
