import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Grilla de "Materiales" en Inicio: al entrar en pantalla por scroll, los
// cuatro bloques se revelan en escalera de izquierda a derecha (cada uno
// arranca un poco después que el anterior gracias a "staggerChildren"),
// subiendo levemente desde abajo mientras el desenfoque (blur) baja a cero
// y la opacidad sube a 100%. Al salir de pantalla hacia arriba (el usuario
// vuelve a subir) se repite el mismo efecto pero al revés: se desarma en
// escalera de derecha a izquierda ("staggerDirection: -1"). Como el
// "viewport" no queda fijo en "once", la animación se reinicia cada vez que
// la sección vuelve a entrar en pantalla, en vez de jugarse una sola vez.
// En "reducir movimiento" se muestra directo, sin animación.

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

const MATERIALES = [
  { icono: '◆', titulo: 'Hierro macizo', texto: 'Estructuras soldadas a mano, pensadas para resistir el uso diario.' },
  { icono: '◈', titulo: 'Maderas nobles', texto: 'Combinamos el hierro con maderas seleccionadas por veta y dureza.' },
  { icono: '▲', titulo: 'Terminación a fuego', texto: 'Pátinas y terminaciones que protegen la pieza sin perder su carácter.' },
  { icono: '●', titulo: 'Diseño a medida', texto: 'Cada encargo se ajusta a las medidas y el estilo del espacio.' },
]

const variantesContenedor = {
  oculto: { transition: { staggerChildren: 0.1, staggerDirection: -1 } },
  visible: { transition: { staggerChildren: 0.13, delayChildren: 0.05, staggerDirection: 1 } },
}

const variantesItem = {
  oculto: { opacity: 0, y: 26, filter: 'blur(9px)', transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } },
}

export default function MaterialesGrid() {
  const reducido = usePrefiereMenosMovimiento()

  if (reducido) {
    return (
      <div className="materiales-grid">
        {MATERIALES.map(mat => (
          <article key={mat.titulo} className="material-item">
            <span>{mat.icono}</span><h4>{mat.titulo}</h4><p>{mat.texto}</p>
          </article>
        ))}
      </div>
    )
  }

  return (
    <motion.div
      className="materiales-grid"
      initial="oculto"
      whileInView="visible"
      viewport={{ once: false, amount: 0.3 }}
      variants={variantesContenedor}
    >
      {MATERIALES.map(mat => (
        <motion.article key={mat.titulo} className="material-item" variants={variantesItem}>
          <span>{mat.icono}</span><h4>{mat.titulo}</h4><p>{mat.texto}</p>
        </motion.article>
      ))}
    </motion.div>
  )
}
