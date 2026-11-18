import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { medidasNormalizadas, normalizarImagenProducto } from './imagenes.js'

const crear = async (nombre, ancho, alto, formato, opciones = {}) => {
  const ruta = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'imagenes-')), nombre)
  await sharp({ create: { width: ancho, height: alto, channels: 4, background: '#a0522d' } })[formato](opciones).toFile(ruta)
  return ruta
}

test('medidasNormalizadas recorta a 4:5 y limita el ancho sin agrandar', () => {
  assert.deepEqual(medidasNormalizadas(4000, 3000), { ancho: 1600, alto: 2000 })
  assert.deepEqual(medidasNormalizadas(1000, 1000), { ancho: 800, alto: 1000 })
  assert.deepEqual(medidasNormalizadas(600, 2000), { ancho: 600, alto: 750 })
  assert.deepEqual(medidasNormalizadas(400, 500), { ancho: 400, alto: 500 })
})

test('una foto apaisada grande queda en 1600×2000', async () => {
  const ruta = await crear('a.jpg', 4000, 3000, 'jpeg')
  const r = await normalizarImagenProducto(ruta)
  assert.equal(r.estado, 'normalizada')
  const meta = await sharp(ruta).metadata()
  assert.deepEqual([meta.width, meta.height, meta.format], [1600, 2000, 'jpeg'])
})

test('un PNG cuadrado chico se recorta sin agrandarse y sigue siendo PNG', async () => {
  const ruta = await crear('b.png', 500, 500, 'png')
  await normalizarImagenProducto(ruta)
  const meta = await sharp(ruta).metadata()
  assert.deepEqual([meta.width, meta.height, meta.format, meta.hasAlpha], [400, 500, 'png', true])
})

test('una foto que ya es 4:5 no se toca', async () => {
  const ruta = await crear('c.webp', 800, 1000, 'webp')
  const antes = await fs.readFile(ruta)
  const r = await normalizarImagenProducto(ruta)
  assert.equal(r.estado, 'sin-cambios')
  assert.ok(antes.equals(await fs.readFile(ruta)))
})

test('respeta la orientación EXIF de las fotos de celular', async () => {
  // Foto apaisada 1000×600 guardada "acostada" con orientación 6 (girada 90°):
  // en pantalla es vertical 600×1000, así que queda 600×750.
  const ruta = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'imagenes-')), 'd.jpg')
  await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#333' } }).jpeg().withMetadata({ orientation: 6 }).toFile(ruta)
  await normalizarImagenProducto(ruta)
  const meta = await sharp(ruta).metadata()
  assert.deepEqual([meta.width, meta.height, meta.orientation ?? 1], [600, 750, 1])
})

test('un archivo que no es imagen da error', async () => {
  const ruta = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'imagenes-')), 'e.jpg')
  await fs.writeFile(ruta, 'esto no es una imagen')
  await assert.rejects(normalizarImagenProducto(ruta))
})
