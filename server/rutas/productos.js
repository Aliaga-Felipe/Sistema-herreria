import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { pool } from '../db.js'
import { SLUGS_CATEGORIAS_PRODUCTO, asyncRoute, auth, decimal, fallo, leerConfiguracion, slugify } from '../comun.js'
import { sincronizarEnSegundoPlano, sincronizarProducto } from '../meta-whatsapp.js'

const router = Router()

const consultaProductos = `SELECT p.id, p.nombre, p.descripcion, p.precio_venta::float8 AS precio_venta, p.activo, p.destacado, p.publicado, p.slug, p.creado_en,
    p.categoria_id, c.nombre AS categoria_nombre, c.slug AS categoria_slug, p.horas_hombre::float8 AS horas_hombre, p.chapita_id,
    p.medidas, p.costo_producto::float8 AS costo_producto, p.historia,
    p.whatsapp_sync_estado, p.whatsapp_sync_error, p.whatsapp_sync_actualizado_en,
    p.vendido_en, p.precio_vendido::float8 AS precio_vendido, p.costo_vendido::float8 AS costo_vendido,
    COALESCE((SELECT json_agg(jsonb_build_object('id', pi.id, 'url', pi.url, 'orden', pi.orden, 'es_principal', pi.es_principal) ORDER BY pi.orden)
      FROM producto_imagenes pi WHERE pi.producto_id = p.id), '[]') AS imagenes,
    COALESCE((SELECT json_agg(jsonb_build_object('id', pm.id, 'nombre', pm.nombre, 'precio_unitario', pm.precio_unitario::float8, 'cantidad', pm.cantidad::float8, 'orden', pm.orden) ORDER BY pm.orden)
      FROM producto_materiales pm WHERE pm.producto_id = p.id), '[]') AS materiales
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  WHERE NOT p.eliminado
  GROUP BY p.id, c.nombre, c.slug`

// Estados de un producto (ver "VENTAS DE PRODUCTOS" en schema.sql):
// - activo = TRUE  -> disponible: entra en la proyección de ventas.
// - activo = FALSE -> VENDIDO (se desactivó o se eliminó). vendido_en,
//   precio_vendido y costo_vendido los completa solo el trigger
//   productos_registrar_venta. Reactivarlo anula la venta.
// - eliminado      -> vendido y además oculto del panel (borrado lógico:
//   la fila se conserva para que la venta siga en las estadísticas).

// Agrega el desglose de costo calculado a cada fila: mano de obra (horas ×
// costo de la hora configurable) + costo del producto (número de
// referencia que carga el admin a mano, ver costo_producto) + costo de
// materiales (suma de precio_unitario × cantidad de las filas de
// producto_materiales, ver "materiales" en consultaProductos). El margen
// se calcula acá, en un solo lugar, contra ese costo total.
const conCostoCalculado = async filas => {
  const costoHora = Number((await leerConfiguracion()).costo_hora_mano_obra) || 0
  return filas.map(fila => {
    const costoManoObra = decimal((Number(fila.horas_hombre) || 0) * costoHora)
    const costoProducto = decimal(fila.costo_producto)
    const costoMateriales = decimal((fila.materiales || []).reduce((total, material) => total + (Number(material.precio_unitario) || 0) * (Number(material.cantidad) || 0), 0))
    const costoCalculadoTotal = decimal(costoManoObra + costoProducto + costoMateriales)
    return {
      ...fila,
      costo_hora_mano_obra: costoHora,
      costo_mano_obra: costoManoObra,
      costo_materiales: costoMateriales,
      costo_calculado_total: costoCalculadoTotal,
      margen: decimal(fila.precio_venta - costoCalculadoTotal)
    }
  })
}

// Los productos ya NO tienen tareas/etapas de fabricación: las tareas se
// definen en cada pedido (ver POST /pedidos en server/rutas/pedidos.js), así
// que dos pedidos del mismo producto pueden tener tareas distintas sin
// tocar el producto. La vieja tabla etapas_producto se conserva sólo como
// sugerencia de tareas para pedidos nuevos (GET /pedidos/tareas-sugeridas).

// Valida y normaliza los materiales utilizados por el producto: nombre
// libre obligatorio, precio unitario numérico ≥ 0 y cantidad numérica > 0.
// Los materiales son opcionales: un producto
// puede no tener ninguno cargado (se guarda con costo de materiales 0), y
// no hay límite de filas.
const normalizarMateriales = materiales => {
  if (materiales === undefined || materiales === null) return []
  if (!Array.isArray(materiales)) throw fallo('Los materiales del producto no tienen el formato esperado.')
  return materiales.map((material, indice) => {
    if (!material?.nombre?.toString().trim()) throw fallo('Cada material necesita un nombre.')
    const precioUnitario = decimal(material.precio_unitario)
    if (!(precioUnitario >= 0)) throw fallo('El precio unitario de cada material no puede ser negativo.')
    const cantidad = decimal(material.cantidad)
    if (!(cantidad > 0)) throw fallo('La cantidad de cada material debe ser mayor a cero.')
    return { nombre: material.nombre.toString().trim(), precio_unitario: precioUnitario, cantidad, orden: indice + 1 }
  })
}

const guardarMateriales = async (cliente, productoId, materiales) => {
  await cliente.query('DELETE FROM producto_materiales WHERE producto_id = $1', [productoId])
  for (const material of materiales) {
    await cliente.query('INSERT INTO producto_materiales (producto_id, nombre, precio_unitario, cantidad, orden) VALUES ($1, $2, $3, $4, $5)',
      [productoId, material.nombre, material.precio_unitario, material.cantidad, material.orden])
  }
}

// Recorta y limita medidas/historia (texto libre, opcionales) y valida el
// costo del producto (número ≥ 0, no obligatorio: por defecto 0).
const normalizarMedidas = medidas => {
  const valor = medidas?.toString().trim() || ''
  if (!valor) return null
  if (valor.length > 200) throw fallo('Las medidas no pueden superar los 200 caracteres.')
  return valor
}
const normalizarHistoria = historia => historia?.toString().trim() || null

// Genera un slug único a partir del nombre. Si ya existe (por ejemplo dos
// productos "Mesa ratona") agrega un sufijo numérico hasta que sea único.
const generarSlugUnico = async (cliente, nombre, idExcluir = null) => {
  const base = slugify(nombre) || 'producto'
  let slug = base
  let sufijo = 2
  while (true) {
    const { rows } = await cliente.query(
      idExcluir ? 'SELECT 1 FROM productos WHERE slug = $1 AND id <> $2' : 'SELECT 1 FROM productos WHERE slug = $1',
      idExcluir ? [slug, idExcluir] : [slug]
    )
    if (!rows[0]) return slug
    slug = `${base}-${sufijo}`
    sufijo += 1
  }
}

// Categoría OPCIONAL en borradores: vacía = producto sin categoría. Si
// viene, tiene que ser una de las tres categorías fijas (Mesas, Mesitas
// ratoneras, Fogoneros). Para publicar en la web es obligatoria (ver
// validarPublicacion).
const validarCategoria = async categoriaId => {
  if (categoriaId === null || categoriaId === undefined || categoriaId === '') return null
  const { rows } = await pool.query('SELECT id FROM categorias WHERE id = $1 AND slug = ANY($2::text[])', [categoriaId, SLUGS_CATEGORIAS_PRODUCTO])
  if (!rows[0]) throw fallo('La categoría seleccionada no existe. Elegí Mesas, Mesitas ratoneras o Fogoneros.')
  return categoriaId
}

// ID de producto (chapita): se genera solo al crear el producto, pero el
// admin lo puede editar. El valor guardado es el que muestra la chapita de
// la web pública. Mismo criterio que sugerirIdPieza en
// src/panel-productos.jsx: el menor número libre, con ceros a la izquierda
// (001, 002...). Se usa como respaldo si el ID llega vacío.
const generarChapitaId = async cliente => {
  const { rows } = await cliente.query(`SELECT chapita_id FROM productos WHERE chapita_id ~ '^[0-9]+$'`)
  const usados = new Set(rows.map(fila => parseInt(fila.chapita_id, 10)))
  let siguiente = 1
  while (usados.has(siguiente)) siguiente++
  return String(siguiente).padStart(3, '0')
}

const normalizarChapita = valor => {
  const chapita = valor?.toString().trim() || null
  if (chapita && chapita.length > 20) throw fallo('El ID de producto no puede superar los 20 caracteres.')
  return chapita
}

// Precio de venta: opcional en un borrador (vacío se guarda en 0), pero
// nunca negativo.
const normalizarPrecio = valor => {
  if (valor === undefined || valor === null || valor === '') return 0
  const precio = decimal(valor)
  if (precio < 0) throw fallo('El precio de venta no puede ser negativo.')
  return precio
}

// Reglas de guardado:
// - BORRADOR (sin "Publicar en la web"): sólo el nombre es obligatorio. El
//   precio, la descripción técnica, la historia, la categoría y el ID
//   pueden quedar vacíos (el ID se genera solo, ver generarChapitaId).
// - PUBLICADO: nombre, ID, precio (> 0), descripción técnica, historia y
//   categoría son obligatorios. Si falta alguno, no se guarda y el mensaje
//   dice exactamente qué falta. La base de datos aplica la misma regla
//   (restricción productos_publicado_completo, ver schema.sql), así que un
//   producto incompleto nunca puede quedar visible en la web pública.
const validarPublicacion = ({ nombre, chapitaId, precio, descripcion, historia, categoriaId }) => {
  const faltantes = []
  if (!nombre) faltantes.push('nombre')
  if (!chapitaId) faltantes.push('ID de producto')
  if (!(precio > 0)) faltantes.push('precio de venta (mayor a cero)')
  if (!descripcion) faltantes.push('descripción técnica')
  if (!historia) faltantes.push('historia del producto')
  if (!categoriaId) faltantes.push('categoría')
  if (faltantes.length) throw fallo(`Para publicar el producto en la web falta completar: ${faltantes.join(', ')}.`)
}

router.get('/', auth(), asyncRoute(async (req, res) => {
  const soloActivos = req.query.activos === 'true'
  const { rows } = await pool.query(`${consultaProductos}${soloActivos ? ' HAVING p.activo' : ''} ORDER BY p.nombre`)
  res.json(await conCostoCalculado(rows))
}))

router.get('/:id', auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`${consultaProductos} HAVING p.id = $1`, [req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  res.json((await conCostoCalculado(rows))[0])
}))

router.post('/', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', precio_venta, materiales, categoria_id = null, destacado = false, publicado = false, horas_hombre = 0,
    chapita_id = null, medidas = '', costo_producto = 0, historia = '' } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del producto.')
  const precio = normalizarPrecio(precio_venta)
  const horasHombre = Math.max(0, decimal(horas_hombre))
  let chapitaId = normalizarChapita(chapita_id)
  const costoProducto = Math.max(0, decimal(costo_producto))
  const medidasNormalizadas = normalizarMedidas(medidas)
  const descripcionNormalizada = descripcion?.toString().trim() || null
  const historiaNormalizada = normalizarHistoria(historia)
  const materialesNormalizados = normalizarMateriales(materiales)
  const categoriaValida = await validarCategoria(categoria_id)
  // Al publicar, el ID tiene que venir cargado (no se autocompleta).
  if (publicado === true) validarPublicacion({ nombre: nombre.trim(), chapitaId, precio, descripcion: descripcionNormalizada, historia: historiaNormalizada, categoriaId: categoriaValida })

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    if (!chapitaId) chapitaId = await generarChapitaId(cliente)
    const slug = await generarSlugUnico(cliente, nombre.trim())
    const { rows } = await cliente.query(
      `INSERT INTO productos (nombre, descripcion, precio_venta, categoria_id, slug, destacado, horas_hombre, chapita_id, medidas, costo_producto, historia, publicado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [nombre.trim(), descripcionNormalizada, precio, categoriaValida, slug, Boolean(destacado), horasHombre, chapitaId, medidasNormalizadas, costoProducto, historiaNormalizada, publicado === true]
    )
    await guardarMateriales(cliente, rows[0].id, materialesNormalizados)
    await cliente.query('COMMIT')
    sincronizarEnSegundoPlano(rows[0].id)
    const creado = await pool.query(`${consultaProductos} HAVING p.id = $1`, [rows[0].id])
    res.status(201).json((await conCostoCalculado(creado.rows))[0])
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505' && error.constraint === 'productos_chapita_id_key') throw fallo(`El ID de producto "${chapitaId}" ya existe. Elegí otro.`, 409)
    if (error.constraint === 'productos_publicado_completo') throw fallo('Para publicar el producto en la web falta completar datos obligatorios.')
    throw error
  } finally { cliente.release() }
}))

router.put('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { nombre, descripcion = '', precio_venta, materiales, categoria_id = null, destacado = false, publicado, horas_hombre = 0,
    chapita_id = null, medidas = '', costo_producto = 0, historia = '' } = req.body
  if (!nombre?.trim()) throw fallo('Indicá el nombre del producto.')
  const precio = normalizarPrecio(precio_venta)
  const horasHombre = Math.max(0, decimal(horas_hombre))
  let chapitaId = normalizarChapita(chapita_id)
  const costoProducto = Math.max(0, decimal(costo_producto))
  const medidasNormalizadas = normalizarMedidas(medidas)
  const descripcionNormalizada = descripcion?.toString().trim() || null
  const historiaNormalizada = normalizarHistoria(historia)
  const materialesNormalizados = normalizarMateriales(materiales)
  const categoriaValida = await validarCategoria(categoria_id)

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const actual = await cliente.query('SELECT nombre, slug, chapita_id, publicado FROM productos WHERE id = $1 AND NOT eliminado', [req.params.id])
    if (!actual.rows[0]) throw fallo('Producto no encontrado.', 404)
    // Queda publicado si se pide publicarlo, o si ya lo estaba y el cuerpo
    // no trae el campo: en ambos casos se exigen los datos obligatorios.
    const quedaPublicado = typeof publicado === 'boolean' ? publicado : actual.rows[0].publicado
    if (quedaPublicado) validarPublicacion({ nombre: nombre.trim(), chapitaId: chapitaId || actual.rows[0].chapita_id, precio, descripcion: descripcionNormalizada, historia: historiaNormalizada, categoriaId: categoriaValida })
    // Al editar se conserva el ID actual salvo que el admin lo cambie a
    // mano; si llega vacío se mantiene el que tenía (o se genera uno si el
    // producto nunca tuvo). Al publicar, el ID ya se exigió arriba.
    if (!chapitaId) chapitaId = actual.rows[0].chapita_id || await generarChapitaId(cliente)
    // Sólo regenera el slug si cambió el nombre, para no romper enlaces ya compartidos.
    const slug = actual.rows[0].nombre === nombre.trim() && actual.rows[0].slug
      ? actual.rows[0].slug
      : await generarSlugUnico(cliente, nombre.trim(), req.params.id)

    const { rows } = await cliente.query(
      `UPDATE productos SET nombre = $1, descripcion = $2, precio_venta = $3, categoria_id = $4, slug = $5, destacado = $6, horas_hombre = $7,
         chapita_id = $8, medidas = $9, costo_producto = $10, historia = $11,
         publicado = COALESCE($13::boolean, publicado), actualizado_en = NOW() WHERE id = $12 RETURNING id`,
      [nombre.trim(), descripcionNormalizada, precio, categoriaValida, slug, Boolean(destacado), horasHombre,
        chapitaId, medidasNormalizadas, costoProducto, historiaNormalizada, req.params.id,
        // "Publicar en la web": si no viene en el cuerpo se conserva el valor actual.
        typeof publicado === 'boolean' ? publicado : null]
    )
    if (!rows[0]) throw fallo('Producto no encontrado.', 404)
    // Los pedidos ya generados guardan copia del precio, del costo de mano
    // de obra y del costo de materiales, así que editar el producto acá no
    // altera la producción en curso.
    await guardarMateriales(cliente, rows[0].id, materialesNormalizados)
    await cliente.query('COMMIT')
    sincronizarEnSegundoPlano(rows[0].id)
    const actualizado = await pool.query(`${consultaProductos} HAVING p.id = $1`, [rows[0].id])
    res.json((await conCostoCalculado(actualizado.rows))[0])
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505' && error.constraint === 'productos_chapita_id_key') throw fallo(`El ID de producto "${chapitaId}" ya existe. Elegí otro.`, 409)
    if (error.constraint === 'productos_publicado_completo') throw fallo('Para publicar el producto en la web falta completar datos obligatorios.')
    throw error
  } finally { cliente.release() }
}))

router.patch('/:id/activo', auth(['admin']), asyncRoute(async (req, res) => {
  const { activo } = req.body
  if (typeof activo !== 'boolean') throw fallo('El campo activo debe ser booleano.')
  // Desactivar = registrar la venta; reactivar = anularla (ver trigger
  // productos_registrar_venta). Un producto eliminado no se puede reactivar.
  const { rows } = await pool.query(`UPDATE productos SET activo = $1, actualizado_en = NOW() WHERE id = $2 AND NOT eliminado
    RETURNING id, nombre, activo, vendido_en, precio_vendido::float8 AS precio_vendido`, [activo, req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  sincronizarEnSegundoPlano(rows[0].id)
  res.json(rows[0])
}))

// "Eliminar" es un borrado lógico: el producto desaparece del panel, de la
// web pública y de WhatsApp, pero la fila se conserva porque un producto
// eliminado cuenta como VENDIDO en las estadísticas (antes el DELETE
// físico hacía perder esa venta). Si ya estaba desactivado (vendido), se
// conserva la fecha y el precio de esa venta: no se cuenta dos veces.
router.delete('/:id', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE productos SET eliminado = TRUE, actualizado_en = NOW() WHERE id = $1 AND NOT eliminado RETURNING id',
    [req.params.id])
  if (!rows[0]) throw fallo('Producto no encontrado.', 404)
  // Si ya estaba sincronizado en WhatsApp se marca "discontinued" en Meta
  // (un error de Meta no impide eliminarlo del sistema).
  sincronizarEnSegundoPlano(rows[0].id)
  res.json({ mensaje: 'Producto eliminado: se contabiliza como vendido en las estadísticas.', desactivado: false, vendido: true })
}))

// -----------------------------------------------------------------------
// GALERÍA DE IMÁGENES
// Los archivos se guardan en disco (server/uploads/productos) y se sirven
// como estáticos desde /uploads (ver server/index.js). Sólo se guarda la
// URL relativa en la base, nunca el archivo en sí.
// -----------------------------------------------------------------------
const directorioUploads = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'productos')
fs.mkdirSync(directorioUploads, { recursive: true })

const tiposPermitidos = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, directorioUploads),
    filename: (_, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`)
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(tiposPermitidos.has(file.mimetype) ? null : fallo('Formato de imagen no soportado. Usá JPG, PNG, WEBP o GIF.'), tiposPermitidos.has(file.mimetype))
})

const listarImagenes = async productoId => {
  const { rows } = await pool.query('SELECT id, url, orden, es_principal FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden', [productoId])
  return rows
}

router.post('/:id/imagenes', auth(['admin']), (req, res, next) => {
  upload.single('imagen')(req, res, error => {
    if (error) return res.status(400).json({ error: error.message || 'No se pudo subir la imagen.' })
    next()
  })
}, asyncRoute(async (req, res) => {
  const producto = await pool.query('SELECT id FROM productos WHERE id = $1', [req.params.id])
  if (!producto.rows[0]) throw fallo('Producto no encontrado.', 404)
  if (!req.file) throw fallo('Adjuntá un archivo de imagen.')

  const url = `/uploads/productos/${req.file.filename}`
  const existentes = await pool.query('SELECT COUNT(*)::int AS total, COALESCE(MAX(orden), 0)::int AS max_orden FROM producto_imagenes WHERE producto_id = $1', [req.params.id])
  const esPrimera = existentes.rows[0].total === 0
  const { rows } = await pool.query(
    'INSERT INTO producto_imagenes (producto_id, url, orden, es_principal) VALUES ($1, $2, $3, $4) RETURNING id, url, orden, es_principal',
    [req.params.id, url, existentes.rows[0].max_orden + 1, esPrimera]
  )
  // La primera foto que se sube después de crear el producto es la que
  // permite sincronizarlo por primera vez con WhatsApp (Meta exige imagen).
  if (esPrimera) sincronizarEnSegundoPlano(req.params.id)
  res.status(201).json({ imagen: rows[0], imagenes: await listarImagenes(req.params.id) })
}))

router.patch('/:id/imagenes/:imagenId/principal', auth(['admin']), asyncRoute(async (req, res) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const objetivo = await cliente.query('SELECT id FROM producto_imagenes WHERE id = $1 AND producto_id = $2', [req.params.imagenId, req.params.id])
    if (!objetivo.rows[0]) throw fallo('Imagen no encontrada.', 404)
    await cliente.query('UPDATE producto_imagenes SET es_principal = FALSE WHERE producto_id = $1', [req.params.id])
    await cliente.query('UPDATE producto_imagenes SET es_principal = TRUE WHERE id = $1', [req.params.imagenId])
    await cliente.query('COMMIT')
  } catch (error) { await cliente.query('ROLLBACK'); throw error } finally { cliente.release() }
  // Cambió la foto que se muestra en el catálogo (y en WhatsApp).
  sincronizarEnSegundoPlano(req.params.id)
  res.json({ imagenes: await listarImagenes(req.params.id) })
}))

router.delete('/:id/imagenes/:imagenId', auth(['admin']), asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM producto_imagenes WHERE id = $1 AND producto_id = $2 RETURNING url, es_principal', [req.params.imagenId, req.params.id])
  if (!rows[0]) throw fallo('Imagen no encontrada.', 404)

  // Borra el archivo físico sin interrumpir la respuesta si ya no existe.
  const archivo = path.join(directorioUploads, path.basename(rows[0].url))
  fs.unlink(archivo, () => {})

  // Si la imagen borrada era la principal, promueve a la siguiente en orden.
  if (rows[0].es_principal) {
    const restante = await pool.query('SELECT id FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden LIMIT 1', [req.params.id])
    if (restante.rows[0]) await pool.query('UPDATE producto_imagenes SET es_principal = TRUE WHERE id = $1', [restante.rows[0].id])
    // Cambió (o se quedó sin) la foto principal: puede afectar lo que ya
    // esté sincronizado en WhatsApp (incluido el caso "ya no queda ninguna
    // foto", que vuelve a fallar la sincronización con un motivo claro).
    sincronizarEnSegundoPlano(req.params.id)
  }
  res.json({ imagenes: await listarImagenes(req.params.id) })
}))

// -----------------------------------------------------------------------
// SINCRONIZACIÓN CON EL CATÁLOGO DE WHATSAPP
// La sincronización automática (ver sincronizarEnSegundoPlano más arriba)
// corre en segundo plano al guardar el producto o sus fotos. Esta ruta es
// el botón "Reintentar sincronización" del panel: corre la misma lógica
// pero espera el resultado para poder mostrarlo al instante.
// -----------------------------------------------------------------------
router.post('/:id/whatsapp/reintentar', auth(['admin']), asyncRoute(async (req, res) => {
  const producto = await pool.query('SELECT id FROM productos WHERE id = $1', [req.params.id])
  if (!producto.rows[0]) throw fallo('Producto no encontrado.', 404)

  const resultado = await sincronizarProducto(req.params.id)
  if (resultado.estado === 'ERROR') throw fallo(resultado.error || 'No se pudo sincronizar con el catálogo de WhatsApp.', 502)
  if (resultado.omitido) {
    const mensaje = resultado.motivo === 'deshabilitada'
      ? 'La integración con WhatsApp no está habilitada en el servidor. Completá WHATSAPP_SYNC_ENABLED y las variables META_* (ver INTEGRACION_WHATSAPP.md).'
      : 'El producto tiene que estar activo y marcado como "Publicar en la web" para sincronizarlo con WhatsApp.'
    throw fallo(mensaje, 400)
  }
  res.json({ mensaje: 'Producto sincronizado con el catálogo de WhatsApp.', whatsapp_sync_estado: resultado.estado })
}))

export default router
