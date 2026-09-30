// =====================================================================
// RECOMPENSA POR EQUIPO (funciones puras)
// Todo el taller trabaja como un único equipo: la recompensa se paga por
// completar la producción propuesta para el día, nunca por empleado.
//
//   objetivo (horas)   = Σ (cantidad objetivo × horas-hombre) de cada
//                        producto con objetivo diario activo (se definen en
//                        Producción diaria; ej. 4 sillas de 4 hs = 16 hs)
//   horas_producidas   = Σ (unidades × horas-hombre del producto)
//   cumplido           = horas_producidas >= objetivo
//   recompensa         = objetivo × valor hora-hombre × % premio
//                        (0 si no se completa el objetivo)
//
// Producir de más no aumenta la recompensa: se paga el objetivo completo.
//
// Sin base de datos ni UI: las rutas (server/jornadas.js) leen los datos y
// llaman a estas funciones, y los tests las prueban de forma aislada.
// =====================================================================

const redondear = valor => Math.round((Number(valor) || 0) * 100) / 100
const positivo = valor => { const numero = Number(valor); return Number.isFinite(numero) && numero > 0 ? numero : 0 }

// Convierte una lista { producto, cantidad, tiempo_estandar } a horas
// estándar. Sirve tanto para lo producido como para los objetivos. Los
// productos sin tiempo estándar suman 0 horas y se devuelven aparte.
export function horasProducidas(lista = []) {
  let horas = 0
  const sinTiempoEstandar = []
  for (const fila of lista) {
    const cantidad = positivo(fila.cantidad)
    const tiempo = positivo(fila.tiempo_estandar)
    if (cantidad && !tiempo) sinTiempoEstandar.push(fila.producto ?? fila.producto_id ?? null)
    horas += cantidad * tiempo
  }
  return { horas: redondear(horas), sinTiempoEstandar }
}

// Objetivo del equipo a partir de los objetivos diarios por producto.
export const objetivoEquipo = (objetivos = []) => horasProducidas(objetivos)

// Resultado completo del día.
//   objetivos         objetivos diarios por producto [{ producto, cantidad, tiempo_estandar }]
//   objetivoHoras     objetivo ya guardado para el día (días cerrados); si viene, reemplaza al calculado con `objetivos`
//   producciones      [{ producto, cantidad, tiempo_estandar }]
//   valorHora         valor monetario de una hora-hombre
//   porcentajePremio  0 a 100 (100 = se paga todo el valor del objetivo)
export function calcularRecompensaEquipo({ objetivos = [], objetivoHoras = null, producciones = [], valorHora = 0, porcentajePremio = 100 } = {}) {
  const desdeObjetivos = objetivoEquipo(objetivos)
  const guardado = objetivoHoras !== null && objetivoHoras !== undefined && objetivoHoras !== '' && Number.isFinite(Number(objetivoHoras))
  const objetivo = guardado ? redondear(Math.max(0, Number(objetivoHoras))) : desdeObjetivos.horas
  const producido = horasProducidas(producciones)
  const valor = positivo(valorHora)
  const porcentaje = positivo(porcentajePremio)

  const advertencias = []
  if (!objetivo) advertencias.push('El objetivo del día es 0: definí objetivos diarios por producto en Producción diaria. Sin objetivo no se paga recompensa.')
  if (!guardado && desdeObjetivos.sinTiempoEstandar.length) advertencias.push(`Productos con objetivo pero sin horas-hombre (no suman al objetivo): ${desdeObjetivos.sinTiempoEstandar.join(', ')}.`)
  if (producido.sinTiempoEstandar.length) advertencias.push(`Productos sin horas-hombre (no suman horas producidas): ${producido.sinTiempoEstandar.join(', ')}.`)
  if (!valor) advertencias.push('El valor de la hora-hombre es 0.')

  // Con objetivo 0 no hay nada que completar: nunca se paga.
  const cumplido = objetivo > 0 && producido.horas >= objetivo
  const recompensa = cumplido ? redondear(objetivo * valor * (porcentaje / 100)) : 0

  return {
    objetivo_horas: objetivo,
    horas_producidas: producido.horas,
    // Diferencia contra el objetivo (informativa: negativa = lo que faltó).
    excedente_horas: objetivo > 0 ? redondear(producido.horas - objetivo) : 0,
    cumplido,
    valor_hora: redondear(valor),
    porcentaje_premio: redondear(porcentaje),
    recompensa,
    productos_sin_tiempo_estandar: producido.sinTiempoEstandar,
    advertencias
  }
}
