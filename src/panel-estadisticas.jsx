import React, { useMemo, useState } from 'react'
import { dinero, duracion, fecha, useAutoRefresco, useData } from './api.js'
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
  useAutoRefresco(stats.load)
  const datos = stats.data

  if (stats.loading && !datos) return <p>Calculando estadísticas...</p>
  if (stats.error) return <p className="form-error">{stats.error}</p>
  if (!datos) return <Empty title="Sin datos todavía" text="Cargá productos y pedidos para generar las estadísticas." />

  // Mismo cálculo que el Panel de control (server/metricas.js).
  const { metricas, rendimiento, semaforo, por_producto: porProducto, mensual, configuracion } = datos
  const { productos, pedidos, real, en_curso: enCurso, proyectado } = metricas
  const conRango = Boolean(datos.rango?.desde || datos.rango?.hasta)
  const periodo = conRango ? `${datos.rango.desde ? fecha(`${datos.rango.desde}T00:00`) : 'el inicio'} al ${datos.rango.hasta ? fecha(`${datos.rango.hasta}T00:00`) : 'hoy'}` : 'todo el historial'
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

      {/* ---------- DINERO REAL ---------- */}
      <section className="section-heading">
        <div>
          <h2>Real: ganancias y gastos</h2>
          <p>Del {periodo}. Los ingresos se cuentan al vender un producto (desactivarlo o eliminarlo) o al terminar un pedido; los gastos, al completar cada etapa.</p>
        </div>
      </section>

      <section className="stats-grid monthly-stats">
        <Stat label="Ingresos cobrados" value={dinero(real.ingresos, moneda)} hint={`${productos.vendidos_periodo} productos vendidos ${dinero(real.ingresos_productos, moneda)} · ${pedidos.cobrados} pedidos terminados ${dinero(real.ingresos_pedidos, moneda)}`} />
        <Stat label="Gastos de producción" value={dinero(real.gastos_produccion, moneda)} hint={`Etapas completadas ${dinero(real.gastos_etapas_pedidos + real.gastos_tareas, moneda)} · Costo de lo vendido ${dinero(real.costo_productos_vendidos, moneda)}`} />
        <Stat label="Recompensas pagadas" value={dinero(real.recompensas, moneda)} hint={`${real.recompensas_cantidad} recompensas otorgadas`} />
        <Stat
          label="Ganancia neta"
          value={dinero(real.ganancia, moneda)}
          hint="Cobrado − gastos de producción − recompensas"
          tone={real.ganancia >= 0 ? '' : 'danger'}
        />
      </section>

      {/* ---------- PROYECCIÓN ---------- */}
      <section className="section-heading">
        <div>
          <h2>Proyectado: si se vende todo el stock</h2>
          <p>Supone que se venden los {productos.activos} productos activos a su precio de venta y que se cobran los pedidos abiertos. El stock es el de hoy (no depende del rango); los pedidos abiertos se filtran por fecha de creación.</p>
        </div>
      </section>

      <section className="stats-grid monthly-stats">
        <Stat label="Ingresos en curso" value={dinero(enCurso.ingresos, moneda)} hint={`${pedidos.abiertos} pedidos abiertos · faltan ${dinero(enCurso.gastos_pendientes, moneda)} de costo`} />
        <Stat label="Stock disponible" value={dinero(proyectado.ingresos_stock, moneda)} hint={`${productos.activos} productos activos · costo ${dinero(proyectado.gastos_stock, moneda)}`} tone={productos.activos_sin_precio ? 'danger' : ''} />
        <Stat label="Gastos proyectados" value={dinero(proyectado.gastos, moneda)} hint={`Ingresos proyectados ${dinero(proyectado.ingresos, moneda)}`} />
        <Stat
          label="Ganancia proyectada"
          value={dinero(proyectado.ganancia, moneda)}
          hint={`Real ${dinero(real.ganancia, moneda)} + pedidos ${dinero(enCurso.margen, moneda)} + stock ${dinero(proyectado.margen_stock, moneda)}`}
          tone={proyectado.ganancia >= 0 ? '' : 'danger'}
        />
      </section>
      {productos.activos_sin_precio > 0 && (
        <p className="notice">{productos.activos_sin_precio} productos activos no tienen precio de venta cargado: suman $0 a la proyección.</p>
      )}

      <section className="analytics">
        <article className="chart-card">
          <div className="card-title">Facturación por mes</div>
          {mensual.length ? (
            <div className="chart">
              {[...mensual].reverse().map(mes => (
                <div className="bar-wrap" key={mes.periodo}>
                  <i className="active-bar" style={{ height: `${Math.max(8, (mes.facturado / maxFacturado) * 100)}%` }} title={`${dinero(mes.facturado, moneda)} · ${mes.unidades} unidades`} />
                  <small>{mes.periodo.slice(5)}/{mes.periodo.slice(2, 4)}</small>
                </div>
              ))}
            </div>
          ) : <p className="muted">Todavía no hay ventas cobradas en el período elegido.</p>}
        </article>

        <article className="operator-summary">
          <div className="card-title">Reparto del semáforo</div>
          <BarraSemaforo verdes={semaforo.verdes} amarillos={semaforo.amarillos} rojos={semaforo.rojos} />
          <p className="muted">
            {semaforo.verdes + semaforo.amarillos + semaforo.rojos} etapas medidas · Tiempo estimado {duracion(semaforo.minutos_estimados)} · Tiempo real {duracion(semaforo.minutos_reales)}
            {semaforo.sin_medir ? ` · ${semaforo.sin_medir} etapas cerradas sin informar tiempo` : ''}
          </p>
        </article>
      </section>

      {/* ---------- PRODUCTOS ---------- */}
      <section className="section-heading">
        <div><h2>Rentabilidad por producto</h2><p>Ventas reales del período: productos vendidos (1 unidad cada uno) y unidades de pedidos terminados.</p></div>
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
        <div><h2>Rendimiento de empleados</h2><p>Etapas completadas, tiempos y recompensas del período; pendientes a hoy.</p></div>
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
