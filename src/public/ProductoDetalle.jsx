import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { dinero, publicApi, useMeta } from '../public-api.js'
import { usePublicConfig } from './PublicContext.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'
import ProductCard from './components/ProductCard.jsx'
import SectionTitle from './components/SectionTitle.jsx'
import ChapitaVintage from './components/ChapitaVintage.jsx'

export default function ProductoDetalle() {
  const { slug } = useParams()
  const config = usePublicConfig()
  const [producto, setProducto] = useState(null)
  const [error, setError] = useState(false)
  const [activa, setActiva] = useState(0)

  useEffect(() => {
    setProducto(null); setError(false); setActiva(0)
    publicApi.producto(slug).then(setProducto).catch(() => setError(true))
    window.scrollTo({ top: 0 })
  }, [slug])

  useMeta(producto?.nombre, producto?.descripcion?.slice(0, 160))

  if (error) {
    return (
      <div className="estado-vacio-publico" style={{ paddingTop: '160px' }}>
        <span>◇</span>
        <p>No encontramos este producto. Puede que ya no esté disponible.</p>
        <Link className="btn-public btn-fantasma" to="/productos" style={{ marginTop: 20, display: 'inline-flex' }}>Ver catálogo</Link>
      </div>
    )
  }

  if (!producto) {
    return (
      <div className="detalle-producto">
        <div className="contenedor">
          <div className="detalle-grid" style={{ paddingTop: 40 }}>
            <div className="skeleton" style={{ aspectRatio: '4/5' }} />
            <div>
              <div className="skeleton" style={{ height: 32, width: '70%', marginBottom: 18 }} />
              <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 30 }} />
              <div className="skeleton" style={{ height: 120 }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const imagenes = producto.imagenes?.length ? producto.imagenes : []
  const mensaje = `Hola, quisiera consultar por el producto: ${producto.nombre}`

  return (
    <div className="detalle-producto">
      <div className="contenedor">
        <p className="migas">
          <Link to="/">Inicio</Link> / <Link to="/productos">Productos</Link>
          {producto.categoria_nombre && <> / <Link to={`/productos?categoria=${producto.categoria_slug}`}>{producto.categoria_nombre}</Link></>}
          {' '}/ <span>{producto.nombre}</span>
        </p>

        <div className="detalle-grid">
          <div>
            <div className="galeria-principal">
              {imagenes.length
                ? <img src={imagenes[activa]?.url} alt={producto.nombre} />
                : <span className="sin-imagen">▱</span>}
            </div>
            {imagenes.length > 1 && (
              <div className="galeria-miniaturas">
                {imagenes.map((imagen, indice) => (
                  <button key={imagen.id} className={indice === activa ? 'activa' : ''} onClick={() => setActiva(indice)}>
                    <img src={imagen.url} alt={`${producto.nombre} ${indice + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="detalle-info">
            {producto.categoria_nombre && <p className="eyebrow-public">{producto.categoria_nombre}</p>}
            <div className="detalle-titulo">
              <h1>{producto.nombre}</h1>
              {producto.chapita_id && <ChapitaVintage numero={producto.chapita_id} />}
            </div>
            <p className="detalle-precio">{dinero(producto.precio_venta, config.moneda)}</p>
            {producto.descripcion && <p className="detalle-descripcion">{producto.descripcion}</p>}

            <div className="detalle-acciones">
              <WhatsAppLink numero={config.negocio_whatsapp} mensaje={mensaje}>Consultar por WhatsApp</WhatsAppLink>
              <Link className="btn-public btn-fantasma" to="/contacto">Otras formas de contacto</Link>
            </div>

            <div className="detalle-meta">
              <span><b>Disponibilidad</b> — Fabricado a pedido en nuestro taller.</span>
              {producto.categoria_nombre && <span><b>Categoría</b> — {producto.categoria_nombre}</span>}
            </div>
          </div>
        </div>
      </div>

      {Boolean(producto.relacionados?.length) && (
        <section className="relacionados">
          <div className="contenedor">
            <SectionTitle kicker="También te puede interesar" title="Piezas relacionadas" />
            <div className="grilla-productos">
              {producto.relacionados.map(item => <ProductCard key={item.id} producto={item} moneda={config.moneda} />)}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
