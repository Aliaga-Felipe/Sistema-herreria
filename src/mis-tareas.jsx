import React, { useState } from 'react'
import { api, fecha, horas, hoyLocal, sumarHoras, useData, useSession } from './api.js'
import { Actions, Badge, Empty, EtiquetaJornada, Heading, Modal, Stat, useAviso } from './ui.jsx'

// ---------------------------------------------------------------------
// MIS TAREAS (empleados)
// Las etapas de pedidos que el admin le asignó a la persona al crear cada
// pedido (sola o junto con otros empleados: en ese caso cualquiera de ellos
// la marca como terminada para todos). Arriba, las que están en la
// producción de hoy. Al terminar una
// etapa solo se la marca como terminada (no se informa cuánto se tardó):
// el admin la verifica al cerrar la producción del día, y si se completó
// todo lo propuesto el equipo cobra la recompensa.
// ---------------------------------------------------------------------
export default function MisTareas() {
  const { session } = useSession()
  const tareas = useData('/tareas/asignadas/mias')
  const hoy = hoyLocal()
  const equipo = useData(`/produccion/jornada/${hoy}`, null)
  const { mostrar, nodo } = useAviso()
  const [cerrando, setCerrando] = useState(null)

  const pendientes = tareas.data.filter(tarea => tarea.estado !== 'COMPLETADA')
  const completadas = tareas.data.filter(tarea => tarea.estado === 'COMPLETADA')
  // Orden fijo (pedido/tarea y número de etapa): al marcar una etapa como
  // terminada NO desaparece ni cambia de lugar, queda en la misma posición
  // mostrando el estado "Completada".
  const ordenadas = [...tareas.data].sort((a, b) =>
    a.origen.localeCompare(b.origen) || Number(a.contenedor_id) - Number(b.contenedor_id) || (a.orden || 0) - (b.orden || 0))
  const deHoy = ordenadas.filter(tarea => tarea.jornada === hoy)
  const otras = ordenadas.filter(tarea => tarea.jornada !== hoy)
  const pendientesHoy = deHoy.filter(tarea => tarea.estado !== 'COMPLETADA')

  const iniciar = async tarea => {
    try {
      await api.patch(`/tareas/asignadas/${tarea.origen}/${tarea.id}/iniciar`, {}, tareas.token)
      await tareas.load()
      mostrar('Etapa empezada.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const completar = async (tarea, observaciones) => {
    await api.patch(`/tareas/asignadas/${tarea.origen}/${tarea.id}/completar`, { observaciones }, tareas.token)
    setCerrando(null)
    await Promise.all([tareas.load(), equipo.load()])
    mostrar(tarea.jornada ? `"${tarea.etapa}" terminada. El administrador la verifica al cerrar la producción del día.` : `"${tarea.etapa}" terminada.`)
  }

  const lista = conjunto => (
    <div className="task-list">
      {conjunto.map(tarea => (
        <TarjetaTarea
          key={`${tarea.origen}-${tarea.id}`}
          tarea={tarea}
          hoy={hoy}
          onIniciar={iniciar}
          onCerrar={tarea.estado === 'COMPLETADA' ? undefined : () => setCerrando(tarea)}
        />
      ))}
    </div>
  )

  return (
    <>
      <Heading
        kicker={`Hola, ${session.usuario.nombre.split(' ')[0]}`}
        title="Mis tareas"
        text="Tus etapas de trabajo. Arriba están las de la producción de hoy: cuando termines una, marcala como terminada."
      />

      {nodo}

      <section className="stats-grid dashboard-stats">
        <Stat label="Para hoy" value={pendientesHoy.length} hint={pendientesHoy.length ? `${horas(sumarHoras(pendientesHoy.map(tarea => tarea.horas_hombre)))} por terminar` : 'Nada pendiente para hoy'} />
        <Stat label="Pendientes" value={pendientes.length} hint={`${horas(sumarHoras(pendientes.map(tarea => tarea.horas_hombre)))} en total`} />
        <Stat label="Completadas" value={completadas.length} />
        {equipo.data && equipo.data.estado !== 'SIN_PLANIFICAR' && (
          <Stat
            label="Equipo hoy"
            value={`${equipo.data.avance}%`}
            hint={equipo.data.estado === 'TERMINADA'
              ? (equipo.data.cumplido ? '✅ Producción del día cumplida' : 'Producción del día cerrada')
              : `${horas(equipo.data.horas_completadas)} de ${horas(equipo.data.objetivo_horas)} propuestas`}
          />
        )}
      </section>

      {tareas.loading ? <p>Cargando tus tareas...</p> : tareas.error ? <p className="form-error">{tareas.error}</p> : ordenadas.length ? (
        <>
          <section className="section-heading">
            <div><h2>Producción de hoy</h2><p>Lo que el taller se propuso terminar hoy y te toca a vos. Si el equipo completa todo, cobra la recompensa del día.</p></div>
          </section>
          {deHoy.length ? lista(deHoy) : <p className="notice">No tenés etapas en la producción de hoy. Podés avanzar con tus otras etapas.</p>}

          {otras.length > 0 && (
            <>
              <section className="section-heading">
                <div><h2>Mis otras etapas</h2><p>{otras.filter(tarea => tarea.estado !== 'COMPLETADA').length} pendientes · {otras.filter(tarea => tarea.estado === 'COMPLETADA').length} completadas. Las que terminás quedan en la lista marcadas como completadas.</p></div>
              </section>
              {lista(otras)}
            </>
          )}
        </>
      ) : (
        <Empty title="No tenés tareas asignadas" text="Cuando el administrador te asigne una etapa de un pedido, va a aparecer acá." />
      )}

      {cerrando && <CierreModal tarea={cerrando} close={() => setCerrando(null)} save={completar} />}
    </>
  )
}

// Los otros empleados de la etapa (si la hacen varios).
const companeros = (tarea, usuarioId) => (tarea.empleados || []).filter(empleado => String(empleado.id) !== String(usuarioId))

function TarjetaTarea({ tarea, hoy, onIniciar, onCerrar }) {
  const { session } = useSession()
  const completada = tarea.estado === 'COMPLETADA'
  const otros = companeros(tarea, session.usuario.id)
  return (
    <article className={`task-card tarea-asignada ${completada ? 'completada' : ''}`}>
      <div className="task-card-head">
        <div>
          <Badge estado={tarea.estado} /> <EtiquetaJornada fecha={tarea.jornada} hoy={hoy} />
          <h3>{tarea.etapa}</h3>
          <p>{tarea.titulo} · {tarea.referencia}</p>
          {otros.length > 0 && <p className="muted">Junto con {otros.map(empleado => empleado.nombre).join(', ')}</p>}
        </div>
        {completada && <span className="sello-completada">✓ Completada</span>}
      </div>

      <div className="tarea-tiempos">
        <span><small>Horas-hombre estimadas{otros.length ? ' (entre todos)' : ''}</small><b>{horas(tarea.horas_hombre)}</b></span>
        <span><small>Entrega del pedido</small><b>{fecha(tarea.fecha_entrega)}</b></span>
        <span><small>{completada ? 'Terminada' : 'Empezada'}</small><b>{fecha(completada ? tarea.completado_en : tarea.iniciado_en)}</b></span>
      </div>

      {tarea.observaciones && <p className="form-note">{tarea.observaciones}</p>}

      {!completada && (
        <div className="form-actions">
          {tarea.origen === 'PEDIDO' && tarea.estado === 'PENDIENTE' && onIniciar && (
            <button type="button" className="secondary" onClick={() => onIniciar(tarea)}>Empezar</button>
          )}
          {onCerrar && <button type="button" className="primary" onClick={onCerrar}>Marcar terminada</button>}
        </div>
      )}
    </article>
  )
}

// Confirmación para no cerrar una etapa por error. Las observaciones son
// opcionales; no se pide el tiempo que llevó.
function CierreModal({ tarea, close, save }) {
  const { session } = useSession()
  const otros = companeros(tarea, session.usuario.id)
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await save(tarea, observaciones.trim()) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Terminar etapa" subtitle={`${tarea.etapa} · ${tarea.titulo}`} close={close}>
      <form onSubmit={enviar}>
        <p className="form-note">¿Terminaste <b>{tarea.etapa}</b>? Al confirmar queda como completada{otros.length ? ` también para ${otros.map(empleado => empleado.nombre).join(', ')}` : ''}{tarea.jornada ? ' y el administrador la revisa al cerrar la producción del día' : ''}.</p>

        <label>Observaciones (opcional)
          <textarea value={observaciones} onChange={event => setObservaciones(event.target.value)} placeholder="Materiales usados, inconvenientes, detalles del trabajo" />
        </label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Sí, la terminé" busy={busy} />
      </form>
    </Modal>
  )
}
