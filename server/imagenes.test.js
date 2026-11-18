import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { normalizarImagenProducto } from './imagenes.js'

const crear = async (nombre, ancho, alto, formato, opciones = {}) => {
  const ruta = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'imagenes-')), nombre)
  await sharp({ create: { width: ancho, height: alto, channels: 4, background: '#a0522d' } })[formato](opciones).toFile(ruta)
  return ruta
}

test('una foto apaisada grande queda en 1080×1350', async () => {
  const ruta = await crear('a.jpg', 4000, 3000, 'jpeg')
  const r = await normalizarImagenProducto(ruta)
  assert.equal(r.estado, 'normalizada')
  const meta = await sharp(ruta).metadata()
  assert.deepEqual([meta.width, meta.height, meta.format], [1080, 1350, 'jpeg'])
})

test('un PNG cuadrado chico se recorta, se agranda a 1080×1350 y sigue siendo PNG', async () => {
  const ruta = await crear('b.png', 500, 500, 'png')
  await normalizarImagenProducto(ruta)
  const meta = await sharp(ruta).metadata()
  assert.deepEqual([meta.width, meta.height, meta.format, meta.hasAlpha], [1080, 1350, 'png', true])
})

test('una foto que ya es 1080×1350 no se toca', async () => {
  const ruta = await crear('c.webp', 1080, 1350, 'webp')
  const antes = await fs.readFile(ruta)
  const r = await normalizarImagenProducto(ruta)
  assert.equal(r.estado, 'sin-cambios')
  assert.ok(antes.equals(await fs.readFile(ruta)))
})

test('respeta la orientación EXIF de las fotos de celular', async () => {
  // Foto apaisada 2000×1200 guardada "acostada" con orientación 6 (girada
  // 90°): en pantalla es vertical 1200×2000, se recorta a lo alto (sin
  // perder ancho) y queda 1080×1350.
  const ruta = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'imagenes-')), 'd.jpg')
  await sharp({ create: { width: 2000, height: 1200, channels: 3, background: '#333' } }).jpeg().withMetadata({ orientation: 6 }).toFile(ruta)
  await normalizarImagenProducto(ruta)
  const meta = await sharp(ruta).metadata()
  assert.deepEqual([meta.width, meta.height, meta.orientation ?? 1], [1080, 1350, 1])
})

test('un archivo que no es imagen da error', async () => {
  const ruta = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'imagenes-')), 'e.jpg')
  await fs.writeFile(ruta, 'esto no es una imagen')
  await assert.rejects(normalizarImagenProducto(ruta))
})
