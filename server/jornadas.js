import { pool } from './db.js'
import { calcularRecompensaEquipo } from './recompensa-equipo.js'

// =====================================================================
// JORNADAS DEL EQUIPO (lectura y guardado)
// Junta los datos de un día (producción, objetivos diarios por producto y
// parámetros vigentes en esa fecha), los pasa por la lógica pura de
// recompensa-equipo.js y guarda una copia en jornadas_equipo.
//
// El objetivo del día sale de los objetivos diarios por producto que el
// admin define en Producción diaria (objetivos_produccion). Hoy y días
// futuros usan los objetivos vigentes; un día pasado que ya tiene su
// jornada guardada conserva el objetivo con el que se cerró, así que
// editar un objetivo no reescribe días anteriores.
//
// guardarJornada() se llama cada vez que cambia algo del día (producción
// u objetivos). El valor hora sale del historial por fecha y cada
// registro de producción tiene su propia copia de las horas-hombre.
// =====================================================================

// Fecha local del servidor (no UTC: a la noche en Argentina UTC ya es el día siguiente).
export const fechaDeHoy = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

export const validarFechaDia = valor => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) ? valor : null)

// Valor hora y % premio vigentes en una fecha (último cambio con
// vigente_desde <= fecha). Sin historial: 0 y 100%.
export async function parametrosVigentes(db, fecha) {
  const { rows } = await db.query(
    `SELECT valor_hora::float8 AS valor_hora, porcentaje_premio::float8 AS porcentaje_premio, vigente_desde
     FROM parametros_recompensa_historial WHERE vigente_desde <= $1::date ORDER BY vigente_desde DESC, id DESC LIMIT 1`, [fecha])
  return rows[0] || { valor_hora: 0, porcentaje_premio: 100, vigente_desde: null }
}

// Objetivos diarios activos por producto, con las horas-hombre actuales.
const objetivosVigentes = async db => (await db.query(
  `SELECT o.producto_id, p.nombre AS producto, o.cantidad_objetivo AS cantidad, p.horas_hombre::float8 AS tiempo_estandar
   FROM objetivos_produccion o JOIN productos p ON p.id = o.producto_id
   WHERE o.tipo = 'producto' AND o.activo AND NOT p.eliminado ORDER BY p.nombre`)).rows

async function datosDelDia(db, fecha) {
  const producciones = (await db.query(
    `SELECT r.producto_id, p.nombre AS producto, r.cantidad_producida AS cantidad,
       COALESCE(r.tiempo_estandar, p.horas_hombre)::float8 AS tiempo_estandar
     FROM registros_produccion r JOIN productos p ON p.id = r.producto_id WHERE r.fecha = $1::date ORDER BY p.nombre`, [fecha])).rows
  const guardada = (await db.query(
    `SELECT objetivo_horas::float8 AS objetivo_horas, objetivo_detalle FROM jornadas_equipo WHERE fecha = $1::date`, [fecha])).rows[0]
  const parametros = await parametrosVigentes(db, fecha)

  // Día pasado ya guardado: queda con su objetivo. Si no, objetivos vigentes.
  const cerrado = Boolean(guardada) && fecha < fechaDeHoy()
  const objetivos = cerrado ? (guardada.objetivo_detalle || []) : await objetivosVigentes(db)
  return { producciones, objetivos, objetivoGuardado: cerrado ? guardada.objetivo_horas : null, parametros }
}

const armarResultado = (fecha, { producciones, objetivos, objetivoGuardado, parametros }) => {
  const resultado = calcularRecompensaEquipo({
    objetivos,
    objetivoHoras: objetivoGuardado,
    producciones,
    valorHora: parametros.valor_hora,
    porcentajePremio: parametros.porcentaje_premio
  })
  const conHoras = fila => ({ ...fila, horas_equivalentes: Math.round((Number(fila.cantidad) || 0) * (Number(fila.tiempo_estandar) || 0) * 100) / 100 })
  return {
    fecha,
    ...resultado,
    objetivo_congelado: objetivoGuardado !== null,
    objetivos: objetivos.map(conHoras),
    produccion: producciones.map(conHoras)
  }
}

// Desglose del día sin escribir nada (GET).
export async function obtenerJornada(fecha, db = pool) {
  return armarResultado(fecha, await datosDelDia(db, fecha))
}

// Recalcula el día y guarda la copia, incluido el detalle del objetivo.
export async function guardarJornada(db, fecha) {
  const resultado = armarResultado(fecha, await datosDelDia(db, fecha))
  const detalle = resultado.objetivos.map(({ producto_id, producto, cantidad, tiempo_estandar }) => ({ producto_id, producto, cantidad, tiempo_estandar }))
  await db.query(
    `INSERT INTO jornadas_equipo (fecha, objetivo_horas, objetivo_detalle, horas_producidas, excedente_horas,
       valor_hora, porcentaje_premio, recompensa, calculado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (fecha) DO UPDATE SET objetivo_horas = EXCLUDED.objetivo_horas,
       objetivo_detalle = EXCLUDED.objetivo_detalle, horas_producidas = EXCLUDED.horas_producidas, excedente_horas = EXCLUDED.excedente_horas,
       valor_hora = EXCLUDED.valor_hora, porcentaje_premio = EXCLUDED.porcentaje_premio, recompensa = EXCLUDED.recompensa, calculado_en = NOW()`,
    [fecha, resultado.objetivo_horas, JSON.stringify(detalle), resultado.horas_producidas,
      resultado.excedente_horas, resultado.valor_hora, resultado.porcentaje_premio, resultado.recompensa])
  return resultado
}

// Tras cambiar un objetivo diario o las horas-hombre de un producto: se
// recalcula la jornada de hoy (si ya existe) para que el historial quede al día.
export async function refrescarHoy(db = pool) {
  const hoy = fechaDeHoy()
  const existe = (await db.query('SELECT 1 FROM jornadas_equipo WHERE fecha = $1', [hoy])).rows[0]
  if (existe) await guardarJornada(db, hoy)
}
