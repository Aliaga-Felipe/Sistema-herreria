import React, { useEffect, useState } from 'react'
import { api, dinero, duracion, fecha, useData } from './api.js'
import { Actions, Empty, Heading, Modal, Stat, useAviso } from './ui.jsx'

export default function PanelRecompensas() {
  const recompensas = useData('/recompensas')
  const ranking = useData('/recompensas/ranking')
  const empleados = useData('/usuarios/empleados')
  const { mostrar, nodo } = useAviso()
  const [manual, setManual] = useState(false)

  const total = recompensas.data.reduce((suma, item) => suma + Number(item.monto || 0), 0)
  const automaticas = recompensas.data.filter(item => item.automatica).length
  const minutosAhorrados = recompensas.data.reduce((suma, item) => suma + (item.minutos_ahorrados || 0), 0)

  const recargar = () => Promise.all([recompensas.load(), ranking.load()])

  const otorgar = async datos => {
    await api.post('/recompensas', datos, recompensas.token)
    setManual(false)
    await recargar()
    mostrar('Recompensa manual registrada.')
  }

  const eliminar = async recompensa => {
    if (!window.confirm('¿Eliminar esta recompensa?')) return
    try {
      await api.del(`/recompensas/${recompensa.id}`, recompensas.token)
      await recargar()
      mostrar('Recompensa eliminada.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  return (
    <>
      <Heading kicker="Sistema de semáforo" title="Recompensas" text="Cuando una etapa se cierra más rápido que lo estimado, el sistema genera el bono automáticamente.">
        <button className="primary" onClick={() => setManual(true)}>+ Bono manual</button>
      </Heading>

      {nodo}

      <section className="stats-grid dashboard-stats">
        <Stat label="Total otorgado" value={dinero(total)} />
        <Stat label="Recompensas" value={recompensas.data.length} hint={`${automaticas} automáticas`} />
        <Stat label="Tiempo ahorrado" value={duracion(minutosAhorrados)} />
        <Stat label="Empleados premiados" value={new Set(recompensas.data.map(item => item.usuario_id)).size} />
      </section>

      <ConfiguracionRecompensas onGuardar={() => mostrar('Parámetros de recompensa actualizados.')} />

      <section className="section-heading">
        <div><h2>Rendimiento por empleado</h2><p>Semáforos acumulados y bonos ganados por cada persona.</p></div>
      </section>

      {ranking.data.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head">
            <span>Empleado</span><span>Etapas</span><span>Semáforos</span><span>Promedio</span><span>Eficiencia</span><span>Ganado</span>
          </div>

          {ranking.data.map(empleado => {
            const eficiencia = empleado.minutos_estimados ? Math.round((empleado.minutos_reales / empleado.minutos_estimados) * 100) : null
            return (
              <div className="ranking-fila" key={empleado.id}>
                <b>{empleado.nombre}</b>
                <span>{empleado.completadas}</span>
                <span className="semaforo-conteo">
                  🟢 {empleado.verdes} &nbsp; 🟡 {empleado.amarillos} &nbsp; 🔴 {empleado.rojos}
                </span>
                <span>{duracion(empleado.promedio_minutos)}</span>
                <span className={eficiencia === null ? '' : eficiencia <= 100 ? 'positivo' : 'negativo'}>
                  {eficiencia === null ? '—' : `${eficiencia}%`}
                </span>
                <b>{dinero(empleado.recompensas_monto)}</b>
              </div>
            )
          })}
        </section>
      ) : (
        <p className="notice">Todavía no hay etapas completadas para medir el rendimiento.</p>
      )}

      <section className="section-heading">
        <div><h2>Historial de recompensas</h2><p>Cada bono con el detalle del tiempo comparado.</p></div>
      </section>

      {recompensas.loading ? <p>Cargando recompensas...</p> : recompensas.data.length ? (
        <section className="simple-list">
          {recompensas.data.map(recompensa => (
            <article key={recompensa.id}>
              <span className="medal">{recompensa.automatica ? '🟢' : '♛'}</span>
              <div>
                <b>{recompensa.empleado || 'Sin empleado'} · {dinero(recompensa.monto)}</b>
                <p>
                  {recompensa.motivo}
                  {recompensa.minutos_estimados ? ` (estimado ${duracion(recompensa.minutos_estimados)}, real ${duracion(recompensa.minutos_reales)})` : ''}
                  {recompensa.pedido ? ` · ${recompensa.pedido}` : ''} · {fecha(recompensa.otorgado_en)}
                </p>
              </div>
              <button className="danger-link" onClick={() => eliminar(recompensa)}>Eliminar</button>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="Todavía no se otorgaron recompensas" text="El bono aparece solo cuando un empleado cierra una etapa por debajo del tiempo estimado." />
      )}

      {manual && <BonoModal empleados={empleados.data} close={() => setManual(false)} save={otorgar} />}
    </>
  )
}

// ---------------------------------------------------------------------
// PARÁMETROS DE LA FÓRMULA (editables por el admin)
// bono = (minutos ahorrados / 60) × valor hora × factor de ahorro
// ---------------------------------------------------------------------
export function ConfiguracionRecompensas({ onGuardar }) {
  const configuracion = useData('/configuracion/valores', {})
  const [valores, setValores] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (configuracion.data?.recompensa_valor_hora) setValores(configuracion.data) }, [configuracion.data])
  if (!valores) return null

  const cambiar = clave => event => setValores({ ...valores, [clave]: event.target.type === 'checkbox' ? String(event.target.checked) : event.target.value })

  const guardar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const guardados = await api.put('/configuracion', valores, configuracion.token)
      setValores(guardados)
      onGuardar?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const tolerancia = Math.round((Number(valores.semaforo_tolerancia) || 0) * 100)
  const ejemplo = (30 / 60) * (Number(valores.recompensa_valor_hora) || 0) * (Number(valores.recompensa_factor_ahorro) || 0)

  return (
    <form className="config-card" onSubmit={guardar}>
      <div className="card-title">Cómo se calcula la recompensa</div>

      <p className="muted">
        🟢 verde: termina antes del {100 - tolerancia}% del tiempo estimado · 🟡 amarillo: entre {100 - tolerancia}% y {100 + tolerancia}% ·
        🔴 rojo: se pasa del {100 + tolerancia}%. El bono se paga solo en verde y es proporcional al tiempo ahorrado.
      </p>

      <div className="form-grid config-grid">
        <label>Valor de la hora de taller
          <input min="0" step="0.01" type="number" value={valores.recompensa_valor_hora} onChange={cambiar('recompensa_valor_hora')} />
        </label>

        <label>Factor sobre el ahorro (0 a 1)
          <input min="0" max="1" step="0.05" type="number" value={valores.recompensa_factor_ahorro} onChange={cambiar('recompensa_factor_ahorro')} />
        </label>

        <label>Bono mínimo en verde
          <input min="0" step="0.01" type="number" value={valores.recompensa_bono_minimo} onChange={cambiar('recompensa_bono_minimo')} />
        </label>

        <label>Tolerancia del semáforo (0.1 = 10%)
          <input min="0" max="1" step="0.01" type="number" value={valores.semaforo_tolerancia} onChange={cambiar('semaforo_tolerancia')} />
        </label>
      </div>

      <label className="config-check">
        <input type="checkbox" checked={String(valores.recompensa_activa) === 'true'} onChange={cambiar('recompensa_activa')} />
        Generar recompensas automáticamente al cerrar una etapa en verde
      </label>

      <p className="form-note">Ejemplo: ahorrar 30 minutos paga <b>{dinero(ejemplo)}</b>.</p>

      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? 'Guardando...' : 'Guardar parámetros'}</button>
      </div>
    </form>
  )
}

function BonoModal({ empleados, close, save }) {
  const [usuario, setUsuario] = useState('')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await save({ usuario_id: usuario, monto: Number(monto), motivo }) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Bono manual" subtitle="Reconocimiento fuera del cálculo automático del semáforo." close={close}>
      <form onSubmit={enviar}>
        <label>Empleado
          <select required value={usuario} onChange={event => setUsuario(event.target.value)}>
            <option value="">Seleccionar empleado</option>
            {empleados.map(empleado => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
          </select>
        </label>

        <label>Monto<input required min="1" step="0.01" type="number" value={monto} onChange={event => setMonto(event.target.value)} /></label>
        <label>Motivo<textarea required value={motivo} onChange={event => setMotivo(event.target.value)} placeholder="Por qué se otorga este bono" /></label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Otorgar bono" busy={busy} />
      </form>
    </Modal>
  )
}

// Barra comparativa de semáforos reutilizada por el panel de estadísticas.
export const BarraSemaforo = ({ verdes, amarillos, rojos }) => {
  const total = verdes + amarillos + rojos
  if (!total) return <p className="muted">Sin etapas medidas todavía.</p>
  return (
    <div className="barra-semaforo">
      <div className="barra">
        <i className="verde" style={{ width: `${(verdes / total) * 100}%` }} />
        <i className="amarillo" style={{ width: `${(amarillos / total) * 100}%` }} />
        <i className="rojo" style={{ width: `${(rojos / total) * 100}%` }} />
      </div>
      <p className="muted">🟢 {verdes} &nbsp; 🟡 {amarillos} &nbsp; 🔴 {rojos}</p>
    </div>
  )
}
