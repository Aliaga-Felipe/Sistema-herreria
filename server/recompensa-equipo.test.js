// Tests de la lógica pura de la recompensa por equipo.
// Uso: npm test
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRecompensaEquipo, validarRepartoHoras } from './recompensa-equipo.js'

const VALOR_HORA = 2500
const PREMIO = 50
const etapa = (horas, estado = 'PENDIENTE', responsable = 1) => ({ horas_hombre: horas, estado, responsable_id: responsable })
const hecha = horas => etapa(horas, 'COMPLETADA')

// Caso base: la producción del día es una silla de 4 hs-hombre repartida
// en Corte (1 h), Soldadura (2 hs) y Pintura (1 h).
const dia = estados => calcularRecompensaEquipo({
  etapas: [etapa(1, estados[0]), etapa(2, estados[1]), etapa(1, estados[2])],
  valorHora: VALOR_HORA,
  porcentajePremio: PREMIO
})

describe('recompensa por equipo', () => {
  it('se completan todas las etapas propuestas: cobra las horas-hombre estimadas', () => {
    const resultado = dia(['COMPLETADA', 'COMPLETADA', 'COMPLETADA'])
    assert.equal(resultado.objetivo_horas, 4)
    assert.equal(resultado.horas_completadas, 4)
    assert.equal(resultado.cumplido, true)
    assert.equal(resultado.recompensa, 4 * VALOR_HORA * (PREMIO / 100))
  })

  it('falta una etapa: no se cumple y la recompensa es 0', () => {
    const resultado = dia(['COMPLETADA', 'COMPLETADA', 'EN_PROGRESO'])
    assert.equal(resultado.horas_completadas, 3)
    assert.equal(resultado.horas_pendientes, 1)
    assert.equal(resultado.cumplido, false)
    assert.equal(resultado.recompensa, 0)
    // Igual informa cuánto cobraría al completar todo.
    assert.equal(resultado.recompensa_al_cumplir, 4 * VALOR_HORA * (PREMIO / 100))
  })

  it('el avance se mide en horas-hombre, no en cantidad de etapas', () => {
    const resultado = dia(['PENDIENTE', 'COMPLETADA', 'PENDIENTE'])
    assert.equal(resultado.etapas_completadas, 1)
    assert.equal(resultado.avance, 50)
  })

  it('una producción con etapas de varios pedidos suma todas sus horas', () => {
    const resultado = calcularRecompensaEquipo({ etapas: [hecha(4), hecha(6), hecha(2.5)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 12.5)
    assert.equal(resultado.recompensa, 12.5 * VALOR_HORA)
  })

  it('el % de premio por defecto es 100', () => {
    const resultado = calcularRecompensaEquipo({ etapas: [hecha(4)], valorHora: VALOR_HORA })
    assert.equal(resultado.porcentaje_premio, 100)
    assert.equal(resultado.recompensa, 4 * VALOR_HORA)
  })
})

describe('reparto de horas-hombre en etapas', () => {
  it('coincide cuando las etapas suman la estimación', () => {
    const reparto = validarRepartoHoras(4, [1, 2, 1])
    assert.equal(reparto.coincide, true)
    assert.equal(reparto.diferencia, 0)
  })

  it('admite decimales sin errores de redondeo', () => {
    assert.equal(validarRepartoHoras(1, [0.1, 0.2, 0.7]).coincide, true)
    assert.equal(validarRepartoHoras(2.75, [1.25, 1.5]).coincide, true)
  })

  it('avisa cuánto falta o cuánto sobra', () => {
    assert.deepEqual(validarRepartoHoras(4, [1, 2]), { estimadas: 4, suma: 3, diferencia: 1, coincide: false })
    assert.equal(validarRepartoHoras(4, [3, 2]).diferencia, -1)
  })

  it('sin estimación nunca coincide', () => {
    assert.equal(validarRepartoHoras(0, []).coincide, false)
    assert.equal(validarRepartoHoras('', [0]).coincide, false)
  })
})

describe('casos borde', () => {
  it('sin etapas propuestas: no paga y lo avisa', () => {
    const resultado = calcularRecompensaEquipo({ etapas: [], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 0)
    assert.equal(resultado.cumplido, false)
    assert.equal(resultado.recompensa, 0)
    assert.equal(resultado.avance, 0)
    assert.ok(resultado.advertencias.some(texto => texto.includes('Producción diaria')))
  })

  it('avisa las etapas pendientes sin empleado asignado', () => {
    const resultado = calcularRecompensaEquipo({ etapas: [etapa(2, 'PENDIENTE', null), hecha(1)], valorHora: VALOR_HORA })
    assert.ok(resultado.advertencias.some(texto => texto.includes('sin empleado')))
  })

  it('ignora horas negativas o inválidas', () => {
    const resultado = calcularRecompensaEquipo({ etapas: [hecha(-3), hecha('x'), hecha(null), hecha('2')], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 2)
    assert.equal(resultado.recompensa, 2 * VALOR_HORA)
  })

  it('valor hora 0: se cumple pero la recompensa es 0', () => {
    const resultado = calcularRecompensaEquipo({ etapas: [hecha(4)], valorHora: 0 })
    assert.equal(resultado.cumplido, true)
    assert.equal(resultado.recompensa, 0)
    assert.ok(resultado.advertencias.some(texto => texto.includes('valor de la hora')))
  })
})
