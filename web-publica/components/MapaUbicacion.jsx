import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Tarjeta del mapa de ubicación: mantiene el mismo mapa real de Google Maps
// (mismo tamaño y posición que antes) con un estilo visual negro logrado con
// un filtro CSS sobre el iframe (sin API key). Se le agrega una inclinación
// 3D sutil al pasar el mouse y un botón "Ampliar" que abre el mapa en una
// superposición más grande. Como el mapa es un iframe de otro origen, sus
// eventos de mouse/click no llegan al documento padre: por eso la
// inclinación usa "whileHover" (funciona por el borde del elemento, no por
// seguimiento continuo del mouse) y la ampliación tiene su propio botón en
// vez de un click en cualquier parte de la tarjeta — así el mapa conserva
// intacto su paneo/zoom nativo.

function usePrefiereMenosMovimiento() {
  const [prefiere, setPrefiere] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefiere(consulta.matches)
    const cambiar = event => setPrefiere(event.matches)
    consulta.addEventListener('change', cambiar)
    return () => consulta.removeEventListener('change', cambiar)
  }, [])
  return prefiere
}

export default function MapaUbicacion({ src, titulo }) {
  const [ampliado, setAmpliado] = useState(false)
  const reducido = usePrefiereMenosMovimiento()

  useEffect(() => {
    if (!ampliado) return
    const alTeclado = event => { if (event.key === 'Escape') setAmpliado(false) }
    document.addEventListener('keydown', alTeclado)
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclado)
      document.body.style.overflow = overflowPrevio
    }
  }, [ampliado])

  return (
    <>
      <motion.div
        className="mapa-negro"
        whileHover={reducido ? undefined : { rotateX: -4, rotateY: 4, scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        style={{ perspective: 1000, transformStyle: 'preserve-3d' }}
      >
        <iframe
          title={titulo}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <button type="button" className="mapa-negro-ampliar" onClick={() => setAmpliado(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
          <span>Ampliar</span>
        </button>
      </motion.div>

      <AnimatePresence>
        {ampliado && (
          <motion.div
            className="mapa-negro-overlay-fondo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onMouseDown={event => { if (event.target === event.currentTarget) setAmpliado(false) }}
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
          >
            <motion.div
              className="mapa-negro-overlay-caja"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              <button type="button" className="mapa-negro-overlay-cerrar" onClick={() => setAmpliado(false)} aria-label="Cerrar mapa ampliado">×</button>
              <iframe
                title={titulo}
                src={src}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
