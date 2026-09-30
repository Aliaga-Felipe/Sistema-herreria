import { pool } from './db.js'
import { calcularRecompensaEquipo, sugerirObjetivoUnidades } from './recompensa-equipo.js'

// =====================================================================
// JORNADAS DEL EQUIPO (lectura y guardado)
// Junta los datos de un día (horas de los empleados, producción, objetivo
// y parámetros vigentes en esa fecha), los pasa por la lógica pura de
// recompensa-equipo.js y guarda una copia en jornadas_equipo.
//
// guardarJornada() se llama cada vez que cambia algo de ese día (horas,
// producción u objetivo). Los días que nadie toca conservan su resultado,
// y cambiar el valor hora o las horas-hombre de un producto no los
// recalcula: el valor sale del historial por fecha y cada registro de
// producción tiene su propia copia del tiempo estándar.
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

async function datosDelDia(db, fecha) {
  const horas = (await db.query(
    `SELECT h.usuario_id, u.nombre, h.horas::float8 AS horas FROM horas_trabajadas h JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.fecha = $1::date ORDER BY u.nombre`, [fecha])).rows
  const producciones = (await db.query(
    `SELECT r.producto_id, p.nombre AS producto, r.cantidad_producida AS cantidad,
       COALESCE(r.tiempo_estandar, p.horas_hombre)::float8 AS tiempo_estandar
     FROM registros_produccion r JOIN productos p ON p.id = r.producto_id WHERE r.fecha = $1::date ORDER BY p.nombre`, [fecha])).rows
  const jornada = (await db.query(
    `SELECT objetivo_horas::float8 AS objetivo_horas, objetivo_manual FROM jornadas_equipo WHERE fecha = $1::date`, [fecha])).rows[0]
  const parametros = await parametrosVigentes(db, fecha)
  return { horas, producciones, jornada, parametros }
}

const armarResultado = (fecha, { horas, producciones, jornada, parametros }) => {
  const resultado = calcularRecompensaEquipo({
    horasTotales: horas.reduce((total, fila) => total + fila.horas, 0),
    objetivoHoras: jornada?.objetivo_manual ? jornada.objetivo_horas : null,
    producciones,
    valorHora: parametros.valor_hora,
    porcentajePremio: parametros.porcentaje_premio
  })
  return {
    fecha,
    ...resultado,
    empleados: horas,
    produccion: producciones.map(fila => ({
      ...fila,
      horas_equivalentes: Math.round(fila.cantidad * (fila.tiempo_estandar || 0) * 100) / 100,
      // Cuántas unidades de este producto equivale el objetivo del día (null si no tiene tiempo estándar).
      objetivo_unidades: sugerirObjetivoUnidades(resultado.objetivo_horas, fila.tiempo_estandar)
    }))
  }
}

// Desglose del día sin escribir nada (GET).
export async function obtenerJornada(fecha, db = pool) {
  return armarResultado(fecha, await datosDelDia(db, fecha))
}

// Recalcula el día y guarda la copia. `objetivo` (opcional) cambia el
// objetivo antes de calcular: { horas, definidoPor } lo fija a mano y
// { automatico: true } vuelve al sugerido.
export async function guardarJornada(db, fecha, objetivo = null) {
  if (objetivo) {
    const manual = !objetivo.automatico
    await db.query(
      `INSERT INTO jornadas_equipo (fecha, objetivo_horas, objetivo_manual, objetivo_definido_por) VALUES ($1, $2, $3, $4)
       ON CONFLICT (fecha) DO UPDATE SET objetivo_horas = EXCLUDED.objetivo_horas, objetivo_manual = EXCLUDED.objetivo_manual,
         objetivo_definido_por = EXCLUDED.objetivo_definido_por`,
      [fecha, manual ? objetivo.horas : 0, manual, objetivo.definidoPor || null])
  }

  const resultado = armarResultado(fecha, await datosDelDia(db, fecha))
  await db.query(
    `INSERT INTO jornadas_equipo (fecha, horas_totales, objetivo_horas, objetivo_manual, horas_producidas, excedente_horas,
       valor_hora, porcentaje_premio, recompensa, calculado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (fecha) DO UPDATE SET horas_totales = EXCLUDED.horas_totales, objetivo_horas = EXCLUDED.objetivo_horas,
       objetivo_manual = EXCLUDED.objetivo_manual, horas_producidas = EXCLUDED.horas_producidas, excedente_horas = EXCLUDED.excedente_horas,
       valor_hora = EXCLUDED.valor_hora, porcentaje_premio = EXCLUDED.porcentaje_premio, recompensa = EXCLUDED.recompensa, calculado_en = NOW()`,
    [fecha, resultado.horas_totales, resultado.objetivo_horas, resultado.objetivo_manual, resultado.horas_producidas,
      resultado.excedente_horas, resultado.valor_hora, resultado.porcentaje_premio, resultado.recompensa])
  return resultado
}
