// Permisos de la producción diaria y la recompensa por equipo, validados en
// el backend. Monta las rutas reales en un Express en memoria y firma
// tokens como lo hace el login. auth() lee el rol y el estado de la cuenta
// de la base, así que estos tests usan la base de .env: crean un empleado y
// un administrador temporales y los borran al final. Las validaciones que se
// prueban rechazan antes de escribir nada.
// Uso: npm test
import 'dotenv/config'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { rolLiteral, sign } from './comun.js'
import { pool } from './db.js'
import recompensas from './rutas/recompensas.js'
import produccion from './rutas/produccion.js'
import productos from './rutas/productos.js'
import pedidos from './rutas/pedidos.js'
import tareas from './rutas/tareas.js'

let servidor
let base
let tokenEmpleado
let tokenAdmin
const creados = []

const llamar = async (metodo, ruta, token, cuerpo = {}) => {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo)
  })
  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) }
}

const crearUsuario = async (rol, nombre) => {
  const marca = `permisos_${Date.now()}_${rol}`
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, contrasena_hash, rol) VALUES ($1, $2, 'sin-clave', ${rolLiteral('$3')}) RETURNING id`,
    [nombre, `${marca}@prueba.local`, rol])
  creados.push(rows[0].id)
  return sign({ id: rows[0].id, rol, nombre })
}

before(async () => {
  tokenEmpleado = await crearUsuario('empleado', 'Empleado de prueba')
  tokenAdmin = await crearUsuario('admin', 'Admin de prueba')
  const app = express()
  app.use(express.json())
  app.use('/api/recompensas', recompensas)
  app.use('/api/produccion', produccion)
  app.use('/api/productos', productos)
  app.use('/api/pedidos', pedidos)
  app.use('/api/tareas', tareas)
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  await new Promise(resolve => { servidor = app.listen(0, resolve) })
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(async () => {
  await new Promise(resolve => servidor.close(resolve))
  await pool.query('DELETE FROM usuarios WHERE id = ANY($1::bigint[])', [creados])
  await pool.end()
})

describe('un empleado no puede armar ni cerrar la producción diaria', () => {
  it('rechaza agregar trabajo a la producción del día', async () => {
    const { status } = await llamar('POST', '/api/produccion/jornada/2026-09-30/etapas', tokenEmpleado, { pedido_id: 1 })
    assert.equal(status, 403)
  })

  it('rechaza quitar etapas o borrar la producción del día', async () => {
    assert.equal((await llamar('DELETE', '/api/produccion/jornada/2026-09-30/etapas/1', tokenEmpleado)).status, 403)
    assert.equal((await llamar('DELETE', '/api/produccion/jornada/2026-09-30', tokenEmpleado)).status, 403)
  })

  it('rechaza marcar la producción diaria como terminada o reabrirla', async () => {
    assert.equal((await llamar('POST', '/api/produccion/jornada/2026-09-30/terminar', tokenEmpleado)).status, 403)
    assert.equal((await llamar('POST', '/api/produccion/jornada/2026-09-30/reabrir', tokenEmpleado)).status, 403)
  })

  it('rechaza reabrir una etapa completada (eso lo hace el admin al verificar)', async () => {
    const { status } = await llamar('PATCH', '/api/tareas/asignadas/PEDIDO/1/reabrir', tokenEmpleado)
    assert.equal(status, 403)
  })

  it('rechaza crear pedidos y cambiar productos', async () => {
    assert.equal((await llamar('POST', '/api/pedidos', tokenEmpleado, { items: [] })).status, 403)
    assert.equal((await llamar('PUT', '/api/productos/1', tokenEmpleado, { nombre: 'Silla', horas_hombre: 1 })).status, 403)
    assert.equal((await llamar('POST', '/api/productos', tokenEmpleado, { nombre: 'Silla', horas_hombre: 1 })).status, 403)
  })

  it('rechaza cambiar el valor hora-hombre y el % de premio', async () => {
    const { status } = await llamar('PUT', '/api/recompensas/parametros', tokenEmpleado, { valor_hora: 99999, porcentaje_premio: 100 })
    assert.equal(status, 403)
  })

  it('puede consultar la producción del día', async () => {
    const { status, datos } = await llamar('GET', '/api/produccion/jornada/1999-01-01', tokenEmpleado)
    assert.equal(status, 200)
    assert.equal(datos.estado, 'SIN_PLANIFICAR')
  })

  it('puede consultar el historial de días y el resumen de recompensas', async () => {
    const historial = await llamar('GET', '/api/produccion/jornadas?desde=1999-01-01&hasta=1999-01-02', tokenEmpleado)
    assert.equal(historial.status, 200)
    assert.deepEqual(historial.datos, [])
    const resumen = await llamar('GET', '/api/recompensas/resumen', tokenEmpleado)
    assert.equal(resumen.status, 200)
    assert.ok('hoy' in resumen.datos && 'mes' in resumen.datos && 'total' in resumen.datos)
  })

  it('rechaza pedidos sin sesión', async () => {
    const { status } = await llamar('PUT', '/api/recompensas/parametros', 'token-invalido', { valor_hora: 1 })
    assert.equal(status, 401)
  })
})

describe('las rutas del modelo anterior ya no existen', () => {
  it('objetivos diarios por producto y carga de unidades producidas', async () => {
    assert.equal((await llamar('PUT', '/api/produccion/objetivos/1', tokenAdmin, { cantidad_objetivo: 8 })).status, 404)
    assert.equal((await llamar('POST', '/api/produccion/registros', tokenAdmin, { producto_id: 1, fecha: '2026-09-30', cantidad_producida: 1 })).status, 404)
  })

  it('carga de horas trabajadas y objetivo fijado desde Recompensas', async () => {
    assert.equal((await llamar('PUT', '/api/produccion/horas', tokenAdmin, { fecha: '2026-09-30', horas: [] })).status, 404)
    assert.equal((await llamar('PUT', '/api/recompensas/equipo/dia/2026-09-30/objetivo', tokenAdmin, { objetivo_horas: 8 })).status, 404)
  })
})

describe('el administrador pasa el control de permisos y se validan los datos', () => {
  it('valida la fecha de la producción diaria y del desglose', async () => {
    assert.equal((await llamar('GET', '/api/produccion/jornada/30-09-2026', tokenAdmin)).status, 400)
    assert.equal((await llamar('GET', '/api/recompensas/equipo/dia/30-09-2026', tokenAdmin)).status, 400)
  })

  it('pide qué agregar a la producción del día', async () => {
    const { status, datos } = await llamar('POST', '/api/produccion/jornada/1999-01-01/etapas', tokenAdmin, {})
    assert.equal(status, 400)
    assert.match(datos.error, /pedido, el producto o las etapas/i)
  })

  it('no se puede terminar un día sin producción cargada', async () => {
    const { status } = await llamar('POST', '/api/produccion/jornada/1999-01-01/terminar', tokenAdmin)
    assert.equal(status, 404)
  })

  it('valida el % de premio', async () => {
    const { status, datos } = await llamar('PUT', '/api/recompensas/parametros', tokenAdmin, { valor_hora: 1, porcentaje_premio: 150 })
    assert.equal(status, 400)
    assert.match(datos.error, /porcentaje/i)
  })
})
