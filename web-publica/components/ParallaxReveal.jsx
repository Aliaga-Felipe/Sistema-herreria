import React, { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

// Envoltorio de scroll para la imagen/motivo de "Sobre nosotros" (y
// reutilizable en cualquier otra imagen destacada del sitio público). A
// medida que el elemento entra en pantalla se revela con un barrido de
// izquierda a derecha (clipPath), aparece (opacity) y se acomoda con un
// pequeño desplazamiento vertical tipo parallax (y). No fija el scroll
// ("scroll jacking"): es una animación ligada al progreso natural del
// scroll, con la misma lógica de useScroll + useTransform que ya se usa en
// components/DestacadosAnimados.jsx.
//
// No reemplaza a <Reveal>: Reveal sigue siendo el fade simple para texto y
// tarjetas; este componente es específicamente para la imagen, con el
// efecto de aparición/revelado pedido (opacity + clipPath + parallax).

// Respeta "reducir movimiento" del sistema operativo: si está activo, el
// contenido aparece directo, sin clipPath ni desplazamiento.
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

// En mobile el desplazamiento vertical se reduce, para que el efecto se
// sienta suave y no "salte" en pantallas chicas.
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

export default function ParallaxReveal({ className = '', style = {}, distancia = 40, children }) {
  const ref = useRef(null)
  const reducido = usePrefiereMenosMovimiento()
  const distanciaY = useDistanciaParallax(distancia)

  // Progreso 0→1 mientras el elemento sube desde el borde inferior de la
  // pantalla hasta que su centro llega al centro de la pantalla: para
  // cuando el visitante lo tiene enfrente, la animación ya terminó.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })

  const opacidad = useTransform(scrollYProgress, [0, 0.7], [0, 1])
  const recorte = useTransform(scrollYProgress, [0, 0.7], ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'])
  const y = useTransform(scrollYProgress, [0, 1], [-distanciaY, 0])

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: reducido ? 1 : opacidad,
        clipPath: reducido ? 'none' : recorte,
        y: reducido ? 0 : y
      }}
    >
      {children}
    </motion.div>
  )
}
