import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApi, useMeta } from './api.js'
import { usePublicConfig } from './PublicContext.jsx'
import ProductCard from './components/ProductCard.jsx'

// Opciones del orden del catálogo. Se definen acá (y no como <option> de
// un <select> nativo) porque el SelectOrden de más abajo dibuja su propia
// lista desplegada en vez de depender de la del navegador.
const OPCIONES_ORDEN = [
  { value: 'novedades', label: 'Más recientes' },
  { value: 'nombre', label: 'Nombre A-Z' },
  { value: 'precio_asc', label: 'Precio: menor a mayor' },
  { value: 'precio_desc', label: 'Precio: mayor a menor' }
]

export default function Catalogo() {
  const config = usePublicConfig()
  const [params, setParams] = useSearchParams()
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [busquedaLocal, setBusquedaLocal] = useState(params.get('q') || '')

  // La categoría ya no tiene un filtro visible en esta página (se quitó
  // el select), pero el parámetro se sigue leyendo y pasando a la API:
  // las tarjetas de categoría del Inicio y de /categorias enlazan acá con
  // ?categoria=slug, y ese enlace tiene que seguir filtrando el catálogo.
  const categoria = params.get('categoria') || ''
  const orden = params.get('orden') || 'novedades'
  const q = params.get('q') || ''
  const pagina = Number(params.get('pagina')) || 1

  useMeta('Productos', 'Catálogo completo de muebles y piezas de herrería artesanal: mesas, sillas, portones, rejas y decoración.')

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
              <SelectOrden value={orden} onChange={valor => actualizar({ orden: valor })} />
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

// ---------------------------------------------------------------------
// SELECT DE ORDEN (reemplaza el <select> nativo del catálogo)
// Un <select> nativo no se puede re-estilar por dentro: la lista
// desplegada la dibuja el sistema operativo/navegador con sus propios
// colores (fondo blanco, resaltado azul), sin importar el CSS del sitio.
// Este control dibuja su propia lista, así que la opción activa puede
// mostrarse con el mismo fondo que el resto de los filtros + un borde
// negro (igual que el resto de los campos), en vez de blanco.
// Mismo valor/onChange que un <select> común, así que el filtrado y la
// URL (?orden=...) funcionan exactamente igual que antes.
// ---------------------------------------------------------------------
function SelectOrden({ value, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)
  const actual = OPCIONES_ORDEN.find(opcion => opcion.value === value) || OPCIONES_ORDEN[0]

  useEffect(() => {
    const cerrarSiEsAfuera = event => {
      if (raiz.current && !raiz.current.contains(event.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrarSiEsAfuera)
    return () => document.removeEventListener('mousedown', cerrarSiEsAfuera)
  }, [])

  return (
    <div className="select-personalizado" ref={raiz}>
      <button
        type="button"
        className={`select-personalizado-boton ${abierto ? 'abierto' : ''}`}
        onClick={() => setAbierto(previo => !previo)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
      >
        {actual.label}
      </button>
      {abierto && (
        <ul className="select-personalizado-lista" role="listbox">
          {OPCIONES_ORDEN.map(opcion => (
            <li
              key={opcion.value}
              role="option"
              aria-selected={opcion.value === value}
              className={opcion.value === value ? 'seleccionada' : ''}
              onClick={() => { onChange(opcion.value); setAbierto(false) }}
            >
              {opcion.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
