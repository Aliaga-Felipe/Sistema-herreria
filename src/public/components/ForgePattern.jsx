import React from 'react'

// Motivo decorativo abstracto (líneas al estilo del trazo de una reja
// forjada) usado como reemplazo elegante de una fotografía cuando todavía
// no hay una foto real cargada para esa sección. No pretende ser una
// fotografía: es una textura de marca, coherente en toda la web.
export default function ForgePattern({ className = '', style = {} }) {
  return (
    <div className={className} style={{ background: 'linear-gradient(160deg, #2e2a26 0%, #1a1a1a 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <svg viewBox="0 0 200 200" width="72%" height="72%" fill="none" stroke="#7a4e2d" strokeWidth="1.1" opacity="0.85">
        <circle cx="100" cy="100" r="70" />
        <circle cx="100" cy="100" r="46" stroke="#b78c5e" />
        <path d="M100 30 C 60 30 30 60 30 100" />
        <path d="M170 100 C 170 140 140 170 100 170" stroke="#b78c5e" />
        <path d="M100 8 L100 30 M100 170 L100 192 M8 100 L30 100 M170 100 L192 100" />
        <circle cx="100" cy="100" r="5" fill="#b78c5e" stroke="none" />
      </svg>
    </div>
  )
}
