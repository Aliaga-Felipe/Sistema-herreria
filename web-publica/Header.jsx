import React, { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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

  const { pathname } = useLocation()

  // El menú móvil se cierra solo al cambiar de página (antes el efecto
  // corría una sola vez al montar y el menú podía quedar abierto).
  useEffect(() => { setAbierto(false) }, [pathname])

  // Mientras el menú está abierto: Escape lo cierra y la página de fondo no
  // se desplaza (se bloquea el scroll del documento, sin mover el layout).
  useEffect(() => {
    if (!abierto) return undefined
    const alTeclear = event => { if (event.key === 'Escape') setAbierto(false) }
    const raiz = document.documentElement
    const overflowPrevio = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    window.addEventListener('keydown', alTeclear)
    return () => {
      raiz.style.overflow = overflowPrevio
      window.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

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

          <button
            type="button"
            className={`hamburguesa ${abierto ? 'abierto' : ''}`}
            onClick={() => setAbierto(!abierto)}
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            aria-controls="menu-movil"
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* Menú móvil: panel lateral dentro de una capa fija del tamaño exacto
          del viewport que recorta lo que queda afuera. Cerrado, el panel
          espera fuera de pantalla DENTRO de esa capa (antes era un elemento
          fijo corrido 100% a la derecha, y el texto del botón de WhatsApp,
          que no podía partirse, asomaba sobre la página). El fondo oscuro
          cierra el menú al tocarlo; el header (con la hamburguesa) queda
          siempre por encima para poder cerrarlo. */}
      <div className={`menu-movil-capa ${abierto ? 'abierto' : ''}`} aria-hidden={!abierto}>
        <div className="menu-movil-fondo" onClick={() => setAbierto(false)} />
        <nav id="menu-movil" className={`menu-movil ${abierto ? 'abierto' : ''}`} aria-label="Menú principal">
          {enlaces.map(enlace => (
            <NavLink key={enlace.to} to={enlace.to} end={enlace.fin} onClick={() => setAbierto(false)} tabIndex={abierto ? 0 : -1}>
              {enlace.label}
            </NavLink>
          ))}
          <div className="nav-cta">
            <WhatsAppLink numero={config.negocio_whatsapp} mensaje="Hola, quisiera hacer una consulta." className="btn-public btn-madera btn-block">
              Consultar por WhatsApp
            </WhatsAppLink>
          </div>
        </nav>
      </div>
    </>
  )
}
