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
          {/* La línea de categoría se renderiza siempre (vacía si el producto
              no tiene categoría) para que el título quede a la misma
              distancia en todas las tarjetas. */}
          <p className="tarjeta-producto-cat" aria-hidden={producto.categoria_nombre ? undefined : true}>{producto.categoria_nombre || '\u00a0'}</p>
          <h3 className="tarjeta-producto-nombre">{producto.nombre}</h3>
          <p className="tarjeta-producto-precio">{dinero(producto.precio_venta, moneda)}</p>
        </div>
      </Link>
    </Reveal>
  )
}
