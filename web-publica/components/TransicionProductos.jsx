import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

// Transición de entrada a "Productos": una burbuja del gris "gris-piedra"
// del sitio (sólido, ver .transicion-productos en public.css) aparece en la
// esquina superior izquierda, crece hasta cubrir toda la pantalla y después
// se repliega hacia la esquina OPUESTA (inferior derecha), revelando el
// catálogo ya cargado debajo con un barrido diagonal en vez de volver por
// donde vino (efecto "iris"/circular wipe). No hace falta que nazca ni
// termine en un punto minúsculo: arranca y cierra en un círculo moderado,
// no en un radio casi invisible. Se arma con clip-path: circle(), animando
// tanto el radio como el centro del círculo, con Framer Motion (ya
// instalado en el proyecto, no se agregó ninguna librería nueva). Cada
// tramo usa una curva de desaceleración suave (la misma familia que ya se
// usa en el resto del sitio) para que se sienta fluido, sin el quiebre
// brusco de una curva simétrica de entrada/salida.
//
// El catálogo (Catalogo.jsx) acompaña este mismo barrido: sus productos
// entran con un pequeño arrastre en la misma dirección diagonal (desde la
// esquina superior izquierda), como si la burbuja los arrastrara consigo
// al revelarlos.
//
// Se dispara sólo al ENTRAR a /productos desde otra ruta (por ejemplo
// desde Inicio o desde el detalle de un producto): compara la ruta anterior
// contra la actual con un ref, así cambios de query string dentro de la
// misma sección (?pagina=, ?orden=, ?categoria=, búsquedas) no la repiten,
// porque el pathname sigue siendo "/productos" y el efecto no vuelve a
// disparar. Tampoco se reproduce en la primera carga directa de la página
// (F5 o entrar por link directo), sólo en navegaciones dentro de la SPA.

const RUTA_PRODUCTOS = '/productos'

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

export default function TransicionProductos() {
  const location = useLocation()
  const reducido = usePrefiereMenosMovimiento()
  const rutaAnterior = useRef(location.pathname)
  const [reproduciendo, setReproduciendo] = useState(false)

  useEffect(() => {
    const entrando = location.pathname === RUTA_PRODUCTOS && rutaAnterior.current !== RUTA_PRODUCTOS
    rutaAnterior.current = location.pathname
    if (entrando && !reducido) setReproduciendo(true)
  }, [location.pathname, reducido])

  return (
    <AnimatePresence>
      {reproduciendo && (
        <motion.div
          className="transicion-productos"
          initial={{ clipPath: 'circle(20% at 0% 0%)' }}
          animate={{
            clipPath: ['circle(20% at 0% 0%)', 'circle(150% at 0% 0%)', 'circle(20% at 100% 100%)']
          }}
          transition={{
            duration: 0.8,
            times: [0, 0.42, 1],
            ease: [[0.22, 1, 0.36, 1], [0.16, 1, 0.3, 1]]
          }}
          onAnimationComplete={() => setReproduciendo(false)}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  )
}
