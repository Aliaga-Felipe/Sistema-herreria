// Cliente HTTP de la web pública: sólo habla con /api/publico, que no
// exige sesión. Nada de tokens ni credenciales acá.
const BASE = '/api/publico'

async function get(path) {
  const response = await fetch(`${BASE}${path}`)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar la información.')
  return data
}

export const publicApi = {
  productos: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    const texto = query.toString()
    return get(`/productos${texto ? `?${texto}` : ''}`)
  },
  producto: slug => get(`/productos/${encodeURIComponent(slug)}`),
  categorias: () => get('/categorias'),
  configuracion: () => get('/configuracion')
}

// ---------------------------------------------------------------------
// Ayudas compartidas por las páginas públicas.
// ---------------------------------------------------------------------
export const dinero = (valor, moneda = 'ARS') =>
  `${moneda === 'ARS' ? '$' : `${moneda} `}${Number(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

export const urlWhatsapp = (numero, mensaje) =>
  `https://wa.me/${String(numero || '').replace(/[^0-9]/g, '')}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`

// Actualiza <title> y meta description/OG de forma básica para cada
// página (la app es un SPA sin server-side rendering, así que esto ayuda
// a la pestaña del navegador y a la vista previa al compartir un link,
// pero no reemplaza un prerender real para buscadores).
export function useMeta(titulo, descripcion, subtituloSitio) {
  if (typeof document === 'undefined') return
  document.title = titulo ? `${titulo} · El Atelier` : `El Atelier — ${subtituloSitio || 'Herrería de diseño'}`

  const establecer = (atributo, nombre, valor) => {
    if (!valor) return
    let etiqueta = document.head.querySelector(`meta[${atributo}="${nombre}"]`)
    if (!etiqueta) {
      etiqueta = document.createElement('meta')
      etiqueta.setAttribute(atributo, nombre)
      document.head.appendChild(etiqueta)
    }
    etiqueta.setAttribute('content', valor)
  }

  if (descripcion) {
    establecer('name', 'description', descripcion)
    establecer('property', 'og:description', descripcion)
  }
  establecer('property', 'og:title', document.title)
}
