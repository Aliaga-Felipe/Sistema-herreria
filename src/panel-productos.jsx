import React, { useEffect, useRef, useState } from 'react'
import { api, dinero, duracion, useData } from './api.js'
import { Actions, CampoNumero, Empty, Heading, Modal, useAviso } from './ui.jsx'

const etapaVacia = () => ({ nombre: '', minutos_estimados: 60 })
const etapasSugeridas = [
  { nombre: 'Diseño y medidas', minutos_estimados: 30 },
  { nombre: 'Corte de material', minutos_estimados: 60 },
  { nombre: 'Soldadura', minutos_estimados: 120 },
  { nombre: 'Pintura y terminación', minutos_estimados: 45 }
]

// Genera automáticamente el próximo ID de producto (chapita) libre para
// prellenar el campo al crear un producto nuevo: completa huecos en vez de
// ir siempre al final, con formato de ceros a la izquierda (001, 002...
// 099, 100...). Sólo mira los ID numéricos ya usados; un ID con letras no
// cuenta para la sugerencia pero el admin puede seguir escribiendo el que
// quiera a mano. El ID que se guarda es el que muestra la chapita de la
// web pública. El backend aplica el mismo criterio si el ID llega vacío
// (ver generarChapitaId en server/rutas/productos.js).
export const sugerirIdPieza = productos => {
  const usados = new Set(
    productos
      .map(producto => (producto.chapita_id || '').trim())
      .filter(valor => /^\d+$/.test(valor))
      .map(valor => parseInt(valor, 10))
  )
  let siguiente = 1
  while (usados.has(siguiente)) siguiente++
  return String(siguiente).padStart(3, '0')
}

// Arma el cuerpo que espera POST/PUT /productos a partir del estado del
// formulario (ProductoModal). Se exporta para que otras pantallas que
// también dan de alta productos (como "+ Nuevo producto" desde el alta de
// un pedido, ver panel-pedidos.jsx) reutilicen exactamente la misma lógica
// en vez de duplicarla.
export const construirCuerpoProducto = producto => ({
  nombre: producto.nombre,
  descripcion: producto.descripcion,
  precio_venta: Number(producto.precio_venta),
  categoria_id: producto.categoria_id || null,
  destacado: Boolean(producto.destacado),
  publicado: Boolean(producto.publicado),
  horas_hombre: Number(producto.horas_hombre) || 0,
  chapita_id: producto.chapita_id?.trim() || null,
  medidas: producto.medidas?.trim() || '',
  costo_producto: Number(producto.costo_producto) || 0,
  historia: producto.historia?.trim() || '',
  etapas: producto.etapas.map(etapa => ({ ...etapa, minutos_estimados: Number(etapa.minutos_estimados) }))
})

export default function PanelProductos({ intencion, limpiarIntencion }) {
  const productos = useData('/productos')
  const categorias = useData('/categorias')
  const configuracion = useData('/configuracion/valores', {})
  const { mostrar, nodo } = useAviso()
  const [editando, setEditando] = useState(null)

  // Abre el formulario de producto nuevo con un ID de chapita ya generado
  // (editable a mano).
  const nuevoProducto = () => setEditando({ chapita_id: sugerirIdPieza(productos.data || []) })

  // Al editar se conserva el ID actual del producto. Sólo si un producto
  // viejo nunca tuvo ID se le propone uno generado.
  const editarProducto = producto => setEditando(producto.chapita_id ? producto : { ...producto, chapita_id: sugerirIdPieza(productos.data || []) })

  // El panel principal puede abrir el formulario directamente.
  useEffect(() => {
    if (intencion === 'nuevo') { nuevoProducto(); limpiarIntencion?.() }
  }, [intencion])

  // Guarda el producto y cierra el modal solo si el guardado tuvo éxito.
  // Si save() tira un error (validación o servidor), ProductoModal lo
  // atrapa y mantiene el formulario abierto mostrando el mensaje.
  const guardar = async producto => {
    const cuerpo = construirCuerpoProducto(producto)
    producto.id
      ? await api.put(`/productos/${producto.id}`, cuerpo, productos.token)
      : await api.post('/productos', cuerpo, productos.token)
    await productos.load()
    mostrar(producto.id ? 'Producto actualizado.' : 'Producto creado. Abrilo de nuevo para cargarle fotos.')
    setEditando(null)
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
      <Heading kicker="Catálogo de fabricación" title="Productos" text="Cada producto define su precio de venta, categoría, fotos y las etapas que lo fabrican. En la web pública sólo se ven los productos marcados como “Publicar en la web”.">
        <button className="primary" onClick={nuevoProducto}>+ Nuevo producto</button>
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
                <h3>
                  {producto.nombre} {producto.destacado && <span title="Destacado en la web">★</span>}
                  {!producto.activo && <span className="badge-inactivo">Inactivo</span>}
                  {producto.publicado
                    ? <span className="badge-publicado" title="Visible en la web pública">En la web</span>
                    : <span className="badge-inactivo" title="Oculto en la web pública: sólo se ve en el panel">No publicado</span>}
                </h3>
                <p>
                  {producto.categoria_nombre || 'Sin categoría'}
                  {producto.chapita_id ? ` · ID ${producto.chapita_id}` : ''}
                  {producto.medidas ? ` · ${producto.medidas}` : ''}
                </p>
                <p>{producto.descripcion || 'Sin descripción.'}</p>

                <div className="product-numbers">
                  <span><small>Precio</small><b>{dinero(producto.precio_venta)}</b></span>
                  <span className={producto.margen >= 0 ? 'positivo' : 'negativo'}><small>Margen</small><b>{dinero(producto.margen)}</b></span>
                  <span><small>Duración</small><b>{duracion(producto.minutos_totales)}</b></span>
                  <span><small>Horas-hombre</small><b>{producto.horas_hombre || '—'}</b></span>
                </div>

                <div className="product-numbers">
                  <span><small>Mano de obra</small><b>{dinero(producto.costo_mano_obra)}</b></span>
                  <span><small>Costo producto</small><b>{dinero(producto.costo_producto)}</b></span>
                  <span><small>Costo total</small><b>{dinero(producto.costo_calculado_total)}</b></span>
                </div>

                <div className="tags">
                  {producto.etapas.map(etapa => (
                    <span key={etapa.id}>{etapa.orden}. {etapa.nombre} · {duracion(etapa.minutos_estimados)}</span>
                  ))}
                </div>
              </div>

              <div className="card-buttons">
                <button onClick={() => editarProducto(producto)}>Editar</button>
                <button className={producto.activo ? '' : 'activar-resaltado'} onClick={() => alternarActivo(producto)}>{producto.activo ? 'Desactivar' : 'Activar'}</button>
                <button className="danger-link" onClick={() => eliminar(producto)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay productos cargados" text="Creá el primer producto con sus etapas de fabricación." action={nuevoProducto} label="Crear producto" />
      )}

      {editando && (
        <ProductoModal
          producto={editando}
          productosExistentes={productos.data}
          categorias={categorias.data}
          costoHora={Number(configuracion.data.costo_hora_mano_obra) || 0}
          token={productos.token}
          close={() => setEditando(null)}
          save={guardar}
        />
      )}
    </>
  )
}

export function ProductoModal({ producto, productosExistentes, categorias, costoHora, token, close, save }) {
  const editar = Boolean(producto.id)
  const [nombre, setNombre] = useState(producto.nombre || '')
  const [descripcion, setDescripcion] = useState(producto.descripcion || '')
  const [precio, setPrecio] = useState(producto.precio_venta ?? '')
  const [categoriaId, setCategoriaId] = useState(producto.categoria_id || '')
  const [destacado, setDestacado] = useState(Boolean(producto.destacado))
  // "Publicar en la web": sin marcar, el producto queda oculto en la web
  // pública pero sigue disponible en el panel (pedidos, tareas, etc.).
  const [publicado, setPublicado] = useState(Boolean(producto.publicado))
  // Horas-hombre es opcional: vacío = sin cargar (se guarda en 0).
  const [horasHombre, setHorasHombre] = useState(producto.horas_hombre ? producto.horas_hombre : '')
  const [chapitaId, setChapitaId] = useState(producto.chapita_id || '')
  const [medidas, setMedidas] = useState(producto.medidas || '')
  const [costoProducto, setCostoProducto] = useState(producto.costo_producto ?? 0)
  const [historia, setHistoria] = useState(producto.historia || '')
  const [etapas, setEtapas] = useState(producto.etapas?.length ? producto.etapas.map(({ nombre, minutos_estimados }) => ({ nombre, minutos_estimados })) : etapasSugeridas)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarEtapa = (indice, campo, valor) =>
    setEtapas(etapas.map((etapa, posicion) => (posicion === indice ? { ...etapa, [campo]: valor } : etapa)))

  // Marca junto a las etiquetas: los campos que pasan a ser obligatorios
  // al publicar muestran "*"; en un borrador se ven como opcionales.
  const marca = publicado ? ' *' : ' (opcional)'

  const minutosTotal = etapas.reduce((total, etapa) => total + (Number(etapa.minutos_estimados) || 0), 0)

  // Borrador vs. publicado:
  // - Sin "Publicar en la web" el producto es un BORRADOR: sólo se exige el
  //   nombre. Precio, descripción técnica, historia, categoría e ID pueden
  //   quedar vacíos (el ID vacío lo genera el servidor).
  // - Para publicarlo son obligatorios nombre, ID, precio (> 0),
  //   descripción técnica, historia y categoría; si falta alguno no se
  //   guarda y se indica exactamente qué falta. El backend y la base de
  //   datos aplican la misma regla (ver validarPublicacion en
  //   server/rutas/productos.js y productos_publicado_completo en
  //   schema.sql), así que esto es una primera capa, no la única.
  const faltantesParaPublicar = () => {
    const faltantes = []
    if (!nombre.trim()) faltantes.push('nombre')
    if (!chapitaId.trim()) faltantes.push('ID de producto')
    if (!(Number(precio) > 0)) faltantes.push('precio de venta (mayor a cero)')
    if (!descripcion.trim()) faltantes.push('descripción técnica')
    if (!historia.trim()) faltantes.push('historia del producto')
    if (!categoriaId) faltantes.push('categoría')
    return faltantes
  }

  const enviar = async event => {
    event.preventDefault()
    if (!nombre.trim()) return setError('Indicá el nombre del producto.')
    const chapitaTrim = chapitaId.trim()
    if (chapitaTrim && productosExistentes.some(existente => String(existente.chapita_id || '').trim() === chapitaTrim && existente.id !== producto.id)) {
      return setError(`El ID de producto "${chapitaTrim}" ya existe. Elegí otro.`)
    }
    if (publicado) {
      const faltantes = faltantesParaPublicar()
      if (faltantes.length) return setError(`Para publicar el producto en la web falta completar: ${faltantes.join(', ')}. Completalos o desmarcá "Publicar en la web" para guardarlo como borrador.`)
    }
    if (precio !== '' && Number(precio) < 0) return setError('El precio de venta no puede ser negativo.')
    if (horasHombre !== '' && !(Number(horasHombre) >= 0)) return setError('Las horas-hombre no pueden ser negativas.')
    if (!etapas.length) return setError('El producto necesita al menos una etapa.')
    if (etapas.some(etapa => !etapa.nombre.trim())) return setError('Cada etapa necesita un nombre.')
    if (medidas.trim().length > 200) return setError('Las medidas no pueden superar los 200 caracteres.')
    setBusy(true); setError('')
    try {
      await save({
        id: producto.id, nombre, descripcion, precio_venta: precio, categoria_id: categoriaId || null, destacado, publicado,
        horas_hombre: horasHombre, chapita_id: chapitaTrim, medidas, costo_producto: costoProducto, historia, etapas
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={editar ? 'Editar producto' : 'Nuevo producto'} subtitle="Definí el precio, la categoría, las fotos y las etapas de fabricación." close={close} ancho="720px">
      <form onSubmit={enviar}>
        <div className="form-grid config-grid">
          <label>Nombre del producto
            <input required value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Mesa ratona de hierro forjado" />
          </label>

          <label>ID de producto (chapita){publicado ? ' *' : ''}
            <input value={chapitaId} onChange={event => setChapitaId(event.target.value)} placeholder="Ej. 014" maxLength={20} title="Se genera automáticamente; podés cambiarlo. Es el número que muestra la chapita en la web pública." />
          </label>
        </div>

        <div className="form-grid config-grid datos-fabricacion">
          <label>Categoría{marca}
            <select value={categoriaId} onChange={event => setCategoriaId(event.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map(categoria => <option key={categoria.id} value={categoria.id}>{categoria.nombre}{categoria.activo ? '' : ' (oculta)'}</option>)}
            </select>
          </label>

          <label>Horas-hombre (opcional)
            <CampoNumero min="0" step="0.25" value={horasHombre} onChange={setHorasHombre} placeholder="0" />
          </label>

          <label>Medidas (opcional)
            <input maxLength={200} value={medidas} onChange={event => setMedidas(event.target.value)} placeholder='Ej. 2.10 x 1.20 m' />
          </label>
        </div>

        <div className="form-grid config-grid">
          <label>Precio de venta{marca}
            <CampoNumero min="0" step="0.01" value={precio} onChange={setPrecio} placeholder="0" />
          </label>

          <label>Costo del producto (opcional)
            <CampoNumero min="0" step="0.01" value={costoProducto} onChange={setCostoProducto} placeholder="0" />
          </label>
        </div>

        <label>Descripción técnica{marca}
          <textarea value={descripcion} onChange={event => setDescripcion(event.target.value)} placeholder="Medidas, materiales o notas de fabricación. Esto se muestra tal cual en la web pública." />
        </label>

        <label>Historia del producto{marca}
          <textarea className="historia-input" value={historia} onChange={event => setHistoria(event.target.value)} placeholder="El relato detrás de esta pieza: de dónde salió la idea, qué la inspiró, qué la hace única. Se muestra en la web pública con un estilo editorial, distinto de la descripción técnica." />
        </label>

        <label className="config-check destacado-check">
          <input type="checkbox" checked={publicado} onChange={event => setPublicado(event.target.checked)} />
          <span className="destacado-check-texto">
            <b>🌐 Publicar en la web</b>
            <small>Sólo los productos marcados se muestran en la web pública. Para publicar son obligatorios: nombre, ID, precio, descripción técnica, historia y categoría. Sin marcar, se guarda como borrador (oculto al público, disponible en el panel) y esos datos pueden quedar vacíos.</small>
          </span>
        </label>

        <label className="config-check destacado-check">
          <input type="checkbox" checked={destacado} onChange={event => setDestacado(event.target.checked)} />
          <span className="destacado-check-texto">
            <b>★ Producto destacado</b>
            <small>Se muestra en la sección "Productos destacados" de la portada de la web (si el producto está publicado)</small>
          </span>
        </label>

        {editar
          ? <GestorImagenes productoId={producto.id} imagenesIniciales={producto.imagenes || []} token={token} />
          : <p className="muted" style={{ marginTop: 4 }}>Guardá el producto para poder cargarle fotos.</p>}

        <div className="stage-edit">
          <div>
            <b>Etapas de fabricación</b>
            <span>Nombre de cada etapa, para asignar tareas; la duración estimada es opcional. Esto es información interna: nunca se muestra en la web pública.</span>
          </div>

          <div className="etapa-grid-head">
            <small>#</small><small>Etapa</small><small>Minutos (opcional)</small><small />
          </div>

          {etapas.map((etapa, indice) => (
            <div className="etapa-grid-row" key={indice}>
              <small>{indice + 1}</small>
              <input required value={etapa.nombre} onChange={event => cambiarEtapa(indice, 'nombre', event.target.value)} placeholder="Nombre de la etapa" />
              <input min="0" type="number" value={etapa.minutos_estimados} onChange={event => cambiarEtapa(indice, 'minutos_estimados', event.target.value)} placeholder="0" />
              <button type="button" onClick={() => setEtapas(etapas.filter((_, posicion) => posicion !== indice))}>×</button>
            </div>
          ))}

          <button type="button" className="add-stage" onClick={() => setEtapas([...etapas, etapaVacia()])}>+ Agregar etapa</button>

          <p className="stage-total">Duración total {duracion(minutosTotal)}</p>
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
// de mano de obra.
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
      <p className="muted">Se multiplica por las horas-hombre de cada producto para calcular su costo de mano de obra.</p>

      <div className="form-grid config-grid">
        <label>Costo por hora
          <CampoNumero min="0" step="0.01" value={valor} onChange={setValor} />
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
