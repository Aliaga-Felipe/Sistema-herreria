import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApi, useMeta } from '../public-api.js'
import { usePublicConfig } from './PublicContext.jsx'
import ProductCard from './components/ProductCard.jsx'

export default function Catalogo() {
  const config = usePublicConfig()
  const [params, setParams] = useSearchParams()
  const [categorias, setCategorias] = useState([])
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [busquedaLocal, setBusquedaLocal] = useState(params.get('q') || '')

  const categoria = params.get('categoria') || ''
  const orden = params.get('orden') || 'novedades'
  const q = params.get('q') || ''
  const pagina = Number(params.get('pagina')) || 1

  useMeta('Productos', 'Catálogo completo de muebles y piezas de herrería artesanal: mesas, sillas, portones, rejas y decoración.')

  useEffect(() => { publicApi.categorias().then(setCategorias).catch(() => setCategorias([])) }, [])

  useEffect(() => {
    setCargando(true)
    publicApi.productos({ categoria, orden, q, pagina, limite: 24 })
      .then(setResultado)
      .catch(() => setResultado({ productos: [], total: 0, paginas: 1 }))
      .finally(() => setCargando(false))
  }, [categoria, orden, q, pagina])

  const actualizar = cambios => {
    const siguiente = new URLSearchParams(params)
    Object.entries(cambios).forEach(([clave, valor]) => {
      if (valor) siguiente.set(clave, valor); else siguiente.delete(clave)
    })
    if (!('pagina' in cambios)) siguiente.delete('pagina')
    setParams(siguiente)
  }

  const enviarBusqueda = event => { event.preventDefault(); actualizar({ q: busquedaLocal }) }

  return (
    <>
      <header className="catalogo-encabezado">
        <div className="contenedor">
          <p className="eyebrow-public">Catálogo completo</p>
          <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.2rem)' }}>Productos</h1>

          <form className="filtros-barra" onSubmit={enviarBusqueda}>
            <div className="campo-filtro">
              <input
                type="search"
                placeholder="Buscar por nombre…"
                value={busquedaLocal}
                onChange={event => setBusquedaLocal(event.target.value)}
              />
            </div>
            <div className="campo-filtro">
              <select value={categoria} onChange={event => actualizar({ categoria: event.target.value })}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c.id} value={c.slug}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="campo-filtro">
              <select value={orden} onChange={event => actualizar({ orden: event.target.value })}>
                <option value="novedades">Más recientes</option>
                <option value="nombre">Nombre A-Z</option>
                <option value="precio_asc">Precio: menor a mayor</option>
                <option value="precio_desc">Precio: mayor a menor</option>
              </select>
            </div>
            <button type="submit" className="btn-public btn-madera">Buscar</button>
          </form>

          {!cargando && resultado && (
            <p className="resultado-info" style={{ color: 'var(--texto-claro-muted)' }}>
              {resultado.total} {resultado.total === 1 ? 'producto encontrado' : 'productos encontrados'}
            </p>
          )}
        </div>
      </header>

      <section className="catalogo-lista">
        <div className="contenedor">
          {cargando ? (
            <div className="grilla-productos">
              {Array.from({ length: 8 }).map((_, indice) => <div key={indice} className="skeleton" style={{ aspectRatio: '4/5' }} />)}
            </div>
          ) : resultado.productos.length ? (
            <>
              <div className="grilla-productos">
                {resultado.productos.map(producto => <ProductCard key={producto.id} producto={producto} moneda={config.moneda} />)}
              </div>

              {resultado.paginas > 1 && (
                <div className="paginacion">
                  <button disabled={pagina <= 1} onClick={() => actualizar({ pagina: String(pagina - 1) })}>‹</button>
                  {Array.from({ length: resultado.paginas }).map((_, indice) => (
                    <button key={indice} className={pagina === indice + 1 ? 'activa' : ''} onClick={() => actualizar({ pagina: String(indice + 1) })}>
                      {indice + 1}
                    </button>
                  ))}
                  <button disabled={pagina >= resultado.paginas} onClick={() => actualizar({ pagina: String(pagina + 1) })}>›</button>
                </div>
              )}
            </>
          ) : (
            <div className="estado-vacio-publico">
              <span>◇</span>
              <p>No encontramos productos con esos filtros. Probá con otra búsqueda o categoría.</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
