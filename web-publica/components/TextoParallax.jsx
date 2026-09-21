import React, { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

// Acompaña a <ParallaxReveal>: se usa en el texto (o cualquier bloque) que
// va al lado de una imagen/mapa envuelto en ParallaxReveal, para que ambos
// lados de la fila se sientan coordinados sin repetir la misma animación.
// Mientras la imagen/mapa se revela con un barrido (clipPath) + parallax,
// este texto sube suavemente desde abajo y se desvanece hacia adentro
// (opacity + y), con el mismo progreso de scroll y la misma ventana de
// activación (offset ['start end', 'center center']) que ParallaxReveal, así
// el movimiento de ambos lados avanza al mismo ritmo. No fija el scroll
// ("scroll jacking").

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

// En mobile el desplazamiento vertical se reduce, igual que en ParallaxReveal.
function useDistanciaParallax(distancia) {
  const [valor, setValor] = useState(distancia)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const consulta = window.matchMedia('(max-width: 640px)')
    const actualizar = () => setValor(consulta.matches ? Math.round(distancia * 0.4) : distancia)
    actualizar()
    consulta.addEventListener('change', actualizar)
    return () => consulta.removeEventListener('change', actualizar)
  }, [distancia])
  return valor
}

export default function TextoParallax({ className = '', style = {}, distancia = 26, children }) {
  const ref = useRef(null)
  const reducido = usePrefiereMenosMovimiento()
  const distanciaY = useDistanciaParallax(distancia)

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })

  const opacidad = useTransform(scrollYProgress, [0, 0.7], [0, 1])
  const y = useTransform(scrollYProgress, [0, 0.85], [distanciaY, 0])

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: reducido ? 1 : opacidad,
        y: reducido ? 0 : y
      }}
    >
      {children}
    </motion.div>
  )
}
