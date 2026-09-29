import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import CarruselSqueeze from './CarruselSqueeze.jsx'

// Sección animada de "Piezas destacadas" en el Inicio: a medida que se
// desplaza hacia esta sección, el título centrado arma sus letras desde
// los costados, debajo entra la bajada centrada y después el botón "Ver
// todo el catálogo" (a la derecha, con un movimiento mínimo). Ese mismo
// recorrido de scroll termina llevando directo al carrusel de productos
// destacados (CarruselSqueeze.jsx): sus paneles entran con la misma
// animación que arma el título, letra por letra (cada uno desde el
// costado que le toca según su posición en la fila, convergiendo al
// centro con la misma curva de desvanecido). No hay una grilla de fotos
// "vieja" de por medio en ningún momento: la animación de entrada lleva
// directo al carrusel. No es un loop continuo, es pura animación de
// scroll (useScroll + useTransform).

const TITULO = 'PRODUCTOS DESTACADOS'

// Respeta "reducir movimiento" del sistema operativo: si está activo, el
// contenido aparece directo, sin las animaciones de traslado/rotación.
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

// Distancia (px por letra) desde la que cada letra entra al título. En
// escritorio es la original (26px); en pantallas angostas se achica en
// proporción al ancho, para que las letras de los extremos no arranquen
// cientos de píxeles fuera de la pantalla (eso ensanchaba la página en el
// celular mientras corría la animación).
function usePasoLetras() {
  const calcular = () => (typeof window === 'undefined' ? 26 : Math.min(26, Math.max(8, window.innerWidth / 40)))
  const [paso, setPaso] = useState(calcular)
  useEffect(() => {
    const alCambiar = () => setPaso(calcular())
    window.addEventListener('resize', alCambiar)
    return () => window.removeEventListener('resize', alCambiar)
  }, [])
  return paso
}

function LetraTitulo({ char, indice, centro, progreso, reducido, paso }) {
  const distancia = indice - centro
  const xInicial = distancia * paso
  const x = useTransform(progreso, [0, 1], [reducido ? 0 : xInicial, 0])
  const opacidad = useTransform(progreso, [0, 0.85, 1], [reducido ? 1 : 0, reducido ? 1 : 0.4, 1])
  const esEspacio = char === ' '
  return (
    <motion.span
      className={`destacados-letra${esEspacio ? ' destacados-letra-espacio' : ''}`}
      style={{ x, opacity: opacidad }}
    >
      {char}
    </motion.span>
  )
}

export default function DestacadosAnimados({ productos, moneda }) {
  const ref = useRef(null)
  const reducido = usePrefiereMenosMovimiento()
  const paso = usePasoLetras()

  // El progreso 0→1 corre mientras la sección entra desde abajo hasta que
  // queda arriba del todo: no fija/"engancha" el scroll, solo escalona la
  // animación a medida que el visitante baja de forma natural.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.92', 'start 0.18'] })

  const progresoTitulo = useTransform(scrollYProgress, [0, 0.35], [0, 1])
  const opacidadSubtitulo = useTransform(scrollYProgress, [0.25, 0.45], [0, 1])
  const ySubtitulo = useTransform(scrollYProgress, [0.25, 0.45], [14, 0])
  const opacidadCta = useTransform(scrollYProgress, [0.4, 0.58], [0, 1])
  // Último tramo del mismo recorrido: en vez de hacer entrar fotos sueltas
  // en una grilla vieja, lleva directo al carrusel con la misma animación
  // que arma el título letra por letra (cada panel entra desde el costado
  // que le toca según su posición en la fila, convergiendo al centro).
  // "progresoCarrusel" es ese 0→1, igual que "progresoTitulo" arriba.
  const progresoCarrusel = useTransform(scrollYProgress, [0.58, 0.92], [0, 1])

  const letras = TITULO.split('')
  const centroLetras = Math.floor(letras.length / 2)
  // Las letras se agrupan por palabra (cada palabra no se parte, pero entre
  // palabras sí puede haber salto de línea): antes eran 20 bloques pegados
  // sin ningún punto de corte, y en el celular el título quedaba más ancho
  // que la pantalla. El índice de cada letra sigue siendo el global, así
  // que la animación es la misma.
  const palabras = TITULO.split(' ').reduce((grupos, palabra) => {
    const inicio = grupos.length ? grupos[grupos.length - 1].inicio + grupos[grupos.length - 1].palabra.length + 1 : 0
    return [...grupos, { palabra, inicio }]
  }, [])
  const cargando = productos === null
  const vacio = !cargando && productos.length === 0

  return (
    <div className="destacados-animados" ref={ref}>
      <h2 className="destacados-titulo" aria-hidden="true">
        {palabras.map(({ palabra, inicio }, numero) => (
          <React.Fragment key={inicio}>
            {numero > 0 && ' '}
            <span className="destacados-palabra">
              {palabra.split('').map((char, posicion) => (
                <LetraTitulo key={inicio + posicion} char={char} indice={inicio + posicion} centro={centroLetras} progreso={progresoTitulo} reducido={reducido} paso={paso} />
              ))}
            </span>
          </React.Fragment>
        ))}
      </h2>
      <span className="sr-only">Productos destacados</span>

      <motion.p className="destacados-subtitulo" style={{ opacity: reducido ? 1 : opacidadSubtitulo, y: reducido ? 0 : ySubtitulo }}>
        Una muestra de nuestro trabajo: diseño propio, hierro forjado y terminaciones hechas a mano.
      </motion.p>

      <motion.div className="destacados-cta" style={{ opacity: reducido ? 1 : opacidadCta }}>
        <Link className="enlace-ver-todo" to="/productos">Ver todo el catálogo</Link>
      </motion.div>

      {vacio ? (
        <p className="destacados-vacio">Todavía no hay productos destacados. Muy pronto vas a poder verlos acá.</p>
      ) : cargando ? (
        <motion.div className="destacados-fase" style={{ opacity: reducido ? 1 : progresoCarrusel }}>
          <div className="destacados-skeleton-carrusel skeleton" />
        </motion.div>
      ) : (
        <div className="destacados-fase">
          <CarruselSqueeze productos={productos} moneda={moneda} progresoEntrada={progresoCarrusel} />
        </div>
      )}
    </div>
  )
}
