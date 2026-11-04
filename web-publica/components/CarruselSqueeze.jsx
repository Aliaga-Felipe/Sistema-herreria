import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { precioPublico } from '../api.js'

// ---------------------------------------------------------------------
// CARRUSEL "SQUEEZE" DE PRODUCTOS DESTACADOS
//
// Adaptación del componente de referencia "carousel-squeeze" (una tira de
// paneles donde uno queda abierto y el resto se comprime en "listones" a
// la derecha) a los productos reales de este catálogo. El panel abierto
// es siempre el de la izquierda (col 0): es el producto que se nombra
// debajo, en ".csq-info", y siempre es el más ancho de la fila (ver
// REPARTO_BASE). En un contenedor angosto (celular) pasa a mostrar un
// solo producto a casi todo el ancho, con el siguiente asomando, se puede
// deslizar con el dedo y suma puntos indicadores debajo. A diferencia de
// la referencia, no tiene datos de ejemplo, ni Tailwind/shadcn/TypeScript
// (este proyecto no los usa), ni la tipografía o los colores de la demo. Los estilos viven en
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

// REPARTO DEL ESPACIO SOBRANTE (solo en computadora)
//
// El panel abierto (col 0, el de la izquierda: es el que se nombra en
// ".csq-info" debajo) mide "--csq-hero" (el alto del carrusel × la
// relación de la imagen) más su parte del espacio sobrante
// "--csq-espacio"; las columnas secundarias (col 1 a 3) miden solo su
// parte de ese espacio, y los listones, un ancho fijo.
//
// - REPARTO_BASE: sin el mouse encima. La col 0 se lleva la mayor parte
//   y las secundarias van en orden decreciente, así que el panel abierto
//   es siempre el más ancho (además de --csq-hero, que solo tiene él).
// - REPARTO_COMPRIMIDO: con el mouse sobre otro panel, todas las
//   columnas ceden un 12 % de su parte (base × 0,88)...
// - REPARTO_HOVER: ...y la que está bajo el mouse suma ese 12 % entero
//   (comprimido + 0,12). Así la fila sigue sumando 1 y la columna bajo
//   el mouse crece (efecto "squeeze"), pero nunca alcanza a la col 0:
//   incluso sin contar --csq-hero, 0,396 (col 0 comprimida) supera a
//   0,384 (col 1 con hover), y con menos columnas la diferencia es mayor.
//
// Con 1, 2 o 3 productos se recortan a la cantidad real de columnas y se
// reescalan (ver construirReparto) para que el reparto base y el de
// cualquier hover sigan sumando 1.
const REPARTO_BASE = [0.45, 0.3, 0.15, 0.1]
const REPARTO_COMPRIMIDO = [0.396, 0.264, 0.132, 0.088]
const REPARTO_HOVER = [0.516, 0.384, 0.252, 0.208]

function construirReparto(columnas) {
  const sumar = lista => lista.reduce((a, b) => a + b, 0)
  const base = REPARTO_BASE.slice(0, columnas)
  const comprimido = REPARTO_COMPRIMIDO.slice(0, columnas)
  // Lo que suma la columna bajo el mouse respecto de su valor comprimido
  // (el mismo para todas las columnas: 0,12).
  const extra = REPARTO_HOVER[0] - REPARTO_COMPRIMIDO[0]
  const sumaBase = sumar(base) || 1
  // Las comprimidas se reescalan a (1 − extra) para que, al sumarle el
  // extra a la que está bajo el mouse, la fila siga sumando exactamente 1.
  // (Con una sola columna no hay hover: ver "hoverActivo".)
  const escalaComprimido = (1 - extra) / (sumar(comprimido) || 1)
  const comprimidoFinal = comprimido.map(v => v * escalaComprimido)
  return {
    base: base.map(v => v / sumaBase),
    comprimido: comprimidoFinal,
    hover: comprimidoFinal.map(v => v + extra),
  }
}

// Ancho del contenedor (no de la ventana) por debajo del cual el carrusel
// pasa al modo celular: un producto a casi todo el ancho, el siguiente
// asomando, sin listones ni columnas comprimidas.
const ANCHO_MOVIL = 640
// Parte del ancho que ocupa el producto abierto en el modo celular.
const FRACCION_MOVIL = 0.85
// Separación entre paneles en el modo celular (más chica que la de
// computadora para que el siguiente asome lo suficiente).
const SEPARACION_MOVIL = 12
// Distancia mínima (px) de un deslizamiento para pasar de producto.
const UMBRAL_DESLIZAR = 50
// Movimiento a partir del cual un toque deja de contar como "tocar" y
// pasa a ser un arrastre (evita cambiar de producto con un toque torcido).
const HOLGURA_ARRASTRE = 8

// Mide el ancho del propio carrusel con ResizeObserver: el modo celular
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
  const raiz = useRef(null)
  const anchoContenedor = useAnchoContenedor(raiz, total > 0)
  const movil = anchoContenedor !== null && anchoContenedor < ANCHO_MOVIL
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
  // Desplazamiento (px) que sigue al dedo mientras se desliza en celular.
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

  // Deslizar con el dedo (o con el mouse) en el modo celular: eventos de
  // puntero sobre ".csq-tira". La tira sigue al dedo y, al soltar, un
  // recorrido horizontal de más de UMBRAL_DESLIZAR px pasa al producto
  // siguiente o al anterior; si no, vuelve a su lugar. "touch-action:
  // pan-y" (en public.css) deja que el navegador siga manejando el
  // scroll vertical de la página: si el gesto es vertical, el navegador
  // lo toma y cancela el puntero (pointercancel), sin mover la tira.
  const alBajarPuntero = event => {
    if (!movil || total < 2 || (event.pointerType === 'mouse' && event.button !== 0)) return
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

  // Ir directo a un producto (puntos indicadores del modo celular).
  const irA = indice => avanzar(indice - abierto)

  if (!total) return null

  const slat = numero(anchoSlat)
  // Sin ningún panel bajo el puntero (o en pantallas táctiles, en el modo
  // celular o con reducir movimiento, donde directamente no se activa),
  // todas las columnas usan el reparto base. Con un panel bajo el puntero,
  // ese toma el reparto "hover" y el resto pasa al "comprimido"; aun así
  // la col 0 sigue siendo la más ancha (ver REPARTO_BASE).
  const hoverActivo = !movil && crecerConHover && puedeHover && !reducido && columnasGrandes > 1 && hover >= 0 && hover < columnasGrandes

  const shareDe = col => {
    if (!hoverActivo) return reparto.base[col]
    return hover === col ? reparto.hover[col] : reparto.comprimido[col]
  }

  const anchoDe = col => {
    // En celular todos los paneles miden lo mismo (el abierto a casi todo
    // el ancho): el siguiente asoma a la derecha y el resto queda fuera de
    // la vista, sin listones ni columnas comprimidas.
    if (movil) return 'var(--csq-panel-movil)'
    if (col < 0 || col >= columnasGrandes) return slat
    if (col === 0) return `calc(var(--csq-hero) + var(--csq-espacio) * ${shareDe(col)})`
    return `calc(var(--csq-espacio) * ${shareDe(col)})`
  }

  // En celular el alto sale del ancho del panel (FRACCION_MOVIL del
  // contenedor, o todo el ancho si hay un solo producto) para que siga
  // siendo cuadrado; en computadora se usa "altura".
  const variablesMovil = movil
    ? {
        '--csq-panel-movil': total > 1 ? `${FRACCION_MOVIL * 100}cqi` : '100cqi',
        '--csq-alto': 'calc(var(--csq-panel-movil) / var(--csq-relacion))',
      }
    : {}

  const variables = {
    '--csq-alto': numero(altura),
    '--csq-gap': numero(movil ? Math.min(separacion, SEPARACION_MOVIL) : separacion),
    '--csq-slat-gap': numero(separacionSlats),
    '--csq-radio': numero(radio),
    '--csq-ms': `${ms}ms`,
    '--csq-ease': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--csq-relacion': relacionImagen,
    '--csq-hero': 'calc(var(--csq-alto) * var(--csq-relacion))',
    '--csq-espacio': `calc(100cqi - var(--csq-hero) - ${listones} * var(--csq-slat-gap) - ${Math.max(columnasGrandes - 1, 0)} * var(--csq-gap) - ${listones} * ${slat})`,
    ...variablesMovil,
  }

  // Cada paso de la tira corre un panel: en computadora el que sale se
  // achica a listón (de ahí el ancho del listón); en celular, el panel
  // entero. En celular se suma lo que lleva arrastrado el dedo.
  const paso = movil ? 'var(--csq-panel-movil)' : slat
  const mover = `translateX(calc(${desplazado} * (${paso} + var(--csq-gap)) + ${arrastre}px))`
  const transicionTira = quieto || gesto.current?.arrastrando ? 'none' : `transform var(--csq-ms) var(--csq-ease)`

  return (
    <div
      ref={raiz}
      className={clases('csq', movil && 'csq-movil', className)}
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
                  margenIzquierdo={lugar === 0 ? 0 : movil || col < columnasGrandes ? 'var(--csq-gap)' : 'var(--csq-slat-gap)'}
                  quieto={quieto}
                />
              )
            })
          })()}
        </div>
      </div>

      {movil && total > 1 && (
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
