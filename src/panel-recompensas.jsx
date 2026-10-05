import React, { useEffect, useState } from 'react'
import { api, dinero, fecha, fechaDia, horas, useData } from './api.js'
import { CampoNumero, Heading, Stat, useAviso } from './ui.jsx'

// ---------------------------------------------------------------------
// RECOMPENSA DEL EQUIPO
// Un único monto por día para todo el taller (ver server/recompensa-equipo.js):
//   propuesto  = Σ horas-hombre de las etapas propuestas en Producción diaria
//   recompensa = propuesto × valor hora-hombre × % de premio, cuando el admin
//                marca la producción del día como terminada con todas las
//                etapas completadas; si falta alguna, 0
// Acá se ve cuánto cobró el equipo (hoy, este mes y en total) y se definen
// el valor de la hora-hombre y el % de premio. El desglose de cada día y el
// historial de días están en Producción diaria.
// ---------------------------------------------------------------------
export default function PanelRecompensas({ ir }) {
  const resumen = useData('/recompensas/resumen', null)
  const { mostrar, nodo } = useAviso()
  const datos = resumen.data

  return (
    <>
      <Heading kicker="Trabajo en equipo" title="Recompensa del equipo" text="Un único premio por día para todo el taller: las horas-hombre de la producción propuesta, cuando se completa todo y el administrador la da por terminada. El detalle de cada día está en Producción diaria.">
        {ir && <button className="secondary" onClick={() => ir('Producción diaria')}>Ver los días en Producción diaria</button>}
      </Heading>

      {nodo}

      {resumen.loading && !datos ? <p>Cargando el resumen...</p> : resumen.error ? <p className="form-error">{resumen.error}</p> : datos && (
        <section className="stats-grid dashboard-stats">
          <ResumenHoy hoy={datos.hoy} />
          <Stat label="Pagado este mes" value={dinero(datos.mes.monto)} hint={`${datos.mes.cumplidos} de ${datos.mes.terminados} ${datos.mes.terminados === 1 ? 'día terminado cumplido' : 'días terminados cumplidos'}`} />
          <Stat label="Pagado en total" value={dinero(datos.total.monto)} hint={`${datos.total.cumplidos} ${datos.total.cumplidos === 1 ? 'día cumplido' : 'días cumplidos'} desde el inicio`} />
        </section>
      )}

      <ParametrosRecompensa onGuardar={async () => { await resumen.load(); mostrar('Valor hora y % de premio actualizados. Rigen desde hoy.') }} />

      <HistorialIndividual />
    </>
  )
}

// La recompensa de hoy: en juego mientras el día está abierto, pagada (o
// no) cuando el admin lo termina.
function ResumenHoy({ hoy }) {
  if (hoy.estado === 'SIN_PLANIFICAR') return <Stat label="Hoy" value="Sin producción" hint={`Proponé el trabajo del ${fechaDia(hoy.fecha)} en Producción diaria`} tone="danger" />
  if (hoy.estado === 'TERMINADA') {
    return <Stat label="Hoy" value={dinero(hoy.recompensa)} hint={hoy.cumplido ? '✅ Producción cumplida y pagada' : 'Producción terminada sin completar'} tone={hoy.cumplido ? '' : 'danger'} />
  }
  return <Stat label="Hoy, al completar" value={dinero(hoy.recompensa_al_cumplir)} hint={`${hoy.avance}% · ${horas(hoy.horas_completadas)} de ${horas(hoy.objetivo_horas)}${hoy.cumplido ? ' · falta verificar' : ''}`} />
}

// ---------------------------------------------------------------------
// VALOR HORA-HOMBRE Y % DE PREMIO (solo administradores)
// Cada cambio queda en el historial y rige desde hoy: los días ya
// terminados conservan el valor con el que se cerraron.
// ---------------------------------------------------------------------
function ParametrosRecompensa({ onGuardar }) {
  const parametros = useData('/recompensas/parametros', null)
  const [valores, setValores] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (parametros.data?.vigente) setValores(parametros.data.vigente) }, [parametros.data])
  if (!valores) return null

  const guardar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await api.put('/recompensas/parametros', { valor_hora: Number(valores.valor_hora), porcentaje_premio: Number(valores.porcentaje_premio) }, parametros.token)
      await parametros.load()
      await onGuardar?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const ejemplo = 16 * (Number(valores.valor_hora) || 0) * ((Number(valores.porcentaje_premio) || 0) / 100)

  return (
    <form className="config-card" onSubmit={guardar}>
      <div className="card-title">Cómo se calcula la recompensa</div>
      <p className="muted">
        Cada etapa de un pedido vale las horas-hombre que se le estimaron al crear el pedido. Si se completan todas las etapas propuestas en la
        Producción diaria y el administrador la da por terminada, el equipo cobra: horas-hombre propuestas × valor de la hora-hombre × % de premio.
        Si falta alguna etapa, la recompensa del día es 0.
      </p>

      <div className="form-grid config-grid">
        <label>Valor de la hora-hombre
          <CampoNumero min="0" step="0.01" value={valores.valor_hora} onChange={valor => setValores({ ...valores, valor_hora: valor })} />
        </label>
        <label>% de premio (0 a 100)
          <CampoNumero min="0" max="100" step="1" value={valores.porcentaje_premio} onChange={valor => setValores({ ...valores, porcentaje_premio: valor })} />
        </label>
      </div>

      <p className="form-note">Ejemplo: completar una producción diaria de 16 hs-hombre (4 sillas de 4 hs) paga <b>{dinero(ejemplo)}</b> al equipo.</p>

      {parametros.data?.historial?.length > 1 && (
        <details>
          <summary className="muted">Historial de cambios ({parametros.data.historial.length})</summary>
          <ul className="muted">
            {parametros.data.historial.map(cambio => (
              <li key={cambio.id}>
                Desde {fechaDia(cambio.vigente_desde)}: {dinero(cambio.valor_hora)} por hora · {cambio.porcentaje_premio}% de premio
                {cambio.creado_por ? ` · ${cambio.creado_por}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? 'Guardando...' : 'Guardar parámetros'}</button>
      </div>
    </form>
  )
}

// Bonos individuales del sistema anterior: solo lectura, como referencia.
function HistorialIndividual() {
  const anteriores = useData('/recompensas/historial-individual')
  if (!anteriores.data.length) return null
  const total = anteriores.data.reduce((suma, item) => suma + Number(item.monto || 0), 0)

  return (
    <details className="config-card">
      <summary className="card-title">Historial anterior: bonos individuales ({anteriores.data.length} · {dinero(total)})</summary>
      <p className="muted">Bonos por etapa y manuales del sistema anterior. Ya no se generan; se conservan como registro y siguen contando como gasto.</p>
      <section className="simple-list">
        {anteriores.data.map(recompensa => (
          <article key={recompensa.id}>
            <span className="medal">{recompensa.automatica ? '🟢' : '♛'}</span>
            <div>
              <b>{recompensa.empleado || 'Sin empleado'} · {dinero(recompensa.monto)}</b>
              <p>{recompensa.motivo}{recompensa.pedido ? ` · ${recompensa.pedido}` : ''} · {fecha(recompensa.otorgado_en)}</p>
            </div>
          </article>
        ))}
      </section>
    </details>
  )
}
