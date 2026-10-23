import React from 'react'
import { Link } from 'react-router-dom'
import { precioPublico } from '../api.js'
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
          {/* Igual que la categoría: siempre presente (vacía si no hay
              disponibilidad) para que todas las tarjetas tengan la misma
              altura. Texto plano, en una sola línea. */}
          <p className="tarjeta-producto-disponibilidad" aria-hidden={producto.disponibilidad ? undefined : true}>{producto.disponibilidad || '\u00a0'}</p>
          <p className="tarjeta-producto-precio">{precioPublico(producto.precio_venta, moneda)}</p>
        </div>
      </Link>
    </Reveal>
  )
}
