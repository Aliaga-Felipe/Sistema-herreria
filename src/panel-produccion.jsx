import React, { useEffect, useMemo, useState } from 'react'
import { api, dinero, fecha, useData } from './api.js'
import { Actions, Empty, Heading, Modal, Stat, useAviso } from './ui.jsx'

const hoy = () => new Date().toISOString().slice(0, 10)

export default function PanelProduccion() {
  const objetivos = useData('/produccion/objetivos')
  const productos = useData('/productos?activos=true')
  const { mostrar, nodo } = useAviso()
  const [editando, setEditando] = useState(null)

  const [rango, setRango] = useState({ desde: '', hasta: '' })
  const consultaRegistros = useMemo(() => {
    const parametros = new URLSearchParams()
    if (rango.desde) parametros.set('desde', rango.desde)
    if (rango.hasta) parametros.set('hasta', rango.hasta)
    const texto = parametros.toString()
    return `/produccion/registros${texto ? `?${texto}` : ''}`
  }, [rango.desde, rango.hasta])
  const registros = useData(consultaRegistros)

  const recargar = () => Promise.all([objetivos.load(), registros.load()])

  const guardarObjetivo = async objetivo => {
    await api.put(`/produccion/objetivos/${objetivo.producto_id}`, objetivo, objetivos.token)
    setEditando(null)
    await objetivos.load()
    mostrar('Objetivo diario guardado.')
  }

  const eliminarObjetivo = async objetivo => {
    if (!window.confirm(`¿Quitar el objetivo diario de "${objetivo.producto}"?`)) return
    try {
      await api.del(`/produccion/objetivos/${objetivo.producto_id}`, objetivos.token)
      await objetivos.load()
      mostrar('Objetivo eliminado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const registrarProduccion = async registro => {
    try {
      const resultado = await api.post('/produccion/registros', registro, registros.token)
      await recargar()
      mostrar(resultado.cumplido ? `¡Objetivo cumplido! Se desbloquea la recompensa de ${resultado.producto}.` : `Producción registrada. No llegó al objetivo de ${resultado.producto}.`, resultado.cumplido ? 'ok' : 'error')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const productosConObjetivo = new Set(objetivos.data.map(objetivo => String(objetivo.producto_id)))
  const productosSinObjetivo = productos.data.filter(producto => !productosConObjetivo.has(String(producto.id)))

  const cumplidos = registros.data.filter(registro => registro.cumplido).length

  return (
    <>
      <Heading kicker="Producción diaria" title="Objetivos y recompensas" text="Definí cuánto tiene que producirse por día de cada producto. Si se cumple o se supera, se desbloquea la recompensa asociada.">
        <button className="primary" onClick={() => setEditando({})}>+ Nuevo objetivo</button>
      </Heading>

      {nodo}

      <section className="stats-grid dashboard-stats">
        <Stat label="Productos con objetivo" value={objetivos.data.length} hint={`${objetivos.data.filter(o => o.activo).length} activos`} />
        <Stat label="Días registrados" value={registros.data.length} />
        <Stat label="Días con objetivo cumplido" value={cumplidos} tone={cumplidos ? '' : 'danger'} />
      </section>

      <section className="section-heading">
        <div><h2>Objetivos por producto</h2><p>Cantidad diaria esperada y la recompensa que se otorga al cumplirla.</p></div>
      </section>

      {objetivos.loading ? <p>Cargando objetivos...</p> : objetivos.data.length ? (
        <section className="product-grid">
          {objetivos.data.map(objetivo => (
            <article className={`product-card ${objetivo.activo ? '' : 'inactivo'}`} key={objetivo.id}>
              <div className="product-symbol">◈</div>
              <div className="product-info">
                <h3>{objetivo.producto}</h3>
                <p>Objetivo: {objetivo.cantidad_objetivo} por día</p>
                <p>
                  {objetivo.tipo_recompensa === 'monto'
                    ? `Recompensa: ${dinero(objetivo.valor_recompensa)}`
                    : `Recompensa: ${objetivo.descripcion_recompensa || 'Sin descripción'}`}
                </p>
              </div>
              <div className="card-buttons">
                <button onClick={() => setEditando(objetivo)}>Editar</button>
                <button className="danger-link" onClick={() => eliminarObjetivo(objetivo)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay objetivos cargados" text="Definí cuántas unidades de un producto se esperan por día." action={() => setEditando({})} label="Crear objetivo" />
      )}

      <section className="section-heading">
        <div><h2>Registrar producción de hoy</h2><p>Cargá lo producido por cada producto con objetivo activo.</p></div>
      </section>

      {objetivos.data.filter(objetivo => objetivo.activo).length ? (
        <RegistroDiario objetivos={objetivos.data.filter(objetivo => objetivo.activo)} save={registrarProduccion} />
      ) : (
        <p className="notice">Cargá al menos un objetivo activo para poder registrar producción.</p>
      )}

      <section className="section-heading">
        <div><h2>Historial de cumplimiento</h2><p>Qué días se cumplió el objetivo y cuáles no.</p></div>
        <div className="actions">
          <label className="rango">Desde<input type="date" value={rango.desde} onChange={event => setRango({ ...rango, desde: event.target.value })} /></label>
          <label className="rango">Hasta<input type="date" value={rango.hasta} onChange={event => setRango({ ...rango, hasta: event.target.value })} /></label>
          {(rango.desde || rango.hasta) && <button className="filter" onClick={() => setRango({ desde: '', hasta: '' })}>Limpiar</button>}
        </div>
      </section>

      {registros.loading ? <p>Cargando historial...</p> : registros.data.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head produccion-head">
            <span>Fecha</span><span>Producto</span><span>Producido</span><span>Objetivo</span><span>Resultado</span>
          </div>
          {registros.data.map(registro => (
            <div className="ranking-fila produccion-fila" key={registro.id}>
              <span>{fecha(registro.fecha)}</span>
              <b>{registro.producto}</b>
              <span>{registro.cantidad_producida}</span>
              <span>{registro.objetivo_cantidad}</span>
              <span className={registro.cumplido ? 'positivo' : 'negativo'}>{registro.cumplido ? '✅ Cumplido' : '❌ No cumplido'}</span>
            </div>
          ))}
        </section>
      ) : (
        <Empty title="Todavía no hay producción registrada" text="Registrá la producción del día para empezar a ver el historial." />
      )}

      {editando && <ObjetivoModal objetivo={editando} productos={editando.id ? productos.data : productosSinObjetivo} close={() => setEditando(null)} save={guardarObjetivo} />}
    </>
  )
}

// ---------------------------------------------------------------------
// FORMULARIO DE OBJETIVO (alta o edición, uno por producto)
// ---------------------------------------------------------------------
function ObjetivoModal({ objetivo, productos, close, save }) {
  const editar = Boolean(objetivo.id)
  const [productoId, setProductoId] = useState(objetivo.producto_id || '')
  const [cantidad, setCantidad] = useState(objetivo.cantidad_objetivo ?? '')
  const [tipoRecompensa, setTipoRecompensa] = useState(objetivo.tipo_recompensa || 'monto')
  const [valorRecompensa, setValorRecompensa] = useState(objetivo.valor_recompensa ?? '')
  const [descripcionRecompensa, setDescripcionRecompensa] = useState(objetivo.descripcion_recompensa || '')
  const [activo, setActivo] = useState(objetivo.activo ?? true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    if (!productoId) return setError('Elegí un producto.')
    setBusy(true); setError('')
    try {
      await save({
        producto_id: productoId,
        cantidad_objetivo: Number(cantidad),
        tipo_recompensa: tipoRecompensa,
        valor_recompensa: tipoRecompensa === 'monto' ? Number(valorRecompensa) || 0 : 0,
        descripcion_recompensa: descripcionRecompensa,
        activo
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!editar && !productos.length) {
    return (
      <Modal title="Nuevo objetivo" close={close}>
        <Empty title="Todos los productos activos ya tienen un objetivo" text="Editá un objetivo existente o creá un producto nuevo." action={close} label="Entendido" />
      </Modal>
    )
  }

  return (
    <Modal title={editar ? 'Editar objetivo' : 'Nuevo objetivo diario'} subtitle="Cantidad esperada por día y la recompensa que se otorga al cumplirla." close={close}>
      <form onSubmit={enviar}>
        <label>Producto
          <select required disabled={editar} value={productoId} onChange={event => setProductoId(event.target.value)}>
            <option value="">Seleccionar producto</option>
            {productos.map(producto => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
          </select>
        </label>

        <label>Cantidad objetivo por día
          <input required min="1" type="number" value={cantidad} onChange={event => setCantidad(event.target.value)} placeholder="Ej. 2" />
        </label>

        <div className="form-grid config-grid">
          <label>Tipo de recompensa
            <select value={tipoRecompensa} onChange={event => setTipoRecompensa(event.target.value)}>
              <option value="monto">Monto fijo</option>
              <option value="libre">Otra (día libre, premio, etc.)</option>
            </select>
          </label>

          {tipoRecompensa === 'monto' && (
            <label>Monto de la recompensa
              <input min="0" step="0.01" type="number" value={valorRecompensa} onChange={event => setValorRecompensa(event.target.value)} placeholder="0" />
            </label>
          )}
        </div>

        <label>Descripción de la recompensa {tipoRecompensa === 'libre' ? '' : '(opcional)'}
          <textarea required={tipoRecompensa === 'libre'} value={descripcionRecompensa} onChange={event => setDescripcionRecompensa(event.target.value)} placeholder="Ej. Media jornada libre, entrada al cine, etc." />
        </label>

        <label className="config-check">
          <input type="checkbox" checked={activo} onChange={event => setActivo(event.target.checked)} />
          Objetivo activo (se puede registrar producción contra él)
        </label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label={editar ? 'Guardar cambios' : 'Crear objetivo'} busy={busy} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// REGISTRO DE PRODUCCIÓN DEL DÍA
// Una fila por producto con objetivo activo; se guarda producto por
// producto para no perder lo cargado si uno de los campos falla.
// ---------------------------------------------------------------------
function RegistroDiario({ objetivos, save }) {
  const [fechaSeleccionada, setFechaSeleccionada] = useState(hoy())
  const [cantidades, setCantidades] = useState({})
  const [guardando, setGuardando] = useState(null)

  useEffect(() => { setCantidades({}) }, [fechaSeleccionada])

  const guardar = async objetivo => {
    const cantidad = cantidades[objetivo.producto_id]
    if (cantidad === undefined || cantidad === '') return
    setGuardando(objetivo.producto_id)
    try { await save({ producto_id: objetivo.producto_id, fecha: fechaSeleccionada, cantidad_producida: Number(cantidad) }) }
    finally { setGuardando(null) }
  }

  return (
    <section className="stage-edit">
      <label className="rango">Fecha a registrar<input type="date" max={hoy()} value={fechaSeleccionada} onChange={event => setFechaSeleccionada(event.target.value)} /></label>

      <div className="stage-grid-head registro-grid-head">
        <small>Producto</small><small>Objetivo</small><small>Producido</small><small />
      </div>

      {objetivos.map(objetivo => (
        <div className="stage-grid-row registro-grid-row" key={objetivo.id}>
          <small>{objetivo.producto}</small>
          <span>{objetivo.cantidad_objetivo}</span>
          <input
            min="0"
            type="number"
            value={cantidades[objetivo.producto_id] ?? ''}
            onChange={event => setCantidades({ ...cantidades, [objetivo.producto_id]: event.target.value })}
            placeholder="0"
          />
          <button type="button" className="add-stage" disabled={guardando === objetivo.producto_id} onClick={() => guardar(objetivo)}>
            {guardando === objetivo.producto_id ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      ))}
    </section>
  )
}
