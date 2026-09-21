import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { dinero, publicApi, useMeta } from './api.js'
import { usePublicConfig } from './PublicContext.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'
import ProductCard from './components/ProductCard.jsx'
import SectionTitle from './components/SectionTitle.jsx'

export default function ProductoDetalle() {
  const { slug } = useParams()
  const config = usePublicConfig()
  const [producto, setProducto] = useState(null)
  const [error, setError] = useState(false)
  const [activa, setActiva] = useState(0)
  const [amplificada, setAmplificada] = useState(false)

  useEffect(() => {
    setProducto(null); setError(false); setActiva(0); setAmplificada(false)
    publicApi.producto(slug).then(setProducto).catch(() => setError(true))
    window.scrollTo({ top: 0 })
  }, [slug])

  useMeta(producto?.nombre, producto?.descripcion?.slice(0, 160))

  // Imágenes del producto actual (vacío mientras todavía no cargó). Se
  // calculan acá arriba —y no más abajo, después de los "return" de
  // carga/error— porque el carrusel automático (el useEffect siguiente)
  // es un hook y los hooks no pueden quedar detrás de un return
  // condicional: React exige llamarlos siempre en el mismo orden.
  const imagenes = producto?.imagenes?.length ? producto.imagenes : []
  const hayVarias = imagenes.length > 1
  const irAnterior = () => setActiva(indice => (indice - 1 + imagenes.length) % imagenes.length)
  const irSiguiente = () => setActiva(indice => (indice + 1) % imagenes.length)

  // Carrusel automático: cada 3s avanza a la siguiente imagen y vuelve a
  // la primera al llegar al final. No se activa con una sola imagen.
  // Se pausa por completo mientras el lightbox está abierto (no se crea
  // ningún intervalo en ese caso, así la imagen ampliada queda fija y el
  // contador no sigue corriendo de fondo) y se reinicia limpio —desde la
  // imagen actual, nunca desde la primera— cada vez que cambia `activa`
  // (incluida una navegación manual con flechas/puntos) o que se cierra
  // el lightbox. El cleanup limpia el intervalo en cada re-ejecución y al
  // desmontar, así nunca queda más de un temporizador corriendo, incluso
  // si el usuario cambia de producto rápido (el efecto de arriba resetea
  // `activa`, lo que dispara este efecto de nuevo desde cero).
  useEffect(() => {
    if (!hayVarias || amplificada) return
    const id = setInterval(() => {
      setActiva(indice => (indice + 1) % imagenes.length)
    }, 3000)
    return () => clearInterval(id)
  }, [hayVarias, amplificada, imagenes.length, activa])

  // Mientras el lightbox está abierto: bloquea el scroll de fondo (para
  // que tocar/scrollear detrás no mueva la página) y permite cerrar con
  // Escape además de la X, sin afectar nada del resto del sitio porque
  // ambos efectos se deshacen apenas `amplificada` vuelve a false.
  useEffect(() => {
    if (!amplificada) return
    const estiloPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const alTeclear = event => { if (event.key === 'Escape') setAmplificada(false) }
    window.addEventListener('keydown', alTeclear)
    return () => {
      document.body.style.overflow = estiloPrevio
      window.removeEventListener('keydown', alTeclear)
    }
  }, [amplificada])

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

  const mensaje = `Hola, quisiera consultar por el producto: ${producto.nombre}`

  return (
    <div className="detalle-producto">
      <div className="contenedor">
        <Link to="/productos" className="volver-productos">
          <span aria-hidden="true">←</span> Volver a productos
        </Link>

        <p className="migas">
          <Link to="/">Inicio</Link> / <Link to="/productos">Productos</Link>
          {producto.categoria_nombre && <> / <Link to={`/productos?categoria=${producto.categoria_slug}`}>{producto.categoria_nombre}</Link></>}
          {' '}/ <span>{producto.nombre}</span>
        </p>

        <div className="detalle-grid">
          <div>
            <div className="galeria-principal">
              {imagenes.length ? (
                <AnimatePresence initial={false}>
                  <motion.img
                    key={imagenes[activa].id}
                    src={imagenes[activa].url}
                    alt={producto.nombre}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => setAmplificada(true)}
                    role="button"
                    tabIndex={0}
                    aria-label="Ampliar imagen"
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setAmplificada(true) }}
                  />
                </AnimatePresence>
              ) : (
                <span className="sin-imagen">▱</span>
              )}

              {hayVarias && (
                <>
                  <button type="button" className="galeria-flecha galeria-flecha-izq" onClick={irAnterior} aria-label="Imagen anterior">‹</button>
                  <button type="button" className="galeria-flecha galeria-flecha-der" onClick={irSiguiente} aria-label="Imagen siguiente">›</button>
                </>
              )}
            </div>

            {hayVarias && (
              <div className="galeria-puntos">
                {imagenes.map((imagen, indice) => (
                  <button
                    key={imagen.id}
                    type="button"
                    className={indice === activa ? 'activo' : ''}
                    onClick={() => setActiva(indice)}
                    aria-label={`Ver imagen ${indice + 1} de ${imagenes.length}`}
                  />
                ))}
              </div>
            )}

            {hayVarias && (
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
            <h1>{producto.nombre}</h1>
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

      <AnimatePresence>
        {amplificada && Boolean(imagenes.length) && (
          <motion.div
            className="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setAmplificada(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`${producto.nombre} — imagen ampliada`}
          >
            <button
              type="button"
              className="lightbox-cerrar"
              onClick={event => { event.stopPropagation(); setAmplificada(false) }}
              aria-label="Cerrar imagen ampliada"
            >
              ×
            </button>
            <motion.img
              key={imagenes[activa].id}
              className="lightbox-imagen"
              src={imagenes[activa].url}
              alt={producto.nombre}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={event => event.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
