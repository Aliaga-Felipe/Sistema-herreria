import fs from 'fs/promises'
import sharp from 'sharp'

// -----------------------------------------------------------------------
// NORMALIZACIÓN DE FOTOS DE PRODUCTO (ticket #81)
// Todas las fotos de producto se guardan en formato vertical 4:5, que es
// la proporción en la que se muestran en la web pública y en el panel,
// siempre a la misma resolución: 1080×1350. Si la foto no es 4:5 se
// recorta centrada, y después se escala a 1080×1350 (las grandes se
// achican, lo que también baja el peso; las chicas se agrandan). Se
// conserva el formato original (JPG, PNG, WEBP o GIF,
// incluidos los GIF animados), así el nombre y la URL del archivo no
// cambian.
// Lo usan la subida de fotos (rutas/productos.js) y el script que
// normaliza las fotos ya cargadas (scripts/normalizar-imagenes.js).
// -----------------------------------------------------------------------
export const ANCHO_PRODUCTO = 1080
export const ALTO_PRODUCTO = 1350

export const yaNormalizada = (ancho, alto) => ancho === ANCHO_PRODUCTO && alto === ALTO_PRODUCTO

const codificar = (imagen, formato) => {
  switch (formato) {
    case 'jpeg': return imagen.jpeg({ quality: 85, mozjpeg: true })
    case 'png': return imagen.png({ compressionLevel: 9 })
    case 'webp': return imagen.webp({ quality: 85 })
    case 'gif': return imagen.gif()
    default: return null
  }
}

// Normaliza el archivo en su lugar. Devuelve qué pasó, con las medidas de
// antes y de después. Si el archivo no es una imagen válida, lanza error.
export async function normalizarImagenProducto(ruta) {
  const original = await fs.readFile(ruta)
  // animated: true para que un GIF/WEBP animado se procese cuadro por cuadro.
  const meta = await sharp(original, { animated: true }).metadata()
  const formato = meta.format
  // En las fotos de celular la orientación viene en el EXIF (4 a 8 = girada
  // 90°): el ancho y el alto "reales" son los invertidos.
  const girada = (meta.orientation || 1) >= 5
  const altoCuadro = meta.pageHeight || meta.height
  const ancho = girada ? altoCuadro : meta.width
  const alto = girada ? meta.width : altoCuadro
  const antes = { ancho, alto }

  if (!ancho || !alto) throw new Error('No se pudo leer el tamaño de la imagen.')
  if (yaNormalizada(ancho, alto) && (meta.orientation || 1) === 1) return { estado: 'sin-cambios', antes, despues: antes }

  const despues = { ancho: ANCHO_PRODUCTO, alto: ALTO_PRODUCTO }
  const imagen = codificar(
    sharp(original, { animated: true })
      .rotate() // aplica la orientación del EXIF antes de recortar
      .resize({ width: despues.ancho, height: despues.alto, fit: 'cover', position: 'centre' }),
    formato
  )
  if (!imagen) throw new Error(`Formato de imagen no soportado (${formato}).`)

  // Se escribe a un temporal y se renombra, así nunca queda un archivo a
  // medio escribir si el proceso se corta.
  const temporal = `${ruta}.tmp-${process.pid}`
  try {
    await imagen.toFile(temporal)
    await fs.rename(temporal, ruta)
  } catch (error) {
    await fs.rm(temporal, { force: true })
    throw error
  }
  return { estado: 'normalizada', antes, despues }
}
