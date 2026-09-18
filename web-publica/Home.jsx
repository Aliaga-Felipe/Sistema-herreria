import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicApi, useMeta } from './api.js'
import { usePublicConfig } from './PublicContext.jsx'
import ForgePattern from './components/ForgePattern.jsx'
import Reveal from './components/Reveal.jsx'
import ParallaxReveal from './components/ParallaxReveal.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'
import DestacadosAnimados from './components/DestacadosAnimados.jsx'

export default function Home() {
  const config = usePublicConfig()
  const [destacados, setDestacados] = useState(null)

  useMeta(null, config.negocio_descripcion, config.negocio_rubro)

  useEffect(() => {
    publicApi.productos({ destacados: 'true', limite: 8 }).then(datos => setDestacados(datos.productos)).catch(() => setDestacados([]))
  }, [])

  return (
    <>
      <section className="hero-public">
        {Boolean(config.negocio_hero_video) && (
          <video className="hero-video" src={config.negocio_hero_video} autoPlay muted loop playsInline />
        )}
        <div className="contenedor hero-inner">
          <p className="eyebrow-public">{config.negocio_nombre} · {config.negocio_rubro}</p>
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
          <DestacadosAnimados productos={destacados} moneda={config.moneda} />
        </div>
      </section>

      <section className="seccion-publica seccion-oscura">
        <div className="contenedor">
          <div className="split-editorial">
            <ParallaxReveal>
              {config.negocio_nosotros_imagen
                ? <img
                    src={config.negocio_nosotros_imagen}
                    alt={`Taller de ${config.negocio_nombre}`}
                    className="split-editorial-img"
                    style={{ aspectRatio: '4/5', borderRadius: '2px', objectFit: 'cover' }}
                  />
                : <ForgePattern className="split-editorial-img" style={{ aspectRatio: '4/5', borderRadius: '2px' }} />}
            </ParallaxReveal>
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

          <div className="ubicacion-grid">
            <Reveal className="ubicacion-mapa">
              <iframe
                title="Mapa de ubicación del taller"
                src="https://www.google.com/maps?q=Pasaje%20Paraguay%204%2C%20Villa%20Carlos%20Paz%2C%20C%C3%B3rdoba%2C%20Argentina&output=embed"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </Reveal>
            <Reveal className="ubicacion-info">
              <h3>Dónde nos encontramos</h3>
              <address className="ubicacion-direccion">
                Pasaje Paraguay 4<br />
                Villa Carlos Paz, Córdoba<br />
                Argentina
              </address>
              <div className="contacto-datos ubicacion-horario">
                <article>
                  <span className="icono">▷</span>
                  <div>
                    <b>Horario</b>
                    <p>{config.negocio_horario || 'Completá aquí tu horario de atención (ejemplo: Lunes a viernes de 9 a 18 hs).'}</p>
                  </div>
                </article>
              </div>
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
