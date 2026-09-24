import { pool } from './db.js'
import { leerConfiguracion } from './comun.js'

// -----------------------------------------------------------------------
// INTEGRACIÓN CON EL CATÁLOGO DE WHATSAPP BUSINESS (Meta Commerce Platform)
//
// Cada producto activo y "Publicado en la web" se sincroniza contra el
// catálogo de Meta conectado al WhatsApp Business del cliente, usando el
// endpoint oficial POST /{catalog_id}/products de la Graph API (hace upsert
// por retailer_id: crea el ítem si no existe, lo actualiza si ya existe).
// Ver INTEGRACION_WHATSAPP.md para la configuración completa (IDs, token,
// permisos) y las variables de entorno necesarias.
//
// Todas las credenciales viven en variables de entorno del SERVIDOR: nunca
// se envían al frontend ni se hardcodean. Si no están configuradas (o
// WHATSAPP_SYNC_ENABLED no está en "true"), la sincronización se omite sin
// romper el guardado local del producto: PostgreSQL y la web pública son
// siempre la fuente de verdad, WhatsApp es un espejo (ver sincronizarProducto).
// -----------------------------------------------------------------------

const RECORTE_TITULO = 200
const RECORTE_DESCRIPCION = 5000
const RECORTE_MARCA = 100
const TIEMPO_LIMITE_MS = 10000

const habilitada = () => String(process.env.WHATSAPP_SYNC_ENABLED || '').toLowerCase() === 'true'

const configuracionMeta = () => ({
  token: process.env.META_ACCESS_TOKEN || '',
  catalogoId: process.env.META_CATALOG_ID || '',
  version: process.env.META_GRAPH_API_VERSION || 'v23.0',
  // Dominio público (https) donde queda servida esta misma aplicación: hace
  // falta para armar URLs absolutas de imagen y de producto, porque Meta
  // las tiene que poder descargar/abrir desde afuera (ver
  // server/index.js: '/uploads' y la ruta pública '/productos/:slug').
  urlPublica: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '')
})

const faltantesConfiguracion = config => {
  const faltantes = []
  if (!config.token) faltantes.push('META_ACCESS_TOKEN')
  if (!config.catalogoId) faltantes.push('META_CATALOG_ID')
  if (!config.urlPublica) faltantes.push('PUBLIC_BASE_URL')
  return faltantes
}

// Identificador propio que se envía a Meta como "retailer_id". Estable y
// derivado del id interno: no depende de chapita_id ni id_pieza (ver
// migracion_013 para el porqué).
const generarRetailerId = productoId => `atelier-${productoId}`

const recortar = (texto, max) => (texto || '').toString().trim().slice(0, max)

async function cargarProductoParaSync(productoId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, p.descripcion, p.precio_venta::float8 AS precio_venta, p.activo, p.publicado, p.slug,
        p.whatsapp_retailer_id,
        (SELECT pi.url FROM producto_imagenes pi WHERE pi.producto_id = p.id ORDER BY pi.es_principal DESC, pi.orden LIMIT 1) AS imagen_principal
      FROM productos p WHERE p.id = $1`,
    [productoId]
  )
  return rows[0] || null
}

async function guardarEstado(productoId, { estado, error = null, retailerId = null, productoMetaId = null }) {
  await pool.query(
    `UPDATE productos SET whatsapp_sync_estado = $1::whatsapp_sync_estado, whatsapp_sync_error = $2,
        whatsapp_retailer_id = COALESCE($3, whatsapp_retailer_id),
        whatsapp_product_id = COALESCE($4, whatsapp_product_id),
        whatsapp_sync_actualizado_en = NOW()
      WHERE id = $5`,
    [estado, error, retailerId, productoMetaId, productoId]
  )
}

// Payload del ítem de catálogo. Tira un error legible (sin datos sensibles)
// si falta algo imprescindible para Meta: por ahora, la foto principal (la
// descripción, el precio, el nombre y la categoría ya son obligatorios para
// publicar en la web, ver validarPublicacion en rutas/productos.js).
function construirPayload(producto, retailerId, config, configuracionNegocio) {
  if (!producto.imagen_principal) throw new Error('El producto no tiene ninguna foto cargada: el catálogo de WhatsApp exige al menos una imagen.')
  const disponible = producto.activo && producto.publicado
  return {
    retailer_id: retailerId,
    name: recortar(producto.nombre, RECORTE_TITULO),
    description: recortar(producto.descripcion, RECORTE_DESCRIPCION),
    price: Math.round(Number(producto.precio_venta) * 100),
    currency: configuracionNegocio.moneda || 'ARS',
    image_url: `${config.urlPublica}${producto.imagen_principal}`,
    url: `${config.urlPublica}/productos/${producto.slug}`,
    // Meta recomienda "discontinued" en vez de borrar el ítem del catálogo
    // cuando un producto deja de estar disponible (conserva el historial
    // usado para recomendaciones). Ver INTEGRACION_WHATSAPP.md.
    availability: disponible ? 'in stock' : 'discontinued',
    condition: 'new',
    brand: recortar(configuracionNegocio.negocio_nombre || 'El Atelier', RECORTE_MARCA),
    allow_upsert: true
  }
}

async function llamarMeta(config, payload) {
  const respuesta = await fetch(`https://graph.facebook.com/${config.version}/${config.catalogoId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIEMPO_LIMITE_MS)
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok || datos.error) {
    const codigo = datos.error?.code ? ` (código ${datos.error.code})` : ''
    throw new Error(`${datos.error?.message || `Meta respondió con estado ${respuesta.status}`}${codigo}`)
  }
  return datos // { id: '<whatsapp_product_id>' }
}

// ---------------------------------------------------------------------
// Punto único de sincronización: lo usan tanto el guardado automático
// (crear/editar producto, alta/baja de fotos, activar/desactivar) como el
// botón "Reintentar sincronización" del panel. Nunca tira: si algo falla,
// deja whatsapp_sync_estado = 'ERROR' con el motivo (sin tokens) y devuelve
// ese resultado para que quien la llamó decida qué mostrar.
// ---------------------------------------------------------------------
export async function sincronizarProducto(productoId) {
  const producto = await cargarProductoParaSync(productoId)
  if (!producto) return { estado: 'NO_SINCRONIZADO', omitido: true, motivo: 'no_encontrado' }

  if (!habilitada()) return { estado: 'NO_SINCRONIZADO', omitido: true, motivo: 'deshabilitada' }

  const config = configuracionMeta()
  const faltantes = faltantesConfiguracion(config)
  if (faltantes.length) {
    const error = `Integración con WhatsApp no configurada: falta ${faltantes.join(', ')} en el servidor.`
    await guardarEstado(productoId, { estado: 'ERROR', error })
    return { estado: 'ERROR', error }
  }

  // Si el producto no está visible (borrador, desactivado) y nunca se
  // sincronizó, no hay nada que hacer en Meta todavía.
  const yaSincronizado = Boolean(producto.whatsapp_retailer_id)
  if (!(producto.activo && producto.publicado) && !yaSincronizado) {
    return { estado: 'NO_SINCRONIZADO', omitido: true, motivo: 'no_aplica' }
  }

  const retailerId = producto.whatsapp_retailer_id || generarRetailerId(producto.id)
  await guardarEstado(productoId, { estado: 'PENDIENTE', retailerId })

  try {
    const configuracionNegocio = await leerConfiguracion()
    const payload = construirPayload(producto, retailerId, config, configuracionNegocio)
    const respuesta = await llamarMeta(config, payload)
    await guardarEstado(productoId, { estado: 'SINCRONIZADO', retailerId, productoMetaId: respuesta.id })
    return { estado: 'SINCRONIZADO' }
  } catch (error) {
    const mensaje = error.name === 'TimeoutError' ? 'Meta no respondió a tiempo (tiempo de espera agotado).' : error.message
    await guardarEstado(productoId, { estado: 'ERROR', error: mensaje, retailerId })
    return { estado: 'ERROR', error: mensaje }
  }
}

// Dispara la sincronización sin bloquear la respuesta HTTP del guardado
// local: un error de Meta (token vencido, catálogo mal configurado, imagen
// no accesible, etc.) nunca debe impedir que el producto quede guardado en
// PostgreSQL ni en el catálogo de la web.
export function sincronizarEnSegundoPlano(productoId) {
  sincronizarProducto(productoId).catch(error => console.error(`[whatsapp] Error al sincronizar producto ${productoId}:`, error.message))
}
