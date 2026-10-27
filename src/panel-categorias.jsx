import React, { useState } from 'react'
import { api, useData } from './api.js'
import { Empty, Heading, Modal, useAviso } from './ui.jsx'

// ---------------------------------------------------------------------
// CATEGORÍAS DE PRODUCTO
// Se pueden CREAR, RENOMBRAR y ELIMINAR (POST/PUT/DELETE /api/categorias).
// Las categorías se guardan en la tabla `categorias` y son las mismas que
// se eligen en el formulario de producto y que ve el visitante en la web
// pública. Al eliminar una categoría con productos hay que elegir a qué
// otra pasan (ningún producto publicado queda sin categoría), por eso no se
// puede eliminar la única que existe.
// ---------------------------------------------------------------------

const limpiarNombre = texto => texto.trim().replace(/\s+/g, ' ')
const normalizar = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const textoProductos = total => total === 1 ? '1 producto' : `${total} productos`

// Primera capa contra duplicados (el backend valida lo mismo, también sin
// distinguir mayúsculas ni acentos). `excluirId` deja afuera a la categoría
// que se está renombrando. Devuelve el mensaje de error o ''.
const errorDeNombre = (nombre, categorias, excluirId = null) => {
  if (!nombre) return 'Escribí el nombre de la categoría.'
  const repetida = categorias.find(categoria => categoria.id !== excluirId && normalizar(categoria.nombre) === normalizar(nombre))
  return repetida ? `Ya existe la categoría "${repetida.nombre}".` : ''
}

export default function PanelCategorias() {
  const categorias = useData('/categorias')
  const { mostrar, nodo } = useAviso()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editando, setEditando] = useState(null) // { id, nombre, error, busy }
  const [eliminando, setEliminando] = useState(null)

  const crear = async event => {
    event.preventDefault()
    const limpio = limpiarNombre(nombre)
    const problema = errorDeNombre(limpio, categorias.data)
    if (problema) return setError(problema)
    setBusy(true); setError('')
    try {
      const creada = await api.post('/categorias', { nombre: limpio }, categorias.token)
      setNombre('')
      await categorias.load()
      mostrar(`Categoría "${creada.nombre}" creada.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const guardarNombre = async categoria => {
    const limpio = limpiarNombre(editando.nombre)
    if (limpio === categoria.nombre) return setEditando(null)
    const problema = errorDeNombre(limpio, categorias.data, categoria.id)
    if (problema) return setEditando({ ...editando, error: problema })
    setEditando({ ...editando, error: '', busy: true })
    try {
      const actualizada = await api.put(`/categorias/${categoria.id}`, { nombre: limpio }, categorias.token)
      setEditando(null)
      await categorias.load()
      mostrar(`Categoría "${categoria.nombre}" renombrada a "${actualizada.nombre}".`)
    } catch (err) { setEditando(actual => actual && { ...actual, error: err.message, busy: false }) }
  }

  const eliminar = async (categoria, reasignarA = null) => {
    const respuesta = await api.del(`/categorias/${categoria.id}`, categorias.token, reasignarA ? { reasignar_a: reasignarA } : undefined)
    setEliminando(null)
    if (editando?.id === categoria.id) setEditando(null)
    await categorias.load()
    mostrar(respuesta.mensaje)
  }

  const pedirEliminar = async categoria => {
    if (categorias.data.length <= 1) return mostrar('No se puede eliminar la única categoría: los productos publicados necesitan una.', 'error')
    if (categoria.productos_total > 0) return setEliminando(categoria)
    if (!window.confirm(`¿Eliminar la categoría "${categoria.nombre}"? No tiene productos.`)) return
    try { await eliminar(categoria) } catch (err) { mostrar(err.message, 'error') }
  }

  return (
    <>
      <Heading kicker="Catálogo" title="Categorías" text="Agrupan los productos. Las categorías creadas acá aparecen al cargar o editar un producto y en el catálogo de la web pública." />

      {nodo}

      <form className="config-card categoria-alta" onSubmit={crear}>
        <div className="card-title">Nueva categoría</div>
        <div className="categoria-alta-fila">
          <input
            value={nombre}
            onChange={event => { setNombre(event.target.value); if (error) setError('') }}
            placeholder="Ej. Sillas"
            maxLength={120}
            aria-label="Nombre de la categoría"
            disabled={busy}
          />
          <button className="primary" disabled={busy}>{busy ? 'Creando...' : 'Crear categoría'}</button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>

      <section className="section-heading">
        <div><h2>Categorías existentes</h2><p>{categorias.data.length} categorías</p></div>
      </section>

      {categorias.loading && !categorias.data.length ? <p>Cargando categorías...</p> : categorias.error ? <p className="form-error">{categorias.error}</p> : categorias.data.length ? (
        <section className="simple-list categorias-lista">
          {categorias.data.map(categoria => (
            <article key={categoria.id}>
              <div className="product-symbol">▤</div>
              {editando?.id === categoria.id ? (
                <form className="categoria-edicion" onSubmit={event => { event.preventDefault(); guardarNombre(categoria) }}>
                  <div className="categoria-alta-fila">
                    <input
                      autoFocus
                      value={editando.nombre}
                      onChange={event => setEditando({ ...editando, nombre: event.target.value, error: '' })}
                      onKeyDown={event => { if (event.key === 'Escape') setEditando(null) }}
                      maxLength={120}
                      aria-label={`Nuevo nombre de la categoría ${categoria.nombre}`}
                      disabled={editando.busy}
                    />
                    <button className="primary" disabled={editando.busy}>{editando.busy ? 'Guardando...' : 'Guardar'}</button>
                    <button type="button" className="secondary" onClick={() => setEditando(null)} disabled={editando.busy}>Cancelar</button>
                  </div>
                  {editando.error && <p className="form-error">{editando.error}</p>}
                </form>
              ) : (
                <>
                  <div>
                    <b>{categoria.nombre}</b>
                    <p>{textoProductos(categoria.productos_total)}</p>
                  </div>
                  <span className="card-buttons">
                    <button type="button" onClick={() => setEditando({ id: categoria.id, nombre: categoria.nombre, error: '', busy: false })}>Editar</button>
                    <button type="button" className="danger-link" onClick={() => pedirEliminar(categoria)}>Eliminar</button>
                  </span>
                </>
              )}
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay categorías cargadas" text="Creá la primera categoría con el formulario de arriba." />
      )}

      {eliminando && (
        <EliminarConProductosModal
          categoria={eliminando}
          otras={categorias.data.filter(categoria => categoria.id !== eliminando.id)}
          close={() => setEliminando(null)}
          confirmar={reasignarA => eliminar(eliminando, reasignarA)}
        />
      )}
    </>
  )
}

// Eliminar una categoría que tiene productos: se elige a qué otra categoría
// pasan antes de borrarla (el backend lo hace en una sola transacción).
function EliminarConProductosModal({ categoria, otras, close, confirmar }) {
  const [destino, setDestino] = useState(String(otras[0]?.id ?? ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    if (!destino) return setError('Elegí a qué categoría pasan los productos.')
    setBusy(true); setError('')
    try { await confirmar(Number(destino)) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal
      title={`Eliminar "${categoria.nombre}"`}
      subtitle={`Esta categoría tiene ${textoProductos(categoria.productos_total)}. Elegí a qué categoría pasan antes de eliminarla.`}
      close={close}
    >
      <form onSubmit={enviar}>
        <label>Mover los productos a
          <select value={destino} onChange={event => { setDestino(event.target.value); setError('') }} disabled={busy}>
            {otras.map(otra => <option key={otra.id} value={otra.id}>{otra.nombre}</option>)}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={close}>Cancelar</button>
          <button className="primary" disabled={busy || !destino}>{busy ? 'Eliminando...' : 'Mover y eliminar'}</button>
        </div>
      </form>
    </Modal>
  )
}
