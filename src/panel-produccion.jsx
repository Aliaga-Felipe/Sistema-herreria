import React, { useEffect, useMemo, useState } from 'react'
import { api, dinero, fecha, useData } from './api.js'
import { Badge, Empty, Heading, Stat, useAviso } from './ui.jsx'
import { horas, hoyLocal } from './panel-recompensas.jsx'

export default function PanelProduccion() {
  const hoy = hoyLocal()
  const pedidos = useData('/pedidos')
  const etapasDia = useData(`/produccion/etapas-diarias?fecha=${hoy}`)
  const jornada = useData(`/recompensas/equipo/dia/${hoy}`, null)
  const { mostrar, nodo } = useAviso()
  const [seleccion, setSeleccion] = useState({})
  const [busy, setBusy] = useState(false)
  const etapas = etapasDia.data || []

  useEffect(() => {
    const valores = {}
    for (const fila of etapas) if (fila.horas_hombre) valores[fila.etapa_id] = String(fila.horas_hombre)
    setSeleccion(valores)
  }, [etapasDia.data])

  const totalHoras = Object.values(seleccion).reduce((s, h) => s + (Number(h) || 0), 0)
  const valorPremio = totalHoras * (Number(jornada.data?.valor_hora) || 0)
  const pedidosEnProduccion = useMemo(() => pedidos.data.filter(p => !['CANCELADO', 'TERMINADO'].includes(p.estado)), [pedidos.data])

  const guardar = async () => {
    if (Object.values(seleccion).some(horas => !Number.isFinite(Number(horas)) || Number(horas) <= 0)) {
      mostrar('Ingresá las horas-hombre mayores a cero para cada etapa seleccionada.', 'error')
      return
    }
    setBusy(true)
    try {
      await api.put('/produccion/etapas-diarias', {
        fecha: hoy,
        etapas: Object.entries(seleccion).filter(([, horas]) => Number(horas) > 0)
          .map(([etapa_id, horas_hombre]) => ({ etapa_id, horas_hombre: Number(horas_hombre) }))
      }, etapasDia.token)
      await Promise.all([etapasDia.load(), jornada.load()])
      mostrar('Producción diaria guardada. El premio se actualizará al completar las etapas.')
    } catch (error) { mostrar(error.message, 'error') } finally { setBusy(false) }
  }

  return <>
    <Heading kicker="Producción diaria" title="Producción y objetivos" text="Elegí las etapas de pedidos existentes que cuentan para el premio de hoy y asignales horas-hombre.">
      <button className="primary" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar producción diaria'}</button>
    </Heading>
    {nodo}
    <section className="stats-grid dashboard-stats">
      <Stat label="Etapas seleccionadas" value={Object.keys(seleccion).length} />
      <Stat label="Horas-hombre objetivo" value={horas(totalHoras)} />
      <Stat label="Premio potencial del equipo" value={dinero(valorPremio)} hint={`${dinero(jornada.data?.valor_hora || 0)} por hora-hombre`} />
      <Stat label="Estado" value={jornada.data?.cumplido ? 'Cumplido' : 'Pendiente'} hint={jornada.data?.cumplido ? `Premio: ${dinero(jornada.data.recompensa)}` : 'Se paga cuando se completen todas las etapas seleccionadas'} />
    </section>

    <section className="section-heading"><div><h2>Etapas para hoy</h2><p>La selección se guarda por jornada. Las horas se suman para calcular el premio; cada etapa completa aporta sus horas asignadas.</p></div></section>
    {pedidos.loading || etapasDia.loading ? <p>Cargando pedidos…</p> : pedidosEnProduccion.length ? pedidosEnProduccion.map(pedido => {
      const filas = etapas.filter(f => String(f.pedido_id) === String(pedido.id))
      if (!filas.length) return null
      const todasSeleccionadas = filas.length > 0 && filas.every(fila => seleccion[fila.etapa_id] !== undefined)
      return <article className="config-card" key={pedido.id}>
        <div className="detalle-item-head">
          <b>Pedido {pedido.codigo}</b>
          <label className="config-check"><input type="checkbox" checked={todasSeleccionadas} onChange={event => {
            const nueva = { ...seleccion }
            for (const fila of filas) {
              if (event.target.checked && nueva[fila.etapa_id] === undefined) nueva[fila.etapa_id] = ''
              if (!event.target.checked) delete nueva[fila.etapa_id]
            }
            setSeleccion(nueva)
          }} /> Incluir todas las etapas</label>
          <span>{pedido.items.map(item => `${item.cantidad}× ${item.producto}`).join(', ')}</span>
        </div>
        <p className="muted">Entrega {fecha(pedido.fecha_entrega)} · {pedido.estado.replaceAll('_', ' ').toLowerCase()}</p>
        <div className="etapas-tabla">
          {filas.map(etapa => <label className="etapa-fila" key={etapa.etapa_id}>
            <input type="checkbox" checked={seleccion[etapa.etapa_id] !== undefined} onChange={event => {
              const nueva = { ...seleccion }
              if (event.target.checked) nueva[etapa.etapa_id] = ''
              else delete nueva[etapa.etapa_id]
              setSeleccion(nueva)
            }} />
            <span className="etapa-nombre">{etapa.producto} · {etapa.orden}. {etapa.etapa}</span>
            <Badge estado={etapa.estado} />
            <span className="etapa-tiempo">{etapa.estado === 'COMPLETADA' ? 'Completada' : 'Pendiente'}</span>
            {seleccion[etapa.etapa_id] !== undefined && <input aria-label={`Horas-hombre para ${etapa.etapa}`} min="0.01" step="0.01" type="number" value={seleccion[etapa.etapa_id]} onChange={event => setSeleccion({ ...seleccion, [etapa.etapa_id]: event.target.value })} />}
          </label>)}
        </div>
      </article>
    }) : <Empty title="No hay pedidos abiertos" text="Creá un pedido con productos y etapas para definir la producción diaria." />}
  </>
}
