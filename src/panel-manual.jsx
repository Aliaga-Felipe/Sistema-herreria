import React, { useMemo, useState } from 'react'
import './manual.css'
import { Heading } from './ui.jsx'
import { useSession } from './api.js'
import { MANUAL_VERSION, capitulosPara, manual } from './manual-contenido.js'

// Convierte **negrita** en <strong>. Es lo único de "formato" que admite el
// contenido del manual, así que no hace falta ninguna librería.
function Texto({ x }) {
  return String(x).split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith('**') && parte.endsWith('**') ? <strong key={i}>{parte.slice(2, -2)}</strong> : <React.Fragment key={i}>{parte}</React.Fragment>)
}

// Texto plano de un bloque, para el buscador.
const textoPlano = bloque =>
  [bloque.x, bloque.pie, ...(bloque.cab || []), ...(bloque.filas || []).flat()].flat().filter(Boolean).join(' ').replace(/\*\*/g, '')

// Capturas de pantalla del manual (src/manual-capturas/): Vite las empaqueta
// y devuelve la URL final de cada una.
const capturas = import.meta.glob('./manual-capturas/*.png', { eager: true, query: '?url', import: 'default' })
const urlCaptura = src => capturas[`./manual-capturas/${src}`]

const normalizar = texto => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Bloque({ bloque }) {
  switch (bloque.t) {
    case 'p': return <p><Texto x={bloque.x} /></p>
    case 'h': return <h3>{bloque.x}</h3>
    case 'ul': return <ul>{bloque.x.map((item, i) => <li key={i}><Texto x={item} /></li>)}</ul>
    case 'ol': return <ol>{bloque.x.map((item, i) => <li key={i}><Texto x={item} /></li>)}</ol>
    case 'nota': return <aside className="manual-nota"><b>Consejo</b><Texto x={bloque.x} /></aside>
    case 'aviso': return <aside className="manual-aviso"><b>Importante</b><Texto x={bloque.x} /></aside>
    case 'tabla':
      return (
        <div className="manual-tabla-caja">
          <table className="manual-tabla">
            <thead><tr>{bloque.cab.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{bloque.filas.map((fila, i) => <tr key={i}>{fila.map((celda, j) => <td key={j}><Texto x={celda} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    case 'img':
      return (
        <figure className="manual-captura">
          <img src={urlCaptura(bloque.src)} alt={bloque.pie} loading="lazy" />
          <figcaption>{bloque.pie}</figcaption>
        </figure>
      )
    default: return null
  }
}

export default function PanelManual() {
  const { session } = useSession()
  const rol = session.usuario.rol
  const todos = useMemo(() => capitulosPara(rol), [rol])
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [descargando, setDescargando] = useState(false)

  const termino = normalizar(busqueda.trim())
  const capitulos = termino
    ? todos.filter(c => normalizar(c.titulo + ' ' + c.bloques.map(textoPlano).join(' ')).includes(termino))
    : todos

  const descargarPdf = async () => {
    setDescargando(true); setError('')
    try {
      const respuesta = await fetch('/api/manual/pdf', { headers: { Authorization: `Bearer ${session.token}` } })
      if (!respuesta.ok) throw new Error('No se pudo descargar el PDF. Probá de nuevo en unos minutos.')
      const url = URL.createObjectURL(await respuesta.blob())
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = 'Manual-de-usuario-Un-atelier.pdf'
      document.body.appendChild(enlace)
      enlace.click()
      enlace.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) { setError(err.message) } finally { setDescargando(false) }
  }

  const irA = id => document.getElementById(`manual-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="manual">
      <Heading kicker="Ayuda" title="Manual de usuario" text={`Guía paso a paso de ${manual.marca}. Versión ${MANUAL_VERSION}.`}>
        <button className="primary" type="button" onClick={descargarPdf} disabled={descargando}>
          {descargando ? 'Descargando...' : '⬇ Descargar PDF'}
        </button>
      </Heading>
      {error && <p className="form-error">{error}</p>}

      <div className="manual-buscador">
        <input
          type="search"
          value={busqueda}
          onChange={event => setBusqueda(event.target.value)}
          placeholder="Buscar en el manual (por ejemplo: vendido, contraseña, pedido)"
          aria-label="Buscar en el manual"
        />
        {termino && <small>{capitulos.length === 1 ? '1 capítulo' : `${capitulos.length} capítulos`}</small>}
      </div>

      <div className="manual-cuerpo">
        <nav className="manual-indice" aria-label="Índice del manual">
          <b>Índice</b>
          <ol>
            {capitulos.map(c => (
              <li key={c.id}><button type="button" onClick={() => irA(c.id)}>{c.titulo}</button></li>
            ))}
          </ol>
        </nav>

        <div className="manual-contenido">
          {capitulos.length === 0 && <p className="muted">No encontramos nada con “{busqueda}”. Probá con otra palabra.</p>}
          {capitulos.map(c => (
            <article key={c.id} id={`manual-${c.id}`} className="manual-capitulo">
              <h2>{c.titulo}</h2>
              {c.bloques.map((bloque, i) => <Bloque key={i} bloque={bloque} />)}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
