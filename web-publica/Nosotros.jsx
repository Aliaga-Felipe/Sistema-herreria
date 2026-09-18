import React from 'react'
import { Link } from 'react-router-dom'
import { useMeta } from './api.js'
import { usePublicConfig } from './PublicContext.jsx'
import ForgePattern from './components/ForgePattern.jsx'
import Reveal from './components/Reveal.jsx'
import ParallaxReveal from './components/ParallaxReveal.jsx'

export default function Nosotros() {
  const config = usePublicConfig()
  useMeta('Nosotros', `Conocé el taller de ${config.negocio_nombre}: oficio de herrería, diseño propio y fabricación artesanal.`)

  return (
    <div>
      <header className="catalogo-encabezado nosotros-encabezado" style={{ paddingBottom: 56 }}>
        <div className="contenedor">
          <p className="eyebrow-public">Nuestra historia</p>
        </div>
      </header>

      <section className="seccion-publica seccion-oscura" style={{ paddingTop: 0 }}>
        <div className="contenedor">
          <div className="split-editorial">
            <ParallaxReveal>
              {config.negocio_nosotros_imagen
                ? <img
                    src={config.negocio_nosotros_imagen}
                    alt={`Taller de ${config.negocio_nombre}`}
                    style={{ aspectRatio: '4/5', borderRadius: '2px', width: '100%', objectFit: 'cover' }}
                  />
                : <ForgePattern
                    style={{
                      aspectRatio: '4/5',
                      borderRadius: '2px',
                      background: 'radial-gradient(circle at 50% 42%, rgba(122,78,45,0.4) 0%, rgba(46,42,38,0.55) 45%, var(--negro) 78%)'
                    }}
                  />}
            </ParallaxReveal>
            <Reveal className="texto">
              <p className="eyebrow-public">Taller y diseño</p>
              <h2>Hierro, fuego y paciencia</h2>
              <p>
                {config.negocio_nombre} nació del oficio de la herrería tradicional y la mirada de un estudio de
                diseño: cada mueble se piensa primero en el papel y se fabrica después, pieza por pieza, en nuestro
                propio taller. No trabajamos en serie: cada encargo se ajusta al espacio, al uso y al gusto de quien
                lo va a tener en su casa.
              </p>
              <p>
                Combinamos hierro macizo, soldado y forjado a mano, con maderas seleccionadas por su veta y dureza.
                El resultado son piezas robustas, pensadas para envejecer bien y acompañar un espacio durante años.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="seccion-publica seccion-clara">
        <div className="contenedor">
          <div className="materiales-grid" style={{ marginTop: 0 }}>
            <Reveal as="article" className="material-item">
              <span>🔥</span><h4>Forjado a fuego</h4><p>Cada pieza estructural se trabaja en la fragua, no se compra prefabricada.</p>
            </Reveal>
            <Reveal as="article" className="material-item">
              <span>✎</span><h4>Diseño propio</h4><p>Los modelos se diseñan en el taller, pensando en proporciones y uso real.</p>
            </Reveal>
            <Reveal as="article" className="material-item">
              <span>⚒</span><h4>Fabricación a medida</h4><p>Ajustamos medidas, terminaciones y materiales a cada encargo.</p>
            </Reveal>
            <Reveal as="article" className="material-item">
              <span>◆</span><h4>Calidad duradera</h4><p>Uniones soldadas y terminaciones pensadas para el uso diario.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="cta-final">
        <div className="contenedor">
          <Reveal>
            <h2>Conocé el catálogo completo</h2>
            <p>Descubrí las piezas disponibles hoy en el taller, o contanos qué estás buscando para diseñar algo a medida.</p>
            <div className="acciones">
              <Link className="btn-public btn-fantasma" to="/productos">Ver productos</Link>
              <Link className="btn-public btn-madera" to="/contacto">Contactar al taller</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
