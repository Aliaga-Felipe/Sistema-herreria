import React, { useEffect, useState } from 'react'
import { api, dinero, fecha, useData } from './api.js'
import { CampoNumero, Empty, Heading, Stat, useAviso } from './ui.jsx'

// Fecha local en formato AAAA-MM-DD (toISOString daría el día siguiente
// a la noche en Argentina).
export const hoyLocal = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

// "2026-09-30" → "30/09/2026" sin pasar por Date (evita el corrimiento de zona horaria).
export const fechaDia = texto => (texto ? String(texto).slice(0, 10).split('-').reverse().join('/') : '—')

export const horas = valor => `${Number(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })} hs`

// ---------------------------------------------------------------------
// RECOMPENSA DEL EQUIPO
// Un único monto por día para todo el taller (ver server/recompensa-equipo.js):
//   excedente = horas producidas equivalentes − objetivo del día
//   recompensa = excedente × valor hora-hombre × % de premio
// Las horas de cada empleado y la producción se cargan en Producción diaria.
// ---------------------------------------------------------------------
export default function PanelRecompensas() {
  const [dia, setDia] = useState(hoyLocal())
  const jornada = useData(`/recompensas/equipo/dia/${dia}`, null)
  const historial = useData('/recompensas/equipo')
  const { mostrar, nodo } = useAviso()

  const recargar = () => Promise.all([jornada.load(), historial.load()])

  return (
    <>
      <Heading kicker="Trabajo en equipo" title="Recompensa del equipo" text="Un único premio por día para todo el taller, cuando lo producido (en horas-hombre estándar) supera el objetivo del día.">
        <label className="rango">Día<input type="date" max={hoyLocal()} value={dia} onChange={event => event.target.value && setDia(event.target.value)} /></label>
      </Heading>

      {nodo}

      {jornada.loading && !jornada.data ? <p>Cargando el día...</p> : jornada.error ? <p className="form-error">{jornada.error}</p> : jornada.data && (
        <>
          <DesgloseDia jornada={jornada.data} />
          <ObjetivoDia
            jornada={jornada.data}
            token={jornada.token}
            onGuardar={async texto => { await recargar(); mostrar(texto) }}
          />
        </>
      )}

      <ParametrosRecompensa onGuardar={async () => { await recargar(); mostrar('Valor hora y % de premio actualizados. Rigen desde hoy.') }} />

      <section className="section-heading">
        <div><h2>Historial de días</h2><p>Resultado guardado de cada día con horas o producción cargadas. Tocá un día para ver su desglose.</p></div>
      </section>

      {historial.loading ? <p>Cargando historial...</p> : historial.data.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head jornada-head">
            <span>Día</span><span>Horas totales</span><span>Objetivo</span><span>Producido</span><span>Excedente</span><span>Valor hora · premio</span><span>Recompensa</span>
          </div>
          {historial.data.map(fila => (
            <div className="ranking-fila jornada-fila" key={fila.fecha} role="button" tabIndex={0} onClick={() => setDia(fila.fecha)} onKeyDown={event => event.key === 'Enter' && setDia(fila.fecha)}>
              <b>{fechaDia(fila.fecha)}</b>
              <span>{horas(fila.horas_totales)}</span>
              <span>{horas(fila.objetivo_horas)}{fila.objetivo_manual ? ' ✎' : ''}</span>
              <span>{horas(fila.horas_producidas)}</span>
              <span className={fila.excedente_horas > 0 ? 'positivo' : fila.excedente_horas < 0 ? 'negativo' : ''}>{horas(fila.excedente_horas)}</span>
              <span>{dinero(fila.valor_hora)} · {fila.porcentaje_premio}%</span>
              <b className={fila.recompensa > 0 ? 'positivo' : ''}>{dinero(fila.recompensa)}</b>
            </div>
          ))}
        </section>
      ) : (
        <Empty title="Todavía no hay días calculados" text="Cargá las horas del equipo y la producción del día en Producción diaria." />
      )}

      <HistorialIndividual />
    </>
  )
}

// Horas totales, objetivo, producido, excedente y recompensa del día.
function DesgloseDia({ jornada }) {
  const formula = jornada.supera
    ? `${horas(jornada.excedente_horas)} × ${dinero(jornada.valor_hora)} × ${jornada.porcentaje_premio}%`
    : 'No se superó el objetivo'

  return (
    <>
      <section className="stats-grid dashboard-stats">
        <Stat label="Horas totales" value={horas(jornada.horas_totales)} hint={`${jornada.empleados.length} ${jornada.empleados.length === 1 ? 'empleado' : 'empleados'}`} />
        <Stat label="Objetivo" value={horas(jornada.objetivo_horas)} hint={jornada.objetivo_manual ? 'Fijado por el administrador' : 'Sugerido: igual a las horas totales'} />
        <Stat label="Producido" value={horas(jornada.horas_producidas)} hint="En horas-hombre estándar" />
        <Stat label="Excedente" value={horas(jornada.excedente_horas)} tone={jornada.excedente_horas < 0 ? 'danger' : ''} hint={jornada.cumplido ? 'Objetivo cumplido' : 'Objetivo no cumplido'} />
        <Stat label="Recompensa del equipo" value={dinero(jornada.recompensa)} hint={formula} />
      </section>

      {jornada.advertencias.map(texto => <p className="notice" key={texto}>⚠ {texto}</p>)}

      <section className="section-heading">
        <div>
          <h2>Desglose del {fechaDia(jornada.fecha)}</h2>
          <p>
            Horas por empleado: {jornada.empleados.length
              ? jornada.empleados.map(empleado => `${empleado.nombre} ${horas(empleado.horas)}`).join(' · ')
              : 'sin cargar'} (se cargan en Producción diaria).
          </p>
        </div>
      </section>

      {jornada.produccion.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head produccion-head">
            <span>Producto</span><span>Unidades</span><span>Tiempo estándar</span><span>Horas equivalentes</span><span>Objetivo en unidades</span>
          </div>
          {jornada.produccion.map(fila => (
            <div className="ranking-fila produccion-fila" key={fila.producto_id}>
              <b>{fila.producto}</b>
              <span>{fila.cantidad}</span>
              <span className={fila.tiempo_estandar ? '' : 'negativo'}>{fila.tiempo_estandar ? horas(fila.tiempo_estandar) : 'Sin tiempo estándar'}</span>
              <span>{horas(fila.horas_equivalentes)}</span>
              <span>{fila.objetivo_unidades === null ? '—' : fila.objetivo_unidades.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
            </div>
          ))}
        </section>
      ) : <p className="notice">No hay producción registrada este día.</p>}
    </>
  )
}

// ---------------------------------------------------------------------
// OBJETIVO DEL DÍA (solo administradores: la API lo valida)
// Se guarda en horas estándar. Para pensarlo en unidades ("4 sillas"),
// se elige un producto de referencia y la cantidad, y se convierte con
// sus horas-hombre.
// ---------------------------------------------------------------------
function ObjetivoDia({ jornada, token, onGuardar }) {
  const productos = useData('/productos?activos=true')
  const [objetivo, setObjetivo] = useState('')
  const [referencia, setReferencia] = useState('')
  const [unidades, setUnidades] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setObjetivo(jornada.objetivo_horas); setUnidades(''); setError('') }, [jornada.fecha, jornada.objetivo_horas])

  const conTiempo = productos.data.filter(producto => Number(producto.horas_hombre) > 0)
  const productoReferencia = conTiempo.find(producto => String(producto.id) === String(referencia))

  const cambiarUnidades = valor => {
    setUnidades(valor)
    if (productoReferencia && valor !== '') setObjetivo(Math.round(Number(valor) * Number(productoReferencia.horas_hombre) * 100) / 100)
  }

  const enviar = async cuerpo => {
    setBusy(true); setError('')
    try {
      await api.put(`/recompensas/equipo/dia/${jornada.fecha}/objetivo`, cuerpo, token)
      await onGuardar(cuerpo.automatico ? 'El objetivo volvió al sugerido.' : 'Objetivo del día guardado.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const guardar = event => {
    event.preventDefault()
    if (objetivo === '' || Number(objetivo) < 0) return setError('Indicá el objetivo en horas (0 o más).')
    enviar({ objetivo_horas: Number(objetivo) })
  }

  const sugeridoEnUnidades = productoReferencia
    ? ` (${(jornada.objetivo_sugerido / Number(productoReferencia.horas_hombre)).toLocaleString('es-AR', { maximumFractionDigits: 2 })} × ${productoReferencia.nombre})`
    : ''

  return (
    <form className="config-card" onSubmit={guardar}>
      <div className="card-title">Objetivo del {fechaDia(jornada.fecha)}</div>
      <p className="muted">
        Sugerido: {horas(jornada.objetivo_sugerido)}{sugeridoEnUnidades}, igual a las horas trabajadas por el equipo.
        {jornada.objetivo_manual ? ' Hoy rige un objetivo fijado a mano.' : ' Hoy rige el sugerido.'} El objetivo queda guardado en este día.
      </p>

      <div className="form-grid config-grid">
        <label>Producto de referencia (opcional)
          <select value={referencia} onChange={event => { setReferencia(event.target.value); setUnidades('') }}>
            <option value="">Cargar directo en horas</option>
            {conTiempo.map(producto => <option key={producto.id} value={producto.id}>{producto.nombre} ({horas(producto.horas_hombre)})</option>)}
          </select>
        </label>

        {productoReferencia && (
          <label>Unidades de {productoReferencia.nombre}
            <CampoNumero min="0" step="1" value={unidades} onChange={cambiarUnidades} placeholder="Ej. 4" />
          </label>
        )}

        <label>Objetivo en horas estándar
          <CampoNumero min="0" step="0.5" value={objetivo} onChange={valor => { setObjetivo(valor); setUnidades('') }} />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        {jornada.objetivo_manual && <button type="button" className="secondary" disabled={busy} onClick={() => enviar({ automatico: true })}>Usar el sugerido</button>}
        <button className="primary" disabled={busy}>{busy ? 'Guardando...' : 'Fijar objetivo'}</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// VALOR HORA-HOMBRE Y % DE PREMIO (solo administradores)
// Cada cambio queda en el historial y rige desde hoy: los días anteriores
// conservan el valor que tenían.
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

  const ejemplo = 4 * (Number(valores.valor_hora) || 0) * ((Number(valores.porcentaje_premio) || 0) / 100)

  return (
    <form className="config-card" onSubmit={guardar}>
      <div className="card-title">Cómo se calcula la recompensa</div>
      <p className="muted">
        Cada producto vale sus horas-hombre (tiempo estándar, se edita en Productos). Si lo producido en el día supera el objetivo,
        el equipo cobra: excedente en horas × valor de la hora-hombre × % de premio. Si no lo supera, la recompensa es 0.
      </p>

      <div className="form-grid config-grid">
        <label>Valor de la hora-hombre
          <CampoNumero min="0" step="0.01" value={valores.valor_hora} onChange={valor => setValores({ ...valores, valor_hora: valor })} />
        </label>
        <label>% de premio (0 a 100)
          <CampoNumero min="0" max="100" step="1" value={valores.porcentaje_premio} onChange={valor => setValores({ ...valores, porcentaje_premio: valor })} />
        </label>
      </div>

      <p className="form-note">Ejemplo: superar el objetivo por 4 hs paga <b>{dinero(ejemplo)}</b> al equipo.</p>

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

// ---------------------------------------------------------------------
// TOLERANCIA DEL SEMÁFORO (Configuración, super_admin)
// El semáforo quedó como indicador de tiempos: ya no genera recompensas.
// ---------------------------------------------------------------------
export function ConfiguracionSemaforo({ onGuardar }) {
  const configuracion = useData('/configuracion/valores', {})
  const [tolerancia, setTolerancia] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (configuracion.data?.semaforo_tolerancia !== undefined) setTolerancia(configuracion.data.semaforo_tolerancia) }, [configuracion.data])
  if (tolerancia === null) return null

  const guardar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const guardados = await api.put('/configuracion', { semaforo_tolerancia: tolerancia }, configuracion.token)
      setTolerancia(guardados.semaforo_tolerancia)
      onGuardar?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const porcentajeTolerancia = Math.round((Number(tolerancia) || 0) * 100)

  return (
    <form className="config-card" onSubmit={guardar}>
      <div className="card-title">Semáforo de rendimiento</div>
      <p className="muted">
        🟢 verde: termina antes del {100 - porcentajeTolerancia}% del tiempo estimado · 🟡 amarillo: entre {100 - porcentajeTolerancia}% y {100 + porcentajeTolerancia}% ·
        🔴 rojo: se pasa del {100 + porcentajeTolerancia}%. Es un indicador de tiempos; la recompensa es por equipo (ver Recompensas).
      </p>
      <div className="form-grid config-grid">
        <label>Tolerancia del semáforo (0.1 = 10%)
          <input min="0" max="1" step="0.01" type="number" value={tolerancia} onChange={event => setTolerancia(event.target.value)} />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </form>
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
