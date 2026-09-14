import React, { useEffect, useState } from 'react'
import { api, useData } from './api.js'
import { Actions, Empty, Heading, Modal, useAviso } from './ui.jsx'

export default function PanelCategorias() {
  const categorias = useData('/categorias')
  const { mostrar, nodo } = useAviso()
  const [editando, setEditando] = useState(null)

  // Igual que en Productos: guarda pero deja el modal abierto con el id
  // recién asignado, para poder cargarle la foto sin pasos extra.
  const guardar = async categoria => {
    const cuerpo = { nombre: categoria.nombre, descripcion: categoria.descripcion, orden: Number(categoria.orden) || 0 }
    const resultado = categoria.id
      ? await api.put(`/categorias/${categoria.id}`, cuerpo, categorias.token)
      : await api.post('/categorias', cuerpo, categorias.token)
    await categorias.load()
    mostrar(categoria.id ? 'Categoría actualizada.' : 'Categoría creada. Ahora podés agregarle una foto.')
    setEditando(resultado)
  }

  const eliminar = async categoria => {
    if (!window.confirm(`¿Eliminar "${categoria.nombre}"? Si tiene productos asociados sólo se desactivará.`)) return
    try {
      const respuesta = await api.del(`/categorias/${categoria.id}`, categorias.token)
      await categorias.load()
      mostrar(respuesta.mensaje)
    } catch (error) { mostrar(error.message, 'error') }
  }

  const alternarActivo = async categoria => {
    try {
      await api.patch(`/categorias/${categoria.id}/activo`, { activo: !categoria.activo }, categorias.token)
      await categorias.load()
      mostrar(categoria.activo ? 'Categoría desactivada.' : 'Categoría reactivada.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  return (
    <>
      <Heading kicker="Catálogo público" title="Categorías" text="Organizan el catálogo que ve el visitante en la web pública. Una categoría desactivada deja de mostrarse ahí, pero sus productos siguen existiendo.">
        <button className="primary" onClick={() => setEditando({})}>+ Nueva categoría</button>
      </Heading>

      {nodo}

      {categorias.loading ? <p>Cargando categorías...</p> : categorias.error ? <p className="form-error">{categorias.error}</p> : categorias.data.length ? (
        <section className="product-grid">
          {categorias.data.map(categoria => (
            <article className={`product-card ${categoria.activo ? '' : 'inactivo'}`} key={categoria.id}>
              {categoria.imagen_url
                ? <img src={categoria.imagen_url} alt={categoria.nombre} className="product-thumb-img" />
                : <div className="product-symbol">◈</div>}
              <div className="product-info">
                <h3>{categoria.nombre}</h3>
                <p>{categoria.descripcion || 'Sin descripción.'}</p>
                <div className="product-numbers">
                  <span><small>Productos</small><b>{categoria.productos_total}</b></span>
                  <span><small>Orden</small><b>{categoria.orden}</b></span>
                  <span><small>Estado</small><b>{categoria.activo ? 'Visible' : 'Oculta'}</b></span>
                </div>
                <p className="muted" style={{ fontSize: '0.8rem' }}>/productos?categoria={categoria.slug}</p>
              </div>
              <div className="card-buttons">
                <button onClick={() => setEditando(categoria)}>Editar</button>
                <button onClick={() => alternarActivo(categoria)}>{categoria.activo ? 'Ocultar' : 'Mostrar'}</button>
                <button className="danger-link" onClick={() => eliminar(categoria)}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay categorías cargadas" text="Creá la primera categoría para empezar a organizar el catálogo público." action={() => setEditando({})} label="Crear categoría" />
      )}

      {editando && <CategoriaModal categoria={editando} token={categorias.token} close={() => setEditando(null)} save={guardar} />}
    </>
  )
}

function CategoriaModal({ categoria, token, close, save }) {
  const editar = Boolean(categoria.id)
  const [nombre, setNombre] = useState(categoria.nombre || '')
  const [descripcion, setDescripcion] = useState(categoria.descripcion || '')
  const [orden, setOrden] = useState(categoria.orden ?? 0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await save({ id: categoria.id, nombre, descripcion, orden }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={editar ? 'Editar categoría' : 'Nueva categoría'} subtitle="Se usa para agrupar productos en la web pública." close={close}>
      <form onSubmit={enviar}>
        <label>Nombre
          <input required value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Mesas" />
        </label>
        <label>Descripción
          <textarea value={descripcion} onChange={event => setDescripcion(event.target.value)} placeholder="Frase breve que se muestra en la página de categorías" />
        </label>
        <label>Orden de aparición
          <input min="0" type="number" value={orden} onChange={event => setOrden(event.target.value)} />
        </label>

        {editar
          ? <GestorImagenCategoria categoriaId={categoria.id} imagenInicial={categoria.imagen_url} token={token} />
          : <p className="muted" style={{ marginTop: 4 }}>Guardá la categoría para poder cargarle una foto.</p>}

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label={editar ? 'Guardar cambios' : 'Crear categoría'} busy={busy} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// FOTO DE LA CATEGORÍA
// Una sola imagen (no una galería, como en productos). Si no se carga,
// la web pública usa automáticamente la foto de algún producto de esa
// categoría, así que esto es opcional.
// ---------------------------------------------------------------------
function GestorImagenCategoria({ categoriaId, imagenInicial, token }) {
  const [imagen, setImagen] = useState(imagenInicial || null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setImagen(imagenInicial || null) }, [categoriaId])

  const subir = async event => {
    const archivo = event.target.files?.[0]
    event.target.value = ''
    if (!archivo) return
    setSubiendo(true); setError('')
    try {
      const formData = new FormData()
      formData.append('imagen', archivo)
      const respuesta = await api.subir(`/categorias/${categoriaId}/imagen`, formData, token)
      setImagen(respuesta.imagen_url)
    } catch (err) { setError(err.message) } finally { setSubiendo(false) }
  }

  const quitar = async () => {
    try {
      const respuesta = await api.del(`/categorias/${categoriaId}/imagen`, token)
      setImagen(respuesta.imagen_url)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="stage-edit">
      <div>
        <b>Foto de la categoría</b>
        <span>Se usa en la tarjeta de la categoría en el Inicio y en /categorias. Si no cargás una, se usa automáticamente la foto de un producto de esta categoría.</span>
      </div>

      {imagen && (
        <div className="imagenes-grid" style={{ maxWidth: 200 }}>
          <div className="imagen-item principal">
            <img src={imagen} alt="" />
            <div className="imagen-acciones">
              <button type="button" className="danger-link" onClick={quitar}>Quitar</button>
            </div>
          </div>
        </div>
      )}

      <label className="add-stage" style={{ display: 'inline-flex', cursor: 'pointer' }}>
        {subiendo ? 'Subiendo...' : imagen ? 'Reemplazar foto' : '+ Agregar foto'}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
      </label>

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
