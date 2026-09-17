import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'

// Sección animada de "Piezas destacadas" en el Inicio: a medida que se
// desplaza hacia esta sección, el título centrado arma sus letras desde
// los costados, debajo entra la bajada centrada, después el botón "Ver
// todo el catálogo" (a la derecha, con un movimiento mínimo) y por último
// las fotos cuadradas de los productos destacados entran volando desde los
// costados, cada una a su propio ritmo según qué tan lejos está del
// centro. Una vez que terminan de entrar quedan quietas: no es un loop
// continuo, es pura animación de scroll (useScroll + useTransform).

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

function LetraTitulo({ char, indice, centro, progreso, reducido }) {
  const distancia = indice - centro
  const xInicial = distancia * 26
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

// Foto cuadrada de un producto destacado: entra volando desde el costado
// que le toca según su posición respecto del centro de la fila, y una vez
// que el scroll pasa ese tramo queda fija en su lugar (no vuelve a moverse).
// Debajo de la foto va el nombre del producto, dentro del mismo bloque
// animado para que entre junto con la foto.
function FotoProducto({ producto, indice, centro, progreso, reducido }) {
  const distancia = indice - centro
  const x = useTransform(progreso, [0, 1], [reducido ? 0 : distancia * 60, 0])
  const y = useTransform(progreso, [0, 1], [reducido ? 0 : Math.abs(distancia) * 24, 0])
  const escala = useTransform(progreso, [0, 1], [reducido ? 1 : 0.7, 1])
  const opacidad = useTransform(progreso, [0, 0.5, 1], [reducido ? 1 : 0, reducido ? 1 : 0.35, 1])

  return (
    <motion.div className="destacados-item" style={{ x, y, scale: escala, opacity: opacidad }}>
      <div className="destacados-logo">
        <Link to={`/productos/${producto.slug}`} aria-label={producto.nombre} title={producto.nombre}>
          {producto.imagen_principal
            ? <img src={producto.imagen_principal} alt={producto.nombre} loading="lazy" />
            : <span className="destacados-logo-sin-imagen">▱</span>}
        </Link>
      </div>
      <p className="destacados-nombre">{producto.nombre}</p>
    </motion.div>
  )
}

export default function DestacadosAnimados({ productos }) {
  const ref = useRef(null)
  const reducido = usePrefiereMenosMovimiento()

  // El progreso 0→1 corre mientras la sección entra desde abajo hasta que
  // queda arriba del todo: no fija/"engancha" el scroll, solo escalona la
  // animación a medida que el visitante baja de forma natural.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.92', 'start 0.18'] })

  const progresoTitulo = useTransform(scrollYProgress, [0, 0.35], [0, 1])
  const opacidadSubtitulo = useTransform(scrollYProgress, [0.25, 0.45], [0, 1])
  const ySubtitulo = useTransform(scrollYProgress, [0.25, 0.45], [14, 0])
  const opacidadCta = useTransform(scrollYProgress, [0.4, 0.58], [0, 1])
  const progresoFotos = useTransform(scrollYProgress, [0.52, 0.88], [0, 1])

  const letras = TITULO.split('')
  const centroLetras = Math.floor(letras.length / 2)
  const cargando = productos === null
  const vacio = !cargando && productos.length === 0
  const items = cargando ? Array.from({ length: 4 }) : productos
  const centroFotos = Math.floor(items.length / 2)

  return (
    <div className="destacados-animados" ref={ref}>
      <h2 className="destacados-titulo" aria-hidden="true">
        {letras.map((char, indice) => (
          <LetraTitulo key={indice} char={char} indice={indice} centro={centroLetras} progreso={progresoTitulo} reducido={reducido} />
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
      ) : (
        <div className="destacados-logos">
          {items.map((producto, indice) => (
            cargando
              ? <div key={indice} className="destacados-item"><div className="destacados-logo skeleton" /></div>
              : <FotoProducto key={producto.id} producto={producto} indice={indice} centro={centroFotos} progreso={progresoFotos} reducido={reducido} />
          ))}
        </div>
      )}
    </div>
  )
}
