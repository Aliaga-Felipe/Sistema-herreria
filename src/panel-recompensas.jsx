import React, { useEffect, useState } from 'react'
import { api, dinero, fecha, fechaDia, horas, hoyLocal, useData } from './api.js'
import { Badge, CampoNumero, Empty, Heading, Stat, useAviso } from './ui.jsx'

// ---------------------------------------------------------------------
// RECOMPENSA DEL EQUIPO
// Un único monto por día para todo el taller (ver server/recompensa-equipo.js):
//   propuesto  = Σ horas-hombre de las etapas propuestas en Producción diaria
//   recompensa = propuesto × valor hora-hombre × % de premio, cuando el admin
//                marca la producción del día como terminada con todas las
//                etapas completadas; si falta alguna, 0
// El trabajo del día se arma y se cierra en Producción diaria; acá se ve el
// resultado y se definen el valor de la hora-hombre y el % de premio.
// ---------------------------------------------------------------------
export default function PanelRecompensas() {
  const [dia, setDia] = useState(hoyLocal())
  const jornada = useData(`/recompensas/equipo/dia/${dia}`, null)
  const historial = useData('/recompensas/equipo')
  const { mostrar, nodo } = useAviso()

  const recargar = () => Promise.all([jornada.load(), historial.load()])

  return (
    <>
      <Heading kicker="Trabajo en equipo" title="Recompensa del equipo" text="Un único premio por día para todo el taller: las horas-hombre de la producción propuesta, cuando se completa todo y el administrador la da por terminada.">
        <label className="rango">Día<input type="date" value={dia} onChange={event => event.target.value && setDia(event.target.value)} /></label>
      </Heading>

      {nodo}

      {jornada.loading && !jornada.data ? <p>Cargando el día...</p> : jornada.error ? <p className="form-error">{jornada.error}</p> : jornada.data && (
        <DesgloseDia jornada={jornada.data} />
      )}

      <ParametrosRecompensa onGuardar={async () => { await recargar(); mostrar('Valor hora y % de premio actualizados. Rigen desde hoy.') }} />

      <section className="section-heading">
        <div><h2>Historial de días</h2><p>Cada día con producción propuesta. Los terminados muestran la recompensa que se pagó; los abiertos, cómo vienen. Tocá un día para ver su desglose.</p></div>
      </section>

      {historial.loading ? <p>Cargando historial...</p> : historial.data.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head jornada-head">
            <span>Día</span><span>Propuesto</span><span>Completado</span><span>Resultado</span><span>Valor hora · premio</span><span>Recompensa</span>
          </div>
          {historial.data.map(fila => (
            <div className="ranking-fila jornada-fila" key={fila.fecha} role="button" tabIndex={0} onClick={() => setDia(fila.fecha)} onKeyDown={event => event.key === 'Enter' && setDia(fila.fecha)}>
              <b>{fechaDia(fila.fecha)}</b>
              <span>{horas(fila.objetivo_horas)}</span>
              <span>{horas(fila.horas_completadas)}</span>
              {fila.estado === 'ABIERTA'
                ? <span className="muted">{fila.cumplido ? 'Falta verificar' : 'En curso'}</span>
                : fila.cumplido
                  ? <span className="positivo">✅ Cumplido</span>
                  : <span className="negativo">{fila.objetivo_horas > 0 ? `Faltaron ${horas(fila.objetivo_horas - fila.horas_completadas)}` : 'Sin objetivo'}</span>}
              <span>{dinero(fila.valor_hora)} · {fila.porcentaje_premio}%</span>
              <b className={fila.recompensa > 0 ? 'positivo' : ''}>{fila.estado === 'ABIERTA' ? '—' : dinero(fila.recompensa)}</b>
            </div>
          ))}
        </section>
      ) : (
        <Empty title="Todavía no hay días con producción" text="Proponé el trabajo del día en Producción diaria." />
      )}

      <HistorialIndividual />
    </>
  )
}

// Propuesto, completado, resultado y recompensa del día, con el detalle
// de las etapas. Los días del sistema anterior muestran sus objetivos y su
// producción por producto.
function DesgloseDia({ jornada }) {
  const terminada = jornada.estado === 'TERMINADA'
  const formula = `${horas(jornada.objetivo_horas)} × ${dinero(jornada.valor_hora)} × ${jornada.porcentaje_premio}%`
  const resultado = jornada.estado === 'SIN_PLANIFICAR' ? 'Sin producción'
    : terminada ? (jornada.cumplido ? '✅ Cumplido' : 'No cumplido')
      : jornada.cumplido ? 'Falta verificar' : 'En curso'

  return (
    <>
      <section className="stats-grid dashboard-stats">
        <Stat label="Propuesto" value={horas(jornada.objetivo_horas)} hint={jornada.modelo === 'productos' ? 'Objetivos por producto (sistema anterior)' : `${jornada.etapas_totales} etapas de pedidos`} tone={jornada.objetivo_horas ? '' : 'danger'} />
        <Stat label="Completado" value={horas(jornada.horas_completadas)} hint={`${jornada.avance}% de lo propuesto`} />
        <Stat
          label="Resultado"
          value={resultado}
          tone={terminada && !jornada.cumplido ? 'danger' : ''}
          hint={terminada ? `Terminada${jornada.terminada_por ? ` por ${jornada.terminada_por}` : ''}${jornada.terminada_en ? ` el ${fecha(jornada.terminada_en)}` : ''}` : jornada.estado === 'ABIERTA' ? 'Se cierra en Producción diaria' : 'Proponé trabajo en Producción diaria'}
        />
        <Stat label={terminada ? 'Recompensa del equipo' : 'Recompensa al completar'} value={dinero(terminada ? jornada.recompensa : jornada.recompensa_al_cumplir)} hint={formula} />
      </section>

      {!terminada && jornada.estado !== 'SIN_PLANIFICAR' && jornada.advertencias.map(texto => <p className="notice" key={texto}>⚠ {texto}</p>)}

      {jornada.modelo === 'productos' ? <DesgloseAnterior jornada={jornada} /> : jornada.etapas.length > 0 && (
        <>
          <section className="section-heading">
            <div>
              <h2>Producción del {fechaDia(jornada.fecha)}</h2>
              <p>{terminada ? 'Copia guardada al terminar el día: ya no cambia aunque después se editen los pedidos.' : 'Se arma y se cierra en Producción diaria.'}</p>
            </div>
          </section>
          <section className="ranking-tabla">
            <div className="ranking-head etapas-jornada-head">
              <span>Pedido</span><span>Producto · etapa</span><span>Empleado</span><span>Horas-hombre</span><span>Estado</span>
            </div>
            {jornada.etapas.map(etapa => (
              <div className="ranking-fila etapas-jornada-fila" key={etapa.id}>
                <span>{etapa.pedido}</span>
                <b>{etapa.producto} · {etapa.nombre}</b>
                <span>{etapa.responsable || 'Sin asignar'}</span>
                <span>{horas(etapa.horas_hombre)}</span>
                <Badge estado={etapa.estado} />
              </div>
            ))}
          </section>
        </>
      )}
    </>
  )
}

// Día cargado con el sistema anterior: objetivos diarios por producto y
// unidades producidas.
function DesgloseAnterior({ jornada }) {
  return (
    <>
      <section className="section-heading">
        <div><h2>Objetivo del {fechaDia(jornada.fecha)} (sistema anterior)</h2><p>Objetivos diarios por producto con los que se calculó este día.</p></div>
      </section>
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
