import React, { useMemo, useState } from 'react'
import { dinero, fecha, fechaDia, horas, porcentaje, useAutoRefresco, useData } from './api.js'
import { Empty, Heading, Progress, Stat } from './ui.jsx'

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
  const { metricas, rendimiento, produccion, por_producto: porProducto, mensual, configuracion } = datos
  const { productos, pedidos, real, en_curso: enCurso, proyectado } = metricas
  const conRango = Boolean(datos.rango?.desde || datos.rango?.hasta)
  const periodo = conRango ? `${datos.rango.desde ? fecha(`${datos.rango.desde}T00:00`) : 'el inicio'} al ${datos.rango.hasta ? fecha(`${datos.rango.hasta}T00:00`) : 'hoy'}` : 'todo el historial'
  const moneda = configuracion?.moneda || 'ARS'
  const maxFacturado = Math.max(...mensual.map(mes => mes.facturado), 1)

  return (
    <>
      <Heading kicker="Análisis detallado" title="Estadísticas generales" text="Gastos, ganancias, producción diaria y rendimiento del equipo, con el detalle que no entra en el panel principal.">
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
          <p>Del {periodo}. Los ingresos se cuentan al marcar un producto como vendido o al terminar un pedido; los gastos, al completar cada etapa (el costo de cada producto se reparte entre sus etapas según sus horas-hombre) y al terminar cada producción diaria con recompensa.</p>
        </div>
      </section>

      <section className="stats-grid monthly-stats">
        <Stat label="Ingresos cobrados" value={dinero(real.ingresos, moneda)} hint={`${productos.vendidos_periodo} productos vendidos ${dinero(real.ingresos_productos, moneda)} · ${pedidos.cobrados} pedidos terminados ${dinero(real.ingresos_pedidos, moneda)}`} />
        <Stat label="Gastos de producción" value={dinero(real.gastos_produccion, moneda)} hint={`Etapas completadas ${dinero(real.gastos_etapas_pedidos + real.gastos_tareas, moneda)} · Costo de lo vendido ${dinero(real.costo_productos_vendidos, moneda)}`} />
        <Stat label="Recompensas pagadas" value={dinero(real.recompensas, moneda)} hint={`Premio del equipo por producción diaria cumplida (y bonos anteriores) · ${real.recompensas_cantidad} registros`} />
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
        <Stat label="Stock disponible" value={dinero(proyectado.ingresos_stock, moneda)} hint={`${productos.activos} productos activos · costo ${dinero(proyectado.gastos_stock, moneda)}${productos.desactivados ? ` · ${productos.desactivados} desactivados (no cuentan)` : ''}`} tone={productos.activos_sin_precio ? 'danger' : ''} />
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

      <section className="analytics una-columna">
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
      </section>

      {/* ---------- PRODUCCIÓN DIARIA ---------- */}
      <section className="section-heading">
        <div>
          <h2>Producción diaria</h2>
          <p>Del {periodo}. Días con trabajo propuesto en Producción diaria: cuántos se terminaron con todo lo propuesto completo, y las horas-hombre estimadas que se propusieron y se completaron. Un día abierto se cuenta como en curso.</p>
        </div>
      </section>

      <section className="stats-grid monthly-stats">
        <Stat label="Días con producción" value={produccion.dias} hint={`${produccion.terminadas} terminados${produccion.abiertas ? ` · ${produccion.abiertas} en curso` : ''}`} />
        <Stat
          label="Días cumplidos"
          value={`${produccion.cumplidas} de ${produccion.terminadas}`}
          hint={produccion.terminadas ? `${porcentaje(produccion.cumplidas, produccion.terminadas)}% de los días terminados cobró la recompensa` : 'Todavía no hay días terminados'}
          tone={produccion.terminadas && produccion.cumplidas < produccion.terminadas ? 'danger' : ''}
        />
        <Stat label="Horas-hombre completadas" value={horas(produccion.horas_completadas)} hint={`de ${horas(produccion.horas_propuestas)} propuestas en días terminados (${porcentaje(produccion.horas_completadas, produccion.horas_propuestas)}%)`} />
        <Stat label="Promedio por día" value={horas(produccion.promedio_por_dia)} hint="Horas-hombre completadas por día terminado" />
      </section>

      <section className="analytics analytics-produccion">
        <article className="chart-card">
          <div className="card-title">Horas-hombre por día</div>
          <p className="muted grafico-subtitulo">Últimos {produccion.serie.length || ''} días con producción del período: cuánto se propuso y cuánto se completó.</p>
          <GraficoDias serie={produccion.serie} moneda={moneda} />
        </article>

        <article className="operator-summary">
          <div className="card-title">Trabajo pendiente</div>
          <span className="large-number">{horas(produccion.pendiente.horas)}</span>
          <p className="muted">{produccion.pendiente.etapas} {produccion.pendiente.etapas === 1 ? 'etapa' : 'etapas'} sin completar en pedidos abiertos (a hoy).</p>
          {produccion.dias_estimados !== null
            ? <p className="muted">Al ritmo del período ({horas(produccion.promedio_por_dia)} por día) son unos <b>{produccion.dias_estimados} {produccion.dias_estimados === 1 ? 'día' : 'días'}</b> de producción.</p>
            : <p className="muted">Cuando haya días terminados en el período, acá se estima cuántos días de producción faltan.</p>}
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
        <div><h2>Rendimiento de empleados</h2><p>Horas-hombre estimadas de las etapas que completó cada uno en el período, cuántas fueron parte de producciones diarias cumplidas (las que pagaron recompensa al equipo) y lo que tiene pendiente hoy.</p></div>
      </section>

      {rendimiento.length ? (
        <section className="employee-grid rendimiento-grid">
          {rendimiento.map(empleado => (
            <article className="employee-card rendimiento-card" key={empleado.id}>
              <div className="rendimiento-head">
                <h3>{empleado.nombre}</h3>
                <small>{empleado.completadas} etapas completadas · {empleado.pendientes} pendientes</small>
              </div>

              <div className="rendimiento-datos">
                <span><small>Completadas</small><b>{horas(empleado.horas_completadas)}</b></span>
                <span><small>En días cumplidos</small><b>{horas(empleado.horas_premiadas)}</b></span>
                <span><small>Pendientes</small><b>{horas(empleado.horas_pendientes)}</b></span>
              </div>

              <Progress value={porcentaje(empleado.horas_completadas, empleado.horas_completadas + empleado.horas_pendientes)} />
            </article>
          ))}
        </section>
      ) : <p className="notice">No hay empleados con actividad registrada.</p>}
    </>
  )
}

// Tope "redondo" del eje vertical: el primer valor de la lista que alcanza
// al máximo (si es más grande, el siguiente múltiplo de 100).
const TOPES = [1, 2, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500]
const topeLimpio = maximo => TOPES.find(tope => tope >= maximo) ?? Math.ceil(maximo / 100) * 100

const estadoDia = dia => (dia.estado === 'ABIERTA' ? (dia.cumplido ? 'Falta verificar' : 'En curso') : dia.cumplido ? 'Cumplido' : 'No se completó')

// ---------------------------------------------------------------------
// HORAS-HOMBRE POR DÍA
// Una columna por día con producción: la pista es lo propuesto y el relleno
// lo completado, en el mismo tono (eje único, en horas-hombre). Los días
// cumplidos llevan ✓ junto a la fecha. Al pasar el mouse (o con el foco del
// teclado) cada columna muestra su detalle, y los mismos datos están en la
// tabla de abajo.
// ---------------------------------------------------------------------
function GraficoDias({ serie, moneda }) {
  const [activo, setActivo] = useState(null)
  if (!serie.length) return <p className="muted">Todavía no hay producciones diarias en el período elegido.</p>

  const tope = topeLimpio(Math.max(...serie.map(dia => dia.objetivo_horas), 1))
  const marcas = [tope, tope / 2, 0]
  const altura = valor => `${Math.min(100, (valor / tope) * 100)}%`

  return (
    <div className="grafico-dias">
      <div className="grafico-leyenda">
        <span><i className="clave relleno" />Completado</span>
        <span><i className="clave pista" />Propuesto</span>
        <span>✓ Día cumplido</span>
      </div>

      <div className="grafico-cuerpo">
        <div className="grafico-eje" aria-hidden="true">
          {marcas.map(marca => <span key={marca} style={{ bottom: altura(marca) }}>{horas(marca)}</span>)}
        </div>

        <div className="grafico-area">
          <div className="grafico-lineas" aria-hidden="true">
            {marcas.map(marca => <i key={marca} style={{ bottom: altura(marca) }} />)}
          </div>

          {serie.map(dia => {
            const encendida = activo === dia.fecha
            const cumplido = dia.estado === 'TERMINADA' && dia.cumplido
            return (
              <div
                className="grafico-columna"
                key={dia.fecha}
                tabIndex={0}
                aria-label={`${fechaDia(dia.fecha)}: ${horas(dia.horas_completadas)} completadas de ${horas(dia.objetivo_horas)} propuestas, ${estadoDia(dia)}`}
                onMouseEnter={() => setActivo(dia.fecha)}
                onMouseLeave={() => setActivo(null)}
                onFocus={() => setActivo(dia.fecha)}
                onBlur={() => setActivo(null)}
              >
                <div className="grafico-plot">
                  <div className={`grafico-pista${encendida ? ' encendida' : ''}`} style={{ height: altura(dia.objetivo_horas) }}>
                    <div className="grafico-relleno" style={{ height: dia.objetivo_horas ? `${Math.min(100, (dia.horas_completadas / dia.objetivo_horas) * 100)}%` : 0 }} />
                  </div>
                  {encendida && (
                    <div className="grafico-tooltip" role="tooltip">
                      <b>{horas(dia.horas_completadas)} de {horas(dia.objetivo_horas)}</b>
                      <span>{fechaDia(dia.fecha)} · {estadoDia(dia)}</span>
                      {dia.estado === 'TERMINADA' && <span>Recompensa {dinero(dia.recompensa, moneda)}</span>}
                    </div>
                  )}
                </div>
                <small className="grafico-x">{fechaDia(dia.fecha).slice(0, 5)}{cumplido ? ' ✓' : ''}</small>
              </div>
            )
          })}
        </div>
      </div>

      <details className="grafico-tabla">
        <summary>Ver los datos como tabla</summary>
        <table>
          <thead>
            <tr><th>Día</th><th>Propuesto</th><th>Completado</th><th>Resultado</th><th>Recompensa</th></tr>
          </thead>
          <tbody>
            {serie.map(dia => (
              <tr key={dia.fecha}>
                <td>{fechaDia(dia.fecha)}</td>
                <td>{horas(dia.objetivo_horas)}</td>
                <td>{horas(dia.horas_completadas)}</td>
                <td>{estadoDia(dia)}</td>
                <td>{dia.estado === 'TERMINADA' ? dinero(dia.recompensa, moneda) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
