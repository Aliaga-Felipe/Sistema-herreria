import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { precioPublico } from '../api.js'

// ---------------------------------------------------------------------
// CARRUSEL DE PRODUCTOS DESTACADOS
//
// Una tira horizontal de paneles: se ve un producto principal grande y, a
// su derecha, un fragmento más chico del siguiente asomando. El principal
// es el que se nombra debajo, en ".csq-info". Es el mismo formato en
// celular y en computadora (antes, en computadora, era un carrusel
// "squeeze" con columnas comprimidas y listones; ver #78 y #80):
//
// - Se pasa de producto haciendo clic (o tocando) el que asoma, con las
//   flechas de arriba, con las flechas del teclado o con los puntos
//   indicadores de abajo.
// - Con el dedo se puede deslizar (celular/tablet). Con el mouse NO se
//   arrastra: en computadora se avanza haciendo clic en el próximo.
// - En celular el principal es cuadrado y ocupa el 85 % del ancho (igual
//   que en la versión 1.3.1). En computadora ocupa el 70 % del ancho de la
//   sección, apaisado y con el alto limitado (para no llenar toda la
//   pantalla en un monitor ancho), y el siguiente asoma en el resto, un
//   poco más chico (ESCALA_SIGUIENTE).
//
// No usa Tailwind/shadcn/TypeScript (este proyecto no los usa). Los
// estilos viven en public.css (clases "csq-*") y usan la misma paleta y
// variables que el resto de la web pública.
//
// Recibe los productos ya cargados por quien lo use (misma fuente que el
// resto de "Productos destacados": no arma ni duplica ninguna lista
// propia), y reutiliza los mismos datos, enlaces y formato de precio que
// ya usan ProductCard/Catalogo en el resto del sitio.
// ---------------------------------------------------------------------

const numero = valor => (typeof valor === 'number' ? `${valor}px` : valor)
const clases = (...partes) => partes.filter(Boolean).join(' ')

// Ancho del contenedor (no de la ventana) por debajo del cual el carrusel
// usa la separación de celular.
const ANCHO_MOVIL = 640
// Parte del ancho del carrusel que ocupa el producto principal (el resto
// es lo que asoma del siguiente), en celular y en computadora.
const FRACCION_MOVIL = 0.85
const FRACCION_ESCRITORIO = 0.7
// Proporción (ancho / alto) del panel en computadora, antes de limitar el
// alto con "alturaMaxima".
const RELACION_ESCRITORIO = 4 / 3
// Tamaño del que asoma respecto del principal, en computadora.
const ESCALA_SIGUIENTE = 0.82
// Separación entre paneles en celular (más chica que la de computadora
// para que el siguiente asome lo suficiente).
const SEPARACION_MOVIL = 12
// Distancia mínima (px) de un deslizamiento para pasar de producto.
const UMBRAL_DESLIZAR = 50
// Movimiento a partir del cual un toque deja de contar como "tocar" y
// pasa a ser un arrastre (evita cambiar de producto con un toque torcido).
const HOLGURA_ARRASTRE = 8

// Mide el ancho del propio carrusel con ResizeObserver: la separación
// depende del espacio que le deja la página, no del ancho de la ventana.
function useAnchoContenedor(ref, activo) {
  const [ancho, setAncho] = useState(null)
  useLayoutEffect(() => {
    if (!activo) return
    const nodo = ref.current
    if (!nodo) return
    setAncho(nodo.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(entradas => {
      const entrada = entradas[entradas.length - 1]
      if (entrada) setAncho(entrada.contentRect.width)
    })
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [ref, activo])
  return ancho
}

// Respeta "reducir movimiento" del sistema operativo, igual que el resto
// de las animaciones de la web pública.
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

export default function CarruselSqueeze({
  productos,
  moneda = 'ARS',
  indiceInicial = 0,
  // Progreso 0→1 de scroll para la entrada de los paneles (la misma idea
  // que arma el título letra por letra en DestacadosAnimados.jsx: cada
  // panel entra desde el costado que le toca según su posición en la
  // fila, y converge al centro). Si no se pasa, los paneles aparecen
  // directamente en su lugar, sin animación de entrada.
  progresoEntrada,
  // Alto máximo del carrusel en computadora.
  alturaMaxima = 'min(520px, 66vh)',
  // Los productos de este catálogo se muestran en cuadrado (misma
  // proporción que las fotos del panel de producto).
  relacionImagen = 1,
  separacion = 16,
  radio = 4,
  duracion = 900,
  autoplay = false,
  intervalo = 6000,
  controles = true,
  etiqueta = 'Productos destacados',
  className,
  style,
}) {
  const total = productos.length
  const envolver = i => ((i % total) + total) % total

  // En la tira alcanza con el principal y el que asoma: el resto queda
  // fuera de la vista y se agrega recién al avanzar.
  const visibles = Math.min(total, 2)

  const raiz = useRef(null)
  const anchoContenedor = useAnchoContenedor(raiz, total > 0)
  const movil = anchoContenedor !== null && anchoContenedor < ANCHO_MOVIL
  // Hasta medir el contenedor no se sabe si es celular o computadora: el
  // tamaño del que asoma se aplica sin animación hasta entonces, para que
  // no se vea achicarse (o crecer) al cargar la página.
  const [medido, setMedido] = useState(false)
  useEffect(() => {
    if (anchoContenedor === null || medido) return
    const id = requestAnimationFrame(() => setMedido(true))
    return () => cancelAnimationFrame(id)
  }, [anchoContenedor, medido])
  const reducido = usePrefiereMenosMovimiento()
  const ms = reducido ? 0 : duracion

  // Controles, puntos e info: aparecen con un simple fade (igual que el
  // subtítulo/CTA de arriba) sobre la segunda mitad del mismo progreso de
  // entrada que usan los paneles, para que no salten a la vista antes de
  // que la fila termine de armarse.
  const entradaInterna = useMotionValue(1)
  const fuenteEntrada = progresoEntrada ?? entradaInterna
  const opacidadAuxiliar = useTransform(fuenteEntrada, [0.5, 1], [0, 1])

  const ids = useId()
  const semilla = useRef(0)

  const ventanaInicial = () =>
    Array.from({ length: visibles }, (_, p) => ({ key: semilla.current++, indice: envolver(indiceInicial + p) }))

  const [tarjetas, setTarjetas] = useState(ventanaInicial)
  const [columna, setColumna] = useState(0)
  const columnaRef = useRef(0)
  const haciaAdelante = useRef(true)
  const [desplazado, setDesplazado] = useState(0)
  const [quieto, setQuieto] = useState(false)
  const [pausado, setPausado] = useState(false)
  // Desplazamiento (px) que sigue al dedo mientras se desliza.
  const [arrastre, setArrastre] = useState(0)
  const gesto = useRef(null)
  const evitarClick = useRef(false)
  const temporizadores = useRef([])

  useEffect(() => () => temporizadores.current.forEach(clearTimeout), [])

  const abierto = tarjetas[-columna]?.indice ?? indiceInicial

  // Reordena la tira al terminar el movimiento: la deja del largo
  // "visible" y pone los contadores en cero, sin animar nada en ese
  // instante (misma foto, distinta contabilidad interna).
  const asentar = useCallback(() => {
    setTarjetas(tira => (haciaAdelante.current ? tira.slice(-visibles) : tira.slice(0, visibles)))
    columnaRef.current = 0
    setColumna(0)
    setDesplazado(0)
    setQuieto(true)
  }, [visibles])

  useLayoutEffect(() => {
    if (!quieto) return
    const id = requestAnimationFrame(() => setQuieto(false))
    return () => cancelAnimationFrame(id)
  }, [quieto])

  const avanzar = useCallback(
    by => {
      if (total < 2 || by === 0) return
      temporizadores.current.forEach(clearTimeout)
      temporizadores.current = []
      haciaAdelante.current = by > 0

      if (by > 0) {
        setTarjetas(tira => [
          ...tira,
          ...Array.from({ length: by }, (_, k) => ({ key: semilla.current++, indice: envolver(tira[tira.length - 1].indice + 1 + k) })),
        ])
        columnaRef.current -= by
        setColumna(columnaRef.current)
        setDesplazado(s => s - by)
        // Si venía de un deslizamiento, la tira sigue desde donde la dejó
        // el dedo hasta su lugar nuevo, con la misma transición.
        setArrastre(0)
      } else {
        setTarjetas(tira => [
          ...Array.from({ length: -by }, (_, k) => ({ key: semilla.current++, indice: envolver(tira[0].indice - (-by - k)) })),
          ...tira,
        ])
        setDesplazado(s => s + by)
        setQuieto(true)
        // El arrastre se suelta junto con el desplazamiento (y no antes)
        // para que la tira no salte al agregar el panel nuevo a la izquierda.
        temporizadores.current.push(window.setTimeout(() => { setDesplazado(0); setArrastre(0) }, 0))
      }
      temporizadores.current.push(window.setTimeout(asentar, ms + 20))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, ms, asentar]
  )

  // Autoplay opcional (apagado por defecto: esta sección ya tiene su
  // propia animación de entrada, no hace falta que además gire sola).
  useEffect(() => {
    if (!autoplay || pausado || reducido || total < 2) return
    const id = window.setTimeout(() => avanzar(1), intervalo)
    return () => clearTimeout(id)
  }, [autoplay, pausado, reducido, total, abierto, intervalo, avanzar])

  const alPresionarTecla = event => {
    const movimientos = { ArrowRight: 1, ArrowLeft: -1 }
    const by = movimientos[event.key]
    if (by === undefined) return
    event.preventDefault()
    avanzar(by)
  }

  // Deslizar con el dedo: eventos de puntero sobre ".csq-tira". Solo con
  // toque (o lápiz): con el mouse el carrusel no se arrastra, se avanza
  // haciendo clic en el producto que asoma. La tira sigue al dedo y, al
  // soltar, un recorrido horizontal de más de UMBRAL_DESLIZAR px pasa al
  // producto siguiente o al anterior; si no, vuelve a su lugar.
  // "touch-action: pan-y" (en public.css) deja que el navegador siga
  // manejando el scroll vertical de la página: si el gesto es vertical, el
  // navegador lo toma y cancela el puntero (pointercancel), sin mover la tira.
  const alBajarPuntero = event => {
    if (event.pointerType === 'mouse' || total < 2) return
    gesto.current = { id: event.pointerId, x: event.clientX, y: event.clientY, arrastrando: false }
  }

  const alMoverPuntero = event => {
    const g = gesto.current
    if (!g || g.id !== event.pointerId) return
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    if (!g.arrastrando) {
      if (Math.abs(dx) < HOLGURA_ARRASTRE || Math.abs(dx) < Math.abs(dy)) return
      g.arrastrando = true
      // Recién acá se captura el puntero: un toque simple sigue llegando
      // como click al panel tocado (el que asoma lleva a ese producto).
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    setArrastre(reducido ? 0 : dx)
  }

  const alSoltarPuntero = event => {
    const g = gesto.current
    if (!g || g.id !== event.pointerId) return
    gesto.current = null
    if (!g.arrastrando) return
    evitarClick.current = true
    window.setTimeout(() => { evitarClick.current = false }, 0)
    const dx = event.clientX - g.x
    if (event.type !== 'pointercancel' && Math.abs(dx) > UMBRAL_DESLIZAR) avanzar(dx < 0 ? 1 : -1)
    else setArrastre(0)
  }

  // Ir directo a un producto (puntos indicadores).
  const irA = indice => avanzar(indice - abierto)

  if (!total) return null

  // Ancho del panel: con un solo producto, todo el ancho; si no, la
  // fracción que corresponda (y el siguiente asoma en lo que sobra). En
  // celular el alto sale del ancho (panel cuadrado, como en 1.3.1); en
  // computadora el panel es apaisado y su alto queda limitado por
  // "alturaMaxima". La foto se recorta centrada (object-fit: cover).
  const fraccion = total > 1 ? (movil ? FRACCION_MOVIL : FRACCION_ESCRITORIO) : 1
  const variables = {
    '--csq-panel': `${fraccion * 100}cqi`,
    '--csq-alto': movil
      ? 'calc(var(--csq-panel) / var(--csq-relacion))'
      : `min(calc(var(--csq-panel) / ${RELACION_ESCRITORIO}), ${numero(alturaMaxima)})`,
    '--csq-gap': numero(movil ? Math.min(separacion, SEPARACION_MOVIL) : separacion),
    '--csq-radio': numero(radio),
    '--csq-ms': `${ms}ms`,
    '--csq-ease': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--csq-relacion': relacionImagen,
    '--csq-hero': 'calc(var(--csq-alto) * var(--csq-relacion))',
  }

  // Cada paso de la tira corre un panel entero, más lo que lleva
  // arrastrado el dedo.
  const mover = `translateX(calc(${desplazado} * (var(--csq-panel) + var(--csq-gap)) + ${arrastre}px))`
  const transicionTira = quieto || gesto.current?.arrastrando ? 'none' : `transform var(--csq-ms) var(--csq-ease)`

  // "raiz" ocupa todo el ancho disponible y es lo que se mide; el carrusel
  // (".csq") va adentro, con el ancho máximo en computadora. Si se midiera
  // el propio carrusel, al limitarlo a menos de ANCHO_MOVIL pasaría a modo
  // celular, se soltaría el límite y volvería a cambiar sin parar.
  return (
    <div ref={raiz} className="csq-raiz">
      <div
        className={clases('csq', movil && 'csq-movil', className)}
        style={{ containerType: 'inline-size', ...variables, ...style }}
        onMouseEnter={() => setPausado(true)}
        onMouseLeave={() => setPausado(false)}
        onFocusCapture={() => setPausado(true)}
        onBlurCapture={() => setPausado(false)}
      >
        {controles && total > 1 && (
          <motion.div className="csq-controles" style={{ opacity: reducido ? 1 : opacidadAuxiliar }}>
            <FlechaCarrusel atras etiqueta="Producto anterior" onClick={() => avanzar(-1)} />
            <FlechaCarrusel etiqueta="Producto siguiente" onClick={() => avanzar(1)} />
          </motion.div>
        )}

        <div className="csq-ventana" style={{ height: 'var(--csq-alto)' }}>
          <div
            role="tablist"
            aria-label={etiqueta}
            aria-orientation="horizontal"
            onKeyDown={alPresionarTecla}
            onPointerDown={alBajarPuntero}
            onPointerMove={alMoverPuntero}
            onPointerUp={alSoltarPuntero}
            onPointerCancel={alSoltarPuntero}
            onClickCapture={event => {
              // Un deslizamiento no debe contar además como toque en un panel.
              if (!evitarClick.current) return
              event.preventDefault()
              event.stopPropagation()
            }}
            className="csq-tira"
            style={{ transform: mover, transition: transicionTira }}
          >
            {(() => {
              // Centro de la fila visible (igual que "centroLetras" del
              // título): cada panel entra desde el costado que le toca según
              // cuán lejos está de este centro.
              const centroTarjetas = (tarjetas.length - 1) / 2

              return tarjetas.map((tarjeta, lugar) => {
                const col = lugar + columna
                const producto = productos[tarjeta.indice]

                return (
                  <PanelCarrusel
                    key={tarjeta.key}
                    ids={ids}
                    tarjetaKey={tarjeta.key}
                    producto={producto}
                    esAbierto={col === 0}
                    distancia={lugar - centroTarjetas}
                    progresoEntrada={fuenteEntrada}
                    reducido={reducido}
                    onClick={() => col > 0 && avanzar(col)}
                    primero={lugar === 0}
                  escala={movil || col === 0 ? 1 : ESCALA_SIGUIENTE}
                  ms={medido ? ms : 0}
                  />
                )
              })
            })()}
          </div>
        </div>

        {total > 1 && (
          <motion.div className="csq-puntos" style={{ opacity: reducido ? 1 : opacidadAuxiliar }}>
            {productos.map((producto, i) => (
              <button
                key={producto.id ?? i}
                type="button"
                className="csq-punto"
                aria-label={`Ir al producto ${i + 1}`}
                aria-current={i === abierto ? 'true' : undefined}
                onClick={() => irA(i)}
              />
            ))}
          </motion.div>
        )}

        <motion.div id={`${ids}-panel`} role="tabpanel" aria-live="polite" className="csq-info" style={{ opacity: reducido ? 1 : opacidadAuxiliar }}>
          {productos.map((producto, i) => {
            const mostrado = i === abierto
            return (
              <div
                key={producto.id ?? i}
                aria-hidden={!mostrado}
                className="csq-info-item"
                style={{
                  opacity: mostrado ? 1 : 0,
                  visibility: mostrado ? 'visible' : 'hidden',
                  pointerEvents: mostrado ? 'auto' : 'none',
                  transition: 'opacity var(--csq-ms) var(--csq-ease), visibility var(--csq-ms)',
                }}
              >
                <p className="csq-info-texto">
                  <span className="csq-info-nombre">{producto.nombre}</span>{' '}
                  <span className="csq-info-precio">{precioPublico(producto.precio_venta, moneda)}</span>
                </p>
                <Link to={`/productos/${producto.slug}`} tabIndex={mostrado ? 0 : -1} className="csq-accion btn-public btn-madera">
                  Ver producto
                </Link>
              </div>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- */
/*                                 piezas                                */
/* -------------------------------------------------------------------- */

// Un panel de la tira. Todos miden lo mismo (--csq-panel); el que asoma a
// la derecha se ve en parte y es clickeable. Además suma la entrada por
// scroll: mientras "progresoEntrada" va de 0 a 1, el panel se desplaza
// desde el costado que le toca (según "distancia", su lugar en la fila
// respecto del centro) hasta su posición final, con la misma curva de
// opacidad que usa cada letra del título ([0, 0.85, 1] → [0, 0.4, 1]). Al
// no recibir "progresoEntrada" el panel aparece directo, sin animación.
function PanelCarrusel({
  ids, tarjetaKey, producto, esAbierto, distancia, progresoEntrada, reducido, onClick, primero, escala, ms,
}) {
  const xInicial = distancia * 50
  const x = useTransform(progresoEntrada, [0, 1], [reducido ? 0 : xInicial, 0])
  const opacidad = useTransform(progresoEntrada, [0, 0.85, 1], [reducido ? 1 : 0, reducido ? 1 : 0.4, 1])

  return (
    <motion.button
      type="button"
      role="tab"
      id={`${ids}-tab-${tarjetaKey}`}
      aria-selected={esAbierto}
      aria-controls={`${ids}-panel`}
      aria-label={esAbierto ? producto.nombre : `Ver siguiente: ${producto.nombre}`}
      tabIndex={esAbierto ? 0 : -1}
      onClick={onClick}
      className="csq-panel"
      // En computadora el que asoma se ve más chico y crece al pasar a ser
      // el principal (y al revés), con la misma duración que la tira.
      initial={false}
      animate={{ scale: escala }}
      transition={{ duration: ms / 1000, ease: [0.16, 1, 0.3, 1] }}
      style={{
        originX: 0,
        x,
        opacity: opacidad,
        width: 'var(--csq-panel)',
        marginLeft: primero ? 0 : 'var(--csq-gap)',
        borderRadius: 'var(--csq-radio)',
      }}
    >
      <FotoPanel producto={producto} />

      {producto.categoria_nombre && (
        <span
          aria-hidden="true"
          className="csq-chip"
          style={{ opacity: esAbierto ? 1 : 0, transition: 'opacity var(--csq-ms) var(--csq-ease)' }}
        >
          {producto.categoria_nombre}
        </span>
      )}
    </motion.button>
  )
}

// La imagen se dibuja al tamaño del panel principal (--csq-hero) y
// centrada, igual que en la versión 1.3.1 (así en celular se ve idéntica).
function FotoPanel({ producto }) {
  const caja = { width: 'var(--csq-hero)', minWidth: '100%' }
  if (producto.imagen_principal) {
    return (
      <img
        src={producto.imagen_principal}
        alt={producto.nombre}
        draggable={false}
        loading="lazy"
        className="csq-imagen"
        style={caja}
      />
    )
  }
  return (
    <span aria-hidden="true" className="csq-imagen csq-sin-imagen" style={caja}>▱</span>
  )
}

function FlechaCarrusel({ atras = false, etiqueta, onClick }) {
  return (
    <button type="button" aria-label={etiqueta} onClick={onClick} className="csq-flecha">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path
          d={
            atras
              ? 'M9.6 2.6 5.1 7.1h9.1v1.8H5.1l4.5 4.5-1.2 1.2-6-6L1.8 8l.6-.6 6-6 1.2 1.2Z'
              : 'M6.4 2.6l4.5 4.5H1.8v1.8h9.1l-4.5 4.5 1.2 1.2 6-6 .6-.6-.6-.6-6-6-1.2 1.2Z'
          }
        />
      </svg>
    </button>
  )
}
