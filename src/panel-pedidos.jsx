import React, { useEffect, useState } from 'react'
import { api, dinero, duracion, fecha, useData } from './api.js'
import { Actions, Badge, Empty, Heading, Modal, Progress, Semaforo, useAviso } from './ui.jsx'

const estadosPedido = ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO']
const itemVacio = () => ({ producto_id: '', cantidad: 1, precio_unitario: '' })

export default function PanelPedidos({ intencion, limpiarIntencion }) {
  const pedidos = useData('/pedidos')
  const productos = useData('/productos')
  const clientes = useData('/clientes')
  const empleados = useData('/usuarios/empleados')
  const { mostrar, nodo } = useAviso()
  const [creando, setCreando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [filtro, setFiltro] = useState('ACTIVOS')

  useEffect(() => {
    if (intencion === 'nuevo') { setCreando(true); limpiarIntencion?.() }
  }, [intencion])

  const crear = async pedido => {
    await api.post('/pedidos', pedido, pedidos.token)
    setCreando(false)
    await Promise.all([pedidos.load(), clientes.load()])
    mostrar('Pedido creado y desplegado en etapas de producción.')
  }

  const cambiarEstado = async (pedido, estado) => {
    try {
      await api.patch(`/pedidos/${pedido.id}`, { estado }, pedidos.token)
      await pedidos.load()
      mostrar(`Pedido ${pedido.codigo} marcado como ${estado.toLowerCase().replace('_', ' ')}.`)
    } catch (error) { mostrar(error.message, 'error') }
  }

  const asignar = async (pedidoId, etapaId, responsable) => {
    try {
      await api.patch(`/pedidos/${pedidoId}/etapas/${etapaId}/asignar`, { responsable_id: responsable || null }, pedidos.token)
      const actualizado = await api.get(`/pedidos/${pedidoId}`, pedidos.token)
      setDetalle(actualizado)
      await pedidos.load()
      mostrar('Etapa asignada.')
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

  return (
    <>
      <Heading kicker="Trabajo comprometido" title="Pedidos" text="Cada pedido agrupa uno o más productos y refleja su avance según las etapas de fabricación.">
        <div className="actions">
          <select className="filter" value={filtro} onChange={event => setFiltro(event.target.value)}>
            <option value="ACTIVOS">Activos</option>
            <option value="TODOS">Todos</option>
            {estadosPedido.map(estado => <option key={estado} value={estado}>{estado.replace('_', ' ')}</option>)}
          </select>
          <button className="primary" onClick={() => setCreando(true)}>+ Nuevo pedido</button>
        </div>
      </Heading>

      {nodo}

      {pedidos.loading ? <p>Cargando pedidos...</p> : pedidos.error ? <p className="form-error">{pedidos.error}</p> : visibles.length ? (
        <section className="orders-card">
          <div className="order-head pedidos-head">
            <span>Pedido</span><span>Cliente</span><span>Productos</span><span>Avance</span><span>Entrega</span><span>Total</span><span>Acción</span>
          </div>

          {visibles.map(pedido => (
            <div className="order-row pedidos-row" key={pedido.id}>
              <div className="product">
                <div className="product-thumb">▦</div>
                <div>
                  <b>{pedido.codigo}</b>
                  <small><Badge estado={pedido.estado} /></small>
                </div>
              </div>

              <div className="client">
                <b>{pedido.cliente?.nombre || 'Sin cliente'}</b>
                <small>{pedido.cliente?.telefono || pedido.cliente?.email || '—'}</small>
              </div>

              <div className="client">
                <b>{pedido.items.map(item => `${item.cantidad}× ${item.producto}`).join(', ') || '—'}</b>
                <small>{pedido.etapas_completadas}/{pedido.etapas_totales} etapas</small>
              </div>

              <div className="progress-cell">
                <b>{pedido.avance}%</b>
                <Progress value={pedido.avance} />
              </div>

              <div><em className="stage">{fecha(pedido.fecha_entrega)}</em></div>

              <div className="money"><strong>{dinero(pedido.total)}</strong><small>costo {dinero(pedido.costo_estimado)}</small></div>

              <div><button className="row-action" onClick={() => setDetalle(pedido)}>Ver detalle</button></div>
            </div>
          ))}
        </section>
      ) : (
        <Empty title="No hay pedidos en esta vista" text="Creá un pedido eligiendo productos del catálogo y cargando los datos del cliente." action={() => setCreando(true)} label="Crear pedido" />
      )}

      {creando && (
        <PedidoModal
          productos={productos.data.filter(producto => producto.activo)}
          clientes={clientes.data}
          empleados={empleados.data}
          close={() => setCreando(false)}
          save={crear}
        />
      )}

      {detalle && (
        <DetallePedido
          pedido={detalle}
          empleados={empleados.data}
          close={() => setDetalle(null)}
          onAsignar={asignar}
          onEstado={cambiarEstado}
          onEliminar={eliminar}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------
// ALTA DE PEDIDO
// ---------------------------------------------------------------------
function PedidoModal({ productos, clientes, empleados, close, save }) {
  const [clienteId, setClienteId] = useState('')
  const [cliente, setCliente] = useState({ nombre: '', telefono: '', email: '', direccion: '', notas: '' })
  const [items, setItems] = useState([itemVacio()])
  const [entrega, setEntrega] = useState('')
  const [prioridad, setPrioridad] = useState(0)
  const [notas, setNotas] = useState('')
  const [asignaciones, setAsignaciones] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarItem = (indice, campo, valor) =>
    setItems(items.map((item, posicion) => (posicion === indice ? { ...item, [campo]: valor } : item)))

  const detalleProducto = id => productos.find(producto => String(producto.id) === String(id))

  const total = items.reduce((suma, item) => {
    const producto = detalleProducto(item.producto_id)
    const precio = item.precio_unitario === '' ? producto?.precio_venta || 0 : Number(item.precio_unitario)
    return suma + precio * (Number(item.cantidad) || 0)
  }, 0)

  const enviar = async event => {
    event.preventDefault()
    const validos = items.filter(item => item.producto_id)
    if (!validos.length) return setError('Elegí al menos un producto.')
    if (!clienteId && !cliente.nombre.trim()) return setError('Cargá los datos del cliente o elegí uno existente.')
    setBusy(true); setError('')
    try {
      await save({
        cliente_id: clienteId || null,
        cliente: clienteId ? null : cliente,
        fecha_entrega: entrega || null,
        prioridad: Number(prioridad) || 0,
        notas,
        items: validos.map((item, indice) => ({
          producto_id: item.producto_id,
          cantidad: Number(item.cantidad) || 1,
          precio_unitario: item.precio_unitario === '' ? undefined : Number(item.precio_unitario),
          asignaciones: asignaciones[indice] || {}
        }))
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!productos.length) {
    return (
      <Modal title="Nuevo pedido" close={close}>
        <Empty title="Primero creá un producto" text="Los pedidos se arman con productos del catálogo y sus etapas." action={close} label="Entendido" />
      </Modal>
    )
  }

  return (
    <Modal title="Nuevo pedido" subtitle="Elegí los productos, cargá al cliente y, si querés, asigná ya cada etapa." close={close} ancho="720px">
      <form onSubmit={enviar}>
        <div className="form-grid">
          <label>Cliente existente
            <select value={clienteId} onChange={event => setClienteId(event.target.value)}>
              <option value="">— Cargar cliente nuevo —</option>
              {clientes.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </label>

          <label>Fecha de entrega
            <input type="date" value={entrega} onChange={event => setEntrega(event.target.value)} />
          </label>
        </div>

        {!clienteId && (
          <div className="cliente-nuevo">
            <b>Datos del cliente</b>
            <div className="form-grid">
              <label>Nombre<input required value={cliente.nombre} onChange={event => setCliente({ ...cliente, nombre: event.target.value })} /></label>
              <label>Teléfono / contacto<input value={cliente.telefono} onChange={event => setCliente({ ...cliente, telefono: event.target.value })} placeholder="Ej. 11 5555-5555" /></label>
              <label>Correo<input type="email" value={cliente.email} onChange={event => setCliente({ ...cliente, email: event.target.value })} /></label>
              <label>Dirección<input value={cliente.direccion} onChange={event => setCliente({ ...cliente, direccion: event.target.value })} placeholder="Dirección de entrega o instalación" /></label>
            </div>
            <label>Notas del cliente<textarea value={cliente.notas} onChange={event => setCliente({ ...cliente, notas: event.target.value })} placeholder="Referencias, horarios de contacto, etc." /></label>
          </div>
        )}

        <div className="stage-edit">
          <div>
            <b>Productos del pedido</b>
            <span>Cada producto despliega sus etapas como tareas de producción.</span>
          </div>

          {items.map((item, indice) => {
            const producto = detalleProducto(item.producto_id)
            return (
              <div className="item-bloque" key={indice}>
                <div className="item-linea">
                  <select required value={item.producto_id} onChange={event => cambiarItem(indice, 'producto_id', event.target.value)}>
                    <option value="">Seleccionar producto</option>
                    {productos.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.nombre} — {dinero(opcion.precio_venta)}</option>)}
                  </select>
                  <input min="1" type="number" value={item.cantidad} onChange={event => cambiarItem(indice, 'cantidad', event.target.value)} title="Cantidad" />
                  <input min="0" step="0.01" type="number" value={item.precio_unitario} onChange={event => cambiarItem(indice, 'precio_unitario', event.target.value)} placeholder={producto ? String(producto.precio_venta) : 'Precio'} title="Precio unitario" />
                  <button type="button" onClick={() => setItems(items.filter((_, posicion) => posicion !== indice))}>×</button>
                </div>

                {producto && (
                  <div className="item-etapas">
                    {producto.etapas.map(etapa => (
                      <label key={etapa.id}>
                        <span>{etapa.orden}. {etapa.nombre} <small>{duracion(etapa.minutos_estimados * (Number(item.cantidad) || 1))}</small></span>
                        <select
                          value={asignaciones[indice]?.[etapa.id] || ''}
                          onChange={event => setAsignaciones({ ...asignaciones, [indice]: { ...asignaciones[indice], [etapa.id]: event.target.value } })}
                        >
                          <option value="">Sin asignar</option>
                          {empleados.map(empleado => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <button type="button" className="add-stage" onClick={() => setItems([...items, itemVacio()])}>+ Agregar producto</button>
          <p className="stage-total">Total del pedido <b>{dinero(total)}</b></p>
        </div>

        <div className="form-grid">
          <label>Prioridad
            <select value={prioridad} onChange={event => setPrioridad(event.target.value)}>
              <option value="0">Normal</option>
              <option value="1">Alta</option>
              <option value="2">Urgente</option>
            </select>
          </label>
        </div>

        <label>Notas del pedido<textarea value={notas} onChange={event => setNotas(event.target.value)} placeholder="Detalles de fabricación, condiciones de pago, etc." /></label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Crear pedido" busy={busy} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// DETALLE Y ASIGNACIÓN DE ETAPAS
// ---------------------------------------------------------------------
function DetallePedido({ pedido, empleados, close, onAsignar, onEstado, onEliminar }) {
  return (
    <Modal title={`Pedido ${pedido.codigo}`} subtitle={`${pedido.avance}% completado · ${pedido.etapas_completadas} de ${pedido.etapas_totales} etapas`} close={close} ancho="760px">
      <div className="detalle-pedido">
        <section className="detalle-bloque">
          <b>Cliente</b>
          <p>{pedido.cliente?.nombre || 'Sin cliente'}</p>
          <small>{[pedido.cliente?.telefono, pedido.cliente?.email, pedido.cliente?.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small>
          {pedido.cliente?.notas && <small>Notas: {pedido.cliente.notas}</small>}
        </section>

        <section className="detalle-bloque">
          <b>Estado y entrega</b>
          <label className="status-control">
            Estado del pedido
            <select value={pedido.estado} onChange={event => onEstado(pedido, event.target.value)}>
              {estadosPedido.map(estado => <option key={estado} value={estado}>{estado.replace('_', ' ')}</option>)}
            </select>
          </label>
          <small>Entrega: {fecha(pedido.fecha_entrega)}</small>
          <small>Total {dinero(pedido.total)} · Costo estimado {dinero(pedido.costo_estimado)} · Margen {dinero(pedido.total - pedido.costo_estimado)}</small>
        </section>
      </div>

      <Progress value={pedido.avance} />

      {pedido.items.map(item => (
        <section className="detalle-item" key={item.id}>
          <div className="detalle-item-head">
            <b>{item.cantidad}× {item.producto}</b>
            <span>{dinero(item.subtotal)}</span>
          </div>

          <div className="etapas-tabla">
            {pedido.etapas.filter(etapa => String(etapa.pedido_item_id) === String(item.id)).map(etapa => (
              <div className="etapa-fila" key={etapa.id}>
                <span className="etapa-nombre">{etapa.orden}. {etapa.nombre}</span>
                <Badge estado={etapa.estado} />
                <span className="etapa-tiempo">
                  {duracion(etapa.minutos_estimados)}
                  {etapa.minutos_reales ? <b> → {duracion(etapa.minutos_reales)}</b> : null}
                </span>
                <Semaforo valor={etapa.semaforo} compacto />
                <select
                  value={etapa.responsable_id || ''}
                  disabled={etapa.estado === 'COMPLETADA'}
                  onChange={event => onAsignar(pedido.id, etapa.id, event.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {empleados.map(empleado => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      ))}

      {pedido.notas && <p className="form-note">Notas: {pedido.notas}</p>}

      <div className="form-actions">
        <button type="button" className="danger-link" onClick={() => onEliminar(pedido)}>Eliminar pedido</button>
        <button type="button" className="primary" onClick={close}>Cerrar</button>
      </div>
    </Modal>
  )
}
