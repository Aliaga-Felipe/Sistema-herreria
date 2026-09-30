// =====================================================================
// RECOMPENSA POR EQUIPO (funciones puras)
// Todo el taller trabaja como un único equipo: la recompensa se calcula
// sobre el resultado conjunto del día, nunca por empleado.
//
//   horas_totales      = Σ horas trabajadas por cada empleado ese día
//   objetivo (horas)   = el que fijó el admin, o por defecto las horas
//                        totales (16 hs ÷ silla de 4 hs = 4 sillas = 16 hs)
//   horas_producidas   = Σ (unidades × tiempo estándar del producto)
//   excedente          = horas_producidas − objetivo
//   recompensa         = excedente × valor hora-hombre × % premio
//                        (0 si no se supera el objetivo)
//
// Sin base de datos ni UI: las rutas (server/jornadas.js) leen los datos y
// llaman a estas funciones, y los tests las prueban de forma aislada.
// =====================================================================

const redondear = valor => Math.round((Number(valor) || 0) * 100) / 100
const positivo = valor => { const numero = Number(valor); return Number.isFinite(numero) && numero > 0 ? numero : 0 }

// Horas totales del día. Acepta números sueltos o filas { horas }; ignora
// valores vacíos, negativos o no numéricos.
export function sumarHoras(registros = []) {
  return redondear(registros.reduce((total, registro) => total + positivo(typeof registro === 'object' && registro !== null ? registro.horas : registro), 0))
}

// Objetivo sugerido en unidades de un producto: horas totales ÷ tiempo
// estándar. null cuando el producto no tiene tiempo estándar (evita la
// división por cero).
export function sugerirObjetivoUnidades(horasTotales, tiempoEstandar) {
  const tiempo = positivo(tiempoEstandar)
  if (!tiempo) return null
  return redondear(positivo(horasTotales) / tiempo)
}

// Horas estándar equivalentes a lo producido. Los productos sin tiempo
// estándar suman 0 horas y se devuelven aparte para avisarle al admin.
export function horasProducidas(producciones = []) {
  let horas = 0
  const sinTiempoEstandar = []
  for (const produccion of producciones) {
    const cantidad = positivo(produccion.cantidad)
    const tiempo = positivo(produccion.tiempo_estandar)
    if (cantidad && !tiempo) sinTiempoEstandar.push(produccion.producto ?? produccion.producto_id ?? null)
    horas += cantidad * tiempo
  }
  return { horas: redondear(horas), sinTiempoEstandar }
}

// Resultado completo del día.
//   horasTotales      Σ horas de los empleados
//   objetivoHoras     objetivo fijado por el admin (null/undefined = usar el sugerido)
//   producciones      [{ producto, cantidad, tiempo_estandar }]
//   valorHora         valor monetario de una hora-hombre
//   porcentajePremio  0 a 100 (100 = se paga todo el valor del excedente)
export function calcularRecompensaEquipo({ horasTotales = 0, objetivoHoras = null, producciones = [], valorHora = 0, porcentajePremio = 100 } = {}) {
  const totales = redondear(positivo(horasTotales))
  const manual = objetivoHoras !== null && objetivoHoras !== undefined && objetivoHoras !== '' && Number.isFinite(Number(objetivoHoras))
  const objetivo = manual ? redondear(Math.max(0, Number(objetivoHoras))) : totales
  const producido = horasProducidas(producciones)
  const valor = positivo(valorHora)
  const porcentaje = positivo(porcentajePremio)

  const advertencias = []
  if (!totales) advertencias.push('No hay horas trabajadas cargadas para este día.')
  if (!objetivo) advertencias.push('El objetivo del día es 0: no se paga recompensa hasta cargar horas o fijar un objetivo.')
  if (producido.sinTiempoEstandar.length) advertencias.push(`Productos sin tiempo estándar (no suman horas): ${producido.sinTiempoEstandar.join(', ')}.`)
  if (!valor) advertencias.push('El valor de la hora-hombre es 0.')

  // Con objetivo 0 no hay contra qué medir: nunca se paga (si no, un día
  // sin horas cargadas pagaría toda la producción como excedente).
  const excedente = objetivo > 0 ? redondear(producido.horas - objetivo) : 0
  const supera = objetivo > 0 && excedente > 0
  const recompensa = supera ? redondear(excedente * valor * (porcentaje / 100)) : 0

  return {
    horas_totales: totales,
    objetivo_horas: objetivo,
    objetivo_sugerido: totales,
    objetivo_manual: manual,
    horas_producidas: producido.horas,
    excedente_horas: excedente,
    cumplido: objetivo > 0 && producido.horas >= objetivo,
    supera,
    valor_hora: redondear(valor),
    porcentaje_premio: redondear(porcentaje),
    recompensa,
    productos_sin_tiempo_estandar: producido.sinTiempoEstandar,
    advertencias
  }
}
