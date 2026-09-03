import React, { useState } from 'react'
import { etiquetaEstado } from './api.js'

export const Stat = ({ label, value, hint, tone = '' }) => (
  <article className={`stat-card ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {hint && <small>{hint}</small>}
  </article>
)

export const Progress = ({ value }) => (
  <div className="progress"><i style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} /></div>
)

export const Heading = ({ kicker, title, text, children }) => (
  <section className="headline">
    <div>
      <p className="eyebrow">{kicker}</p>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
    </div>
    {children}
  </section>
)

export const Empty = ({ title, text, action, label = 'Crear' }) => (
  <section className="empty">
    <span>◇</span>
    <h3>{title}</h3>
    <p>{text}</p>
    {action && <button className="primary" onClick={action}>{label}</button>}
  </section>
)

export const Badge = ({ estado }) => (
  <span className={`task-status ${String(estado || '').toLowerCase()}`}>{etiquetaEstado(estado)}</span>
)

// Semáforo de rendimiento: verde más rápido, amarillo en promedio, rojo más lento.
export const semaforos = {
  VERDE: { icono: '🟢', texto: 'Más rápido de lo esperado' },
  AMARILLO: { icono: '🟡', texto: 'Dentro del promedio' },
  ROJO: { icono: '🔴', texto: 'Más lento de lo esperado' }
}

export const Semaforo = ({ valor, compacto = false }) => {
  if (!valor) return <span className="semaforo vacio" title="Sin tiempo informado">⚪{compacto ? '' : ' Sin medir'}</span>
  const dato = semaforos[valor] || semaforos.AMARILLO
  return (
    <span className={`semaforo ${valor.toLowerCase()}`} title={dato.texto}>
      {dato.icono}{compacto ? '' : ` ${valor.toLowerCase()}`}
    </span>
  )
}

export function Modal({ title, subtitle, close, children, ancho, icono }) {
  return (
    <div className="modal-back" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section className="modal" style={ancho ? { width: `min(${ancho}, 100%)` } : undefined}>
        <button className="close" onClick={close} type="button">×</button>
        <p className="eyebrow">El Atelier</p>
        <h2>{icono && <span className="modal-icon">{icono}</span>}{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </section>
    </div>
  )
}

export const Actions = ({ close, label, busy }) => (
  <div className="form-actions">
    <button type="button" className="secondary" onClick={close}>Cancelar</button>
    <button className="primary" disabled={busy}>{busy ? 'Guardando...' : label}</button>
  </div>
)

// Aviso efímero reutilizado por todos los paneles.
export function useAviso() {
  const [aviso, setAviso] = useState(null)
  const mostrar = (texto, tipo = 'ok') => {
    setAviso({ texto, tipo })
    window.setTimeout(() => setAviso(null), 3200)
  }
  const nodo = aviso && <p className={aviso.tipo === 'error' ? 'form-error' : 'notice'}>{aviso.texto}</p>
  return { mostrar, nodo }
}

// Fila de accesos directos del panel principal.
export const QuickActions = ({ acciones }) => (
  <section className="quick-actions">
    {acciones.map(accion => (
      <button key={accion.label} type="button" onClick={accion.onClick} className={accion.destacada ? 'quick destacada' : 'quick'}>
        <span>{accion.icono}</span>
        <b>{accion.label}</b>
        <small>{accion.texto}</small>
      </button>
    ))}
  </section>
)
