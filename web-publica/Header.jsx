import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { usePublicConfig } from './PublicContext.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'
import logoUnAtelier from './logo-un-atelier.png'

const enlaces = [
  { to: '/', label: 'Inicio', fin: true },
  { to: '/productos', label: 'Productos' },
  { to: '/contacto', label: 'Contacto' }
]

export default function Header() {
  const config = usePublicConfig()
  const [scrolled, setScrolled] = useState(false)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setAbierto(false) }, [])

  return (
    <>
      <header className={`site-header ${scrolled || abierto ? 'scrolled' : ''}`}>
        <div className="contenedor">
          <NavLink to="/" className="brand-public" onClick={() => setAbierto(false)}>
            <img src={logoUnAtelier} alt={config.negocio_nombre || 'Un Atelier'} className="logo-header" />
          </NavLink>

          <nav className="nav-public">
            {enlaces.map(enlace => (
              <NavLink key={enlace.to} to={enlace.to} end={enlace.fin} className={({ isActive }) => (isActive ? 'activo' : '')}>
                {enlace.label}
              </NavLink>
            ))}
          </nav>

          <button className={`hamburguesa ${abierto ? 'abierto' : ''}`} onClick={() => setAbierto(!abierto)} aria-label="Abrir menú">
            <span /><span /><span />
          </button>
        </div>
      </header>

      <div className={`menu-movil ${abierto ? 'abierto' : ''}`}>
        {enlaces.map(enlace => (
          <NavLink key={enlace.to} to={enlace.to} end={enlace.fin} onClick={() => setAbierto(false)}>
            {enlace.label}
          </NavLink>
        ))}
        <div className="nav-cta">
          <WhatsAppLink numero={config.negocio_whatsapp} mensaje="Hola, quisiera hacer una consulta." className="btn-public btn-madera btn-block">
            Consultar por WhatsApp
          </WhatsAppLink>
        </div>
      </div>
    </>
  )
}
