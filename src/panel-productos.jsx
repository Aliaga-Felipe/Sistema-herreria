import React, { useEffect, useState } from 'react'
import { api, dinero, duracion, useData } from './api.js'
import { Actions, Empty, Heading, Modal, useAviso } from './ui.jsx'

const etapaVacia = () => ({ nombre: '', costo: 0, minutos_estimados: 60 })
const etapasSugeridas = [
  { nombre: 'Diseño y medidas', costo: 0, minutos_estimados: 30 },
  { nombre: 'Corte de material', costo: 0, minutos_estimados: 60 },
  { nombre: 'Soldadura', costo: 0, minutos_estimados: 120 },
  { nombre: 'Pintura y terminación', costo: 0, minutos_estimados: 45 }
]

export default function PanelProductos({ intencion, limpiarIntencion }) {
  const productos = useData('/productos')
  const { mostrar, nodo } = useAviso()
  const [editando, setEditando] = useState(null)

  // El panel principal puede abrir el formulario directamente.
  useEffect(() => {
    if (intencion === 'nuevo') { setEditando({}); limpiarIntencion?.() }
  }, [intencion])

  const guardar = async producto => {
    const cuerpo = {
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      precio_venta: Number(producto.precio_venta),
      etapas: producto.etapas.map(etapa => ({ ...etapa, costo: Number(etapa.costo), minutos_estimados: Number(etapa.minutos_estimados) }))
    }
    if (producto.id) await api.put(`/productos/${producto.id}`, cuerpo, productos.token)
    else await api.post('/productos', cuerpo, productos.token)
    setEditando(null)
    await productos.load()
    mostrar(producto.id ? 'Producto actualizado.' : 'Producto creado con sus etapas.')
  }

  const eliminar = async producto => {
    if (!window.confirm(`¿Eliminar "${producto.nombre}"? Si tiene pedidos asociados solo se desactivará.`)) return
    try {
      const respuesta = await api.del(`/productos/${producto.id}`, productos.token)
      await productos.load()
      mostrar(respuesta.mensaje)
    } catch (error) { mostrar(error.message, 'error') }
  }

  const alternarActivo = async producto => {
    try {
      await api.patch(`/productos/${producto.id}/activo`, { activo: !producto.activo }, productos.token)
      await productos.load()
      mostrar(producto.activo ? 'Producto desactivado.' : 'Producto reactivado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  return (
    <>
      <Heading kicker="Catálogo de fabricación" title="Productos" text="Cada producto define su precio de venta y las etapas que lo fabrican, con costo y duración estimada.">
        <button className="primary" onClick={() => setEditando({})}>+ Nuevo producto</button>
      </Heading>

      {nodo}

      {productos.loading ? <p>Cargando productos...</p> : productos.error ? <p className="form-error">{productos.error}</p> : productos.data.length ? (
        <section className="product-grid">
          {productos.data.map(producto => (
            <article className={`product-card ${producto.activo ? '' : 'inactivo'}`} key={producto.id}>
              <div className="product-symbol">▱</div>

              <div className="product-info">
                <h3>{producto.nombre}</h3>
                <p>{producto.descripcion || 'Sin descripción.'}</p>

                <div className="product-numbers">
                  <span><small>Precio</small><b>{dinero(producto.precio_venta)}</b></span>
                  <span><small>Costo etapas</small><b>{dinero(producto.costo_total)}</b></span>
                  <span className={producto.margen >= 0 ? 'positivo' : 'negativo'}><small>Margen</small><b>{dinero(producto.margen)}</b></span>
                  <span><small>Duración</small><b>{duracion(producto.minutos_totales)}</b></span>
                </div>

                <div className="tags">
                  {producto.etapas.map(etapa => (
                    <span key={etapa.id}>{etapa.orden}. {etapa.nombre} · {duracion(etapa.minutos_estimados)} · {dinero(etapa.costo)}</span>
                  ))}
                </div>
              </div>

              <div className="card-buttons">
                <button onClick={() => setEditando(producto)}>Editar</button>
                <button onClick={() => alternarActivo(producto)}>{producto.activo ? 'Desactivar' : 'Activar'}</button>
                <button className="danger-link" onClick={() => eliminar(producto)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay productos cargados" text="Creá el primer producto con sus etapas de fabricación." action={() => setEditando({})} label="Crear producto" />
      )}

      {editando && <ProductoModal producto={editando} close={() => setEditando(null)} save={guardar} />}
    </>
  )
}

function ProductoModal({ producto, close, save }) {
  const editar = Boolean(producto.id)
  const [nombre, setNombre] = useState(producto.nombre || '')
  const [descripcion, setDescripcion] = useState(producto.descripcion || '')
  const [precio, setPrecio] = useState(producto.precio_venta ?? '')
  const [etapas, setEtapas] = useState(producto.etapas?.length ? producto.etapas.map(({ nombre, costo, minutos_estimados }) => ({ nombre, costo, minutos_estimados })) : etapasSugeridas)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarEtapa = (indice, campo, valor) =>
    setEtapas(etapas.map((etapa, posicion) => (posicion === indice ? { ...etapa, [campo]: valor } : etapa)))

  const costoTotal = etapas.reduce((total, etapa) => total + (Number(etapa.costo) || 0), 0)
  const minutosTotal = etapas.reduce((total, etapa) => total + (Number(etapa.minutos_estimados) || 0), 0)
  const margen = (Number(precio) || 0) - costoTotal

  const enviar = async event => {
    event.preventDefault()
    if (!etapas.length) return setError('El producto necesita al menos una etapa.')
    if (etapas.some(etapa => !etapa.nombre.trim() || Number(etapa.minutos_estimados) <= 0)) return setError('Cada etapa necesita nombre y una duración mayor a cero.')
    setBusy(true); setError('')
    try { await save({ id: producto.id, nombre, descripcion, precio_venta: precio, etapas }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={editar ? 'Editar producto' : 'Nuevo producto'} subtitle="Definí el precio de venta y las etapas de fabricación con su costo y duración." close={close} ancho="640px">
      <form onSubmit={enviar}>
        <label>Nombre del producto
          <input required value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Portón de hierro forjado" />
        </label>

        <label>Descripción
          <textarea value={descripcion} onChange={event => setDescripcion(event.target.value)} placeholder="Medidas, materiales o notas de fabricación" />
        </label>

        <label>Precio de venta
          <input required min="1" step="0.01" type="number" value={precio} onChange={event => setPrecio(event.target.value)} placeholder="0" />
        </label>

        <div className="stage-edit">
          <div>
            <b>Etapas de fabricación</b>
            <span>Nombre, costo y duración estimada de cada etapa.</span>
          </div>

          <div className="stage-grid-head">
            <small>#</small><small>Etapa</small><small>Costo</small><small>Minutos</small><small />
          </div>

          {etapas.map((etapa, indice) => (
            <div className="stage-grid-row" key={indice}>
              <small>{indice + 1}</small>
              <input required value={etapa.nombre} onChange={event => cambiarEtapa(indice, 'nombre', event.target.value)} placeholder="Nombre de la etapa" />
              <input required min="0" step="0.01" type="number" value={etapa.costo} onChange={event => cambiarEtapa(indice, 'costo', event.target.value)} />
              <input required min="1" type="number" value={etapa.minutos_estimados} onChange={event => cambiarEtapa(indice, 'minutos_estimados', event.target.value)} />
              <button type="button" onClick={() => setEtapas(etapas.filter((_, posicion) => posicion !== indice))}>×</button>
            </div>
          ))}

          <button type="button" className="add-stage" onClick={() => setEtapas([...etapas, etapaVacia()])}>+ Agregar etapa</button>

          <p className="stage-total">
            Costo total {dinero(costoTotal)} · Duración {duracion(minutosTotal)} ·
            <b className={margen >= 0 ? ' positivo' : ' negativo'}> Margen {dinero(margen)}</b>
          </p>
        </div>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label={editar ? 'Guardar cambios' : 'Crear producto'} busy={busy} />
      </form>
    </Modal>
  )
}
