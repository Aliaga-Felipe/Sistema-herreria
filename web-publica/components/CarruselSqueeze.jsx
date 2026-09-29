import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { precioPublico } from '../api.js'

// ---------------------------------------------------------------------
// CARRUSEL "SQUEEZE" DE PRODUCTOS DESTACADOS
//
// Adaptación del componente de referencia "carousel-squeeze" (una tira de
// paneles donde uno queda abierto y el resto se comprime en "listones" a
// la derecha) a los productos reales de este catálogo: sin datos de
// ejemplo, sin Tailwind/shadcn/TypeScript (este proyecto no los usa) y sin
// la tipografía ni los colores de la demo original. Los estilos viven en
// public.css (clases "csq-*") y usan la misma paleta y variables que el
// resto de la web pública.
//
// Recibe los productos ya cargados por quien lo use (misma fuente que el
// resto de "Productos destacados": no arma ni duplica ninguna lista
// propia), y reutiliza los mismos datos, enlaces y formato de precio que
// ya usan ProductCard/Catalogo en el resto del sitio.
// ---------------------------------------------------------------------

const numero = valor => (typeof valor === 'number' ? `${valor}px` : valor)
const acotar = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor))
const clases = (...partes) => partes.filter(Boolean).join(' ')

// Reparto "base" (columna abierta primero, luego las secundarias en orden
// decreciente) pensado para 4 columnas grandes. Con menos productos se
// recorta a la cantidad real y se reescala para que el reparto base siga
// sumando 1: con 4 productos o más el resultado es idéntico al original;
// con 1, 2 o 3 el carrusel sigue funcionando, solo que sin "listones".
const REPARTO_BASE = [-0.06, 0.61, 0.3, 0.15]
const REPARTO_HOVER = [0, 0.71, 0.4, 0.25]
const REPARTO_COMPRIMIDO = [-0.12, 0.59, 0.28, 0.13]

function construirReparto(columnas) {
  const base = REPARTO_BASE.slice(0, columnas)
  const hover = REPARTO_HOVER.slice(0, columnas)
  const comprimido = REPARTO_COMPRIMIDO.slice(0, columnas)
  const suma = base.reduce((a, b) => a + b, 0) || 1
  const escala = 1 / suma
  return { base: base.map(v => v * escala), hover: hover.map(v => v * escala), comprimido: comprimido.map(v => v * escala) }
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

// En mobile/tablet no hay hover real: el efecto "crece bajo el mouse" no
// debe activarse ahí (evita que quede un panel agrandado sin motivo tras
// un toque). La navegación sigue siendo 100% funcional por toque/click.
function usePuedeHover() {
  const [puede, setPuede] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const consulta = window.matchMedia('(hover: hover) and (pointer: fine)')
    setPuede(consulta.matches)
    const cambiar = event => setPuede(event.matches)
    consulta.addEventListener('change', cambiar)
    return () => consulta.removeEventListener('change', cambiar)
  }, [])
  return puede
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
  altura = 'clamp(220px, 40cqi, 380px)',
  // Los productos de este catálogo se muestran en cuadrado (misma
  // proporción que la grilla animada previa y que las fotos del panel de
  // producto), así que el panel abierto usa esa misma relación en vez del
  // 16:9 del componente de referencia.
  relacionImagen = 1,
  anchoSlat = 8,
  separacionSlats = 8,
  separacion = 16,
  radio = 4,
  duracion = 900,
  crecerConHover = true,
  autoplay = false,
  intervalo = 6000,
  controles = true,
  etiqueta = 'Productos destacados',
  className,
  style,
}) {
  const total = productos.length
  const envolver = i => ((i % total) + total) % total

  // Cuatro columnas grandes como máximo (la abierta + hasta 3
  // comprimidas); con menos productos, todas entran como columnas
  // grandes y no hay listones.
  const columnasGrandes = Math.min(4, total)
  const listones = total > columnasGrandes ? acotar(total - columnasGrandes, 1, 3) : 0
  const visibles = columnasGrandes + listones

  const reparto = useMemo(() => construirReparto(columnasGrandes), [columnasGrandes])
  const puedeHover = usePuedeHover()
  const reducido = usePrefiereMenosMovimiento()
  const ms = reducido ? 0 : duracion

  // Controles e info debajo de la fila: aparecen con un simple fade (igual
  // que el subtítulo/CTA de arriba) sobre la segunda mitad del mismo
  // progreso de entrada que usan los paneles, para que no salten a la
  // vista antes de que la fila termine de armarse.
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
  const [hover, setHover] = useState(-1)
  const [pausado, setPausado] = useState(false)
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
      } else {
        setTarjetas(tira => [
          ...Array.from({ length: -by }, (_, k) => ({ key: semilla.current++, indice: envolver(tira[0].indice - (-by - k)) })),
          ...tira,
        ])
        setDesplazado(s => s + by)
        setQuieto(true)
        temporizadores.current.push(window.setTimeout(() => setDesplazado(0), 0))
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

  if (!total) return null

  const slat = numero(anchoSlat)
  // Sin ningún panel bajo el puntero (o en mobile/reducir-movimiento, donde
  // directamente no se activa), todas las columnas usan el reparto base.
  // Con un panel bajo el puntero, ese toma el reparto "hover" y el resto
  // pasa al reparto "comprimido".
  const hoverActivo = crecerConHover && puedeHover && !reducido && columnasGrandes > 1 && hover >= 0 && hover < columnasGrandes

  const shareDe = col => {
    if (!hoverActivo) return reparto.base[col]
    return hover === col ? reparto.hover[col] : reparto.comprimido[col]
  }

  const anchoDe = col => {
    if (col < 0 || col >= columnasGrandes) return slat
    if (col === 0) return `calc(var(--csq-hero) + var(--csq-espacio) * ${shareDe(col)})`
    return `calc(var(--csq-espacio) * ${shareDe(col)})`
  }

  const variables = {
    '--csq-alto': numero(altura),
    '--csq-gap': numero(separacion),
    '--csq-slat-gap': numero(separacionSlats),
    '--csq-radio': numero(radio),
    '--csq-ms': `${ms}ms`,
    '--csq-ease': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--csq-relacion': relacionImagen,
    '--csq-hero': 'calc(var(--csq-alto) * var(--csq-relacion))',
    '--csq-espacio': `calc(100cqi - var(--csq-hero) - ${listones} * var(--csq-slat-gap) - ${Math.max(columnasGrandes - 1, 0)} * var(--csq-gap) - ${listones} * ${slat})`,
  }

  const mover = `translateX(calc(${desplazado} * (${slat} + var(--csq-gap))))`

  return (
    <div
      className={clases('csq', className)}
      style={{ containerType: 'inline-size', ...variables, ...style }}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => { setPausado(false); setHover(-1) }}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={() => setPausado(false)}
    >
      {controles && total > 1 && (
        <motion.div className="csq-controles" style={{ opacity: reducido ? 1 : opacidadAuxiliar }}>
          <FlechaSqueeze atras etiqueta="Producto anterior" onClick={() => avanzar(-1)} />
          <FlechaSqueeze etiqueta="Producto siguiente" onClick={() => avanzar(1)} />
        </motion.div>
      )}

      <div className="csq-ventana" style={{ height: 'var(--csq-alto)' }}>
        <div
          role="tablist"
          aria-label={etiqueta}
          aria-orientation="horizontal"
          onKeyDown={alPresionarTecla}
          className="csq-tira"
          style={{ transform: mover, transition: quieto ? 'none' : `transform var(--csq-ms) var(--csq-ease)` }}
        >
          {(() => {
            // Centro de la fila visible (igual que "centroLetras" del
            // título): cada panel entra desde el costado que le toca según
            // cuán lejos está de este centro.
            const centroTarjetas = (tarjetas.length - 1) / 2

            return tarjetas.map((tarjeta, lugar) => {
              const col = lugar + columna
              const producto = productos[tarjeta.indice]
              const esAbierto = col === 0

              return (
                <PanelSqueeze
                  key={tarjeta.key}
                  ids={ids}
                  tarjetaKey={tarjeta.key}
                  producto={producto}
                  esAbierto={esAbierto}
                  distancia={lugar - centroTarjetas}
                  progresoEntrada={fuenteEntrada}
                  reducido={reducido}
                  onMouseMove={() => crecerConHover && setHover(col)}
                  onClick={() => col > 0 && avanzar(col)}
                  ancho={anchoDe(col)}
                  margenIzquierdo={lugar === 0 ? 0 : col < columnasGrandes ? 'var(--csq-gap)' : 'var(--csq-slat-gap)'}
                  quieto={quieto}
                />
              )
            })
          })()}
        </div>
      </div>

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
  )
}

/* -------------------------------------------------------------------- */
/*                                 piezas                                */
/* -------------------------------------------------------------------- */

// Un panel de la fila. La mecánica de "squeeze" (ancho, margen, radio,
// transición) es la misma que antes; lo único que suma este componente es
// la entrada por scroll: mientras "progresoEntrada" va de 0 a 1, el panel
// se desplaza desde el costado que le toca (según "distancia", su lugar
// en la fila respecto del centro) hasta su posición final, con la misma
// curva de opacidad que usa cada letra del título ([0, 0.85, 1] → [0,
// 0.4, 1]). Al no recibir "progresoEntrada" (o no haber más de un panel
// en pantalla) el panel aparece directo, sin animación de entrada.
function PanelSqueeze({
  ids, tarjetaKey, producto, esAbierto, distancia, progresoEntrada, reducido,
  onMouseMove, onClick, ancho, margenIzquierdo, quieto,
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
      aria-label={producto.nombre}
      tabIndex={esAbierto ? 0 : -1}
      onMouseMove={onMouseMove}
      onClick={onClick}
      className="csq-panel"
      style={{
        x,
        opacity: opacidad,
        width: ancho,
        marginLeft: margenIzquierdo,
        borderRadius: `min(var(--csq-radio), calc(${ancho} / 2))`,
        transitionProperty: 'width, margin-left',
        transitionDuration: quieto ? '0s' : 'var(--csq-ms)',
        transitionTimingFunction: 'var(--csq-ease)',
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

// La imagen se dibuja siempre al tamaño fijo del panel abierto (--csq-hero)
// y centrada: así nunca se reescala ni se resamplea a mitad de la
// transición, el panel solo tapa más o menos de ella según su ancho.
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

function FlechaSqueeze({ atras = false, etiqueta, onClick }) {
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
