import React from 'react'
import { urlWhatsapp } from '../../public-api.js'

// Botón de WhatsApp reutilizable. Si no hay número configurado no se
// renderiza (evita un botón roto mientras el admin todavía no lo cargó).
export function WhatsAppLink({ numero, mensaje, className = 'btn-public btn-whatsapp', children }) {
  if (!numero) return null
  return (
    <a className={className} href={urlWhatsapp(numero, mensaje)} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export function WhatsAppFlotante({ numero, mensaje }) {
  if (!numero) return null
  return (
    <a className="whatsapp-flotante" href={urlWhatsapp(numero, mensaje)} target="_blank" rel="noopener noreferrer" aria-label="Consultar por WhatsApp">
      ✆
    </a>
  )
}
