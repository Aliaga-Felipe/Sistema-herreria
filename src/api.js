import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const API = '/api'
export const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)

export async function request(path, options = {}, token) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.')
  return data
}

// Atajos para no repetir el método y el body en cada pantalla.
export const api = {
  get: (path, token) => request(path, {}, token),
  post: (path, body, token) => request(path, { method: 'POST', body: JSON.stringify(body) }, token),
  put: (path, body, token) => request(path, { method: 'PUT', body: JSON.stringify(body) }, token),
  patch: (path, body, token) => request(path, { method: 'PATCH', body: JSON.stringify(body) }, token),
  del: (path, token) => request(path, { method: 'DELETE' }, token),
  // Subida de archivos (multipart/form-data): no fija Content-Type para
  // que el navegador agregue el boundary automáticamente.
  async subir(path, formData, token) {
    const response = await fetch(`${API}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No se pudo subir el archivo.')
    return data
  }
}

// Carga un recurso del backend y expone recarga manual. `vacio` define la
// forma inicial (lista para colecciones, objeto para resúmenes).
export function useData(path, vacio = []) {
  const { session, close } = useSession()
  const token = session?.token
  const [data, setData] = useState(vacio)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!path || !token) return
    setLoading(true)
    try { setData(await request(path, {}, token)); setError('') }
    catch (err) { setError(err.message); if (err.message.includes('Sesión')) close() }
    finally { setLoading(false) }
  }, [path, token])

  useEffect(() => { load() }, [load])
  return { data, loading, error, load, setData, token }
}

// ---------------------------------------------------------------------
// FORMATO
// ---------------------------------------------------------------------
export const iniciales = nombre =>
  (nombre || '?').split(' ').filter(Boolean).map(parte => parte[0]).slice(0, 2).join('').toUpperCase()

export const dinero = (valor, moneda = 'ARS') =>
  `${moneda === 'ARS' ? '$' : `${moneda} `}${Number(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

export const duracion = minutos => {
  const total = Math.round(Number(minutos) || 0)
  if (!total) return '—'
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h ${total % 60 ? `${total % 60} min` : ''}`.trim()
}

export const fecha = valor => (valor ? new Date(valor).toLocaleDateString('es-AR') : '—')

export const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0)

export const etiquetaEstado = estado => String(estado || '').replace(/_/g, ' ').toLowerCase()

// Prioridad del pedido: 0 Normal, 1 Alta, 2 Urgente (mismos valores que usa
// el formulario de alta en panel-pedidos.jsx).
export const etiquetaPrioridad = prioridad => {
  const nivel = Number(prioridad) || 0
  return nivel >= 2 ? 'Urgente' : nivel === 1 ? 'Alta' : 'Normal'
}
