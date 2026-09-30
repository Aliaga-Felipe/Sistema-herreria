import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicApi, useMeta } from './api.js'
import { MOSTRAR_HORARIO, usePublicConfig } from './PublicContext.jsx'
import ForgePattern from './components/ForgePattern.jsx'
import Reveal from './components/Reveal.jsx'
import ParallaxReveal from './components/ParallaxReveal.jsx'
import TextoParallax from './components/TextoParallax.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'
import DestacadosAnimados from './components/DestacadosAnimados.jsx'
import VideoFondo from './components/VideoFondo.jsx'
import MapaUbicacion from './components/MapaUbicacion.jsx'
import MaterialesGrid from './components/MaterialesGrid.jsx'

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
          <VideoFondo className="hero-video" src={config.negocio_hero_video} />
        )}
        <div className="contenedor hero-inner">
          {config.negocio_nombre && <p className="eyebrow-public hero-marca">{config.negocio_nombre}</p>}
          {config.negocio_eslogan && <h1>{config.negocio_eslogan}</h1>}
          {config.negocio_descripcion && <p>{config.negocio_descripcion}</p>}
          <div className="hero-acciones">
            <Link className="btn-public btn-madera" to="/productos">Explorar colección</Link>
          </div>
        </div>
        <span className="hero-scroll">Desplazate para ver más</span>
      </section>

      <section className="seccion-publica seccion-oscura seccion-destacados">
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
            <TextoParallax className="texto">
              <p className="eyebrow-public">Sobre nosotros</p>
              <h2>Objetos con historia, nuevas formas de habitar</h2>
              <p>
                Nuestro atelier nace de una mirada atenta a los objetos y a los materiales que todavía tienen mucho para dar.
                Recuperamos maderas, hierros y piezas con historia para transformarlos en muebles y objetos con una nueva vida.
              </p>
              <p>
                El diseño y el trabajo artesanal nos permiten encontrar nuevas posibilidades sin borrar las huellas del tiempo.
                Conservamos texturas, marcas e imperfecciones que hacen única a cada pieza, creando un vínculo entre su pasado
                y los espacios que hoy habitamos.
              </p>
            </TextoParallax>
          </div>

          <MaterialesGrid />

          <div className="ubicacion-grid">
            <TextoParallax className="ubicacion-info">
              <h3>Dónde nos encontramos</h3>
              <address className="ubicacion-direccion">
                Pasaje Paraguay 4<br />
                Villa Carlos Paz, Córdoba<br />
                Argentina
              </address>
              {MOSTRAR_HORARIO && (
                <div className="contacto-datos ubicacion-horario">
                  <article>
                    <span className="icono">▷</span>
                    <div>
                      <b>Horario</b>
                      <p>{config.negocio_horario || 'Completá aquí tu horario de atención (ejemplo: Lunes a viernes de 9 a 18 hs).'}</p>
                    </div>
                  </article>
                </div>
              )}
            </TextoParallax>
            <ParallaxReveal className="ubicacion-mapa">
              <MapaUbicacion
                titulo="Mapa de ubicación del taller"
                src="https://www.google.com/maps?q=Pasaje%20Paraguay%204%2C%20Villa%20Carlos%20Paz%2C%20C%C3%B3rdoba%2C%20Argentina&output=embed"
              />
            </ParallaxReveal>
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
