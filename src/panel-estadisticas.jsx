import React, { useMemo, useState } from 'react'
import { dinero, duracion, useData } from './api.js'
import { Empty, Heading, Progress, Stat } from './ui.jsx'
import { BarraSemaforo } from './panel-recompensas.jsx'

export default function PanelEstadisticas() {
  const [rango, setRango] = useState({ desde: '', hasta: '' })
  const consulta = useMemo(() => {
    const parametros = new URLSearchParams()
    if (rango.desde) parametros.set('desde', rango.desde)
    if (rango.hasta) parametros.set('hasta', rango.hasta)
    const texto = parametros.toString()
    return `/estadisticas/generales${texto ? `?${texto}` : ''}`
  }, [rango.desde, rango.hasta])

  const stats = useData(consulta, null)
  const datos = stats.data

  if (stats.loading && !datos) return <p>Calculando estadísticas...</p>
  if (stats.error) return <p className="form-error">{stats.error}</p>
  if (!datos) return <Empty title="Sin datos todavía" text="Cargá productos y pedidos para generar las estadísticas." />

  const { ingresos, gastos, ganancia, rendimiento, semaforo, por_producto: porProducto, mensual, configuracion } = datos
  const moneda = configuracion?.moneda || 'ARS'
  const maxFacturado = Math.max(...mensual.map(mes => mes.facturado), 1)

  return (
    <>
      <Heading kicker="Análisis detallado" title="Estadísticas generales" text="Gastos, ganancias y rendimiento del equipo, con el detalle que no entra en el panel principal.">
        <div className="actions">
          <label className="rango">Desde<input type="date" value={rango.desde} onChange={event => setRango({ ...rango, desde: event.target.value })} /></label>
          <label className="rango">Hasta<input type="date" value={rango.hasta} onChange={event => setRango({ ...rango, hasta: event.target.value })} /></label>
          {(rango.desde || rango.hasta) && <button className="filter" onClick={() => setRango({ desde: '', hasta: '' })}>Limpiar</button>}
        </div>
      </Heading>

      {/* ---------- DINERO ---------- */}
      <section className="section-heading">
        <div><h2>Ganancias y gastos</h2><p>Los ingresos se cuentan al cerrar el pedido; los gastos, al completar cada etapa.</p></div>
      </section>

      <section className="stats-grid monthly-stats">
        <Stat label="Ingresos cobrados" value={dinero(ingresos.cobrados, moneda)} hint="Pedidos terminados" />
        <Stat label="Ingresos en curso" value={dinero(ingresos.en_curso, moneda)} hint="Pedidos abiertos" />
        <Stat label="Gastos de producción" value={dinero(gastos.produccion_ejecutada, moneda)} hint="Costo de etapas completadas" />
        <Stat label="Recompensas pagadas" value={dinero(gastos.recompensas, moneda)} hint="Bonos por semáforo verde" />
        <Stat
          label="Ganancia neta"
          value={dinero(ganancia.neta, moneda)}
          hint={`Proyectada ${dinero(ganancia.proyectada, moneda)}`}
          tone={ganancia.neta >= 0 ? '' : 'danger'}
        />
      </section>

      <section className="analytics">
        <article className="chart-card">
          <div className="card-title">Facturación por mes</div>
          {mensual.length ? (
            <div className="chart">
              {[...mensual].reverse().map(mes => (
                <div className="bar-wrap" key={mes.periodo}>
                  <i className="active-bar" style={{ height: `${Math.max(8, (mes.facturado / maxFacturado) * 100)}%` }} title={dinero(mes.facturado, moneda)} />
                  <small>{mes.periodo.slice(5)}/{mes.periodo.slice(2, 4)}</small>
                </div>
              ))}
            </div>
          ) : <p className="muted">Todavía no hay pedidos en el período elegido.</p>}
        </article>

        <article className="operator-summary">
          <div className="card-title">Reparto del semáforo</div>
          <BarraSemaforo verdes={semaforo.verdes} amarillos={semaforo.amarillos} rojos={semaforo.rojos} />
          <p className="muted">
            Tiempo estimado {duracion(semaforo.minutos_estimados)} · Tiempo real {duracion(semaforo.minutos_reales)}
            {semaforo.sin_medir ? ` · ${semaforo.sin_medir} etapas cerradas sin informar tiempo` : ''}
          </p>
        </article>
      </section>

      {/* ---------- PRODUCTOS ---------- */}
      <section className="section-heading">
        <div><h2>Rentabilidad por producto</h2><p>Cuánto factura cada producto y qué costo de fabricación acumula.</p></div>
      </section>

      {porProducto.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head productos-head">
            <span>Producto</span><span>Unidades</span><span>Facturado</span><span>Costo</span><span>Margen</span>
          </div>
          {porProducto.map(producto => {
            const margen = producto.facturado - producto.costo_estimado
            return (
              <div className="ranking-fila productos-fila" key={producto.id}>
                <b>{producto.nombre}</b>
                <span>{producto.unidades}</span>
                <span>{dinero(producto.facturado, moneda)}</span>
                <span>{dinero(producto.costo_estimado, moneda)}</span>
                <b className={margen >= 0 ? 'positivo' : 'negativo'}>{dinero(margen, moneda)}</b>
              </div>
            )
          })}
        </section>
      ) : <p className="notice">Sin ventas registradas en el período.</p>}

      {/* ---------- EMPLEADOS ---------- */}
      <section className="section-heading">
        <div><h2>Rendimiento de empleados</h2><p>Tareas completadas, tiempos promedio y semáforos acumulados.</p></div>
      </section>

      {rendimiento.length ? (
        <section className="employee-grid rendimiento-grid">
          {rendimiento.map(empleado => (
            <article className="employee-card rendimiento-card" key={empleado.id}>
              <div className="rendimiento-head">
                <h3>{empleado.nombre}</h3>
                <small>{empleado.completadas} completadas · {empleado.pendientes} pendientes</small>
              </div>

              <BarraSemaforo verdes={empleado.verdes} amarillos={empleado.amarillos} rojos={empleado.rojos} />

              <div className="rendimiento-datos">
                <span><small>Promedio por etapa</small><b>{duracion(empleado.promedio_minutos)}</b></span>
                <span><small>Estimado / real</small><b>{duracion(empleado.minutos_estimados)} / {duracion(empleado.minutos_reales)}</b></span>
                <span><small>Recompensas</small><b>{dinero(empleado.recompensas_monto, moneda)}</b></span>
              </div>

              {empleado.eficiencia !== null && (
                <>
                  <Progress value={Math.min(100, empleado.eficiencia)} />
                  <p className={`muted ${empleado.eficiencia <= 100 ? 'positivo' : 'negativo'}`}>
                    Usó el {empleado.eficiencia}% del tiempo estimado
                    {empleado.eficiencia <= 100 ? ' (por debajo de lo previsto)' : ' (por encima de lo previsto)'}
                  </p>
                </>
              )}
            </article>
          ))}
        </section>
      ) : <p className="notice">No hay empleados con actividad registrada.</p>}
    </>
  )
}
