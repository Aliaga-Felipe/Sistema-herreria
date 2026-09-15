import React from 'react'
import { Link } from 'react-router-dom'
import { usePublicConfig } from './PublicContext.jsx'

export default function Footer() {
  const config = usePublicConfig()
  const anio = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="contenedor">
        <div className="footer-grid">
          <div>
            <p className="footer-brand">{config.negocio_nombre}</p>
            <p>{config.negocio_descripcion}</p>
            {(config.negocio_instagram || config.negocio_facebook) && (
              <div className="redes-public">
                {config.negocio_instagram && <a href={config.negocio_instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
                {config.negocio_facebook && <a href={config.negocio_facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
              </div>
            )}
          </div>

          <div>
            <h4>Navegación</h4>
            <ul>
              <li><Link to="/productos">Productos</Link></li>
              <li><Link to="/categorias">Categorías</Link></li>
              <li><Link to="/nosotros">Nosotros</Link></li>
              <li><Link to="/contacto">Contacto</Link></li>
            </ul>
          </div>

          <div>
            <h4>Contacto</h4>
            <ul>
              {config.negocio_whatsapp && <li>WhatsApp: {config.negocio_whatsapp}</li>}
              {config.negocio_email && <li><a href={`mailto:${config.negocio_email}`}>{config.negocio_email}</a></li>}
              {config.negocio_telefono && <li>{config.negocio_telefono}</li>}
            </ul>
          </div>

          <div>
            <h4>Taller</h4>
            <ul>
              {config.negocio_direccion && <li>{config.negocio_direccion}</li>}
              {config.negocio_horario && <li>{config.negocio_horario}</li>}
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {anio} {config.negocio_nombre}. Todos los derechos reservados.</span>
          <span>Hierro forjado, diseño y oficio.</span>
        </div>
      </div>
    </footer>
  )
}
