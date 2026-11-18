import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizarImagenProducto } from '../imagenes.js'

// Script de uso único (ticket #81): pasa a 4:5 las fotos de producto que
// ya estaban cargadas antes de que la subida las normalizara sola.
// Recorta centrada cada foto de server/uploads/productos que no sea 4:5 y
// achica las que superan los 1600 px de ancho. Las que ya están bien no
// se tocan, así que se puede correr más de una vez sin problema.
//
// Los archivos se reemplazan en su lugar (mismo nombre, misma URL), por
// eso no hace falta tocar la base. Antes de reemplazar, guarda una copia
// del original en server/uploads/productos-originales-<fecha>/; una vez
// que se revisa la web y todo se ve bien, esa carpeta se puede borrar.
//
// Uso, parado en la carpeta del proyecto:
//
//   node server/scripts/normalizar-imagenes.js --prueba   (solo muestra qué haría)
//   node server/scripts/normalizar-imagenes.js            (normaliza)
//
// Opciones:
//   --prueba       no modifica nada, solo lista qué fotos cambiarían.
//   --sin-copia    no guarda la copia de los originales.

const directorio = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'productos')
const extensiones = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const prueba = process.argv.includes('--prueba')
const sinCopia = process.argv.includes('--sin-copia')

const kb = bytes => `${Math.round(bytes / 1024)} KB`
const medidas = m => `${m.ancho}×${m.alto}`

async function main() {
  const archivos = (await fs.readdir(directorio))
    .filter(nombre => extensiones.has(path.extname(nombre).toLowerCase()))
    .sort()
  if (!archivos.length) { console.log('No hay fotos en', directorio); return }

  const fecha = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  const copias = path.join(directorio, '..', `productos-originales-${fecha}`)
  console.log(`${archivos.length} fotos en ${directorio}${prueba ? ' (modo prueba: no se modifica nada)' : ''}\n`)

  const total = { normalizadas: 0, sinCambios: 0, errores: 0, antes: 0, despues: 0 }
  for (const nombre of archivos) {
    const ruta = path.join(directorio, nombre)
    try {
      const pesoAntes = (await fs.stat(ruta)).size
      if (prueba) {
        // En modo prueba se procesa una copia temporal, para mostrar el
        // resultado real sin tocar el archivo.
        const temporal = `${ruta}.prueba-${process.pid}${path.extname(nombre)}`
        await fs.copyFile(ruta, temporal)
        try {
          const r = await normalizarImagenProducto(temporal)
          informar(nombre, r, pesoAntes, (await fs.stat(temporal)).size, total)
        } finally { await fs.rm(temporal, { force: true }) }
        continue
      }
      if (!sinCopia) {
        await fs.mkdir(copias, { recursive: true })
        await fs.copyFile(ruta, path.join(copias, nombre))
      }
      const r = await normalizarImagenProducto(ruta)
      informar(nombre, r, pesoAntes, (await fs.stat(ruta)).size, total)
      // Si no cambió, la copia no hace falta.
      if (r.estado === 'sin-cambios' && !sinCopia) await fs.rm(path.join(copias, nombre), { force: true })
    } catch (error) {
      total.errores++
      console.log(`  ERROR      ${nombre}: ${error.message}`)
    }
  }

  // Si no se normalizó nada, la carpeta de copias queda vacía: se borra.
  if (!prueba && !sinCopia) await fs.rmdir(copias).catch(() => {})

  console.log(`\nNormalizadas: ${total.normalizadas} · Ya estaban bien: ${total.sinCambios} · Con error: ${total.errores}`)
  if (total.normalizadas) console.log(`Peso de las normalizadas: ${kb(total.antes)} → ${kb(total.despues)}`)
  if (!prueba && !sinCopia && total.normalizadas) console.log(`Originales guardados en ${copias}`)
  if (total.errores) process.exitCode = 1
}

function informar(nombre, r, pesoAntes, pesoDespues, total) {
  if (r.estado === 'sin-cambios') { total.sinCambios++; console.log(`  sin cambio ${nombre} (${medidas(r.antes)})`); return }
  total.normalizadas++
  total.antes += pesoAntes
  total.despues += pesoDespues
  console.log(`  ${prueba ? 'cambiaría ' : 'normalizada'} ${nombre}: ${medidas(r.antes)} → ${medidas(r.despues)}, ${kb(pesoAntes)} → ${kb(pesoDespues)}`)
}

main().catch(error => { console.error(error); process.exit(1) })
