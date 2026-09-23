import React from 'react'
import { Outlet } from 'react-router-dom'
import './public.css'
import { PublicConfigProvider, usePublicConfig } from './PublicContext.jsx'
import Header from './Header.jsx'
import Footer from './Footer.jsx'
import { WhatsAppFlotante } from './components/WhatsAppButton.jsx'

function Chasis() {
  const config = usePublicConfig()
  return (
    <div className="public-root">
      <Header />
      <Outlet />
      <Footer />
      <WhatsAppFlotante numero={config.negocio_whatsapp} mensaje="Hola, quisiera hacer una consulta." />
    </div>
  )
}

// Envuelve todas las rutas públicas: carga los datos del negocio una sola
// vez (nombre, WhatsApp, redes) y monta header/footer alrededor de cada
// página, que se renderiza en <Outlet />.
export default function PublicLayout() {
  return (
    <PublicConfigProvider>
      <Chasis />
    </PublicConfigProvider>
  )
}
