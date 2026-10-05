import React, { useEffect, useMemo, useState } from 'react'
import { api, dinero, duracion, fecha, porcentaje, useData } from './api.js'
import { Actions, Badge, Empty, Heading, Modal, Progress, Semaforo, Stat, useAviso } from './ui.jsx'
import { fechaDia, horas, hoyLocal as hoy } from './panel-recompensas.jsx'

const textoEstadoPedido = { PENDIENTE: 'pendiente', EN_PRODUCCION: 'en producción', PAUSADO: 'pausado', TERMINADO: 'terminado', CANCELADO: 'cancelado' }

// Resumen legible de los productos de un pedido, para elegirlo como objetivo.
const resumenPedido = pedido =>
  `${pedido.codigo} · ${pedido.items.map(item => `${item.cantidad}× ${item.producto}`).join(', ') || 'Sin productos'} · ${textoEstadoPedido[pedido.estado] || pedido.estado}`

export default function PanelProduccion() {
  const objetivos = useData('/produccion/objetivos')
  const productos = useData('/productos?activos=true')
  const pedidos = useData('/pedidos')
  const { mostrar, nodo } = useAviso()
  const [editando, setEditando] = useState(null)
  // Jornada de hoy: valor hora y % de premio vigentes, para mostrar cuánto
  // cobra el equipo al completar los objetivos.
  const jornadaHoy = useData(`/recompensas/equipo/dia/${hoy()}`, null)
  const [refresco, setRefresco] = useState(0)
  const objetivosCambiaron = () => { jornadaHoy.load(); setRefresco(valor => valor + 1) }

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

  const rutaObjetivo = objetivo => objetivo.tipo === 'pedido'
    ? `/produccion/objetivos/pedido/${objetivo.pedido_id}`
    : `/produccion/objetivos/${objetivo.producto_id}`

  const guardarObjetivo = async objetivo => {
    await api.put(rutaObjetivo(objetivo), objetivo, objetivos.token)
    setEditando(null)
    await objetivos.load()
    objetivosCambiaron()
    mostrar('Objetivo guardado.')
  }

  const eliminarObjetivo = async objetivo => {
    const nombre = objetivo.tipo === 'pedido' ? `terminar el pedido ${objetivo.pedido}` : `"${objetivo.producto}"`
    if (!window.confirm(`¿Quitar el objetivo de ${nombre}?`)) return
    try {
      await api.del(rutaObjetivo(objetivo), objetivos.token)
      await objetivos.load()
      objetivosCambiaron()
      mostrar('Objetivo eliminado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const registrarProduccion = async registro => {
    try {
      const resultado = await api.post('/produccion/registros', registro, registros.token)
      await recargar()
      mostrar(resultado.objetivo_cantidad === null || resultado.cumplido
        ? `Producción de ${resultado.producto} registrada.`
        : `Producción de ${resultado.producto} registrada. No llegó a su objetivo de ${resultado.objetivo_cantidad}.`)
      return true
    } catch (error) { mostrar(error.message, 'error'); return false }
  }

  const objetivosProducto = objetivos.data.filter(objetivo => objetivo.tipo !== 'pedido')
  const objetivosActivos = objetivosProducto.filter(objetivo => objetivo.activo)
  const productosConObjetivo = new Set(objetivosProducto.map(objetivo => String(objetivo.producto_id)))
  const productosSinObjetivo = productos.data.filter(producto => !productosConObjetivo.has(String(producto.id)))

  // Objetivo del equipo (base de la recompensa): Σ cantidad × horas-hombre
  // de los objetivos activos. El cálculo que vale es el del servidor
  // (server/recompensa-equipo.js); esto es solo para mostrarlo acá.
  const horasObjetivo = objetivo => (Number(objetivo.cantidad_objetivo) || 0) * (Number(objetivo.horas_hombre) || 0)
  const objetivoEquipo = objetivosActivos.reduce((total, objetivo) => total + horasObjetivo(objetivo), 0)
  // Lo que paga una cantidad de horas-hombre con el valor y el % vigentes.
  const valorDe = horasHombre => horasHombre * (jornadaHoy.data?.valor_hora || 0) * ((jornadaHoy.data?.porcentaje_premio ?? 100) / 100)

  // Pedidos que se pueden elegir como objetivo: abiertos y sin objetivo propio.
  const pedidosConObjetivo = new Set(objetivos.data.filter(objetivo => objetivo.tipo === 'pedido').map(objetivo => String(objetivo.pedido_id)))
  const pedidosDisponibles = pedidos.data.filter(pedido => !['TERMINADO', 'CANCELADO'].includes(pedido.estado) && !pedidosConObjetivo.has(String(pedido.id)))

  // Un producto por fila de pedido en producción, con sus propias etapas
  // (mismo armado que la tabla de Pedidos, ver panel-pedidos.jsx).
  const enProduccion = pedidos.data
    .filter(pedido => pedido.estado === 'EN_PRODUCCION')
    .flatMap(pedido => pedido.items.map(item => {
      const etapasItem = pedido.etapas
        .filter(etapa => String(etapa.pedido_item_id) === String(item.id))
        .sort((a, b) => a.orden - b.orden)
      const completadas = etapasItem.filter(etapa => etapa.estado === 'COMPLETADA').length
      return { clave: `${pedido.id}-${item.id}`, pedido, item, etapasItem, completadas, avance: porcentaje(completadas, etapasItem.length) }
    }))

  return (
    <>
      <Heading kicker="Producción diaria" title="Producción y objetivos" text="Seguí cómo avanza cada producto en producción y definí objetivos diarios por producto o la terminación de un pedido.">
        <button className="primary" onClick={() => setEditando({})}>+ Nuevo objetivo</button>
      </Heading>

      {nodo}

      <section className="stats-grid dashboard-stats">
        <Stat label="Productos en producción" value={enProduccion.length} />
        <Stat label="Objetivos" value={objetivos.data.length} hint={`${objetivos.data.filter(o => o.activo).length} activos`} />
        <Stat label="Objetivo del equipo" value={horas(objetivoEquipo)} hint="Horas-hombre de la producción propuesta por día" tone={objetivoEquipo ? '' : 'danger'} />
        <Stat label="Recompensa al cumplir" value={dinero(valorDe(objetivoEquipo))} hint="Para todo el equipo, si se completa el objetivo del día" />
      </section>

      <section className="section-heading">
        <div><h2>Productos en producción</h2><p>Avance de cada producto de los pedidos en producción, etapa por etapa.</p></div>
      </section>

      {pedidos.loading ? <p>Cargando producción...</p> : pedidos.error ? <p className="form-error">{pedidos.error}</p> : enProduccion.length ? (
        <section>
          {enProduccion.map(fila => (
            <article className="config-card" key={fila.clave}>
              <div className="detalle-item-head">
                <b>{fila.item.cantidad}× {fila.item.producto}</b>
                <span className="task-status en_progreso">En producción</span>
              </div>
              <p className="stage-total">
                Pedido {fila.pedido.codigo} · Entrega {fecha(fila.pedido.fecha_entrega)} ·
                <b> Progreso general {fila.avance}%</b> ({fila.completadas} de {fila.etapasItem.length} etapas)
              </p>
              <Progress value={fila.avance} />

              <div className="etapas-tabla">
                {fila.etapasItem.map(etapa => (
                  <div className="etapa-fila" key={etapa.id}>
                    <span className="etapa-nombre">{etapa.orden}. {etapa.nombre}</span>
                    <Badge estado={etapa.estado} />
                    <span className="etapa-tiempo">
                      {duracion(etapa.minutos_estimados)}
                      {etapa.minutos_reales ? <b> → {duracion(etapa.minutos_reales)}</b> : null}
                    </span>
                    <Semaforo valor={etapa.semaforo} compacto />
                    <span className="etapa-responsable" title="La asignación se gestiona desde Tareas">{etapa.responsable || 'Sin asignar'}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <p className="notice">No hay productos en producción en este momento.</p>
      )}

      <section className="section-heading">
        <div>
          <h2>Objetivos</h2>
          <p>
            Cantidad diaria esperada por producto o pedidos que se busca terminar. Los objetivos activos por producto, pasados a
            horas-hombre, forman el objetivo del equipo ({horas(objetivoEquipo)}): si la producción del día lo completa, el equipo cobra {dinero(valorDe(objetivoEquipo))}.
          </p>
        </div>
      </section>

      {objetivos.loading ? <p>Cargando objetivos...</p> : objetivos.data.length ? (
        <section className="product-grid">
          {objetivos.data.map(objetivo => (
            <article className={`product-card ${objetivo.activo ? '' : 'inactivo'}`} key={objetivo.id}>
              <div className="product-symbol">{objetivo.tipo === 'pedido' ? '⌁' : '◈'}</div>
              <div className="product-info">
                {objetivo.tipo === 'pedido' ? (
                  <>
                    <h3>Terminar pedido {objetivo.pedido}</h3>
                    <p>{objetivo.pedido_estado === 'TERMINADO' ? '✅ Pedido terminado' : `Avance: ${objetivo.pedido_avance}% · ${textoEstadoPedido[objetivo.pedido_estado] || objetivo.pedido_estado}`}</p>
                    <p>Entrega: {fecha(objetivo.pedido_fecha_entrega)}</p>
                  </>
                ) : (
                  <>
                    <h3>{objetivo.producto}</h3>
                    <p>Objetivo: {objetivo.cantidad_objetivo} por día</p>
                    <p>
                      {Number(objetivo.horas_hombre)
                        ? `${horas(horasObjetivo(objetivo))} estándar (${horas(objetivo.horas_hombre)} c/u)`
                        : '⚠ Sin horas-hombre: no suma al objetivo del equipo'}
                    </p>
                  </>
                )}
              </div>
              <div className="card-buttons">
                <button onClick={() => setEditando(objetivo)}>Editar</button>
                <button className="danger-link" onClick={() => eliminarObjetivo(objetivo)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay objetivos cargados" text="Definí cuántas unidades de un producto se esperan por día o qué pedido hay que terminar." action={() => setEditando({})} label="Crear objetivo" />
      )}

      <section className="section-heading">
        <div><h2>Producción del día</h2><p>Cargá lo producido. Si se completa la producción propuesta, el equipo cobra la recompensa.</p></div>
      </section>

      <PlanillaDiaria objetivos={objetivosActivos} productos={productos.data} registrar={registrarProduccion} refresco={refresco} />

      <section className="section-heading">
        <div><h2>Historial de producción</h2><p>Lo producido por día y, si el producto tiene objetivo propio, si se cumplió.</p></div>
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
              <span>{registro.objetivo_cantidad ?? '—'}</span>
              {registro.objetivo_cantidad === null
                ? <span className="muted">Sin objetivo propio</span>
                : <span className={registro.cumplido ? 'positivo' : 'negativo'}>{registro.cumplido ? '✅ Cumplido' : '❌ No cumplido'}</span>}
            </div>
          ))}
        </section>
      ) : (
        <Empty title="Todavía no hay producción registrada" text="Registrá la producción del día para empezar a ver el historial." />
      )}

      {editando && (
        <ObjetivoModal
          objetivo={editando}
          productos={editando.id ? productos.data : productosSinObjetivo}
          valorDe={valorDe}
          pedidos={pedidosDisponibles}
          close={() => setEditando(null)}
          save={guardarObjetivo}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------
// FORMULARIO DE OBJETIVO (alta o edición)
// Dos tipos: producción diaria de un producto (uno por producto) o
// terminar un pedido específico (uno por pedido, elegido de los pedidos
// reales abiertos). En la edición el tipo y el producto/pedido quedan fijos.
// ---------------------------------------------------------------------
function ObjetivoModal({ objetivo, productos, pedidos, valorDe, close, save }) {
  const editar = Boolean(objetivo.id)
  const [tipo, setTipo] = useState(objetivo.tipo || (!productos.length && pedidos.length ? 'pedido' : 'producto'))
  const [productoId, setProductoId] = useState(objetivo.producto_id || '')
  const [pedidoId, setPedidoId] = useState(objetivo.pedido_id || '')
  const [cantidad, setCantidad] = useState(objetivo.cantidad_objetivo ?? '')
  const [activo, setActivo] = useState(objetivo.activo ?? true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    if (tipo === 'producto' && !productoId) return setError('Elegí un producto.')
    if (tipo === 'pedido' && !pedidoId) return setError('Elegí el pedido a terminar.')
    setBusy(true); setError('')
    try {
      await save(tipo === 'pedido'
        ? { tipo, pedido_id: pedidoId, activo }
        : { tipo, producto_id: productoId, cantidad_objetivo: Number(cantidad), activo })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const sinOpciones = !editar && (tipo === 'producto' ? !productos.length : !pedidos.length)

  return (
    <Modal title={editar ? 'Editar objetivo' : 'Nuevo objetivo'} subtitle="Producción diaria de un producto o terminación de un pedido específico." close={close}>
      <form onSubmit={enviar}>
        <label>Tipo de objetivo
          <select disabled={editar} value={tipo} onChange={event => { setTipo(event.target.value); setError('') }}>
            <option value="producto">Producción diaria de un producto</option>
            <option value="pedido">Terminar un pedido específico</option>
          </select>
        </label>

        {tipo === 'producto' ? (
          productos.length || editar ? (
            <>
              <label>Producto
                <select required disabled={editar} value={productoId} onChange={event => setProductoId(event.target.value)}>
                  <option value="">Seleccionar producto</option>
                  {productos.map(producto => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
                </select>
              </label>

              <label>Cantidad objetivo por día
                <input required min="1" type="number" value={cantidad} onChange={event => setCantidad(event.target.value)} placeholder="Ej. 2" />
              </label>

              <ValorObjetivo producto={productos.find(producto => String(producto.id) === String(productoId))} cantidad={cantidad} valorDe={valorDe} />
            </>
          ) : (
            <p className="notice">Todos los productos activos ya tienen un objetivo. Editá uno existente o creá un producto nuevo.</p>
          )
        ) : editar ? (
          <label>Pedido
            <select disabled value={pedidoId}><option value={pedidoId}>{objetivo.pedido}</option></select>
          </label>
        ) : pedidos.length ? (
          <label>Pedido a terminar
            <select required value={pedidoId} onChange={event => setPedidoId(event.target.value)}>
              <option value="">Seleccionar pedido</option>
              {pedidos.map(pedido => <option key={pedido.id} value={pedido.id}>{resumenPedido(pedido)}</option>)}
            </select>
          </label>
        ) : (
          <p className="notice">No hay pedidos abiertos sin objetivo. Creá un pedido desde la sección Pedidos.</p>
        )}

        <label className="config-check">
          <input type="checkbox" checked={activo} onChange={event => setActivo(event.target.checked)} />
          Objetivo activo
        </label>

        {error && <p className="form-error">{error}</p>}
        {sinOpciones
          ? <div className="form-actions"><button type="button" className="primary" onClick={close}>Entendido</button></div>
          : <Actions close={close} label={editar ? 'Guardar cambios' : 'Crear objetivo'} busy={busy} />}
      </form>
    </Modal>
  )
}

// Cuánto aporta este objetivo al objetivo del equipo (cantidad × horas-hombre
// del producto) y cuánto vale con el valor hora y el % de premio vigentes.
function ValorObjetivo({ producto, cantidad, valorDe }) {
  if (!producto) return null
  const tiempo = Number(producto.horas_hombre) || 0
  if (!tiempo) return <p className="form-note">⚠ {producto.nombre} no tiene horas-hombre cargadas: su objetivo no va a sumar al objetivo del equipo. Cargalas en Productos.</p>
  const total = (Number(cantidad) || 0) * tiempo
  return (
    <p className="form-note">
      Cada unidad equivale a {horas(tiempo)}.{total > 0 && <> Este objetivo suma <b>{horas(total)}</b> al objetivo del equipo ({dinero(valorDe(total))} de recompensa).</>}
    </p>
  )
}

// ---------------------------------------------------------------------
// PRODUCCIÓN DEL DÍA
// Se carga producto por producto (para no perder lo cargado si uno falla).
// Se puede registrar cualquier producto activo, tenga o no objetivo
// propio: todo suma horas-hombre producidas. Abajo, el resumen de la
// recompensa del equipo.
// ---------------------------------------------------------------------
function PlanillaDiaria({ objetivos, productos, registrar, refresco }) {
  const [fechaSeleccionada, setFechaSeleccionada] = useState(hoy())
  const jornada = useData(`/recompensas/equipo/dia/${fechaSeleccionada}`, null)
  const [cantidades, setCantidades] = useState({})
  const [otroProducto, setOtroProducto] = useState('')
  const [guardando, setGuardando] = useState(null)

  useEffect(() => { setCantidades({}); setOtroProducto('') }, [fechaSeleccionada])
  // Cambió un objetivo: el resumen de la recompensa del día se recalcula.
  useEffect(() => { if (refresco) jornada.load() }, [refresco])

  const objetivoPorProducto = Object.fromEntries(objetivos.map(objetivo => [String(objetivo.producto_id), objetivo.cantidad_objetivo]))
  const filas = [
    ...objetivos.map(objetivo => ({ id: objetivo.producto_id, nombre: objetivo.producto })),
    ...productos.filter(producto => String(producto.id) === otroProducto).map(producto => ({ id: producto.id, nombre: producto.nombre }))
  ]
  const disponibles = productos.filter(producto => !objetivoPorProducto[String(producto.id)])
  const horasProducto = Object.fromEntries(productos.map(producto => [String(producto.id), Number(producto.horas_hombre) || 0]))

  const enviarProduccion = async fila => {
    const cantidad = cantidades[fila.id]
    if (cantidad === undefined || cantidad === '') return
    setGuardando(fila.id)
    if (await registrar({ producto_id: fila.id, fecha: fechaSeleccionada, cantidad_producida: Number(cantidad) })) await jornada.load()
    setGuardando(null)
  }

  return (
    <section className="stage-edit">
      <label className="rango">Fecha<input type="date" max={hoy()} value={fechaSeleccionada} onChange={event => event.target.value && setFechaSeleccionada(event.target.value)} /></label>

      <div className="stage-grid-head registro-grid-head">
        <small>Producto</small><small>Objetivo propio</small><small>Producido</small><small />
      </div>

      {filas.map(fila => (
        <div className="stage-grid-row registro-grid-row" key={fila.id}>
          <small>{fila.nombre} · {horasProducto[String(fila.id)] ? horas(horasProducto[String(fila.id)]) : 'sin horas-hombre'}</small>
          <span>{objetivoPorProducto[String(fila.id)] ?? '—'}</span>
          <input
            min="0"
            type="number"
            value={cantidades[fila.id] ?? ''}
            onChange={event => setCantidades({ ...cantidades, [fila.id]: event.target.value })}
            placeholder="0"
          />
          <button type="button" className="add-stage" disabled={guardando === fila.id} onClick={() => enviarProduccion(fila)}>
            {guardando === fila.id ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      ))}

      {disponibles.length > 0 && (
        <label>Otro producto
          <select value={otroProducto} onChange={event => setOtroProducto(event.target.value)}>
            <option value="">Elegir un producto sin objetivo propio</option>
            {disponibles.map(producto => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
          </select>
        </label>
      )}

      {jornada.data && (
        <p className="notice">
          {fechaDia(fechaSeleccionada)}: objetivo {horas(jornada.data.objetivo_horas)} · producido {horas(jornada.data.horas_producidas)} ·
          {jornada.data.cumplido
            ? <b> ✅ objetivo cumplido · recompensa del equipo {dinero(jornada.data.recompensa)}</b>
            : jornada.data.objetivo_horas
              ? <b> faltan {horas(-jornada.data.excedente_horas)} para cobrar la recompensa</b>
              : <b> sin objetivo cargado</b>}
        </p>
      )}
    </section>
  )
}
