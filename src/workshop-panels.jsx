import React, { useEffect, useRef, useState } from 'react'
import './features.css'
import { api, dinero, duracion, fecha, iniciales, useData } from './api.js'
import { Badge, Empty, Heading, Modal, Progress, QuickActions, Semaforo, Stat } from './ui.jsx'
import PanelProductos, { ConfiguracionCosteo } from './panel-productos.jsx'
import PanelPedidos from './panel-pedidos.jsx'
import PanelRecompensas, { ConfiguracionRecompensas } from './panel-recompensas.jsx'
import PanelEstadisticas from './panel-estadisticas.jsx'
import PanelUsuarios from './panel-usuarios.jsx'
import PanelMateriales from './panel-materiales.jsx'
import PanelProduccion from './panel-produccion.jsx'
import PanelPresupuestos from './panel-presupuestos.jsx'

export const seccionesAdmin = [
  ['Panel de control', '▦'],
  ['Pedidos', '⌁'],
  ['Presupuestos', '⎙'],
  ['Productos', '▱'],
  ['Materiales', '◆'],
  ['Producción diaria', '◈'],
  ['Tareas', '✓'],
  ['Recompensas', '♛'],
  ['Estadísticas', '◫'],
  ['Usuarios', '♙'],
  ['Configuración', '⚙']
]

// Secciones exclusivas de "super_admin": un "admin" común no las ve en el
// menú ni puede entrar a ellas (y la API tampoco se lo permite, ver
// auth(['super_admin']) en rutas/configuracion.js). "Usuarios" en cambio
// la ven los dos roles: lo que cambia es qué puede hacer un "admin" común
// ahí adentro (ver PanelUsuarios y rutas/usuarios.js: no puede crear
// cuentas, solo restablece la clave de un empleado y solo puede asignar
// el rol "empleado", nunca "admin").
export const SECCIONES_SUPER_ADMIN = ['Configuración']

// Filtra el menú según el rol: un "admin" común nunca ve las secciones
// de arriba; "super_admin" las ve todas.
export const seccionesPara = rol =>
  seccionesAdmin.filter(([nombre]) => rol === 'super_admin' || !SECCIONES_SUPER_ADMIN.includes(nombre))

export default function WorkshopPanels({ section, setSection, rol }) {
  // `intencion` deja que los accesos directos del panel abran un formulario
  // en la sección de destino sin pasos intermedios.
  const [intencion, setIntencion] = useState(null)
  const limpiar = () => setIntencion(null)
  const esSuperAdmin = rol === 'super_admin'

  const ir = (destino, proposito = null) => { setIntencion(proposito); setSection(destino) }

  const vistas = {
    'Panel de control': <Dashboard ir={ir} />,
    Pedidos: <PanelPedidos intencion={intencion} limpiarIntencion={limpiar} />,
    Presupuestos: <PanelPresupuestos />,
    Productos: <PanelProductos intencion={intencion} limpiarIntencion={limpiar} />,
    Materiales: <PanelMateriales />,
    'Producción diaria': <PanelProduccion />,
    Tareas: <PanelTareas />,
    Recompensas: <PanelRecompensas rol={rol} />,
    Estadísticas: <PanelEstadisticas />,
    Usuarios: <PanelUsuarios intencion={intencion} limpiarIntencion={limpiar} rol={rol} />,
    Configuración: <PanelConfiguracion />
  }

  // Defensa extra: aunque el menú ya oculta estos botones para un "admin"
  // común, si por algún motivo quedara seleccionada una sección exclusiva
  // (por ejemplo, al bajar de rol con la sesión abierta) se vuelve al
  // panel de control en vez de mostrarla.
  const seccionSegura = (!esSuperAdmin && SECCIONES_SUPER_ADMIN.includes(section)) ? 'Panel de control' : section

  return vistas[seccionSegura] || vistas['Panel de control']
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
          // "admin" y "super_admin" pueden crear cuentas (ver PanelUsuarios).
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
        <Stat
          label="Semáforo del taller"
          value={
            <span className="semaforo-taller">
              <span>🟢 {trabajo.verdes}</span>
              <span>🟡 {trabajo.amarillos}</span>
              <span>🔴 {trabajo.rojos}</span>
            </span>
          }
          hint={`${catalogo.empleados} empleados activos`}
        />
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
// CAMPO DE TEXTO CON CRECIMIENTO AUTOMÁTICO
// Se ve como un input de una sola línea, pero es un <div contentEditable>:
// no tiene el look de un <textarea> tradicional y crece en altura solo
// cuando el texto lo necesita, sin una caja grande desde el arranque.
// ---------------------------------------------------------------------
function CampoAutoCrecimiento({ value, onChange, placeholder }) {
  const ref = useRef(null)

  // Solo carga el texto inicial una vez: si sincronizáramos en cada
  // render, el cursor saltaría al principio mientras el usuario escribe.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== (value || '')) {
      ref.current.textContent = value || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fuerza el pegado como texto plano: evita que se peguen etiquetas o
  // estilos que rompan la apariencia de "input" de este campo.
  const pegar = event => {
    event.preventDefault()
    const texto = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, texto)
  }

  return (
    <div
      ref={ref}
      className="campo-auto"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={event => {
        const nodo = event.currentTarget
        const texto = nodo.textContent
        // Si se borra todo el texto, algunos navegadores dejan un <br>
        // suelto: se limpia para que ":empty" vuelva a mostrar el placeholder.
        if (!texto) nodo.innerHTML = ''
        onChange(texto)
      }}
      onPaste={pegar}
    />
  )
}

// ---------------------------------------------------------------------
// DATOS DE LA WEB PÚBLICA (nombre, WhatsApp, redes, horario)
// Reutiliza la misma tabla `configuracion` clave/valor que ya usa el
// sistema para los parámetros de recompensas.
// ---------------------------------------------------------------------
function ConfiguracionSitioPublico({ onGuardar }) {
  const configuracion = useData('/configuracion/valores', {})
  const [valores, setValores] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (configuracion.data && 'negocio_nombre' in configuracion.data) setValores(configuracion.data) }, [configuracion.data])
  if (!valores) return null

  const cambiar = clave => event => setValores({ ...valores, [clave]: event.target.value })

  const guardar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const claves = ['negocio_nombre', 'negocio_rubro', 'negocio_eslogan', 'negocio_descripcion', 'negocio_whatsapp', 'negocio_email', 'negocio_telefono', 'negocio_direccion', 'negocio_instagram', 'negocio_facebook', 'negocio_horario']
      const cuerpo = Object.fromEntries(claves.map(clave => [clave, valores[clave] || '']))
      const guardados = await api.put('/configuracion', cuerpo, configuracion.token)
      setValores(guardados)
      onGuardar?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form className="config-card config-card-publico" onSubmit={guardar}>
      <div className="card-title">Datos de la web pública</div>
      <p className="muted">Estos datos aparecen en el catálogo público: portada, pie de página, botón de WhatsApp y página de Contacto.</p>

      <div className="form-grid config-grid">
        <label>Nombre del negocio
          <input required value={valores.negocio_nombre} onChange={cambiar('negocio_nombre')} placeholder="Ej. El Atelier" />
        </label>
        <label>Rubro (junto al nombre, en el encabezado y la portada)
          <input value={valores.negocio_rubro} onChange={cambiar('negocio_rubro')} placeholder="Ej. Herrería de diseño" />
        </label>
        <label>Frase del hero (portada)
          <input value={valores.negocio_eslogan} onChange={cambiar('negocio_eslogan')} placeholder="Ej. Diseño que perdura" />
        </label>
        <label>WhatsApp (con código de país, sin signos)
          <input value={valores.negocio_whatsapp} onChange={cambiar('negocio_whatsapp')} placeholder="Ej. 5491122334455" />
        </label>
        <label>Correo de contacto
          <input type="email" value={valores.negocio_email} onChange={cambiar('negocio_email')} placeholder="contacto@tuherreria.com" />
        </label>
        <label>Teléfono (opcional)
          <input value={valores.negocio_telefono} onChange={cambiar('negocio_telefono')} />
        </label>
        <label>Dirección del taller (opcional)
          <input value={valores.negocio_direccion} onChange={cambiar('negocio_direccion')} />
        </label>
        <label>Horario de atención
          <input value={valores.negocio_horario} onChange={cambiar('negocio_horario')} placeholder="Lunes a viernes de 9 a 18 hs" />
        </label>
        <label>Instagram (URL, opcional)
          <input value={valores.negocio_instagram} onChange={cambiar('negocio_instagram')} placeholder="https://instagram.com/tuherreria" />
        </label>
        <label>Facebook (URL, opcional)
          <input value={valores.negocio_facebook} onChange={cambiar('negocio_facebook')} placeholder="https://facebook.com/tuherreria" />
        </label>
      </div>

      <label>Descripción breve (portada y buscadores)
        <CampoAutoCrecimiento
          value={valores.negocio_descripcion}
          onChange={texto => setValores({ ...valores, negocio_descripcion: texto })}
          placeholder="Una o dos frases sobre el taller."
        />
      </label>

      <GestorVideoHero
        videoInicial={valores.negocio_hero_video}
        token={configuracion.token}
        onCambiar={url => setValores(previo => ({ ...previo, negocio_hero_video: url }))}
      />

      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? 'Guardando...' : 'Guardar datos públicos'}</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// VIDEO DE FONDO DEL HERO (portada de la web pública)
// Se sube y se borra al instante (no espera al submit del formulario de
// arriba), igual que las fotos de producto/categoría.
// ---------------------------------------------------------------------
function GestorVideoHero({ videoInicial, token, onCambiar }) {
  const [video, setVideo] = useState(videoInicial || '')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setVideo(videoInicial || '') }, [videoInicial])

  const subir = async event => {
    const archivo = event.target.files?.[0]
    event.target.value = ''
    if (!archivo) return
    setSubiendo(true); setError('')
    try {
      const formData = new FormData()
      formData.append('video', archivo)
      const respuesta = await api.subir('/configuracion/video-hero', formData, token)
      setVideo(respuesta.negocio_hero_video)
      onCambiar?.(respuesta.negocio_hero_video)
    } catch (err) { setError(err.message) } finally { setSubiendo(false) }
  }

  const quitar = async () => {
    try {
      const respuesta = await api.del('/configuracion/video-hero', token)
      setVideo(respuesta.negocio_hero_video)
      onCambiar?.(respuesta.negocio_hero_video)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="stage-edit">
      <div>
        <b>Video de fondo de la portada</b>
        <span>Se reproduce en bucle, sin sonido, detrás del título del Inicio de la web pública. Formatos MP4, WEBM u OGG, hasta 40 MB. Si no cargás uno, la portada usa el fondo habitual.</span>
      </div>

      {video && (
        <video src={video} className="video-hero-preview" muted loop autoPlay playsInline />
      )}

      <div className="form-actions" style={{ marginTop: video ? 8 : 0 }}>
        <label className="add-stage" style={{ display: 'inline-flex', cursor: 'pointer' }}>
          {subiendo ? 'Subiendo...' : video ? 'Reemplazar video' : '+ Agregar video'}
          <input type="file" accept="video/mp4,video/webm,video/ogg" onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
        </label>
        {video && <button type="button" className="danger-link" onClick={quitar}>Quitar video</button>}
      </div>

      {error && <p className="form-error">{error}</p>}
    </div>
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
      <Heading kicker="Administración" title="Configuración" text="Parámetros del taller, datos de la web pública y reglas del sistema de recompensas." />

      {aviso && <p className="notice">{aviso}</p>}

      <ConfiguracionSitioPublico onGuardar={() => setAviso('Datos de la web pública actualizados.')} />

      <ConfiguracionCosteo onGuardar={() => setAviso('Costo de la mano de obra actualizado.')} />

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
