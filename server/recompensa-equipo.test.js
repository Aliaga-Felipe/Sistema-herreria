// Tests de la lógica pura de la recompensa por equipo.
// Uso: npm test
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRecompensaEquipo, horasProducidas, objetivoEquipo } from './recompensa-equipo.js'

const VALOR_HORA = 2500
const PREMIO = 50
const silla = cantidad => ({ producto: 'Silla', cantidad, tiempo_estandar: 4 })
const mesa = cantidad => ({ producto: 'Mesa', cantidad, tiempo_estandar: 6 })

// Caso base: silla de 4 hs, objetivo diario de 4 sillas (cargado en
// Producción diaria) = 16 hs-hombre.
const dia = producciones => calcularRecompensaEquipo({
  objetivos: [silla(4)],
  producciones,
  valorHora: VALOR_HORA,
  porcentajePremio: PREMIO
})

describe('recompensa por equipo', () => {
  it('produce 4 sillas: completa el objetivo y cobra el objetivo completo', () => {
    const resultado = dia([silla(4)])
    assert.equal(resultado.objetivo_horas, 16)
    assert.equal(resultado.horas_producidas, 16)
    assert.equal(resultado.cumplido, true)
    assert.equal(resultado.recompensa, 16 * VALOR_HORA * (PREMIO / 100))
  })

  it('produce 5 sillas: cobra lo mismo que al cumplir (no paga de más)', () => {
    const resultado = dia([silla(5)])
    assert.equal(resultado.excedente_horas, 4)
    assert.equal(resultado.cumplido, true)
    assert.equal(resultado.recompensa, 16 * VALOR_HORA * (PREMIO / 100))
  })

  it('produce 3 sillas: no completa el objetivo, recompensa 0', () => {
    const resultado = dia([silla(3)])
    assert.equal(resultado.excedente_horas, -4)
    assert.equal(resultado.cumplido, false)
    assert.equal(resultado.recompensa, 0)
  })

  it('usa el objetivo de producción que definió el administrador', () => {
    // El admin cargó 3 sillas en Producción diaria (12 hs).
    const resultado = calcularRecompensaEquipo({ objetivos: [silla(3)], producciones: [silla(3)], valorHora: VALOR_HORA, porcentajePremio: 100 })
    assert.equal(resultado.objetivo_horas, 12)
    assert.equal(resultado.recompensa, 12 * VALOR_HORA)
  })

  it('un día cerrado conserva el objetivo guardado aunque cambien los objetivos', () => {
    const resultado = calcularRecompensaEquipo({ objetivos: [silla(10)], objetivoHoras: 16, producciones: [silla(4)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 16)
    assert.equal(resultado.recompensa, 16 * VALOR_HORA)
  })

  it('dos productos distintos el mismo día se convierten a horas-hombre', () => {
    // Objetivos: 2 sillas (8 hs) + 1 mesa (6 hs) = 14 hs.
    assert.equal(objetivoEquipo([silla(2), mesa(1)]).horas, 14)
    const cumple = calcularRecompensaEquipo({ objetivos: [silla(2), mesa(1)], producciones: [silla(2), mesa(1)], valorHora: VALOR_HORA })
    assert.equal(cumple.horas_producidas, 14)
    assert.equal(cumple.recompensa, 14 * VALOR_HORA)
    // Falta la mesa: 8 hs de 14, no cobra.
    const noCumple = calcularRecompensaEquipo({ objetivos: [silla(2), mesa(1)], producciones: [silla(2)], valorHora: VALOR_HORA })
    assert.equal(noCumple.cumplido, false)
    assert.equal(noCumple.recompensa, 0)
  })

  it('producir un producto sin objetivo propio también suma horas', () => {
    // Objetivo 4 sillas (16 hs); se hacen 3 sillas (12 hs) + 1 mesa (6 hs) = 18 hs → cumple.
    const resultado = calcularRecompensaEquipo({ objetivos: [silla(4)], producciones: [silla(3), mesa(1)], valorHora: VALOR_HORA })
    assert.equal(resultado.cumplido, true)
    assert.equal(resultado.recompensa, 16 * VALOR_HORA)
  })

  it('el % de premio por defecto es 100', () => {
    const resultado = calcularRecompensaEquipo({ objetivos: [silla(4)], producciones: [silla(4)], valorHora: VALOR_HORA })
    assert.equal(resultado.porcentaje_premio, 100)
    assert.equal(resultado.recompensa, 16 * VALOR_HORA)
  })
})

describe('casos borde', () => {
  it('sin objetivos de producción: objetivo 0, no paga', () => {
    const resultado = calcularRecompensaEquipo({ objetivos: [], producciones: [silla(5)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 0)
    assert.equal(resultado.cumplido, false)
    assert.equal(resultado.recompensa, 0)
    assert.ok(resultado.advertencias.some(texto => texto.includes('Producción diaria')))
  })

  it('objetivo guardado en 0: no paga ni divide por cero', () => {
    const resultado = calcularRecompensaEquipo({ objetivoHoras: 0, producciones: [silla(5)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 0)
    assert.equal(resultado.recompensa, 0)
    assert.equal(resultado.cumplido, false)
  })

  it('producto sin horas-hombre suma 0 horas y se informa', () => {
    const producido = horasProducidas([silla(2), { producto: 'Banco', cantidad: 3, tiempo_estandar: 0 }])
    assert.equal(producido.horas, 8)
    assert.deepEqual(producido.sinTiempoEstandar, ['Banco'])
  })

  it('objetivo de un producto sin horas-hombre no suma y se avisa', () => {
    const resultado = calcularRecompensaEquipo({ objetivos: [{ producto: 'Banco', cantidad: 3, tiempo_estandar: 0 }], producciones: [silla(1)], valorHora: VALOR_HORA })
    assert.equal(resultado.objetivo_horas, 0)
    assert.equal(resultado.recompensa, 0)
    assert.ok(resultado.advertencias.some(texto => texto.includes('Banco')))
  })

  it('producción en cero: recompensa 0', () => {
    const resultado = dia([])
    assert.equal(resultado.horas_producidas, 0)
    assert.equal(resultado.recompensa, 0)
  })

  it('ignora cantidades negativas o inválidas', () => {
    assert.equal(horasProducidas([silla(-3), silla('x'), silla(null), silla('2')]).horas, 8)
  })

  it('valor hora 0: cumple el objetivo pero la recompensa es 0', () => {
    const resultado = calcularRecompensaEquipo({ objetivos: [silla(4)], producciones: [silla(4)], valorHora: 0 })
    assert.equal(resultado.cumplido, true)
    assert.equal(resultado.recompensa, 0)
  })
})
