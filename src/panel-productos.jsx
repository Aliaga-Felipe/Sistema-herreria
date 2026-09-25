import React, { useEffect, useRef, useState } from 'react'
import { api, dinero, fecha, useData } from './api.js'
import { Actions, CampoNumero, Empty, Heading, Modal, useAviso } from './ui.jsx'

// Fila vacía de la sección "Materiales utilizados" (ver ProductoModal):
// nombre libre, sin catálogo compartido entre productos.
const materialVacio = () => ({ nombre: '', precio_unitario: '', cantidad: '' })

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
  materiales: (producto.materiales || []).map(material => ({
    nombre: material.nombre?.trim() || '',
    precio_unitario: Number(material.precio_unitario) || 0,
    cantidad: Number(material.cantidad) || 0
  }))
})

// ---------------------------------------------------------------------
// ESTADO DE SINCRONIZACIÓN CON WHATSAPP
// Sólo se muestra en productos publicados (los borradores nunca se
// sincronizan). Mismo formato visual que .badge-publicado/.badge-inactivo.
// ---------------------------------------------------------------------
const BadgeWhatsapp = ({ producto }) => {
  const estado = producto.whatsapp_sync_estado || 'NO_SINCRONIZADO'
  if (estado === 'SINCRONIZADO') return <span className="badge-publicado" title={`Sincronizado con WhatsApp${producto.whatsapp_sync_actualizado_en ? ` · ${new Date(producto.whatsapp_sync_actualizado_en).toLocaleString('es-AR')}` : ''}`}>WhatsApp ✓</span>
  if (estado === 'ERROR') return <span className="badge-inactivo" title={producto.whatsapp_sync_error || 'Error al sincronizar con WhatsApp'}>WhatsApp ✗</span>
  if (estado === 'PENDIENTE') return <span className="badge-inactivo" title="Sincronizando con WhatsApp...">WhatsApp …</span>
  return <span className="badge-inactivo" title="Todavía no se sincronizó con WhatsApp">WhatsApp —</span>
}

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
    if (!window.confirm(`¿Eliminar "${producto.nombre}"? Deja de verse en el panel y en la web, y se contabiliza como vendido en las estadísticas.`)) return
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
      mostrar(producto.activo ? 'Producto desactivado: se contabiliza como vendido.' : 'Producto reactivado: vuelve a estar disponible y se anuló su venta.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  // Reintenta la sincronización con el catálogo de WhatsApp (ver
  // POST /productos/:id/whatsapp/reintentar en server/rutas/productos.js).
  // La sincronización automática ya corre sola al guardar el producto o sus
  // fotos; este botón es sólo para forzarla a mano (por ejemplo tras un
  // error, o para verla al instante sin esperar el próximo guardado).
  const reintentarWhatsapp = async producto => {
    try {
      const respuesta = await api.post(`/productos/${producto.id}/whatsapp/reintentar`, {}, productos.token)
      await productos.load()
      mostrar(respuesta.mensaje)
    } catch (error) { mostrar(error.message, 'error') }
  }

  return (
    <>
      <Heading kicker="Catálogo de fabricación" title="Productos" text="Cada producto define su precio de venta, costos, categoría y fotos. Las tareas de fabricación se definen en cada pedido. En la web pública sólo se ven los productos marcados como “Publicar en la web”.">
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
                  {/* Desactivado = vendido (mismo criterio que Panel de control y Estadísticas). */}
                  {!producto.activo && <span className="badge-inactivo" title={`Vendido a ${dinero(producto.precio_vendido)}`}>Vendido {fecha(producto.vendido_en)}</span>}
                  {producto.publicado
                    ? <span className="badge-publicado" title="Visible en la web pública">En la web</span>
                    : <span className="badge-inactivo" title="Oculto en la web pública: sólo se ve en el panel">No publicado</span>}
                  {producto.publicado && <BadgeWhatsapp producto={producto} />}
                </h3>
                <p>
                  {producto.categoria_nombre || 'Sin categoría'}
                  {producto.chapita_id ? ` · ID ${producto.chapita_id}` : ''}
                  {producto.medidas ? ` · ${producto.medidas}` : ''}
                </p>
                <p>{producto.descripcion || 'Sin descripción.'}</p>
                {producto.whatsapp_sync_estado === 'ERROR' && producto.whatsapp_sync_error && (
                  <p className="form-error" style={{ fontSize: 11, margin: '2px 0' }}>WhatsApp: {producto.whatsapp_sync_error}</p>
                )}

                <div className="product-numbers">
                  <span><small>Precio</small><b>{dinero(producto.precio_venta)}</b></span>
                  <span className={producto.margen >= 0 ? 'positivo' : 'negativo'}><small>Margen</small><b>{dinero(producto.margen)}</b></span>
                  <span><small>Horas-hombre</small><b>{producto.horas_hombre || '—'}</b></span>
                </div>

                <div className="product-numbers">
                  <span><small>Mano de obra</small><b>{dinero(producto.costo_mano_obra)}</b></span>
                  <span><small>Costo producto</small><b>{dinero(producto.costo_producto)}</b></span>
                  <span><small>Costo materiales</small><b>{dinero(producto.costo_materiales)}</b></span>
                  <span><small>Costo total</small><b>{dinero(producto.costo_calculado_total)}</b></span>
                </div>

              </div>

              <div className="card-buttons">
                <button onClick={() => editarProducto(producto)}>Editar</button>
                <button className={producto.activo ? '' : 'activar-resaltado'} title={producto.activo ? 'Lo saca de la venta y lo cuenta como vendido' : 'Vuelve a estar disponible y anula la venta'} onClick={() => alternarActivo(producto)}>{producto.activo ? 'Desactivar (vendido)' : 'Reactivar'}</button>
                {producto.publicado && (
                  <button onClick={() => reintentarWhatsapp(producto)}>
                    {producto.whatsapp_sync_estado === 'ERROR' ? 'Reintentar WhatsApp' : 'Sincronizar WhatsApp'}
                  </button>
                )}
                <button className="danger-link" onClick={() => eliminar(producto)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay productos cargados" text="Creá el primer producto con su precio y sus costos." action={nuevoProducto} label="Crear producto" />
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
  // El campo "Costo del producto" se sacó del formulario a pedido: se sigue
  // guardando el valor que ya tenía el producto (0 en uno nuevo), sólo que
  // ya no se puede editar desde acá. El costo total del producto se sigue
  // armando con mano de obra + este valor + costo de materiales.
  const [costoProducto] = useState(producto.costo_producto ?? 0)
  const [historia, setHistoria] = useState(producto.historia || '')
  const [materiales, setMateriales] = useState(
    producto.materiales?.length ? producto.materiales.map(({ nombre, precio_unitario, cantidad }) => ({ nombre, precio_unitario, cantidad })) : []
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cambiarMaterial = (indice, campo, valor) =>
    setMateriales(materiales.map((material, posicion) => (posicion === indice ? { ...material, [campo]: valor } : material)))

  // Costo total de materiales en vivo: suma de precio unitario × cantidad
  // de cada fila cargada. Es un dato interno (nunca se muestra en la web
  // pública) y un concepto aparte del precio de venta y del costo del
  // producto de arriba.
  const costoMaterialesTotal = materiales.reduce((total, material) => total + (Number(material.precio_unitario) || 0) * (Number(material.cantidad) || 0), 0)

  // Marca junto a las etiquetas: los campos que pasan a ser obligatorios
  // al publicar muestran "*"; en un borrador se ven como opcionales.
  const marca = publicado ? ' *' : ' (opcional)'

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
    if (medidas.trim().length > 200) return setError('Las medidas no pueden superar los 200 caracteres.')
    if (materiales.some(material => !material.nombre.trim())) return setError('Cada material necesita un nombre.')
    if (materiales.some(material => !(Number(material.precio_unitario) >= 0))) return setError('El precio unitario de cada material no puede ser negativo.')
    if (materiales.some(material => !(Number(material.cantidad) > 0))) return setError('La cantidad de cada material debe ser mayor a cero.')
    setBusy(true); setError('')
    try {
      await save({
        id: producto.id, nombre, descripcion, precio_venta: precio, categoria_id: categoriaId || null, destacado, publicado,
        horas_hombre: horasHombre, chapita_id: chapitaTrim, medidas, costo_producto: costoProducto, historia, materiales
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={editar ? 'Editar producto' : 'Nuevo producto'} subtitle="Definí el precio, los costos, la categoría y las fotos. Las tareas se cargan en cada pedido." close={close} ancho="720px">
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
            <b>Materiales utilizados</b>
            <span>Materiales cargados para este producto, con su precio unitario y la cantidad que usa una unidad. El costo se calcula solo (precio × cantidad); es información interna, aparte del precio de venta, y nunca se muestra en la web pública.</span>
          </div>

          {materiales.length > 0 && (
            <div className="producto-material-grid-head">
              <small>Material</small><small>Precio unitario</small><small>Cantidad</small><small>Costo</small><small />
            </div>
          )}

          {materiales.map((material, indice) => {
            const costo = (Number(material.precio_unitario) || 0) * (Number(material.cantidad) || 0)
            return (
              <div className="producto-material-grid-row" key={indice}>
                <input required value={material.nombre} onChange={event => cambiarMaterial(indice, 'nombre', event.target.value)} placeholder="Ej. Caño estructural 20x20" />
                <CampoNumero min="0" step="0.01" value={material.precio_unitario} onChange={valor => cambiarMaterial(indice, 'precio_unitario', valor)} placeholder="0" />
                <CampoNumero min="0" step="0.01" value={material.cantidad} onChange={valor => cambiarMaterial(indice, 'cantidad', valor)} placeholder="0" />
                <span className="producto-material-costo">{dinero(costo)}</span>
                <button type="button" onClick={() => setMateriales(materiales.filter((_, posicion) => posicion !== indice))}>×</button>
              </div>
            )
          })}

          <button type="button" className="add-stage" onClick={() => setMateriales([...materiales, materialVacio()])}>+ Agregar material</button>

          <p className="stage-total">Costo total de materiales: {dinero(costoMaterialesTotal)}</p>
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
