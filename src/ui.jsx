import React, { useRef, useState } from 'react'
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

// Marca de la producción diaria (abierta) en la que está propuesta una
// etapa: "Hoy" o la fecha. Sin producción no muestra nada.
export const EtiquetaJornada = ({ fecha, hoy }) => {
  if (!fecha) return null
  const texto = fecha === hoy ? 'Producción de hoy' : `Producción ${String(fecha).slice(0, 10).split('-').reverse().slice(0, 2).join('/')}`
  return <span className={`jornada-tag${fecha === hoy ? ' hoy' : ''}`} title="Propuesta en la producción diaria">{texto}</span>
}

// ---------------------------------------------------------------------
// EMPLEADOS DE UNA ETAPA
// Una etapa de pedido puede necesitar varios empleados
// (empleados_necesarios) y se asigna a todos ellos (empleados: [{ id,
// nombre }]). Las copias de días terminados antes de este cambio solo
// traen "responsable" (un nombre).
// ---------------------------------------------------------------------
export const MAX_EMPLEADOS_ETAPA = 10

export const empleadosDe = etapa => (Array.isArray(etapa.empleados)
  ? etapa.empleados
  : etapa.responsable ? [{ id: etapa.responsable_id ?? etapa.asignado_a, nombre: etapa.responsable }] : [])

// Cuántos empleados le faltan asignar a una etapa pendiente (0 si está
// completa o ya tiene todos).
export const faltanEmpleados = etapa => (etapa.estado === 'COMPLETADA'
  ? 0
  : Math.max(0, (Number(etapa.empleados_necesarios) || 1) - empleadosDe(etapa).length))

// Nombres de los empleados de la etapa; en rojo si le falta alguno.
export function EmpleadosEtapa({ etapa, className = '', claseFalta, title }) {
  const asignados = empleadosDe(etapa)
  const faltan = faltanEmpleados(etapa)
  const necesarios = Number(etapa.empleados_necesarios) || 1
  const clase = faltan ? (claseFalta ?? `${className} negativo`) : className
  return (
    <span className={clase} title={[title, necesarios > 1 && `La etapa necesita ${necesarios} empleados`].filter(Boolean).join('. ') || undefined}>
      {asignados.length ? asignados.map(empleado => empleado.nombre).join(', ') : 'Sin asignar'}
      {asignados.length > 0 && faltan > 0 && ` · falta${faltan === 1 ? '' : 'n'} ${faltan}`}
    </span>
  )
}

// Editor de la asignación: cuántos empleados necesita la etapa y un
// selector por cada uno (un mismo empleado no se puede elegir dos veces).
// `valor` es { empleados_necesarios, empleados: [ids o ''] } y onCambiar
// recibe el nuevo valor (la lista siempre tiene un lugar por empleado).
// `conocidos` suma opciones que ya no están en `empleados` (por ejemplo,
// un empleado dado de baja que sigue asignado), para mostrar su nombre.
export function SelectorEmpleados({ valor, empleados, onCambiar, disabled = false, conocidos = [] }) {
  const cantidad = Number(valor.empleados_necesarios) || 1
  const elegidos = Array.from({ length: cantidad }, (_, indice) => (valor.empleados[indice] ?? '').toString())
  const opciones = [...empleados, ...conocidos.filter(otro => !empleados.some(empleado => String(empleado.id) === String(otro.id)))]
  const cambiarCantidad = nueva => onCambiar({
    empleados_necesarios: nueva,
    empleados: Array.from({ length: nueva }, (_, indice) => elegidos[indice] ?? '')
  })
  const cambiarEmpleado = (posicion, id) => onCambiar({ empleados_necesarios: cantidad, empleados: elegidos.map((actual, indice) => (indice === posicion ? id : actual)) })
  return (
    <div className="selector-empleados">
      <select value={cantidad} disabled={disabled} onChange={event => cambiarCantidad(Number(event.target.value))} title="Cuántos empleados necesita la etapa">
        {Array.from({ length: MAX_EMPLEADOS_ETAPA }, (_, indice) => indice + 1).map(numero => (
          <option key={numero} value={numero}>{numero === 1 ? '1 empleado' : `${numero} empleados`}</option>
        ))}
      </select>
      {elegidos.map((elegido, posicion) => (
        <select key={posicion} value={elegido} disabled={disabled} onChange={event => cambiarEmpleado(posicion, event.target.value)} title={`Empleado ${posicion + 1} de la etapa`}>
          <option value="">{cantidad > 1 ? `Empleado ${posicion + 1}…` : 'Empleado…'}</option>
          {opciones.map(empleado => (
            <option key={empleado.id} value={empleado.id} disabled={elegidos.some((otro, indice) => indice !== posicion && otro === String(empleado.id))}>
              {empleado.nombre}
            </option>
          ))}
        </select>
      ))}
    </div>
  )
}

export function Modal({ title, subtitle, close, children, ancho, icono }) {
  return (
    <div className="modal-back" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section className="modal" style={ancho ? { width: `min(${ancho}, 100%)` } : undefined}>
        <button className="close" onClick={close} type="button">×</button>
        <p className="eyebrow">Un atelier</p>
        <h2>{icono && <span className="modal-icon">{icono}</span>}{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </section>
    </div>
  )
}

// Campo numérico con separador de miles (formato es-AR) al perder el foco,
// sin tocar el valor real que se envía al backend: mientras el campo está
// enfocado se edita como <input type="number"> puro (para no romper el
// cursor ni la escritura), y sólo al perder el foco se muestra formateado
// (ej: 1800000 -> "1.800.000"). Reemplazo directo de
// <input type="number" value={x} onChange={e => setX(e.target.value)} />.
export function CampoNumero({ value, onChange, id, name, placeholder, min, max, step, required, disabled, className, ...resto }) {
  const [enFoco, setEnFoco] = useState(false)
  const formateado = (() => {
    if (value === '' || value === null || value === undefined) return ''
    const numero = Number(value)
    if (Number.isNaN(numero)) return String(value)
    return numero.toLocaleString('es-AR', { maximumFractionDigits: 2 })
  })()
  return (
    <input
      type={enFoco ? 'number' : 'text'}
      inputMode="decimal"
      id={id}
      name={name}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      required={required}
      disabled={disabled}
      className={className}
      {...resto}
      value={enFoco ? (value ?? '') : formateado}
      onFocus={() => setEnFoco(true)}
      onBlur={() => setEnFoco(false)}
      onChange={event => onChange(event.target.value)}
    />
  )
}

export const Actions = ({ close, label, busy }) => (
  <div className="form-actions">
    <button type="button" className="secondary" onClick={close}>Cancelar</button>
    <button className="primary" disabled={busy}>{busy ? 'Guardando...' : label}</button>
  </div>
)

// Aviso efímero reutilizado por todos los paneles. Los errores quedan más
// tiempo para que se alcancen a leer; un aviso nuevo reinicia el temporizador.
export function useAviso() {
  const [aviso, setAviso] = useState(null)
  const temporizador = useRef(null)
  const mostrar = (texto, tipo = 'ok') => {
    setAviso({ texto, tipo })
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setAviso(null), tipo === 'error' ? 8000 : 3200)
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
