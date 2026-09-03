import React, { useState } from 'react'
import { api, dinero, duracion, useData, useSession } from './api.js'
import { Actions, Badge, Empty, Heading, Modal, Semaforo, Stat, semaforos, useAviso } from './ui.jsx'

export default function MisTareas() {
  const { session } = useSession()
  const tareas = useData('/tareas/asignadas/mias')
  const recompensas = useData('/recompensas')
  const { mostrar, nodo } = useAviso()
  const [cerrando, setCerrando] = useState(null)
  const [resultado, setResultado] = useState(null)

  const pendientes = tareas.data.filter(tarea => tarea.estado !== 'COMPLETADA')
  const completadas = tareas.data.filter(tarea => tarea.estado === 'COMPLETADA')
  const acumulado = recompensas.data.reduce((total, recompensa) => total + Number(recompensa.monto || 0), 0)

  const iniciar = async tarea => {
    try {
      await api.patch(`/tareas/asignadas/${tarea.origen}/${tarea.id}/iniciar`, {}, tareas.token)
      await tareas.load()
      mostrar('Etapa iniciada. El tiempo lo informás al terminarla.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const completar = async (tarea, minutos, observaciones) => {
    const respuesta = await api.patch(`/tareas/asignadas/${tarea.origen}/${tarea.id}/completar`, { minutos_reales: Number(minutos), observaciones }, tareas.token)
    setCerrando(null)
    setResultado({ ...respuesta, tarea })
    await Promise.all([tareas.load(), recompensas.load()])
  }

  return (
    <>
      <Heading
        kicker={`Hola, ${session.usuario.nombre.split(' ')[0]}`}
        title="Mis tareas"
        text="Trabajá cada etapa asignada y, al terminarla, informá cuánto tiempo te llevó."
      />

      {nodo}

      <section className="stats-grid dashboard-stats">
        <Stat label="Tareas pendientes" value={pendientes.length} />
        <Stat label="Completadas" value={completadas.length} />
        <Stat label="🟢 Más rápido" value={completadas.filter(tarea => tarea.semaforo === 'VERDE').length} />
        <Stat label="🟡 En promedio" value={completadas.filter(tarea => tarea.semaforo === 'AMARILLO').length} />
        <Stat label="Recompensas ganadas" value={dinero(acumulado)} />
      </section>

      {tareas.loading ? <p>Cargando tus tareas...</p> : tareas.error ? <p className="form-error">{tareas.error}</p> : (
        <>
          <section className="section-heading">
            <div><h2>Pendientes</h2><p>Etapas asignadas que todavía no cerraste.</p></div>
          </section>

          {pendientes.length ? (
            <div className="task-list">
              {pendientes.map(tarea => (
                <TarjetaTarea key={`${tarea.origen}-${tarea.id}`} tarea={tarea} onIniciar={iniciar} onCerrar={() => setCerrando(tarea)} />
              ))}
            </div>
          ) : (
            <Empty title="No tenés tareas pendientes" text="Cuando el administrador te asigne una etapa de un pedido, va a aparecer acá." />
          )}

          {completadas.length > 0 && (
            <>
              <section className="section-heading">
                <div><h2>Historial</h2><p>Etapas cerradas y su resultado en el semáforo.</p></div>
              </section>

              <div className="task-list">
                {completadas.map(tarea => (
                  <TarjetaTarea key={`${tarea.origen}-${tarea.id}`} tarea={tarea} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {cerrando && <CierreModal tarea={cerrando} close={() => setCerrando(null)} save={completar} />}
      {resultado && <ResultadoModal resultado={resultado} close={() => setResultado(null)} />}
    </>
  )
}

function TarjetaTarea({ tarea, onIniciar, onCerrar }) {
  const completada = tarea.estado === 'COMPLETADA'
  return (
    <article className={`task-card tarea-asignada ${completada ? 'completada' : ''}`}>
      <div className="task-card-head">
        <div>
          <Badge estado={tarea.estado} />
          <h3>{tarea.etapa}</h3>
          <p>{tarea.titulo} · {tarea.referencia}</p>
        </div>
        <span className="assigned">{tarea.cliente}</span>
      </div>

      <div className="tarea-tiempos">
        <span><small>Tiempo estimado</small><b>{duracion(tarea.minutos_estimados)}</b></span>
        <span><small>Tiempo real</small><b>{tarea.minutos_reales ? duracion(tarea.minutos_reales) : '—'}</b></span>
        <span><small>Resultado</small><b><Semaforo valor={tarea.semaforo} /></b></span>
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

// Al terminar, el empleado informa el tiempo real: es lo que alimenta el semáforo.
function CierreModal({ tarea, close, save }) {
  const [minutos, setMinutos] = useState('')
  const [horas, setHoras] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const total = (Number(horas) || 0) * 60 + (Number(minutos) || 0)

  const enviar = async event => {
    event.preventDefault()
    if (total <= 0) return setError('Indicá cuánto tiempo te llevó la etapa.')
    setBusy(true); setError('')
    try { await save(tarea, total, observaciones) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Terminar etapa" subtitle={`${tarea.etapa} · ${tarea.titulo}`} close={close}>
      <form onSubmit={enviar}>
        <p className="form-note">Tiempo estimado por el administrador: <b>{duracion(tarea.minutos_estimados)}</b>.</p>

        <div className="form-grid">
          <label>Horas<input min="0" type="number" value={horas} onChange={event => setHoras(event.target.value)} placeholder="0" /></label>
          <label>Minutos<input min="0" max="59" type="number" value={minutos} onChange={event => setMinutos(event.target.value)} placeholder="0" /></label>
        </div>

        {total > 0 && (
          <p className="form-note">
            Vas a informar <b>{duracion(total)}</b>.{' '}
            {total < tarea.minutos_estimados
              ? `Ahorrás ${duracion(tarea.minutos_estimados - total)} respecto de lo estimado.`
              : total > tarea.minutos_estimados
                ? `Te pasás ${duracion(total - tarea.minutos_estimados)} de lo estimado.`
                : 'Coincide con lo estimado.'}
          </p>
        )}

        <label>Observaciones
          <textarea value={observaciones} onChange={event => setObservaciones(event.target.value)} placeholder="Materiales usados, inconvenientes, detalles del trabajo" />
        </label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Confirmar y cerrar etapa" busy={busy} />
      </form>
    </Modal>
  )
}

function ResultadoModal({ resultado, close }) {
  const dato = semaforos[resultado.semaforo] || { icono: '⚪', texto: 'Sin comparación de tiempos' }
  return (
    <Modal title="Etapa cerrada" close={close}>
      <section className={`resultado-semaforo ${String(resultado.semaforo || '').toLowerCase()}`}>
        <span className="resultado-icono">{dato.icono}</span>
        <b>{dato.texto}</b>
        <p>
          Estimado {duracion(resultado.minutos_estimados)} · Real {duracion(resultado.minutos_reales)}
          {resultado.minutos_ahorrados > 0 ? ` · Ahorro ${duracion(resultado.minutos_ahorrados)}` : ''}
        </p>
      </section>

      {resultado.recompensa ? (
        <p className="notice">🏆 Ganaste una recompensa de <b>{dinero(resultado.recompensa.monto)}</b> por terminar antes de lo estimado.</p>
      ) : (
        <p className="form-note">Esta etapa no genera recompensa. El bono se paga cuando terminás por debajo del tiempo estimado.</p>
      )}

      <div className="form-actions">
        <button type="button" className="primary" onClick={close}>Listo</button>
      </div>
    </Modal>
  )
}
