import React from 'react'

// ---------------------------------------------------------------------
// CHAPITA DE PRODUCTO
// Placa metálica vintage que identifica la pieza, como una "ficha" física
// del taller. El asset gráfico (marca, "Vintage Design" y el molde de la
// placa, con fondo transparente) es fijo y vive en /public/chapita-vintage.png;
// lo único variable por producto es el número de serie, que es el ID de
// pieza propio del producto (productos.id_pieza, ver
// database/migracion_008_id_pieza.sql — distinto de productos.id, la
// clave primaria interna) y se superpone con texto.
//
// Si el producto no tiene id_pieza cargado (columna NULL, caso normal en
// productos a los que todavía no se les asignó un ID) el componente no
// renderiza nada: no hay chapita vacía ni hueco en el layout.
// ---------------------------------------------------------------------
export default function ChapitaProducto({ idPieza }) {
  if (!idPieza) return null

  return (
    <div className="chapita-producto" aria-hidden="false">
      <img
        src="/chapita-vintage.png"
        alt="Chapita de identificación de la pieza: Fede Gomez Friera, Vintage Design"
        className="chapita-imagen"
        loading="lazy"
      />
      {/* El asset ya trae impreso "2026 EDITION | PC N°"; acá sólo se
          superpone el número, alineado a continuación de ese texto. */}
      <span className="chapita-numero">{idPieza}</span>
    </div>
  )
}
