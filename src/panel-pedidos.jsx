import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, dinero, duracion, etiquetaPrioridad, fecha, porcentaje, useData } from './api.js'
import { Actions, Badge, CampoNumero, Empty, Heading, Modal, Progress, Semaforo, useAviso } from './ui.jsx'
import { ProductoModal, construirCuerpoProducto, sugerirIdPieza } from './panel-productos.jsx'

const estadosPedido = ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO']
const itemVacio = () => ({ producto_id: '', cantidad: 1, precio_unitario: '' })

// Orden de la lista de pedidos: por prioridad, % de avance, fecha de
// entrega o estado, ascendente o descendente. Se ordena por pedido (no por
// fila de producto) para que los productos de un mismo pedido no se
// separen entre sí.
const opcionesOrden = [
  { valor: 'prioridad', etiqueta: 'Prioridad' },
  { valor: 'avance', etiqueta: '% completado' },
  { valor: 'fecha_entrega', etiqueta: 'Fecha de entrega' },
  { valor: 'estado', etiqueta: 'Estado' }
]

const comparadoresOrden = {
  prioridad: (a, b) => (a.prioridad || 0) - (b.prioridad || 0),
  avance: (a, b) => (a.avance || 0) - (b.avance || 0),
  fecha_entrega: (a, b) => {
    const ta = a.fecha_entrega ? new Date(a.fecha_entrega).getTime() : Infinity
    const tb = b.fecha_entrega ? new Date(b.fecha_entrega).getTime() : Infinity
    return ta - tb
  },
  estado: (a, b) => estadosPedido.indexOf(a.estado) - estadosPedido.indexOf(b.estado)
}

export default function PanelPedidos({ intencion, limpiarIntencion }) {
  const pedidos = useData('/pedidos')
  const productos = useData('/productos')
  const categorias = useData('/categorias')
  const configuracion = useData('/configuracion/valores', {})
  const { mostrar, nodo } = useAviso()
  const [creando, setCreando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [filtro, setFiltro] = useState('ACTIVOS')
  const [ordenPor, setOrdenPor] = useState('prioridad')
  const [ordenDir, setOrdenDir] = useState('desc')

  useEffect(() => {
    if (intencion === 'nuevo') { setCreando(true); limpiarIntencion?.() }
  }, [intencion])

  const crear = async pedido => {
    await api.post('/pedidos', pedido, pedidos.token)
    setCreando(false)
    await pedidos.load()
    mostrar('Pedido creado y desplegado en etapas de producción.')
  }

  // Crea un producto nuevo sin salir del alta de pedido (ver "+ Crear
  // producto nuevo" en PedidoModal): misma lógica que PanelProductos.guardar,
  // reutilizada vía construirCuerpoProducto para no duplicarla.
  const crearProducto = async producto => {
    const cuerpo = construirCuerpoProducto(producto)
    const creado = await api.post('/productos', cuerpo, productos.token)
    await productos.load()
    return creado
  }

  const cambiarEstado = async (pedido, estado) => {
    try {
      const actualizado = await api.patch(`/pedidos/${pedido.id}`, { estado }, pedidos.token)
      setDetalle(actualizado)
      await pedidos.load()
      mostrar(`Pedido ${pedido.codigo} marcado como ${estado.toLowerCase().replace('_', ' ')}.`)
    } catch (error) { mostrar(error.message, 'error') }
  }

  const eliminar = async pedido => {
    if (!window.confirm(`¿Eliminar el pedido ${pedido.codigo}? Se borran también sus etapas.`)) return
    try {
      await api.del(`/pedidos/${pedido.id}`, pedidos.token)
      setDetalle(null)
      await pedidos.load()
      mostrar('Pedido eliminado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const visibles = pedidos.data.filter(pedido =>
    filtro === 'TODOS' ? true : filtro === 'ACTIVOS' ? ['PENDIENTE', 'EN_PRODUCCION', 'PAUSADO'].includes(pedido.estado) : pedido.estado === filtro)

  const visiblesOrdenados = [...visibles].sort((a, b) => {
    const resultado = comparadoresOrden[ordenPor](a, b)
    return ordenDir === 'desc' ? -resultado : resultado
  })

  // Una fila por producto del pedido: cada producto tiene su propio avance
  // de etapas y su propio subtotal. La sección es solo informativa: los
  // pedidos/productos no se asignan a empleados (las etapas se asignan
  // desde Tareas), por eso no hay columna de empleado.
  const filas = visiblesOrdenados.flatMap(pedido => pedido.items.map(item => {
    const etapasItem = pedido.etapas
      .filter(etapa => String(etapa.pedido_item_id) === String(item.id))
      .sort((a, b) => a.orden - b.orden)
    const actual = etapasItem.find(etapa => etapa.estado !== 'COMPLETADA') || null
    const completadas = etapasItem.filter(etapa => etapa.estado === 'COMPLETADA').length
    return { clave: `${pedido.id}-${item.id}`, pedido, item, etapasItem, actual, completadas }
  }))

  return (
    <>
      <Heading kicker="Trabajo comprometido" title="Pedidos" text="Cada pedido agrupa uno o más productos y refleja su avance según las etapas de fabricación.">
        <div className="actions">
          <select className="filter" value={filtro} onChange={event => setFiltro(event.target.value)}>
            <option value="ACTIVOS">Activos</option>
            <option value="TODOS">Todos</option>
            {estadosPedido.map(estado => <option key={estado} value={estado}>{estado.replace('_', ' ')}</option>)}
          </select>
          <select className="filter" value={ordenPor} onChange={event => setOrdenPor(event.target.value)} title="Ordenar por">
            {opcionesOrden.map(opcion => <option key={opcion.valor} value={opcion.valor}>Ordenar: {opcion.etiqueta}</option>)}
          </select>
          <button type="button" className="filter" onClick={() => setOrdenDir(ordenDir === 'desc' ? 'asc' : 'desc')} title="Cambiar dirección del orden">
            {ordenDir === 'desc' ? '↓ Descendente' : '↑ Ascendente'}
          </button>
          <button className="primary" onClick={() => setCreando(true)}>+ Nuevo pedido</button>
        </div>
      </Heading>

      {nodo}

      {pedidos.loading ? <p>Cargando pedidos...</p> : pedidos.error ? <p className="form-error">{pedidos.error}</p> : filas.length ? (
        <section className="orders-card">
          <div className="order-head pedidos-head">
            <span>Producto</span><span>Cantidad</span><span>Etapas</span><span>Prioridad</span><span>Entrega</span><span>Cumplimiento</span><span>Total</span>
          </div>

          {filas.map(fila => {
            const avanceItem = porcentaje(fila.completadas, fila.etapasItem.length)
            return (
              <div className="order-row pedidos-row" key={fila.clave} onClick={() => setDetalle(fila.pedido)}>
                <div className="product">
                  <div className="product-thumb">▦</div>
                  <div>
                    <b>{fila.item.producto}</b>
                    <small>{fila.pedido.codigo}</small>
                  </div>
                </div>

                <div className="cantidad-cell"><b>{fila.item.cantidad}</b></div>

                <div className="etapas-cell">
                  <b>{fila.completadas}/{fila.etapasItem.length}</b>
                </div>

                <div className="prioridad-cell"><span className={`prioridad ${etiquetaPrioridad(fila.pedido.prioridad).toLowerCase()}`}>{etiquetaPrioridad(fila.pedido.prioridad)}</span></div>

                <div><em className="stage">{fecha(fila.pedido.fecha_entrega)}</em></div>

                <div className="progress-cell"><b>{avanceItem}%</b><Progress value={avanceItem} /></div>

                <div className="total-cell"><b>{dinero(fila.item.subtotal)}</b></div>
              </div>
            )
          })}
        </section>
      ) : (
        <Empty title="No hay pedidos en esta vista" text="Creá un pedido eligiendo productos del catálogo." action={() => setCreando(true)} label="Crear pedido" />
      )}

      {creando && (
        <PedidoModal
          productos={productos.data.filter(producto => producto.activo)}
          productosExistentes={productos.data}
          categorias={categorias.data}
          costoHora={Number(configuracion.data.costo_hora_mano_obra) || 0}
          token={productos.token}
          crearProducto={crearProducto}
          close={() => setCreando(false)}
          save={crear}
        />
      )}

      {detalle && (
        <DetallePedido
          pedido={detalle}
          close={() => setDetalle(null)}
          onEstado={cambiarEstado}
          onEliminar={eliminar}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------
// SELECTOR DE FECHA (Día → Mes → Año)
// Tres combos en ese orden en vez del selector nativo del navegador, que
// en la mayoría de los sistemas muestra mes/día/año. El valor que entra y
// sale sigue siendo un string ISO "AAAA-MM-DD" (lo que ya espera el
// backend), así que no cambia nada fuera de este componente.
// ---------------------------------------------------------------------
const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function SelectorFecha({ value, onChange }) {
  // Día, mes y año se guardan como estado propio (no derivado del string
  // ISO compuesto): mientras falta elegir alguno de los tres, la fecha
  // completa todavía no existe (onChange('') no le llega nada al padre),
  // pero el combo que sí se eligió tiene que seguir mostrando su valor en
  // vez de volver a "Día"/"Mes"/"Año" en cada render.
  const inicial = value ? value.split('-').map(Number) : [null, null, null]
  const [anio, setAnio] = useState(inicial[0])
  const [mes, setMes] = useState(inicial[1])
  const [dia, setDia] = useState(inicial[2])
  const anioActual = new Date().getFullYear()
  const anios = Array.from({ length: 8 }, (_, indice) => anioActual - 1 + indice)

  const actualizar = (campo, valor) => {
    const partes = { anio, mes, dia, [campo]: valor }
    if (campo === 'anio') setAnio(valor)
    else if (campo === 'mes') setMes(valor)
    else setDia(valor)
    onChange(partes.anio && partes.mes && partes.dia
      ? `${partes.anio}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`
      : '')
  }

  return (
    <div className="fecha-selector">
      <select value={dia || ''} onChange={event => actualizar('dia', Number(event.target.value) || null)}>
        <option value="">Día</option>
        {Array.from({ length: 31 }, (_, indice) => indice + 1).map(valor => <option key={valor} value={valor}>{valor}</option>)}
      </select>
      <select value={mes || ''} onChange={event => actualizar('mes', Number(event.target.value) || null)}>
        <option value="">Mes</option>
        {nombresMeses.map((nombre, indice) => <option key={nombre} value={indice + 1}>{nombre}</option>)}
      </select>
      <select value={anio || ''} onChange={event => actualizar('anio', Number(event.target.value) || null)}>
        <option value="">Año</option>
        {anios.map(valor => <option key={valor} value={valor}>{valor}</option>)}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------
// ALTA DE PEDIDO
// El presupuesto ya no es un paso aparte: a medida que se eligen
// productos, el resumen de mano de obra, costo de producción,
// precio y ganancia se arma solo, con los mismos valores calculados que
// devuelve /productos (ver conCostoCalculado en server/rutas/productos.js).
// ---------------------------------------------------------------------
function PedidoModal({ productos, productosExistentes, categorias, costoHora, token, crearProducto, close, save }) {
  const [items, setItems] = useState([itemVacio()])
  const [entrega, setEntrega] = useState('')
  const [prioridad, setPrioridad] = useState(0)
  const [notas, setNotas] = useState('')
  const [creandoProductoPara, setCreandoProductoPara] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarItem = (indice, campo, valor) =>
    setItems(items.map((item, posicion) => (posicion === indice ? { ...item, [campo]: valor } : item)))

  const detalleProducto = id => productos.find(producto => String(producto.id) === String(id))

  const total = items.reduce((suma, item) => {
    const producto = detalleProducto(item.producto_id)
    const precio = item.precio_unitario === '' ? producto?.precio_venta || 0 : Number(item.precio_unitario)
    return suma + precio * (Number(item.cantidad) || 0)
  }, 0)

  // Presupuesto en vivo: mismo costo de mano de obra que calcula el backend
  // por producto (costo_mano_obra), multiplicado por la cantidad de cada
  // ítem del pedido. Es el mismo costo que se copia al crear el pedido
  // (ver POST /pedidos en server/rutas/pedidos.js).
  const resumen = items.reduce((acumulado, item) => {
    const producto = detalleProducto(item.producto_id)
    if (!producto) return acumulado
    const cantidad = Number(item.cantidad) || 0
    return { manoObra: acumulado.manoObra + (Number(producto.costo_mano_obra) || 0) * cantidad }
  }, { manoObra: 0 })
  const costoProduccion = resumen.manoObra
  const ganancia = total - costoProduccion

  const enviar = async event => {
    event.preventDefault()
    const validos = items.filter(item => item.producto_id)
    if (!validos.length) return setError('Elegí al menos un producto.')
    setBusy(true); setError('')
    try {
      await save({
        fecha_entrega: entrega || null,
        prioridad: Number(prioridad) || 0,
        notas,
        items: validos.map(item => ({
          producto_id: item.producto_id,
          cantidad: Number(item.cantidad) || 1,
          precio_unitario: item.precio_unitario === '' ? undefined : Number(item.precio_unitario)
        }))
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!productos.length) {
    return (
      <Modal title="Nuevo pedido" close={close}>
        <Empty title="Primero creá un producto" text="Los pedidos se arman con productos del catálogo y sus etapas." action={close} label="Entendido" />
      </Modal>
    )
  }

  return (
    <Modal title="Nuevo pedido" subtitle="Productos → presupuesto: todo en un solo paso. Los empleados se asignan después, desde Tareas." close={close} ancho="720px">
      <form onSubmit={enviar}>
        <div className="form-grid">
          <label>Fecha de entrega
            <SelectorFecha value={entrega} onChange={setEntrega} />
          </label>

          <label>Prioridad
            <select value={prioridad} onChange={event => setPrioridad(event.target.value)}>
              <option value="0">Normal</option>
              <option value="1">Alta</option>
              <option value="2">Urgente</option>
            </select>
          </label>
        </div>

        <div className="stage-edit">
          <div>
            <b>Productos del pedido</b>
            <span>Cada producto despliega sus etapas como tareas de producción. Si el producto todavía no existe, se puede crear sin salir de acá.</span>
          </div>

          {items.map((item, indice) => {
            const producto = detalleProducto(item.producto_id)
            return (
              <div className="item-bloque" key={indice}>
                <div className="item-linea">
                  <select required value={item.producto_id} onChange={event => cambiarItem(indice, 'producto_id', event.target.value)}>
                    <option value="">Seleccionar producto</option>
                    {productos.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.nombre} — {dinero(opcion.precio_venta)}</option>)}
                  </select>
                  <input min="1" type="number" value={item.cantidad} onChange={event => cambiarItem(indice, 'cantidad', event.target.value)} title="Cantidad" />
                  <CampoNumero min="0" step="0.01" value={item.precio_unitario} onChange={valor => cambiarItem(indice, 'precio_unitario', valor)} placeholder={producto ? String(producto.precio_venta) : 'Precio'} title="Precio unitario" />
                  <button type="button" onClick={() => setItems(items.filter((_, posicion) => posicion !== indice))}>×</button>
                </div>

                <button type="button" className="add-stage nuevo-producto-inline" onClick={() => setCreandoProductoPara(indice)}>+ Crear producto nuevo</button>

                {producto && (
                  <div className="tags">
                    {producto.etapas.map(etapa => (
                      <span key={etapa.id}>{etapa.orden}. {etapa.nombre} · {duracion(etapa.minutos_estimados * (Number(item.cantidad) || 1))}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <button type="button" className="add-stage" onClick={() => setItems([...items, itemVacio()])}>+ Agregar producto</button>
        </div>

        <div className="stage-edit">
          <div>
            <b>Presupuesto</b>
            <span>Se arma solo con la mano de obra y el precio de los productos elegidos arriba.</span>
          </div>
          <p className="stage-total">
            Mano de obra {dinero(resumen.manoObra)} ·
            <b> Costo de producción {dinero(costoProduccion)}</b> ·
            Precio de venta {dinero(total)} ·
            <b className={ganancia >= 0 ? ' positivo' : ' negativo'}> Ganancia {dinero(ganancia)}</b>
          </p>
        </div>

        <label>Notas del pedido<textarea value={notas} onChange={event => setNotas(event.target.value)} placeholder="Detalles de fabricación, condiciones de pago, etc." /></label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Crear pedido" busy={busy} />
      </form>

      {/* Portal: ProductoModal trae su propio <form>, y anidarlo dentro del
          <form> de este modal sería HTML inválido (un <form> no puede
          contener otro). Se monta aparte, directo en <body>. */}
      {creandoProductoPara !== null && createPortal(
        <ProductoModal
          producto={{ chapita_id: sugerirIdPieza(productosExistentes) }}
          productosExistentes={productosExistentes}
          categorias={categorias}
          costoHora={costoHora}
          token={token}
          close={() => setCreandoProductoPara(null)}
          save={async nuevoProducto => {
            const creado = await crearProducto(nuevoProducto)
            cambiarItem(creandoProductoPara, 'producto_id', String(creado.id))
            setCreandoProductoPara(null)
          }}
        />,
        document.body
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------
// DETALLE DEL PEDIDO (solo informativo)
// Muestra el avance de las etapas de cada producto. Acá no se asignan
// empleados: eso se hace únicamente desde la sección Tareas.
// ---------------------------------------------------------------------
function DetallePedido({ pedido, close, onEstado, onEliminar }) {
  const ganancia = pedido.total - pedido.costo_estimado

  return (
    <Modal title={`Pedido ${pedido.codigo}`} subtitle={`${pedido.avance}% completado · ${pedido.etapas_completadas} de ${pedido.etapas_totales} etapas`} close={close} ancho="760px">
      <div className="detalle-pedido">
        <section className="detalle-bloque">
          <b>Estado y entrega</b>
          <label className="status-control">
            Estado del pedido
            <select value={pedido.estado} onChange={event => onEstado(pedido, event.target.value)}>
              {estadosPedido.map(estado => <option key={estado} value={estado}>{estado.replace('_', ' ')}</option>)}
            </select>
          </label>
          <small>Entrega: {fecha(pedido.fecha_entrega)}</small>
        </section>
      </div>

      <Progress value={pedido.avance} />

      <p className="stage-total">
        Precio de venta {dinero(pedido.total)} ·{pedido.costo_materiales_total > 0 ? ` Materiales ${dinero(pedido.costo_materiales_total)} ·` : ''} Mano de obra {dinero(pedido.costo_mano_obra_total)} ·
        <b> Costo de producción {dinero(pedido.costo_estimado)}</b> ·
        <b className={ganancia >= 0 ? ' positivo' : ' negativo'}> Ganancia {dinero(ganancia)}</b>
      </p>

      {pedido.items.map(item => {
        const gananciaItem = item.subtotal - item.costo_produccion
        return (
          <section className="detalle-item" key={item.id}>
            <div className="detalle-item-head">
              <b>{item.cantidad}× {item.producto}</b>
              <span>{dinero(item.subtotal)}</span>
            </div>

            <p className="stage-total">
              {item.costo_materiales > 0 ? `Materiales ${dinero(item.costo_materiales)} · ` : ''}Mano de obra {dinero(item.costo_mano_obra)} ·
              <b> Costo producción {dinero(item.costo_produccion)}</b> ·
              <b className={gananciaItem >= 0 ? ' positivo' : ' negativo'}> Ganancia {dinero(gananciaItem)}</b>
            </p>

            <div className="etapas-tabla">
              {pedido.etapas.filter(etapa => String(etapa.pedido_item_id) === String(item.id)).map(etapa => (
                <div className="etapa-fila" key={etapa.id}>
                  <span className="etapa-nombre">{etapa.orden}. {etapa.nombre}</span>
                  <Badge estado={etapa.estado} />
                  <span className="etapa-tiempo">
                    {duracion(etapa.minutos_estimados)}
                    {etapa.minutos_reales ? <b> → {duracion(etapa.minutos_reales)}</b> : null}
                  </span>
                  <Semaforo valor={etapa.semaforo} compacto />
                  <span className="etapa-responsable" title="La asignación se gestiona desde Tareas">{etapa.responsable || 'Sin asignar'}</span>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {pedido.notas && <p className="form-note">Notas: {pedido.notas}</p>}

      <div className="form-actions">
        <button type="button" className="danger-link" onClick={() => onEliminar(pedido)}>Eliminar pedido</button>
        <button type="button" className="primary" onClick={close}>Cerrar</button>
      </div>
    </Modal>
  )
}
