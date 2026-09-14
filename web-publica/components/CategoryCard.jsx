import React from 'react'
import { Link } from 'react-router-dom'
import Reveal from './Reveal.jsx'

export default function CategoryCard({ categoria }) {
  return (
    <Reveal as="div">
      <Link to={`/productos?categoria=${categoria.slug}`} className="tarjeta-categoria">
        {categoria.imagen
          ? <img src={categoria.imagen} alt={categoria.nombre} loading="lazy" />
          : null}
        <div className="tarjeta-categoria-info">
          <span>{categoria.productos_total} {categoria.productos_total === 1 ? 'pieza' : 'piezas'}</span>
          <h3>{categoria.nombre}</h3>
        </div>
      </Link>
    </Reveal>
  )
}
