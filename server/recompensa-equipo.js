// =====================================================================
// RECOMPENSA POR EQUIPO (funciones puras)
// Todo el taller trabaja como un único equipo: la recompensa se paga por
// completar la producción propuesta para el día, nunca por empleado.
//
// La producción diaria es una lista de etapas de pedidos, cada una con
// las horas-hombre que el admin estimó al crear el pedido:
//
//   objetivo (horas)   = Σ horas-hombre de las etapas propuestas
//   horas_completadas  = Σ horas-hombre de las que ya están completadas
//   cumplido           = todas las etapas propuestas están completadas
//   recompensa         = objetivo × valor hora-hombre × % premio
//                        (0 si queda alguna etapa sin completar)
//
// Sin base de datos ni UI: server/jornadas.js lee los datos y llama a
// estas funciones, y los tests las prueban de forma aislada.
// =====================================================================

export const redondear = valor => Math.round((Number(valor) || 0) * 100) / 100
const positivo = valor => { const numero = Number(valor); return Number.isFinite(numero) && numero > 0 ? numero : 0 }

// Margen para comparar horas con decimales (0,01 h ≈ 36 segundos).
const TOLERANCIA_HORAS = 0.01

// ¿Las etapas de un producto reparten exactamente sus horas-hombre
// estimadas? Devuelve la suma y la diferencia (positiva = faltan horas
// por repartir, negativa = las etapas se pasan de la estimación).
export function validarRepartoHoras(horasEstimadas, horasEtapas = []) {
  const estimadas = redondear(positivo(horasEstimadas))
  const suma = redondear(horasEtapas.reduce((total, horas) => total + positivo(horas), 0))
  const diferencia = redondear(estimadas - suma)
  return { estimadas, suma, diferencia, coincide: estimadas > 0 && Math.abs(diferencia) < TOLERANCIA_HORAS }
}

// Resultado de una producción diaria.
//   etapas            [{ horas_hombre, estado, responsable_id? }]
//   valorHora         valor monetario de una hora-hombre
//   porcentajePremio  0 a 100 (100 = se paga todo el valor del objetivo)
export function calcularRecompensaEquipo({ etapas = [], valorHora = 0, porcentajePremio = 100 } = {}) {
  const completadas = etapas.filter(etapa => etapa.estado === 'COMPLETADA')
  const objetivo = redondear(etapas.reduce((total, etapa) => total + positivo(etapa.horas_hombre), 0))
  const hechas = redondear(completadas.reduce((total, etapa) => total + positivo(etapa.horas_hombre), 0))
  const valor = positivo(valorHora)
  const porcentaje = positivo(porcentajePremio)
  const sinAsignar = etapas.filter(etapa => etapa.estado !== 'COMPLETADA' && !etapa.responsable_id).length

  const advertencias = []
  if (!etapas.length) advertencias.push('No hay etapas propuestas para este día: agregá pedidos, productos o etapas en Producción diaria.')
  else if (!objetivo) advertencias.push('Las etapas propuestas no tienen horas-hombre estimadas: la recompensa sería 0.')
  if (sinAsignar) advertencias.push(`${sinAsignar === 1 ? 'Hay 1 etapa propuesta' : `Hay ${sinAsignar} etapas propuestas`} sin empleado asignado: nadie la va a ver en Mis tareas.`)
  if (!valor) advertencias.push('El valor de la hora-hombre es 0.')

  // Sin etapas no hay nada que completar: nunca se paga.
  const cumplido = etapas.length > 0 && completadas.length === etapas.length
  const recompensaAlCumplir = redondear(objetivo * valor * (porcentaje / 100))

  return {
    objetivo_horas: objetivo,
    horas_completadas: hechas,
    horas_pendientes: redondear(objetivo - hechas),
    etapas_totales: etapas.length,
    etapas_completadas: completadas.length,
    avance: objetivo > 0 ? Math.round((100 * hechas) / objetivo) : 0,
    cumplido,
    valor_hora: redondear(valor),
    porcentaje_premio: redondear(porcentaje),
    recompensa_al_cumplir: recompensaAlCumplir,
    recompensa: cumplido ? recompensaAlCumplir : 0,
    advertencias
  }
}
