import React, { useEffect, useState } from 'react'
import { publicApi, useMeta } from '../public-api.js'
import CategoryCard from './components/CategoryCard.jsx'

export default function Categorias() {
  const [categorias, setCategorias] = useState(null)

  useMeta('Categorías', 'Explorá el catálogo de la herrería por categoría: mesas, sillas, portones, rejas, decoración e iluminación.')

  useEffect(() => { publicApi.categorias().then(setCategorias).catch(() => setCategorias([])) }, [])

  return (
    <div className="catalogo-encabezado" style={{ paddingBottom: 90 }}>
      <div className="contenedor">
        <p className="eyebrow-public">Explorá por tipo de pieza</p>
        <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.2rem)', marginBottom: 48 }}>Categorías</h1>

        {categorias === null ? (
          <div className="grilla-categorias">
            {Array.from({ length: 6 }).map((_, indice) => <div key={indice} className="skeleton" style={{ aspectRatio: '3/2' }} />)}
          </div>
        ) : categorias.length ? (
          <div className="grilla-categorias">
            {categorias.map(categoria => <CategoryCard key={categoria.id} categoria={categoria} />)}
          </div>
        ) : (
          <div className="estado-vacio-publico">
            <span>◇</span>
            <p>Todavía no hay categorías cargadas.</p>
          </div>
        )}
      </div>
    </div>
  )
}
