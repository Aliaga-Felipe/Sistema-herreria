import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicApi, useMeta } from '../public-api.js'
import { usePublicConfig } from './PublicContext.jsx'
import ProductCard from './components/ProductCard.jsx'
import CategoryCard from './components/CategoryCard.jsx'
import SectionTitle from './components/SectionTitle.jsx'
import ForgePattern from './components/ForgePattern.jsx'
import Reveal from './components/Reveal.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'

export default function Home() {
  const config = usePublicConfig()
  const [destacados, setDestacados] = useState(null)
  const [categorias, setCategorias] = useState(null)

  useMeta(null, config.negocio_descripcion)

  useEffect(() => {
    publicApi.productos({ destacados: 'true', limite: 8 }).then(datos => setDestacados(datos.productos)).catch(() => setDestacados([]))
    publicApi.categorias().then(datos => setCategorias(datos.slice(0, 6))).catch(() => setCategorias([]))
  }, [])

  return (
    <>
      <section className="hero-public">
        <div className="contenedor hero-inner">
          <p className="eyebrow-public">{config.negocio_nombre} · Herrería de diseño</p>
          <h1>{config.negocio_eslogan || 'Diseño que perdura'}</h1>
          <p>{config.negocio_descripcion || 'Muebles y piezas de herrería artesanal, diseñados y fabricados a medida para transformar espacios.'}</p>
          <div className="hero-acciones">
            <Link className="btn-public btn-madera" to="/productos">Explorar colección</Link>
            <Link className="btn-public btn-fantasma" to="/nosotros">Conocer el taller</Link>
          </div>
        </div>
        <span className="hero-scroll">Desplazate para ver más</span>
      </section>

      <section className="seccion-publica seccion-oscura">
        <div className="contenedor">
          <SectionTitle
            kicker="Selección"
            title="Piezas destacadas"
            text="Una muestra de nuestro trabajo: diseño propio, hierro forjado y terminaciones hechas a mano."
            verTodo={{ to: '/productos', label: 'Ver todo el catálogo' }}
          />
          {destacados === null ? (
            <div className="grilla-productos">
              {Array.from({ length: 4 }).map((_, indice) => <div key={indice} className="skeleton" style={{ aspectRatio: '4/5' }} />)}
            </div>
          ) : destacados.length ? (
            <div className="grilla-productos">
              {destacados.map(producto => <ProductCard key={producto.id} producto={producto} moneda={config.moneda} />)}
            </div>
          ) : (
            <div className="estado-vacio-publico">
              <span>◇</span>
              <p>Todavía no hay productos destacados. Muy pronto vas a poder verlos acá.</p>
            </div>
          )}
        </div>
      </section>

      {Boolean(categorias?.length) && (
        <section className="seccion-publica seccion-clara">
          <div className="contenedor">
            <SectionTitle
              kicker="Explorá"
              title="Categorías"
              text="Cada pieza nace de un mismo oficio: el hierro trabajado a fuego y martillo, pensado para durar generaciones."
              verTodo={{ to: '/categorias', label: 'Ver todas' }}
            />
            <div className="grilla-categorias">
              {categorias.map(categoria => <CategoryCard key={categoria.id} categoria={categoria} />)}
            </div>
          </div>
        </section>
      )}

      <section className="seccion-publica seccion-oscura">
        <div className="contenedor">
          <div className="split-editorial">
            <Reveal><ForgePattern className="split-editorial-img" style={{ aspectRatio: '4/5', borderRadius: '2px' }} /></Reveal>
            <Reveal className="texto">
              <p className="eyebrow-public">Sobre nosotros</p>
              <h2>Oficio de herrería, mirada de diseño</h2>
              <p>
                Cada pieza que sale del taller pasa por las mismas manos que la diseñan: medimos, cortamos, soldamos y
                terminamos a fuego con la misma atención que pondríamos en un mueble para nuestra propia casa.
                Trabajamos con hierro macizo y maderas nobles, pensando cada mueble para que acompañe un espacio
                durante años, no de temporada.
              </p>
              <Link className="btn-public btn-fantasma" to="/nosotros">Conocer más del taller</Link>
            </Reveal>
          </div>

          <div className="materiales-grid">
            <Reveal as="article" className="material-item">
              <span>◆</span><h4>Hierro macizo</h4><p>Estructuras soldadas a mano, pensadas para resistir el uso diario.</p>
            </Reveal>
            <Reveal as="article" className="material-item">
              <span>◈</span><h4>Maderas nobles</h4><p>Combinamos el hierro con maderas seleccionadas por veta y dureza.</p>
            </Reveal>
            <Reveal as="article" className="material-item">
              <span>▲</span><h4>Terminación a fuego</h4><p>Pátinas y terminaciones que protegen la pieza sin perder su carácter.</p>
            </Reveal>
            <Reveal as="article" className="material-item">
              <span>●</span><h4>Diseño a medida</h4><p>Cada encargo se ajusta a las medidas y el estilo del espacio.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="cta-final">
        <div className="contenedor">
          <Reveal>
            <h2>¿Tenés un espacio en mente?</h2>
            <p>Contanos qué estás buscando y te ayudamos a diseñar una pieza única, hecha a mano en nuestro taller.</p>
            <div className="acciones">
              <Link className="btn-public btn-fantasma" to="/contacto">Ir a contacto</Link>
              <WhatsAppLink numero={config.negocio_whatsapp} mensaje="Hola, quisiera consultar por un mueble a medida.">
                Escribir por WhatsApp
              </WhatsAppLink>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
