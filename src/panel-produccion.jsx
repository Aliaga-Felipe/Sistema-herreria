import React, { useEffect, useState } from 'react'
import { api, dinero, etiquetaPrioridad, fecha, fechaDia, horas, hoyLocal as hoy, sumarHoras, useData } from './api.js'
import { Badge, Empty, Heading, Progress, Stat, useAviso } from './ui.jsx'

// ---------------------------------------------------------------------
// PRODUCCIÓN DIARIA
// La producción de un día es la lista de etapas de pedidos que se propone
// terminar ese día (ver server/jornadas.js):
//   1. El admin agrega trabajo: un pedido completo, un producto o etapas
//      sueltas. Cada etapa ya tiene su empleado y sus horas-hombre (se
//      definieron al crear el pedido).
//   2. Los empleados completan sus etapas desde Mis tareas.
//   3. El admin verifica (puede reabrir una etapa mal terminada) y marca
//      la producción diaria como terminada. Si se completó todo lo
//      propuesto, el equipo cobra las horas-hombre estimadas como
//      recompensa (valor hora × % de premio, ver Recompensas).
// Abajo, el historial de días: tocar uno lo abre arriba con su desglose.
// ---------------------------------------------------------------------

const textoEstado = jornada => {
  if (jornada.estado === 'SIN_PLANIFICAR') return 'Sin planificar'
  if (jornada.estado === 'TERMINADA') return jornada.cumplido ? '✅ Terminada' : 'Terminada sin completar'
  return jornada.cumplido ? 'Lista para verificar' : 'En curso'
}

// Agrupa una lista plana de etapas por pedido y, dentro, por producto.
function agruparPorPedido(etapas) {
  const pedidos = new Map()
  for (const etapa of etapas) {
    const clavePedido = String(etapa.pedido_id)
    if (!pedidos.has(clavePedido)) pedidos.set(clavePedido, { id: etapa.pedido_id, codigo: etapa.pedido, estado: etapa.pedido_estado, productos: new Map() })
    const productos = pedidos.get(clavePedido).productos
    const claveProducto = String(etapa.pedido_item_id)
    if (!productos.has(claveProducto)) productos.set(claveProducto, { id: etapa.pedido_item_id, nombre: etapa.producto, cantidad: etapa.cantidad, etapas: [] })
    productos.get(claveProducto).etapas.push(etapa)
  }
  return [...pedidos.values()].map(pedido => ({ ...pedido, productos: [...pedido.productos.values()] }))
}

export default function PanelProduccion() {
  const [dia, setDia] = useState(hoy())
  const jornada = useData(`/produccion/jornada/${dia}`, null)
  const pedidos = useData('/pedidos')
  const historial = useData('/produccion/jornadas')
  const { mostrar, nodo } = useAviso()
  const [ocupado, setOcupado] = useState(false)

  const recargar = () => Promise.all([jornada.load(), pedidos.load(), historial.load()])

  // Elegir un día del historial lo abre arriba (con su desglose y, si está
  // terminado, el botón para reabrirlo).
  const elegirDia = fecha => {
    setDia(fecha)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Corre una acción contra la API, recarga y avisa el resultado.
  const ejecutar = async (accion, mensaje) => {
    setOcupado(true)
    try {
      const resultado = await accion()
      await recargar()
      mostrar(typeof mensaje === 'function' ? mensaje(resultado) : mensaje)
      return true
    } catch (error) { mostrar(error.message, 'error'); return false } finally { setOcupado(false) }
  }

  const agregar = seleccion => ejecutar(
    () => api.post(`/produccion/jornada/${dia}/etapas`, seleccion, jornada.token),
    resultado => `${resultado.agregadas === 1 ? 'Se agregó 1 etapa' : `Se agregaron ${resultado.agregadas} etapas`} a la producción del ${fechaDia(dia)}.`
      + (resultado.omitidas?.length ? ` ${resultado.omitidas.length} no se agregaron (${resultado.omitidas.map(etapa => `${etapa.nombre}: ${etapa.motivo}`).join('; ')}).` : '')
  )

  const quitar = etapa => ejecutar(() => api.del(`/produccion/jornada/${dia}/etapas/${etapa.id}`, jornada.token), `"${etapa.nombre}" ya no está en la producción del día.`)

  const reabrirEtapa = etapa => {
    if (!window.confirm(`¿Reabrir "${etapa.nombre}"? Vuelve a pendiente y ${etapa.responsable || 'el empleado'} la va a ver de nuevo en Mis tareas para terminarla.`)) return
    ejecutar(() => api.patch(`/tareas/asignadas/PEDIDO/${etapa.id}/reabrir`, {}, jornada.token), `"${etapa.nombre}" se reabrió.`)
  }

  const terminar = () => {
    const datos = jornada.data
    const faltan = datos.etapas_totales - datos.etapas_completadas
    const pregunta = datos.cumplido
      ? `¿Verificaste el trabajo? Se marca la producción del ${fechaDia(dia)} como terminada y el equipo cobra ${dinero(datos.recompensa_al_cumplir)} (${horas(datos.objetivo_horas)}).`
      : `Faltan ${faltan} ${faltan === 1 ? 'etapa' : 'etapas'} por completar (${horas(datos.horas_pendientes)}). Si la terminás así, no hay recompensa para este día. ¿Continuar?`
    if (!window.confirm(pregunta)) return
    ejecutar(() => api.post(`/produccion/jornada/${dia}/terminar`, {}, jornada.token),
      resultado => (resultado.cumplido ? `Producción terminada. Recompensa del equipo: ${dinero(resultado.recompensa)}.` : 'Producción terminada sin completar: sin recompensa.'))
  }

  const reabrirDia = () => {
    if (!window.confirm(`¿Reabrir la producción del ${fechaDia(dia)}? La recompensa vuelve a $0 hasta que la termines de nuevo.`)) return
    ejecutar(() => api.post(`/produccion/jornada/${dia}/reabrir`, {}, jornada.token), 'Producción reabierta.')
  }

  const vaciar = () => {
    if (!window.confirm(`¿Quitar todo el trabajo propuesto para el ${fechaDia(dia)}? Las etapas no se borran de sus pedidos.`)) return
    ejecutar(() => api.del(`/produccion/jornada/${dia}`, jornada.token), 'Se vació la producción del día.')
  }

  const datos = jornada.data
  const abierta = datos?.estado !== 'TERMINADA'

  return (
    <>
      <Heading kicker="Producción diaria" title="Producción del día" text="Proponé qué se termina en el día (un pedido, un producto o etapas sueltas). Los empleados completan sus etapas y vos verificás y das por terminada la producción: si se completó todo, el equipo cobra las horas-hombre estimadas.">
        <div className="actions">
          <label className="rango">Día<input type="date" value={dia} onChange={event => event.target.value && setDia(event.target.value)} /></label>
          {dia !== hoy() && <button className="filter" onClick={() => setDia(hoy())}>Hoy</button>}
        </div>
      </Heading>

      {nodo}

      {jornada.loading && !datos ? <p>Cargando la producción del día...</p> : jornada.error ? <p className="form-error">{jornada.error}</p> : datos && (
        <>
          <section className="stats-grid dashboard-stats">
            <Stat label="Propuesto" value={horas(datos.objetivo_horas)} hint={`${datos.etapas_totales} ${datos.etapas_totales === 1 ? 'etapa' : 'etapas'} de pedidos`} tone={datos.estado === 'SIN_PLANIFICAR' ? 'danger' : ''} />
            <Stat label="Completado" value={horas(datos.horas_completadas)} hint={`${datos.avance}% · ${datos.etapas_completadas} de ${datos.etapas_totales} etapas`} />
            <Stat
              label="Estado"
              value={textoEstado(datos)}
              hint={datos.modelo === 'productos' ? 'Día del sistema anterior'
                : datos.estado === 'TERMINADA' ? `Por ${datos.terminada_por || '—'} el ${fecha(datos.terminada_en)}`
                  : datos.cumplido ? 'Todo completado: falta tu verificación'
                    : datos.estado === 'ABIERTA' ? `Faltan ${horas(datos.horas_pendientes)}` : 'Agregá trabajo abajo'}
            />
            <Stat
              label={datos.estado === 'TERMINADA' ? 'Recompensa del equipo' : 'Recompensa al completar'}
              value={dinero(datos.estado === 'TERMINADA' ? datos.recompensa : datos.recompensa_al_cumplir)}
              hint={`${horas(datos.objetivo_horas)} × ${dinero(datos.valor_hora)} × ${datos.porcentaje_premio}%`}
              tone={datos.estado === 'TERMINADA' && !datos.cumplido ? 'danger' : ''}
            />
          </section>

          {datos.estado === 'ABIERTA' && <div className="jornada-progreso"><Progress value={datos.avance} /></div>}
          {abierta && datos.estado !== 'SIN_PLANIFICAR' && datos.advertencias.map(texto => <p className="notice" key={texto}>⚠ {texto}</p>)}

          <section className="section-heading">
            <div>
              <h2>Propuesto para el {fechaDia(dia)}</h2>
              <p>{datos.estado === 'TERMINADA'
                ? 'Producción terminada: quedó guardada tal como se verificó. Si necesitás cambiarla, reabrila.'
                : 'Cuando los empleados completen sus etapas, revisá el trabajo: si algo no quedó bien, reabrí la etapa. Después marcá la producción como terminada.'}</p>
            </div>
            {datos.estado === 'TERMINADA' && datos.modelo === 'etapas' && (
              <button type="button" className="secondary" disabled={ocupado} onClick={reabrirDia}>Reabrir producción</button>
            )}
          </section>

          {datos.modelo === 'productos' ? (
            <DesgloseAnterior jornada={datos} />
          ) : datos.etapas.length ? (
            <JornadaPropuesta jornada={datos} editable={abierta} ocupado={ocupado} onQuitar={quitar} onReabrir={reabrirEtapa} />
          ) : (
            <Empty title="No hay trabajo propuesto para este día" text="Elegí abajo un pedido completo, un producto o etapas sueltas." />
          )}

          {datos.estado === 'ABIERTA' && (
            <div className="form-actions acciones-jornada">
              <button type="button" className="danger-link" disabled={ocupado} onClick={vaciar}>Vaciar el día</button>
              <button type="button" className="primary" disabled={ocupado} onClick={terminar}>Marcar producción diaria terminada</button>
            </div>
          )}
          {abierta && (
            <AgregarTrabajo dia={dia} pedidos={pedidos} ocupado={ocupado} onAgregar={agregar} />
          )}
        </>
      )}

      <HistorialDias historial={historial} seleccionado={dia} onElegir={elegirDia} />
    </>
  )
}

// ---------------------------------------------------------------------
// HISTORIAL DE DÍAS
// Cada día con producción propuesta: los terminados con su resultado y la
// recompensa que se pagó, los abiertos con cómo vienen. Tocar un día lo
// abre arriba, con su desglose (y el botón para reabrirlo si ya se terminó).
// ---------------------------------------------------------------------
function HistorialDias({ historial, seleccionado, onElegir }) {
  const [visibles, setVisibles] = useState(20)
  const resultado = fila => {
    if (fila.estado === 'ABIERTA') return <span className="muted">{fila.cumplido ? 'Falta verificar' : 'En curso'}</span>
    if (fila.cumplido) return <span className="positivo">✅ Cumplido</span>
    return <span className="negativo">{fila.objetivo_horas > 0 ? `Faltaron ${horas(fila.objetivo_horas - fila.horas_completadas)}` : 'Sin objetivo'}</span>
  }

  return (
    <>
      <section className="section-heading historial-dias">
        <div>
          <h2>Historial de días</h2>
          <p>Cada día con producción propuesta. Tocá un día para ver arriba qué se propuso y qué se completó; si ya está terminado, desde ahí lo podés reabrir.</p>
        </div>
      </section>

      {historial.loading && !historial.data.length ? <p>Cargando historial...</p> : historial.error ? <p className="form-error">{historial.error}</p> : historial.data.length ? (
        <>
          <section className="ranking-tabla">
            <div className="ranking-head jornada-head">
              <span>Día</span><span>Propuesto</span><span>Completado</span><span>Resultado</span><span>Valor hora · premio</span><span>Recompensa</span>
            </div>
            {historial.data.slice(0, visibles).map(fila => {
              const elegido = fila.fecha === seleccionado
              return (
                <div
                  className={`ranking-fila jornada-fila${elegido ? ' seleccionada' : ''}`}
                  key={fila.fecha}
                  role="button"
                  tabIndex={0}
                  aria-current={elegido ? 'date' : undefined}
                  title="Ver la producción de este día"
                  onClick={() => onElegir(fila.fecha)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onElegir(fila.fecha) } }}
                >
                  <b>{fechaDia(fila.fecha)}{fila.fecha === hoy() ? ' · hoy' : ''}</b>
                  <span>{horas(fila.objetivo_horas)}</span>
                  <span>{horas(fila.horas_completadas)}</span>
                  {resultado(fila)}
                  <span>{dinero(fila.valor_hora)} · {fila.porcentaje_premio}%</span>
                  <b className={fila.recompensa > 0 ? 'positivo' : ''}>{fila.estado === 'ABIERTA' ? '—' : dinero(fila.recompensa)}</b>
                </div>
              )
            })}
          </section>
          {historial.data.length > visibles && (
            <button type="button" className="add-stage" onClick={() => setVisibles(visibles + 20)}>Mostrar más días ({historial.data.length - visibles})</button>
          )}
        </>
      ) : (
        <p className="notice">Todavía no hay días con producción propuesta.</p>
      )}
    </>
  )
}

// Día cargado con el sistema anterior: objetivos diarios por producto y
// unidades producidas (solo consulta, no se puede reabrir).
function DesgloseAnterior({ jornada }) {
  return (
    <>
      <p className="notice">Este día se cargó con el sistema anterior (objetivos diarios por producto y unidades producidas). Se muestra como se calculó.</p>
      {jornada.objetivos_anteriores.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head produccion-head">
            <span>Producto</span><span>Objetivo diario</span><span>Horas-hombre c/u</span><span>Horas del objetivo</span><span />
          </div>
          {jornada.objetivos_anteriores.map(fila => (
            <div className="ranking-fila produccion-fila" key={fila.producto_id}>
              <b>{fila.producto}</b><span>{fila.cantidad}</span><span>{horas(fila.tiempo_estandar)}</span><span>{horas(fila.horas)}</span><span />
            </div>
          ))}
        </section>
      ) : <p className="notice">Este día no tenía objetivos cargados.</p>}

      {jornada.produccion_anterior.length > 0 && (
        <section className="ranking-tabla">
          <div className="ranking-head produccion-head">
            <span>Producto</span><span>Unidades</span><span>Horas-hombre c/u</span><span>Horas producidas</span><span />
          </div>
          {jornada.produccion_anterior.map(fila => (
            <div className="ranking-fila produccion-fila" key={fila.producto_id}>
              <b>{fila.producto}</b><span>{fila.cantidad}</span><span>{horas(fila.tiempo_estandar)}</span><span>{horas(fila.horas)}</span><span />
            </div>
          ))}
        </section>
      )}
    </>
  )
}

// Trabajo propuesto para el día, agrupado por pedido y producto.
function JornadaPropuesta({ jornada, editable, ocupado, onQuitar, onReabrir }) {
  return (
    <section>
      {agruparPorPedido(jornada.etapas).map(pedido => (
        <article className="config-card" key={pedido.id}>
          <div className="detalle-item-head">
            <b>Pedido {pedido.codigo}</b>
            <span className="muted">{horas(sumarHoras(pedido.productos.flatMap(producto => producto.etapas.map(etapa => etapa.horas_hombre))))}</span>
          </div>
          {pedido.productos.map(producto => (
            <div className="jornada-producto" key={producto.id}>
              <p className="stage-total"><b>{producto.cantidad}× {producto.nombre}</b></p>
              <div className="etapas-tabla">
                {producto.etapas.map(etapa => (
                  <div className="etapa-fila jornada-etapa-fila" key={etapa.id}>
                    <span className="etapa-nombre">{etapa.orden}. {etapa.nombre}</span>
                    <Badge estado={etapa.estado} />
                    <span className="etapa-tiempo">{horas(etapa.horas_hombre)}</span>
                    <span className={etapa.responsable ? 'etapa-responsable' : 'etapa-responsable negativo'}>{etapa.responsable || 'Sin asignar'}</span>
                    <span className="muted" title={etapa.observaciones || ''}>
                      {etapa.completado_en ? `✓ ${new Date(etapa.completado_en).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '—'}
                      {etapa.observaciones ? ' · 📝' : ''}
                    </span>
                    {editable ? (
                      <span className="jornada-acciones">
                        {etapa.estado === 'COMPLETADA' && <button type="button" disabled={ocupado} onClick={() => onReabrir(etapa)} title="El trabajo no quedó bien: vuelve a pendiente">Reabrir</button>}
                        <button type="button" disabled={ocupado} onClick={() => onQuitar(etapa)} title="Sacar esta etapa de la producción del día">Quitar</button>
                      </span>
                    ) : <span />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </article>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------
// AGREGAR TRABAJO AL DÍA
// Pedidos en curso con sus etapas pendientes. Se puede agregar el pedido
// completo, un producto o marcar etapas sueltas. Las etapas que ya están
// propuestas en otro día abierto no se pueden elegir (cuentan una sola vez).
// ---------------------------------------------------------------------
function AgregarTrabajo({ dia, pedidos, ocupado, onAgregar }) {
  const [elegidas, setElegidas] = useState(new Set())
  useEffect(() => { setElegidas(new Set()) }, [dia])

  const enCurso = pedidos.data
    .filter(pedido => ['PENDIENTE', 'EN_PRODUCCION'].includes(pedido.estado))
    .filter(pedido => pedido.etapas.some(etapa => etapa.estado !== 'COMPLETADA' && !etapa.jornada))
    .sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0) || String(a.fecha_entrega || '9999').localeCompare(String(b.fecha_entrega || '9999')))

  const libre = etapa => etapa.estado !== 'COMPLETADA' && !etapa.jornada
  const horasLibres = etapas => sumarHoras(etapas.filter(libre).map(etapa => etapa.horas_hombre))
  const todas = enCurso.flatMap(pedido => pedido.etapas)
  const seleccionadas = todas.filter(etapa => elegidas.has(String(etapa.id)))

  const alternar = etapa => setElegidas(actuales => {
    const nuevas = new Set(actuales)
    const clave = String(etapa.id)
    if (nuevas.has(clave)) nuevas.delete(clave)
    else nuevas.add(clave)
    return nuevas
  })

  const agregarSeleccion = async () => {
    if (await onAgregar({ etapas: seleccionadas.map(etapa => etapa.id) })) setElegidas(new Set())
  }

  return (
    <>
      <section className="section-heading">
        <div>
          <h2>Agregar trabajo al {fechaDia(dia)}</h2>
          <p>Pedidos en curso con etapas pendientes que todavía no están propuestas en ningún día.</p>
        </div>
      </section>

      {pedidos.loading ? <p>Cargando pedidos...</p> : enCurso.length ? (
        <section>
          {enCurso.map(pedido => (
            <article className="config-card" key={pedido.id}>
              <div className="detalle-item-head">
                <b>
                  Pedido {pedido.codigo}
                  <span className="muted"> · Entrega {fecha(pedido.fecha_entrega)} · {etiquetaPrioridad(pedido.prioridad)}</span>
                </b>
                <button type="button" className="add-stage en-linea" disabled={ocupado} onClick={() => onAgregar({ pedido_id: pedido.id })}>
                  + Pedido completo ({horas(horasLibres(pedido.etapas))})
                </button>
              </div>

              {pedido.items.map(item => {
                const etapasItem = pedido.etapas.filter(etapa => String(etapa.pedido_item_id) === String(item.id)).sort((a, b) => a.orden - b.orden)
                const horasItem = horasLibres(etapasItem)
                return (
                  <div className="jornada-producto" key={item.id}>
                    <div className="detalle-item-head">
                      <span>{item.cantidad}× {item.producto}</span>
                      {horasItem > 0 && pedido.items.length > 1 && (
                        <button type="button" className="add-stage en-linea" disabled={ocupado} onClick={() => onAgregar({ pedido_item_id: item.id })}>+ Producto ({horas(horasItem)})</button>
                      )}
                    </div>
                    {etapasItem.map(etapa => (
                      <label className={`etapa-elegible${libre(etapa) ? '' : ' no-disponible'}`} key={etapa.id}>
                        <input type="checkbox" disabled={!libre(etapa) || ocupado} checked={elegidas.has(String(etapa.id))} onChange={() => alternar(etapa)} />
                        <span className="etapa-nombre">{etapa.orden}. {etapa.nombre}</span>
                        <span>{horas(etapa.horas_hombre)}</span>
                        <span className={etapa.responsable ? 'muted' : 'negativo'}>{etapa.responsable || 'Sin asignar'}</span>
                        <span className="muted">
                          {etapa.estado === 'COMPLETADA' ? 'Completada' : etapa.jornada ? (etapa.jornada === dia ? 'Ya está en este día' : `En la producción del ${fechaDia(etapa.jornada)}`) : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </article>
          ))}

          {seleccionadas.length > 0 && (
            <div className="seleccion-jornada">
              <span>{seleccionadas.length} {seleccionadas.length === 1 ? 'etapa elegida' : 'etapas elegidas'} · {horas(sumarHoras(seleccionadas.map(etapa => etapa.horas_hombre)))}</span>
              <button type="button" className="secondary" onClick={() => setElegidas(new Set())}>Limpiar</button>
              <button type="button" className="primary" disabled={ocupado} onClick={agregarSeleccion}>Agregar a la producción</button>
            </div>
          )}
        </section>
      ) : (
        <p className="notice">No hay pedidos en curso con etapas pendientes sin proponer. Creá un pedido en Pedidos.</p>
      )}
    </>
  )
}
