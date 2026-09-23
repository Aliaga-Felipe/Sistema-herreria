import React from 'react'

// Chapita vintage: se muestra junto al nombre del producto en la página de
// detalle SOLO cuando el admin cargó un "ID de chapita" para ese producto
// (ver panel-productos.jsx y ProductoDetalle.jsx, que no la renderiza en
// absoluto si no hay número). El número es lo único que cambia por
// producto; el resto del texto es fijo, igual a la placa de referencia.
// Es una placa metálica armada en CSS puro (bisel, tornillos y pátina por
// capas de gradientes, ver public.css) y no un simple rectángulo de color.
export default function ChapitaVintage({ numero }) {
  return (
    <div className="chapita-vintage" aria-label={`Placa numerada PC N° ${numero}`}>
      <span className="chapita-tornillo tl" aria-hidden="true" />
      <span className="chapita-tornillo tr" aria-hidden="true" />
      <span className="chapita-tornillo bl" aria-hidden="true" />
      <span className="chapita-tornillo br" aria-hidden="true" />
      <div className="chapita-contenido">
        <span className="chapita-marca">Fede Gomez Friera</span>
        <span className="chapita-linea">Vintage Design</span>
        <span className="chapita-separador" aria-hidden="true" />
        <span className="chapita-edicion">2026 Edition</span>
        <span className="chapita-codigo">PC N° {numero}</span>
      </div>
    </div>
  )
}
