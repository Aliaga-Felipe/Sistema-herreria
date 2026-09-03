import React, { useState } from 'react'
import './features.css'
import { dinero, duracion, fecha, iniciales, useData } from './api.js'
import { Badge, Empty, Heading, Modal, Progress, QuickActions, Semaforo, Stat } from './ui.jsx'
import PanelProductos from './panel-productos.jsx'
import PanelPedidos from './panel-pedidos.jsx'
import PanelRecompensas, { ConfiguracionRecompensas } from './panel-recompensas.jsx'
import PanelEstadisticas from './panel-estadisticas.jsx'
import PanelUsuarios from './panel-usuarios.jsx'

export const seccionesAdmin = [
  ['Panel de control', '▦'],
  ['Pedidos', '⌁'],
  ['Productos', '▱'],
  ['Tareas', '✓'],
  ['Recompensas', '♛'],
  ['Estadísticas', '◫'],
  ['Usuarios', '♙'],
  ['Configuración', '⚙']
]

export default function WorkshopPanels({ section, setSection }) {
  // `intencion` deja que los accesos directos del panel abran un formulario
  // en la sección de destino sin pasos intermedios.
  const [intencion, setIntencion] = useState(null)
  const limpiar = () => setIntencion(null)

  const ir = (destino, proposito = null) => { setIntencion(proposito); setSection(destino) }

  const vistas = {
    'Panel de control': <Dashboard ir={ir} />,
    Pedidos: <PanelPedidos intencion={intencion} limpiarIntencion={limpiar} />,
    Productos: <PanelProductos intencion={intencion} limpiarIntencion={limpiar} />,
    Tareas: <PanelTareas />,
    Recompensas: <PanelRecompensas />,
    Estadísticas: <PanelEstadisticas />,
    Usuarios: <PanelUsuarios intencion={intencion} limpiarIntencion={limpiar} />,
    Configuración: <PanelConfiguracion />
  }

  return vistas[section] || vistas['Panel de control']
}

// ---------------------------------------------------------------------
// PANEL DE CONTROL
// Estadísticas de un vistazo + accesos directos de gestión rápida.
// ---------------------------------------------------------------------
function Dashboard({ ir }) {
  const resumen = useData('/estadisticas/resumen', null)
  const datos = resumen.data

  if (resumen.loading && !datos) return <p>Cargando el panel...</p>
  if (resumen.error) return <p className="form-error">{resumen.error}</p>
  if (!datos) return null

  const { pedidos, trabajo, catalogo, dinero: plata, mas_vendidos: masVendidos, empleados_pendientes: pendientes, proximos_pedidos: proximos, configuracion } = datos
  const moneda = configuracion?.moneda || 'ARS'
  const maxUnidades = Math.max(...masVendidos.map(producto => producto.unidades), 1)

  return (
    <>
      <Heading kicker="Resumen de operaciones" title="Panel de producción" text="El estado del taller de un vistazo, con accesos directos para gestionar sin navegar.">
        <button className="primary" onClick={() => ir('Pedidos', 'nuevo')}>+ Nuevo pedido</button>
      </Heading>

      <QuickActions
        acciones={[
          { icono: '⌁', label: 'Nuevo pedido', texto: 'Cliente y productos', onClick: () => ir('Pedidos', 'nuevo'), destacada: true },
          { icono: '▱', label: 'Nuevo producto', texto: 'Precio y etapas', onClick: () => ir('Productos', 'nuevo') },
          { icono: '♙', label: 'Nuevo empleado', texto: 'Alta de cuenta', onClick: () => ir('Usuarios', 'nuevo') },
          { icono: '✓', label: 'Asignar tareas', texto: `${trabajo.sin_asignar} etapas sin dueño`, onClick: () => ir('Tareas') },
          { icono: '◫', label: 'Estadísticas', texto: 'Gastos y ganancias', onClick: () => ir('Estadísticas') },
          { icono: '♛', label: 'Recompensas', texto: 'Semáforo y bonos', onClick: () => ir('Recompensas') }
        ]}
      />

      <section className="stats-grid dashboard-stats">
        <Stat label="Pedidos activos" value={pedidos.activos} hint={`${pedidos.terminados} terminados`} />
        <Stat label="Pedidos atrasados" value={pedidos.atrasados} tone={pedidos.atrasados ? 'danger' : ''} hint="Pasaron su fecha de entrega" />
        <Stat label="Etapas pendientes" value={trabajo.pendientes} hint={`${trabajo.sin_asignar} sin asignar`} />
        <Stat label="Ganancia estimada" value={dinero(plata.ganancia, moneda)} hint={`Ingresos ${dinero(plata.ingresos, moneda)}`} tone={plata.ganancia >= 0 ? '' : 'danger'} />
        <Stat label="Semáforo del taller" value={`🟢 ${trabajo.verdes} 🟡 ${trabajo.amarillos} 🔴 ${trabajo.rojos}`} hint={`${catalogo.empleados} empleados activos`} />
      </section>

      <section className="analytics">
        <article className="chart-card">
          <div className="card-title">Productos más vendidos</div>
          {masVendidos.length ? (
            <div className="ranking-simple">
              {masVendidos.map(producto => (
                <div key={producto.id}>
                  <b>{producto.nombre}</b>
                  <Progress value={(producto.unidades / maxUnidades) * 100} />
                  <span>{producto.unidades} u · {dinero(producto.facturado, moneda)}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">Todavía no hay productos vendidos.</p>}
        </article>

        <article className="operator-summary">
          <div className="card-title">Empleados con tareas pendientes</div>
          {pendientes.length ? pendientes.map(empleado => (
            <div className="person" key={empleado.id}>
              <span>{iniciales(empleado.nombre)}</span>
              <b>{empleado.nombre}</b>
              <Progress value={(empleado.completadas / Math.max(1, empleado.completadas + empleado.pendientes)) * 100} />
              <strong>{empleado.pendientes}</strong>
            </div>
          )) : <p className="muted">Nadie tiene tareas pendientes ahora mismo.</p>}
        </article>
      </section>

      <section className="section-heading">
        <div><h2>Pedidos en curso</h2><p>Ordenados por prioridad y fecha de entrega.</p></div>
        <button className="filter" onClick={() => ir('Pedidos')}>Ver todos</button>
      </section>

      {proximos.length ? (
        <section className="orders-card">
          <div className="order-head resumen-head">
            <span>Pedido</span><span>Cliente</span><span>Estado</span><span>Avance</span><span>Entrega</span>
          </div>
          {proximos.map(pedido => (
            <div className="order-row resumen-row" key={pedido.id}>
              <div className="product">
                <div className="product-thumb">▦</div>
                <div><b>{pedido.codigo}</b><small>{pedido.etapas_completadas}/{pedido.etapas_totales} etapas</small></div>
              </div>
              <div className="client"><b>{pedido.cliente || 'Sin cliente'}</b></div>
              <div><Badge estado={pedido.estado} /></div>
              <div className="progress-cell"><b>{pedido.avance}%</b><Progress value={pedido.avance} /></div>
              <div><em className="stage">{fecha(pedido.fecha_entrega)}</em></div>
            </div>
          ))}
        </section>
      ) : (
        <Empty title="No hay pedidos en curso" text="Creá un pedido para empezar a producir." action={() => ir('Pedidos', 'nuevo')} label="Crear pedido" />
      )}
    </>
  )
}

// ---------------------------------------------------------------------
// TAREAS (vista de producción del administrador)
// ---------------------------------------------------------------------
function PanelTareas() {
  const tareas = useData('/tareas/asignadas/mias?todas=true')
  const [filtro, setFiltro] = useState('PENDIENTES')
  const [seleccionada, setSeleccionada] = useState(null)

  const visibles = tareas.data.filter(tarea =>
    filtro === 'TODAS' ? true : filtro === 'PENDIENTES' ? tarea.estado !== 'COMPLETADA' : tarea.estado === 'COMPLETADA')

  // Cada tarjeta agrupa las etapas de un mismo producto/trabajo (mismo
  // pedido u origen + el nombre del producto), para no repetir el
  // encabezado por cada etapa suelta.
  const grupos = agruparPorProducto(visibles)

  return (
    <>
      <Heading kicker="Flujo de trabajo" title="Tareas de producción" text="Todas las etapas del taller, con su responsable, el tiempo estimado y el resultado del semáforo.">
        <select className="filter" value={filtro} onChange={event => setFiltro(event.target.value)}>
          <option value="PENDIENTES">Pendientes</option>
          <option value="COMPLETADA">Completadas</option>
          <option value="TODAS">Todas</option>
        </select>
      </Heading>

      {tareas.loading ? <p>Cargando tareas...</p> : tareas.error ? <p className="form-error">{tareas.error}</p> : grupos.length ? (
        <div className="tareas-grid">
          {grupos.map(grupo => (
            <article className="pedido-tile" key={grupo.clave}>
              <div className="tarea-tile-head">
                <div className="product-thumb">{grupo.origen === 'PEDIDO' ? '▦' : '✎'}</div>
                <div>
                  <h3>{grupo.titulo}</h3>
                  <div className="tarea-tile-tags">
                    <span>{grupo.referencia}</span>
                    <span>{grupo.cliente}</span>
                  </div>
                </div>
              </div>

              <div className="pedido-tile-etapas">
                {grupo.etapas.map(tarea => (
                  <button
                    type="button"
                    className="etapa-item"
                    key={`${tarea.origen}-${tarea.id}`}
                    onClick={() => setSeleccionada(tarea)}
                  >
                    <span className="etapa-item-nombre">{tarea.etapa}</span>
                    <span className="etapa-item-tiempo">{duracion(tarea.minutos_estimados)}</span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No hay etapas en esta vista" text="Las etapas se generan al crear un pedido con productos del catálogo." />
      )}

      {seleccionada && <DetalleTarea tarea={seleccionada} close={() => setSeleccionada(null)} />}
    </>
  )
}

// Agrupa la lista plana de etapas por producto: mismo origen + mismo
// contenedor (pedido o tarea libre) + mismo nombre de producto/trabajo.
// Un pedido con varios productos distintos arma una tarjeta por producto.
function agruparPorProducto(lista) {
  const mapa = new Map()
  for (const tarea of lista) {
    const clave = `${tarea.origen}-${tarea.contenedor_id}-${tarea.titulo}`
    if (!mapa.has(clave)) {
      mapa.set(clave, { clave, origen: tarea.origen, titulo: tarea.titulo, referencia: tarea.referencia, cliente: tarea.cliente, etapas: [] })
    }
    mapa.get(clave).etapas.push(tarea)
  }
  return [...mapa.values()].map(grupo => ({ ...grupo, etapas: grupo.etapas.sort((a, b) => (a.orden || 0) - (b.orden || 0)) }))
}

// Ventana de detalle: se abre al hacer click en una tarjeta y muestra todos
// los datos de esa etapa sin abandonar la grilla que queda detrás, oscurecida.
function DetalleTarea({ tarea, close }) {
  return (
    <Modal
      title={tarea.etapa}
      subtitle={`${tarea.referencia} · ${tarea.cliente}`}
      icono={tarea.origen === 'PEDIDO' ? '▦' : '✎'}
      close={close}
    >
      <div className="tarea-detalle-grid">
        <span><small>Estado</small><Badge estado={tarea.estado} /></span>
        <span><small>Responsable</small><b>{tarea.responsable || 'Sin asignar'}</b></span>
        <span><small>Tiempo estimado</small><b>{duracion(tarea.minutos_estimados)}</b></span>
        <span><small>Tiempo real</small><b>{tarea.minutos_reales ? duracion(tarea.minutos_reales) : '—'}</b></span>
        <span><small>Semáforo</small><Semaforo valor={tarea.semaforo} /></span>
        {tarea.costo > 0 && <span><small>Costo estimado</small><b>{dinero(tarea.costo)}</b></span>}
        {tarea.fecha_entrega && <span><small>Fecha de entrega</small><b>{fecha(tarea.fecha_entrega)}</b></span>}
        {tarea.prioridad > 0 && <span><small>Prioridad</small><b>{tarea.prioridad >= 2 ? 'Urgente' : 'Alta'}</b></span>}
        <span><small>Fecha de inicio</small><b>{tarea.iniciado_en ? fecha(tarea.iniciado_en) : '—'}</b></span>
        <span><small>Fecha de fin</small><b>{tarea.completado_en ? fecha(tarea.completado_en) : '—'}</b></span>
      </div>

      <div className="detalle-bloque">
        <b>Detalle</b>
        <p>{tarea.titulo}</p>
        {tarea.observaciones && <p className="muted">{tarea.observaciones}</p>}
      </div>

      <div className="form-actions">
        <button type="button" className="secondary" onClick={close}>Cerrar</button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// CONFIGURACIÓN
// ---------------------------------------------------------------------
function PanelConfiguracion() {
  const [aviso, setAviso] = useState('')

  return (
    <>
      <Heading kicker="Administración" title="Configuración" text="Parámetros del taller y reglas del sistema de recompensas." />

      {aviso && <p className="notice">{aviso}</p>}

      <ConfiguracionRecompensas onGuardar={() => setAviso('Parámetros guardados.')} />

      <section className="settings-grid">
        <article>
          <span>🔐</span>
          <h3>Cuentas y roles</h3>
          <p>El primer administrador se carga a mano en la base de datos. Desde “Usuarios” podés dar de alta empleados, restablecer contraseñas y desactivar cuentas sin perder su historial.</p>
        </article>

        <article>
          <span>▣</span>
          <h3>Productos y pedidos</h3>
          <p>Cada producto define su precio de venta y las etapas de fabricación con costo y duración. Al crear un pedido esas etapas se copian, de modo que editar el catálogo no altera la producción en curso.</p>
        </article>

        <article>
          <span>🚦</span>
          <h3>Semáforo de rendimiento</h3>
          <p>El sistema compara el tiempo real informado por el empleado contra el estimado por el administrador y clasifica la etapa en verde, amarillo o rojo. Solo el verde genera bono.</p>
        </article>
      </section>
    </>
  )
}
