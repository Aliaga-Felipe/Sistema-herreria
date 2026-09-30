// Permisos de la recompensa por equipo, validados en el backend.
// Monta las rutas reales en un Express en memoria y firma tokens como lo
// hace el login. El rechazo por rol (auth(['admin'])) ocurre antes de
// consultar la base, así que estos tests no necesitan PostgreSQL.
// Uso: npm test
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { sign } from './comun.js'
import { pool } from './db.js'
import recompensas from './rutas/recompensas.js'
import produccion from './rutas/produccion.js'
import productos from './rutas/productos.js'

let servidor
let base
const tokenEmpleado = sign({ id: 999001, rol: 'empleado', nombre: 'Empleado de prueba' })
const tokenAdmin = sign({ id: 999002, rol: 'admin', nombre: 'Admin de prueba' })

const llamar = async (metodo, ruta, token, cuerpo = {}) => {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo)
  })
  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) }
}

before(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/recompensas', recompensas)
  app.use('/api/produccion', produccion)
  app.use('/api/productos', productos)
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  await new Promise(resolve => { servidor = app.listen(0, resolve) })
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(async () => {
  await new Promise(resolve => servidor.close(resolve))
  await pool.end()
})

describe('un usuario que no es administrador no puede cambiar los parámetros', () => {
  it('rechaza cambiar el objetivo del día', async () => {
    const { status } = await llamar('PUT', '/api/recompensas/equipo/dia/2026-09-30/objetivo', tokenEmpleado, { objetivo_horas: 8 })
    assert.equal(status, 403)
  })

  it('rechaza volver el objetivo al sugerido', async () => {
    const { status } = await llamar('PUT', '/api/recompensas/equipo/dia/2026-09-30/objetivo', tokenEmpleado, { automatico: true })
    assert.equal(status, 403)
  })

  it('rechaza cambiar el valor hora-hombre y el % de premio', async () => {
    const { status } = await llamar('PUT', '/api/recompensas/parametros', tokenEmpleado, { valor_hora: 99999, porcentaje_premio: 100 })
    assert.equal(status, 403)
  })

  it('rechaza cambiar el tiempo estándar (horas-hombre) de un producto', async () => {
    const edicion = await llamar('PUT', '/api/productos/1', tokenEmpleado, { nombre: 'Silla', horas_hombre: 1 })
    const alta = await llamar('POST', '/api/productos', tokenEmpleado, { nombre: 'Silla', horas_hombre: 1 })
    assert.equal(edicion.status, 403)
    assert.equal(alta.status, 403)
  })

  it('rechaza cargar horas trabajadas', async () => {
    const { status } = await llamar('PUT', '/api/produccion/horas', tokenEmpleado, { fecha: '2026-09-30', horas: [{ usuario_id: 1, horas: 8 }] })
    assert.equal(status, 403)
  })

  it('rechaza pedidos sin sesión', async () => {
    const { status } = await llamar('PUT', '/api/recompensas/parametros', 'token-invalido', { valor_hora: 1 })
    assert.equal(status, 401)
  })
})

describe('el administrador pasa el control de permisos', () => {
  // Datos inválidos: la ruta los rechaza con 400 (no 403) antes de tocar la base.
  it('valida el objetivo del día', async () => {
    const { status, datos } = await llamar('PUT', '/api/recompensas/equipo/dia/2026-09-30/objetivo', tokenAdmin, { objetivo_horas: -5 })
    assert.equal(status, 400)
    assert.match(datos.error, /objetivo/i)
  })

  it('valida la fecha', async () => {
    const { status } = await llamar('PUT', '/api/recompensas/equipo/dia/30-09-2026/objetivo', tokenAdmin, { objetivo_horas: 8 })
    assert.equal(status, 400)
  })

  it('valida las horas de la planilla', async () => {
    const { status } = await llamar('PUT', '/api/produccion/horas', tokenAdmin, { fecha: '2026-09-30', horas: [{ usuario_id: 1, horas: 30 }] })
    assert.equal(status, 400)
  })
})
