// Tests de la lógica pura de la recompensa por equipo.
// Uso: npm test
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRecompensaEquipo, horasProducidas, sugerirObjetivoUnidades, sumarHoras } from './recompensa-equipo.js'

const VALOR_HORA = 2500
const PREMIO = 50
const silla = cantidad => ({ producto: 'Silla', cantidad, tiempo_estandar: 4 })

// Caso base del enunciado: 2 empleados × 8 hs, silla de 4 hs, objetivo 4 sillas (16 hs).
const dia = producciones => calcularRecompensaEquipo({
  horasTotales: sumarHoras([8, 8]),
  objetivoHoras: 4 * 4,
  producciones,
  valorHora: VALOR_HORA,
  porcentajePremio: PREMIO
})

describe('recompensa por equipo', () => {
  it('produce 4 sillas: justo en el objetivo, recompensa 0', () => {
    const resultado = dia([silla(4)])
    assert.equal(resultado.horas_totales, 16)
    assert.equal(resultado.objetivo_horas, 16)
    assert.equal(resultado.horas_producidas, 16)
    assert.equal(resultado.excedente_horas, 0)
    assert.equal(resultado.cumplido, true)
    assert.equal(resultado.supera, false)
    assert.equal(resultado.recompensa, 0)
  })

  it('produce 5 sillas: excedente 4 hs, recompensa = 4 × valor hora × % premio', () => {
    const resultado = dia([silla(5)])
    assert.equal(resultado.excedente_horas, 4)
    assert.equal(resultado.recompensa, 4 * VALOR_HORA * (PREMIO / 100))
  })

  it('produce 3 sillas: no llega al objetivo, recompensa 0', () => {
    const resultado = dia([silla(3)])
    assert.equal(resultado.excedente_horas, -4)
    assert.equal(resultado.cumplido, false)
    assert.equal(resultado.recompensa, 0)
  })

  it('empleados con horas distintas (8 y 4) suman 12 hs', () => {
    assert.equal(sumarHoras([{ horas: 8 }, { horas: 4 }]), 12)
    const resultado = calcularRecompensaEquipo({ horasTotales: sumarHoras([8, 4]), producciones: [silla(3)], valorHora: VALOR_HORA })
    assert.equal(resultado.horas_totales, 12)
    assert.equal(resultado.objetivo_horas, 12)
    assert.equal(sugerirObjetivoUnidades(12, 4), 3)
  })

  it('usa el objetivo fijado por el administrador en lugar del sugerido', () => {
    // Sugerido serían 16 hs (4 sillas); el admin lo baja a 3 sillas = 12 hs.
    const resultado = calcularRecompensaEquipo({ horasTotales: 16, objetivoHoras: 12, producciones: [silla(4)], valorHora: VALOR_HORA, porcentajePremio: 100 })
    assert.equal(resultado.objetivo_manual, true)
    assert.equal(resultado.objetivo_sugerido, 16)
    assert.equal(resultado.objetivo_horas, 12)
    assert.equal(resultado.excedente_horas, 4)
    assert.equal(resultado.recompensa, 4 * VALOR_HORA)
  })

  it('sin objetivo manual usa el sugerido (horas totales)', () => {
    const resultado = calcularRecompensaEquipo({ horasTotales: 16, objetivoHoras: null, producciones: [silla(5)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_manual, false)
    assert.equal(resultado.objetivo_horas, 16)
    assert.equal(resultado.recompensa, 4 * VALOR_HORA)
  })

  it('dos productos distintos el mismo día se convierten a horas estándar', () => {
    // 3 sillas (4 hs) + 2 mesas (6 hs) = 12 + 12 = 24 hs; objetivo 16 hs → excedente 8 hs.
    const resultado = calcularRecompensaEquipo({
      horasTotales: 16,
      producciones: [silla(3), { producto: 'Mesa', cantidad: 2, tiempo_estandar: 6 }],
      valorHora: VALOR_HORA,
      porcentajePremio: 100
    })
    assert.equal(resultado.horas_producidas, 24)
    assert.equal(resultado.excedente_horas, 8)
    assert.equal(resultado.recompensa, 8 * VALOR_HORA)
  })

  it('el % de premio por defecto es 100', () => {
    const resultado = calcularRecompensaEquipo({ horasTotales: 16, producciones: [silla(5)], valorHora: VALOR_HORA })
    assert.equal(resultado.porcentaje_premio, 100)
    assert.equal(resultado.recompensa, 4 * VALOR_HORA)
  })
})

describe('casos borde', () => {
  it('día sin horas cargadas y sin objetivo manual: objetivo 0, no paga', () => {
    const resultado = calcularRecompensaEquipo({ horasTotales: 0, producciones: [silla(5)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 0)
    assert.equal(resultado.recompensa, 0)
    assert.equal(resultado.excedente_horas, 0)
    assert.ok(resultado.advertencias.length >= 2)
  })

  it('objetivo fijado en 0: no paga ni divide por cero', () => {
    const resultado = calcularRecompensaEquipo({ horasTotales: 16, objetivoHoras: 0, producciones: [silla(5)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 0)
    assert.equal(resultado.recompensa, 0)
    assert.equal(resultado.cumplido, false)
  })

  it('producto sin tiempo estándar suma 0 horas y se informa', () => {
    const producido = horasProducidas([silla(2), { producto: 'Banco', cantidad: 3, tiempo_estandar: 0 }])
    assert.equal(producido.horas, 8)
    assert.deepEqual(producido.sinTiempoEstandar, ['Banco'])
    assert.equal(sugerirObjetivoUnidades(16, 0), null)
    assert.equal(sugerirObjetivoUnidades(16, null), null)
  })

  it('producción en cero: recompensa 0', () => {
    const resultado = dia([])
    assert.equal(resultado.horas_producidas, 0)
    assert.equal(resultado.recompensa, 0)
  })

  it('ignora horas negativas o inválidas', () => {
    assert.equal(sumarHoras([8, -3, 'x', null, undefined, '4']), 12)
  })

  it('valor hora 0: supera el objetivo pero la recompensa es 0', () => {
    const resultado = calcularRecompensaEquipo({ horasTotales: 16, producciones: [silla(5)], valorHora: 0 })
    assert.equal(resultado.supera, true)
    assert.equal(resultado.recompensa, 0)
  })
})
