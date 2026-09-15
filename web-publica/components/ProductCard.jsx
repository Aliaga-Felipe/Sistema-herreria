import React from 'react'
import { Link } from 'react-router-dom'
import { dinero } from '../api.js'
import Reveal from './Reveal.jsx'

export default function ProductCard({ producto, moneda }) {
  return (
    <Reveal as="article" className="tarjeta-producto">
      <Link to={`/productos/${producto.slug}`}>
        <div className="tarjeta-producto-media">
          {producto.imagen_principal
            ? <img src={producto.imagen_principal} alt={producto.nombre} loading="lazy" />
            : <span className="sin-imagen">▱</span>}
          {producto.destacado && <span className="chip-destacado">Destacado</span>}
        </div>
        <div className="tarjeta-producto-info">
          {producto.categoria_nombre && <p className="tarjeta-producto-cat">{producto.categoria_nombre}</p>}
          <h3 className="tarjeta-producto-nombre">{producto.nombre}</h3>
          <p className="tarjeta-producto-precio">{dinero(producto.precio_venta, moneda)}</p>
        </div>
      </Link>
    </Reveal>
  )
}
