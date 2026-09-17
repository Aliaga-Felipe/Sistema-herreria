import React, { useEffect, useRef, useState } from 'react'
import { api, dinero, duracion, useData } from './api.js'
import { Actions, Empty, Heading, Modal, useAviso } from './ui.jsx'

const etapaVacia = () => ({ nombre: '', costo: 0, minutos_estimados: 60 })
const etapasSugeridas = [
  { nombre: 'Diseño y medidas', costo: 0, minutos_estimados: 30 },
  { nombre: 'Corte de material', costo: 0, minutos_estimados: 60 },
  { nombre: 'Soldadura', costo: 0, minutos_estimados: 120 },
  { nombre: 'Pintura y terminación', costo: 0, minutos_estimados: 45 }
]

export default function PanelProductos({ intencion, limpiarIntencion }) {
  const productos = useData('/productos')
  const categorias = useData('/categorias')
  const materiales = useData('/materiales?activos=true')
  const configuracion = useData('/configuracion/valores', {})
  const { mostrar, nodo } = useAviso()
  const [editando, setEditando] = useState(null)

  // El panel principal puede abrir el formulario directamente.
  useEffect(() => {
    if (intencion === 'nuevo') { setEditando({}); limpiarIntencion?.() }
  }, [intencion])

  // Guarda el producto pero NO cierra el modal: si es nuevo, lo deja
  // abierto ya con id asignado para que el admin pueda cargar fotos sin
  // pasos extra. El admin cierra el modal cuando termina.
  const guardar = async producto => {
    const cuerpo = {
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      precio_venta: Number(producto.precio_venta),
      categoria_id: producto.categoria_id || null,
      destacado: Boolean(producto.destacado),
      horas_hombre: Number(producto.horas_hombre) || 0,
      etapas: producto.etapas.map(etapa => ({ ...etapa, costo: Number(etapa.costo), minutos_estimados: Number(etapa.minutos_estimados) })),
      materiales: producto.materiales.map(item => ({ material_id: item.material_id, cantidad: Number(item.cantidad) }))
    }
    const resultado = producto.id
      ? await api.put(`/productos/${producto.id}`, cuerpo, productos.token)
      : await api.post('/productos', cuerpo, productos.token)
    await productos.load()
    mostrar(producto.id ? 'Producto actualizado.' : 'Producto creado. Ahora podés agregarle fotos.')
    setEditando(resultado)
  }

  const eliminar = async producto => {
    if (!window.confirm(`¿Eliminar "${producto.nombre}"? Si tiene pedidos asociados solo se desactivará.`)) return
    try {
      const respuesta = await api.del(`/productos/${producto.id}`, productos.token)
      await productos.load()
      mostrar(respuesta.mensaje)
    } catch (error) { mostrar(error.message, 'error') }
  }

  const alternarActivo = async producto => {
    try {
      await api.patch(`/productos/${producto.id}/activo`, { activo: !producto.activo }, productos.token)
      await productos.load()
      mostrar(producto.activo ? 'Producto desactivado.' : 'Producto reactivado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  return (
    <>
      <Heading kicker="Catálogo de fabricación" title="Productos" text="Cada producto define su precio de venta, categoría, fotos y las etapas que lo fabrican. Lo que cargues acá es lo que se ve en la web pública.">
        <button className="primary" onClick={() => setEditando({})}>+ Nuevo producto</button>
      </Heading>

      {nodo}

      {productos.loading ? <p>Cargando productos...</p> : productos.error ? <p className="form-error">{productos.error}</p> : productos.data.length ? (
        <section className="product-grid">
          {productos.data.map(producto => (
            <article className={`product-card ${producto.activo ? '' : 'inactivo'}`} key={producto.id}>
              {producto.imagenes?.[0]?.url
                ? <img src={producto.imagenes[0].url} alt={producto.nombre} className="product-thumb-img" />
                : <div className="product-symbol">▱</div>}

              <div className="product-info">
                <h3>{producto.nombre} {producto.destacado && <span title="Destacado en la web">★</span>}</h3>
                <p>{producto.categoria_nombre || 'Sin categoría'}</p>
                <p>{producto.descripcion || 'Sin descripción.'}</p>

                <div className="product-numbers">
                  <span><small>Precio</small><b>{dinero(producto.precio_venta)}</b></span>
                  <span><small>Costo etapas</small><b>{dinero(producto.costo_total)}</b></span>
                  <span className={producto.margen >= 0 ? 'positivo' : 'negativo'}><small>Margen</small><b>{dinero(producto.margen)}</b></span>
                  <span><small>Duración</small><b>{duracion(producto.minutos_totales)}</b></span>
                </div>

                <div className="product-numbers">
                  <span><small>Materiales</small><b>{dinero(producto.costo_materiales)}</b></span>
                  <span><small>Mano de obra</small><b>{dinero(producto.costo_mano_obra)}</b></span>
                  <span><small>Costo materiales + M.O.</small><b>{dinero(producto.costo_calculado_total)}</b></span>
                  <span><small>Horas-hombre</small><b>{producto.horas_hombre}</b></span>
                </div>

                <div className="tags">
                  {producto.etapas.map(etapa => (
                    <span key={etapa.id}>{etapa.orden}. {etapa.nombre} · {duracion(etapa.minutos_estimados)} · {dinero(etapa.costo)}</span>
                  ))}
                </div>
              </div>

              <div className="card-buttons">
                <button onClick={() => setEditando(producto)}>Editar</button>
                <button onClick={() => alternarActivo(producto)}>{producto.activo ? 'Desactivar' : 'Activar'}</button>
                <button className="danger-link" onClick={() => eliminar(producto)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay productos cargados" text="Creá el primer producto con sus etapas de fabricación." action={() => setEditando({})} label="Crear producto" />
      )}

      {editando && (
        <ProductoModal
          producto={editando}
          categorias={categorias.data}
          materialesDisponibles={materiales.data}
          costoHora={Number(configuracion.data.costo_hora_mano_obra) || 0}
          token={productos.token}
          close={() => setEditando(null)}
          save={guardar}
        />
      )}
    </>
  )
}

function ProductoModal({ producto, categorias, materialesDisponibles, costoHora, token, close, save }) {
  const editar = Boolean(producto.id)
  const [nombre, setNombre] = useState(producto.nombre || '')
  const [descripcion, setDescripcion] = useState(producto.descripcion || '')
  const [precio, setPrecio] = useState(producto.precio_venta ?? '')
  const [categoriaId, setCategoriaId] = useState(producto.categoria_id || '')
  const [destacado, setDestacado] = useState(Boolean(producto.destacado))
  const [horasHombre, setHorasHombre] = useState(producto.horas_hombre ?? 0)
  const [etapas, setEtapas] = useState(producto.etapas?.length ? producto.etapas.map(({ nombre, costo, minutos_estimados }) => ({ nombre, costo, minutos_estimados })) : etapasSugeridas)
  const [materiales, setMateriales] = useState(producto.materiales?.length ? producto.materiales.map(({ material_id, cantidad }) => ({ material_id, cantidad })) : [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarEtapa = (indice, campo, valor) =>
    setEtapas(etapas.map((etapa, posicion) => (posicion === indice ? { ...etapa, [campo]: valor } : etapa)))

  const cambiarMaterial = (indice, campo, valor) =>
    setMateriales(materiales.map((item, posicion) => (posicion === indice ? { ...item, [campo]: valor } : item)))

  const costoTotal = etapas.reduce((total, etapa) => total + (Number(etapa.costo) || 0), 0)
  const minutosTotal = etapas.reduce((total, etapa) => total + (Number(etapa.minutos_estimados) || 0), 0)
  const margen = (Number(precio) || 0) - costoTotal

  const detalleMaterial = id => materialesDisponibles.find(material => String(material.id) === String(id))
  const costoMateriales = materiales.reduce((total, item) => total + (Number(item.cantidad) || 0) * (detalleMaterial(item.material_id)?.precio_unitario || 0), 0)
  const costoManoObra = (Number(horasHombre) || 0) * costoHora
  const costoCalculadoTotal = costoMateriales + costoManoObra

  const enviar = async event => {
    event.preventDefault()
    if (!etapas.length) return setError('El producto necesita al menos una etapa.')
    if (etapas.some(etapa => !etapa.nombre.trim() || Number(etapa.minutos_estimados) <= 0)) return setError('Cada etapa necesita nombre y una duración mayor a cero.')
    if (materiales.some(item => !item.material_id || Number(item.cantidad) <= 0)) return setError('Cada material necesita elegirse y tener una cantidad mayor a cero.')
    setBusy(true); setError('')
    try { await save({ id: producto.id, nombre, descripcion, precio_venta: precio, categoria_id: categoriaId || null, destacado, horas_hombre: horasHombre, etapas, materiales }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={editar ? 'Editar producto' : 'Nuevo producto'} subtitle="Definí el precio, la categoría, las fotos y las etapas de fabricación." close={close} ancho="720px">
      <form onSubmit={enviar}>
        <label>Nombre del producto
          <input required value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Portón de hierro forjado" />
        </label>

        <div className="form-grid config-grid">
          <label>Categoría
            <select value={categoriaId} onChange={event => setCategoriaId(event.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map(categoria => <option key={categoria.id} value={categoria.id}>{categoria.nombre}{categoria.activo ? '' : ' (oculta)'}</option>)}
            </select>
          </label>

          <label>Precio de venta
            <input required min="1" step="0.01" type="number" value={precio} onChange={event => setPrecio(event.target.value)} placeholder="0" />
          </label>

          <label>Horas-hombre de fabricación
            <input min="0" step="0.25" type="number" value={horasHombre} onChange={event => setHorasHombre(event.target.value)} placeholder="0" />
          </label>
        </div>

        <label>Descripción
          <textarea value={descripcion} onChange={event => setDescripcion(event.target.value)} placeholder="Medidas, materiales o notas de fabricación. Esto se muestra tal cual en la web pública." />
        </label>

        <label className="config-check destacado-check">
          <input type="checkbox" checked={destacado} onChange={event => setDestacado(event.target.checked)} />
          <span className="destacado-check-texto">
            <b>★ Producto destacado</b>
            <small>Se muestra en la sección "Productos destacados" de la portada de la web</small>
          </span>
        </label>

        {editar
          ? <GestorImagenes productoId={producto.id} imagenesIniciales={producto.imagenes || []} token={token} />
          : <p className="muted" style={{ marginTop: 4 }}>Guardá el producto para poder cargarle fotos.</p>}

        <div className="stage-edit">
          <div>
            <b>Etapas de fabricación</b>
            <span>Nombre, costo y duración estimada de cada etapa. Esto es información interna: nunca se muestra en la web pública.</span>
          </div>

          <div className="stage-grid-head">
            <small>#</small><small>Etapa</small><small>Costo</small><small>Minutos</small><small />
          </div>

          {etapas.map((etapa, indice) => (
            <div className="stage-grid-row" key={indice}>
              <small>{indice + 1}</small>
              <input required value={etapa.nombre} onChange={event => cambiarEtapa(indice, 'nombre', event.target.value)} placeholder="Nombre de la etapa" />
              <input required min="0" step="0.01" type="number" value={etapa.costo} onChange={event => cambiarEtapa(indice, 'costo', event.target.value)} />
              <input required min="1" type="number" value={etapa.minutos_estimados} onChange={event => cambiarEtapa(indice, 'minutos_estimados', event.target.value)} />
              <button type="button" onClick={() => setEtapas(etapas.filter((_, posicion) => posicion !== indice))}>×</button>
            </div>
          ))}

          <button type="button" className="add-stage" onClick={() => setEtapas([...etapas, etapaVacia()])}>+ Agregar etapa</button>

          <p className="stage-total">
            Costo total {dinero(costoTotal)} · Duración {duracion(minutosTotal)} ·
            <b className={margen >= 0 ? ' positivo' : ' negativo'}> Margen {dinero(margen)}</b>
          </p>
        </div>

        <div className="stage-edit">
          <div>
            <b>Materiales y costo calculado</b>
            <span>Cantidad de cada material que usa este producto. El costo se calcula solo: materiales cargados aquí + horas-hombre × costo de la hora (configurable en Configuración).</span>
          </div>

          {materialesDisponibles.length ? (
            <>
              <div className="stage-grid-head">
                <small>#</small><small>Material</small><small>Cantidad</small><small>Subtotal</small><small />
              </div>

              {materiales.map((item, indice) => {
                const material = detalleMaterial(item.material_id)
                const subtotal = (Number(item.cantidad) || 0) * (material?.precio_unitario || 0)
                return (
                  <div className="stage-grid-row" key={indice}>
                    <small>{indice + 1}</small>
                    <select required value={item.material_id} onChange={event => cambiarMaterial(indice, 'material_id', event.target.value)}>
                      <option value="">Seleccionar material</option>
                      {materialesDisponibles.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.nombre} ({opcion.unidad_medida}) — {dinero(opcion.precio_unitario)}</option>)}
                    </select>
                    <input required min="0.001" step="0.001" type="number" value={item.cantidad} onChange={event => cambiarMaterial(indice, 'cantidad', event.target.value)} placeholder={material?.unidad_medida || 'Cantidad'} />
                    <span>{dinero(subtotal)}</span>
                    <button type="button" onClick={() => setMateriales(materiales.filter((_, posicion) => posicion !== indice))}>×</button>
                  </div>
                )
              })}

              <button type="button" className="add-stage" onClick={() => setMateriales([...materiales, { material_id: '', cantidad: 1 }])}>+ Agregar material</button>
            </>
          ) : (
            <p className="muted">Todavía no cargaste materiales en el catálogo. Hacelo desde la sección "Materiales" del panel.</p>
          )}

          <p className="stage-total">
            Materiales {dinero(costoMateriales)} · Mano de obra {dinero(costoManoObra)} ({horasHombre || 0} h × {dinero(costoHora)}) ·
            <b> Costo calculado total {dinero(costoCalculadoTotal)}</b>
          </p>
        </div>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label={editar ? 'Guardar cambios' : 'Crear producto'} busy={busy} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// COSTO POR HORA DE MANO DE OBRA (editable por el admin)
// Se usa junto a las horas-hombre de cada producto para calcular su costo
// de mano de obra dentro del costo materiales + mano de obra.
// ---------------------------------------------------------------------
export function ConfiguracionCosteo({ onGuardar }) {
  const configuracion = useData('/configuracion/valores', {})
  const [valor, setValor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (configuracion.data && 'costo_hora_mano_obra' in configuracion.data) setValor(configuracion.data.costo_hora_mano_obra) }, [configuracion.data])
  if (valor === null) return null

  const guardar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await api.put('/configuracion', { costo_hora_mano_obra: valor }, configuracion.token)
      onGuardar?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form className="config-card" onSubmit={guardar}>
      <div className="card-title">Costo de la mano de obra</div>
      <p className="muted">Se multiplica por las horas-hombre de cada producto para calcular su costo de mano de obra, dentro del costo materiales + mano de obra.</p>

      <div className="form-grid config-grid">
        <label>Costo por hora
          <input min="0" step="0.01" type="number" value={valor} onChange={event => setValor(event.target.value)} />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? 'Guardando...' : 'Guardar costo por hora'}</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// GALERÍA DE IMÁGENES DEL PRODUCTO
// Sube archivos al servidor (server/uploads/productos) y administra cuál
// es la imagen principal, la que se usa en las grillas del catálogo.
// ---------------------------------------------------------------------
function GestorImagenes({ productoId, imagenesIniciales, token }) {
  const [imagenes, setImagenes] = useState(imagenesIniciales)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const zonaRef = useRef(null)

  useEffect(() => { setImagenes(imagenesIniciales) }, [productoId])

  // Punto único de subida: lo usan tanto el selector de archivos como el
  // arrastrar-y-soltar y el pegado (Ctrl+V) de una imagen del portapapeles.
  const subirImagen = async archivo => {
    if (!archivo) return
    if (!archivo.type || !archivo.type.startsWith('image/')) { setError('Solo se pueden subir imágenes.'); return }
    setSubiendo(true); setError('')
    try {
      const formData = new FormData()
      formData.append('imagen', archivo, archivo.name || `foto-pegada-${Date.now()}.png`)
      const respuesta = await api.subir(`/productos/${productoId}/imagenes`, formData, token)
      setImagenes(respuesta.imagenes)
    } catch (err) { setError(err.message) } finally { setSubiendo(false) }
  }

  const subirArchivo = event => {
    const archivo = event.target.files?.[0]
    event.target.value = ''
    subirImagen(archivo)
  }

  const alSoltar = event => {
    event.preventDefault()
    setArrastrando(false)
    subirImagen(event.dataTransfer.files?.[0])
  }

  // Mientras esta galería está montada (el modal de edición abierto), un
  // Ctrl+V en cualquier parte de la página sube la imagen del portapapeles,
  // sin necesidad de hacer foco en un campo puntual.
  useEffect(() => {
    const alPegar = event => {
      const items = event.clipboardData?.items
      if (!items) return
      const item = Array.from(items).find(item => item.type && item.type.startsWith('image/'))
      if (!item) return
      event.preventDefault()
      subirImagen(item.getAsFile())
    }
    window.addEventListener('paste', alPegar)
    return () => window.removeEventListener('paste', alPegar)
  }, [productoId, token])

  const marcarPrincipal = async imagenId => {
    try {
      const respuesta = await api.patch(`/productos/${productoId}/imagenes/${imagenId}/principal`, {}, token)
      setImagenes(respuesta.imagenes)
    } catch (err) { setError(err.message) }
  }

  const eliminarImagen = async imagenId => {
    try {
      const respuesta = await api.del(`/productos/${productoId}/imagenes/${imagenId}`, token)
      setImagenes(respuesta.imagenes)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="stage-edit">
      <div>
        <b>Fotos del producto</b>
        <span>La primera foto marcada como principal es la que aparece en el catálogo. Formatos: JPG, PNG, WEBP o GIF, hasta 8 MB.</span>
      </div>

      {imagenes.length > 0 && (
        <div className="imagenes-grid">
          {imagenes.map(imagen => (
            <div className={`imagen-item ${imagen.es_principal ? 'principal' : ''}`} key={imagen.id}>
              <img src={imagen.url} alt="" />
              {imagen.es_principal && <span className="imagen-badge">Principal</span>}
              <div className="imagen-acciones">
                {!imagen.es_principal && <button type="button" onClick={() => marcarPrincipal(imagen.id)}>Hacer principal</button>}
                <button type="button" className="danger-link" onClick={() => eliminarImagen(imagen.id)}>Quitar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        ref={zonaRef}
        className={`zona-subida${arrastrando ? ' arrastrando' : ''}${subiendo ? ' subiendo' : ''}`}
        onDragOver={event => { event.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
      >
        <span className="zona-subida-icono" aria-hidden="true">🖼️</span>
        <p className="zona-subida-texto">
          {subiendo
            ? 'Subiendo...'
            : <>Arrastrá una foto acá o pegala con <b>Ctrl+V</b></>}
        </p>
        <label className="add-stage" style={{ display: 'inline-flex', cursor: 'pointer' }}>
          {subiendo ? 'Subiendo...' : '+ Elegir foto desde mis archivos'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={subirArchivo} disabled={subiendo} style={{ display: 'none' }} />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
