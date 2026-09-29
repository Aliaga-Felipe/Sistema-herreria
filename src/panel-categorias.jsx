import React, { useState } from 'react'
import { api, useData } from './api.js'
import { Empty, Heading, useAviso } from './ui.jsx'

// ---------------------------------------------------------------------
// CATEGORÍAS DE PRODUCTO
// Por ahora sólo se pueden CREAR y VER. Las categorías se guardan en la
// tabla `categorias` (POST/GET /api/categorias) y son las mismas que se
// eligen en el formulario de producto y que ve el visitante en la web
// pública. Editar o eliminar categorías no está disponible a propósito.
// ---------------------------------------------------------------------
export default function PanelCategorias() {
  const categorias = useData('/categorias')
  const { mostrar, nodo } = useAviso()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const crear = async event => {
    event.preventDefault()
    const limpio = nombre.trim().replace(/\s+/g, ' ')
    if (!limpio) return setError('Escribí el nombre de la categoría.')
    // Primera capa contra duplicados (el backend valida lo mismo, también
    // sin distinguir mayúsculas ni acentos).
    const normalizar = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const repetida = categorias.data.find(categoria => normalizar(categoria.nombre) === normalizar(limpio))
    if (repetida) return setError(`Ya existe la categoría "${repetida.nombre}".`)
    setBusy(true); setError('')
    try {
      const creada = await api.post('/categorias', { nombre: limpio }, categorias.token)
      setNombre('')
      await categorias.load()
      mostrar(`Categoría "${creada.nombre}" creada.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
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
              <div>
                <b>{categoria.nombre}</b>
                <p>{categoria.productos_total === 1 ? '1 producto' : `${categoria.productos_total} productos`}</p>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay categorías cargadas" text="Creá la primera categoría con el formulario de arriba." />
      )}
    </>
  )
}
