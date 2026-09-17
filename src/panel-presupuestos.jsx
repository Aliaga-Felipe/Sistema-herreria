import React, { useMemo, useState } from 'react'
import { api, dinero, fecha, useData } from './api.js'
import { Actions, Empty, Heading, Modal, Stat, useAviso } from './ui.jsx'

const itemVacio = () => ({ producto_id: '', descripcion: '', cantidad: 1, precio_unitario: '' })

export default function PanelPresupuestos() {
  const [filtros, setFiltros] = useState({ cliente: '', desde: '', hasta: '' })
  const consulta = useMemo(() => {
    const parametros = new URLSearchParams()
    if (filtros.cliente) parametros.set('cliente', filtros.cliente)
    if (filtros.desde) parametros.set('desde', filtros.desde)
    if (filtros.hasta) parametros.set('hasta', filtros.hasta)
    const texto = parametros.toString()
    return `/presupuestos${texto ? `?${texto}` : ''}`
  }, [filtros.cliente, filtros.desde, filtros.hasta])

  const presupuestos = useData(consulta)
  const clientes = useData('/clientes')
  const productos = useData('/productos?activos=true')
  const { mostrar, nodo } = useAviso()
  const [creando, setCreando] = useState(false)
  const [detalle, setDetalle] = useState(null)

  const crear = async presupuesto => {
    await api.post('/presupuestos', presupuesto, presupuestos.token)
    setCreando(false)
    await presupuestos.load()
    mostrar('Presupuesto creado.')
  }

  const eliminar = async presupuesto => {
    if (!window.confirm('¿Eliminar este presupuesto?')) return
    try {
      await api.del(`/presupuestos/${presupuesto.id}`, presupuestos.token)
      setDetalle(null)
      await presupuestos.load()
      mostrar('Presupuesto eliminado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const totalGeneral = presupuestos.data.reduce((suma, item) => suma + item.monto_total, 0)
  const senaGeneral = presupuestos.data.reduce((suma, item) => suma + item.sena_monto, 0)
  const restanteGeneral = presupuestos.data.reduce((suma, item) => suma + item.restante, 0)

  return (
    <>
      <Heading kicker="Cotizaciones" title="Presupuestos" text="Presupuestos ya generados, con la seña abonada y el saldo pendiente de cada uno.">
        <button className="primary" onClick={() => setCreando(true)}>+ Nuevo presupuesto</button>
      </Heading>

      {nodo}

      <section className="stats-grid dashboard-stats">
        <Stat label="Presupuestos" value={presupuestos.data.length} />
        <Stat label="Cobro total" value={dinero(totalGeneral)} />
        <Stat label="Señas cobradas" value={dinero(senaGeneral)} />
        <Stat label="Restante por cobrar" value={dinero(restanteGeneral)} tone={restanteGeneral ? 'danger' : ''} />
      </section>

      <section className="section-heading">
        <div><h2>Filtrar</h2><p>Por cliente o por rango de fechas.</p></div>
        <div className="actions">
          <input className="filter" style={{ width: 160 }} value={filtros.cliente} onChange={event => setFiltros({ ...filtros, cliente: event.target.value })} placeholder="Buscar cliente..." />
          <label className="rango">Desde<input type="date" value={filtros.desde} onChange={event => setFiltros({ ...filtros, desde: event.target.value })} /></label>
          <label className="rango">Hasta<input type="date" value={filtros.hasta} onChange={event => setFiltros({ ...filtros, hasta: event.target.value })} /></label>
          {(filtros.cliente || filtros.desde || filtros.hasta) && <button className="filter" onClick={() => setFiltros({ cliente: '', desde: '', hasta: '' })}>Limpiar</button>}
        </div>
      </section>

      {presupuestos.loading ? <p>Cargando presupuestos...</p> : presupuestos.error ? <p className="form-error">{presupuestos.error}</p> : presupuestos.data.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head productos-head">
            <span>Fecha</span><span>Cliente</span><span>Cobro total</span><span>Seña</span><span>Restante</span>
          </div>
          {presupuestos.data.map(presupuesto => (
            <div className="ranking-fila productos-fila" key={presupuesto.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(presupuesto)}>
              <span>{fecha(presupuesto.fecha)}</span>
              <b>{presupuesto.cliente || 'Sin cliente'}</b>
              <span>{dinero(presupuesto.monto_total)}</span>
              <span>{dinero(presupuesto.sena_monto)}</span>
              <b className={presupuesto.restante > 0 ? 'negativo' : 'positivo'}>{dinero(presupuesto.restante)}</b>
            </div>
          ))}
        </section>
      ) : (
        <Empty title="No hay presupuestos en esta vista" text="Creá el primer presupuesto para un cliente." action={() => setCreando(true)} label="Crear presupuesto" />
      )}

      {creando && (
        <PresupuestoModal
          clientes={clientes.data}
          productos={productos.data}
          close={() => setCreando(false)}
          save={crear}
        />
      )}

      {detalle && <DetallePresupuesto presupuesto={detalle} close={() => setDetalle(null)} onEliminar={eliminar} />}
    </>
  )
}

// ---------------------------------------------------------------------
// ALTA DE PRESUPUESTO
// ---------------------------------------------------------------------
function PresupuestoModal({ clientes, productos, close, save }) {
  const [clienteId, setClienteId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [fechaPresupuesto, setFechaPresupuesto] = useState(() => new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState([itemVacio()])
  const [sena, setSena] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarItem = (indice, campo, valor) =>
    setItems(items.map((item, posicion) => {
      if (posicion !== indice) return item
      if (campo === 'producto_id' && valor) {
        const producto = productos.find(opcion => String(opcion.id) === String(valor))
        return { ...item, producto_id: valor, descripcion: producto?.nombre || item.descripcion, precio_unitario: item.precio_unitario === '' ? producto?.precio_venta ?? '' : item.precio_unitario }
      }
      return { ...item, [campo]: valor }
    }))

  const total = items.reduce((suma, item) => suma + (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0), 0)

  const enviar = async event => {
    event.preventDefault()
    const validos = items.filter(item => item.descripcion.trim())
    if (!validos.length) return setError('Cargá al menos un ítem con descripción.')
    if (!clienteId && !clienteNombre.trim()) return setError('Elegí un cliente existente o escribí su nombre.')
    if (Number(sena) > total) return setError('La seña no puede ser mayor al cobro total.')
    setBusy(true); setError('')
    try {
      await save({
        cliente_id: clienteId || null,
        cliente_nombre: clienteId ? '' : clienteNombre.trim(),
        fecha: fechaPresupuesto,
        sena_monto: Number(sena) || 0,
        notas,
        items: validos.map(item => ({ producto_id: item.producto_id || null, descripcion: item.descripcion, cantidad: Number(item.cantidad) || 1, precio_unitario: Number(item.precio_unitario) || 0 }))
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Nuevo presupuesto" subtitle="Cargá el cliente, los ítems cotizados y la seña, si ya se abonó." close={close} ancho="720px">
      <form onSubmit={enviar}>
        <div className="form-grid">
          <label>Cliente existente
            <select value={clienteId} onChange={event => setClienteId(event.target.value)}>
              <option value="">— Escribir nombre —</option>
              {clientes.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </label>

          <label>Fecha
            <input type="date" value={fechaPresupuesto} onChange={event => setFechaPresupuesto(event.target.value)} />
          </label>
        </div>

        {!clienteId && (
          <label>Nombre del cliente
            <input value={clienteNombre} onChange={event => setClienteNombre(event.target.value)} placeholder="Ej. Juan Pérez" />
          </label>
        )}

        <div className="stage-edit">
          <div>
            <b>Ítems del presupuesto</b>
            <span>Elegí un producto del catálogo o escribí una descripción libre.</span>
          </div>

          {items.map((item, indice) => (
            <div className="item-linea item-linea-presupuesto" key={indice}>
              <select value={item.producto_id} onChange={event => cambiarItem(indice, 'producto_id', event.target.value)}>
                <option value="">Ítem libre</option>
                {productos.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>)}
              </select>
              <input required value={item.descripcion} onChange={event => cambiarItem(indice, 'descripcion', event.target.value)} placeholder="Descripción" />
              <input min="1" type="number" value={item.cantidad} onChange={event => cambiarItem(indice, 'cantidad', event.target.value)} title="Cantidad" />
              <input min="0" step="0.01" type="number" value={item.precio_unitario} onChange={event => cambiarItem(indice, 'precio_unitario', event.target.value)} placeholder="Precio" title="Precio unitario" />
              <button type="button" onClick={() => setItems(items.filter((_, posicion) => posicion !== indice))}>×</button>
            </div>
          ))}

          <button type="button" className="add-stage" onClick={() => setItems([...items, itemVacio()])}>+ Agregar ítem</button>
          <p className="stage-total">Cobro total <b>{dinero(total)}</b></p>
        </div>

        <div className="form-grid config-grid">
          <label>Seña abonada
            <input min="0" step="0.01" type="number" value={sena} onChange={event => setSena(event.target.value)} placeholder="0" />
          </label>
          <label>Restante
            <input disabled value={dinero(Math.max(0, total - (Number(sena) || 0)))} />
          </label>
        </div>

        <label>Notas<textarea value={notas} onChange={event => setNotas(event.target.value)} placeholder="Condiciones, forma de pago, etc." /></label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Crear presupuesto" busy={busy} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// DETALLE DEL PRESUPUESTO
// ---------------------------------------------------------------------
function DetallePresupuesto({ presupuesto, close, onEliminar }) {
  return (
    <Modal title={`Presupuesto · ${presupuesto.cliente || 'Sin cliente'}`} subtitle={fecha(presupuesto.fecha)} close={close} ancho="640px">
      <div className="detalle-pedido">
        <section className="detalle-bloque">
          <b>Cobro</b>
          <p>Total {dinero(presupuesto.monto_total)}</p>
          <small>Seña {dinero(presupuesto.sena_monto)} · Restante {dinero(presupuesto.restante)}</small>
        </section>
      </div>

      <section className="detalle-item">
        <div className="detalle-item-head"><b>Ítems</b></div>
        <div className="etapas-tabla">
          {presupuesto.items.map(item => (
            <div className="etapa-fila etapa-fila-presupuesto" key={item.id}>
              <span className="etapa-nombre">{item.cantidad}× {item.descripcion}</span>
              <span>{dinero(item.precio_unitario)}</span>
              <b>{dinero(item.subtotal)}</b>
            </div>
          ))}
        </div>
      </section>

      {presupuesto.notas && <p className="form-note">Notas: {presupuesto.notas}</p>}

      <div className="form-actions">
        <button type="button" className="danger-link" onClick={() => onEliminar(presupuesto)}>Eliminar presupuesto</button>
        <button type="button" className="primary" onClick={close}>Cerrar</button>
      </div>
    </Modal>
  )
}
