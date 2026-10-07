import { pool } from './db.js'
import { empleadosEtapaSql, fallo, nombresEtapaSql } from './comun.js'
import { calcularRecompensaEquipo, redondear } from './recompensa-equipo.js'

// =====================================================================
// PRODUCCIÓN DIARIA (jornadas del equipo)
// Una jornada por fecha. Es la lista de etapas de pedidos propuestas para
// ese día (jornada_etapas): el admin puede proponer un pedido completo, un
// producto de un pedido o etapas sueltas; todo se guarda etapa por etapa.
//
//   ABIERTA    el día está en curso: el resultado se calcula en vivo con
//              el estado actual de cada etapa y el valor hora vigente en
//              esa fecha (ver calcularRecompensaEquipo).
//   TERMINADA  el admin verificó el trabajo y cerró el día: se guarda una
//              copia (objetivo_detalle y totales) que ya no cambia aunque
//              después se editen o se borren las etapas o el pedido.
//
// Si al terminar están completadas todas las etapas propuestas, el equipo
// cobra Σ horas-hombre estimadas × valor hora × % premio; si falta alguna,
// la recompensa del día es 0. Una etapa pendiente solo puede estar en una
// jornada ABIERTA a la vez, para no contarla dos veces.
//
// Los días del modelo anterior (objetivos diarios por producto) quedaron
// como TERMINADOS con su copia: se muestran como historial.
// =====================================================================

// Fecha local del servidor (no UTC: a la noche en Argentina UTC ya es el día siguiente).
export const fechaDeHoy = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

export const validarFechaDia = valor => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) ? valor : null)

// "2026-10-05" → "05/10/2026" para los mensajes de error.
const fechaLegible = texto => String(texto).slice(0, 10).split('-').reverse().join('/')

// Valor hora y % premio vigentes en una fecha (último cambio con
// vigente_desde <= fecha). Sin historial: 0 y 100%.
export async function parametrosVigentes(db, fecha) {
  const { rows } = await db.query(
    `SELECT valor_hora::float8 AS valor_hora, porcentaje_premio::float8 AS porcentaje_premio, vigente_desde
     FROM parametros_recompensa_historial WHERE vigente_desde <= $1::date ORDER BY vigente_desde DESC, id DESC LIMIT 1`, [fecha])
  return rows[0] || { valor_hora: 0, porcentaje_premio: 100, vigente_desde: null }
}

const leerJornada = async (db, fecha, bloquear = false) => (await db.query(
  `SELECT j.fecha::text AS fecha, j.estado, j.cumplido, j.objetivo_horas::float8 AS objetivo_horas, j.objetivo_detalle,
     j.horas_producidas::float8 AS horas_producidas, j.valor_hora::float8 AS valor_hora, j.porcentaje_premio::float8 AS porcentaje_premio,
     j.recompensa::float8 AS recompensa, j.terminada_en, u.nombre AS terminada_por
   FROM jornadas_equipo j LEFT JOIN usuarios u ON u.id = j.terminada_por
   WHERE j.fecha = $1::date${bloquear ? ' FOR UPDATE OF j' : ''}`, [fecha])).rows[0] || null

// Etapas propuestas para un día, con su pedido, producto y empleados
// ("empleados" [{ id, nombre }], "responsable" sus nombres separados por
// coma y "empleados_necesarios"). Es también la forma en que se guardan en
// la copia de un día terminado (las copias anteriores solo tienen
// "responsable", con un único nombre).
async function etapasDeJornada(db, fecha) {
  const { rows } = await db.query(
    `SELECT e.id, e.nombre, e.orden, e.estado::text AS estado, e.horas_hombre::float8 AS horas_hombre,
       e.responsable_id, ${nombresEtapaSql('e')} AS responsable, ${empleadosEtapaSql('e')} AS empleados,
       e.empleados_necesarios, e.iniciado_en, e.completado_en, e.observaciones,
       e.pedido_id, p.codigo AS pedido, p.estado::text AS pedido_estado, p.prioridad,
       e.pedido_item_id, i.producto_id, pr.nombre AS producto, i.cantidad
     FROM jornada_etapas je
     JOIN pedido_etapas e ON e.id = je.pedido_etapa_id
     JOIN pedidos p ON p.id = e.pedido_id
     LEFT JOIN pedido_items i ON i.id = e.pedido_item_id
     LEFT JOIN productos pr ON pr.id = i.producto_id
     WHERE je.fecha = $1::date
     ORDER BY p.prioridad DESC, p.codigo, e.pedido_item_id, e.orden, e.id`, [fecha])
  return rows
}

// Día terminado: se devuelve la copia guardada al cerrarlo. Los días del
// modelo anterior guardaban objetivos por producto (sin etapas): se
// devuelven aparte, junto con lo que se registró como producido ese día.
async function desdeCopia(db, jornada) {
  const detalle = Array.isArray(jornada.objetivo_detalle) ? jornada.objetivo_detalle : []
  // Un día terminado con este modelo siempre tiene etapas (cada una con su id).
  const anterior = !detalle.length || detalle.every(fila => fila.id === undefined)
  const etapas = anterior ? [] : detalle
  const objetivo = redondear(jornada.objetivo_horas)
  const completadas = redondear(jornada.horas_producidas)
  const conHoras = fila => ({ ...fila, horas: redondear((Number(fila.cantidad) || 0) * (Number(fila.tiempo_estandar) || 0)) })
  const produccionAnterior = anterior
    ? (await db.query(
      `SELECT r.producto_id, p.nombre AS producto, r.cantidad_producida AS cantidad, COALESCE(r.tiempo_estandar, p.horas_hombre)::float8 AS tiempo_estandar
       FROM registros_produccion r JOIN productos p ON p.id = r.producto_id WHERE r.fecha = $1::date ORDER BY p.nombre`, [jornada.fecha])).rows.map(conHoras)
    : []
  return {
    fecha: jornada.fecha,
    estado: 'TERMINADA',
    modelo: anterior ? 'productos' : 'etapas',
    objetivo_horas: objetivo,
    horas_completadas: completadas,
    horas_pendientes: redondear(Math.max(0, objetivo - completadas)),
    etapas_totales: etapas.length,
    etapas_completadas: etapas.filter(etapa => etapa.estado === 'COMPLETADA').length,
    avance: objetivo > 0 ? Math.min(100, Math.round((100 * completadas) / objetivo)) : 0,
    cumplido: Boolean(jornada.cumplido),
    valor_hora: redondear(jornada.valor_hora),
    porcentaje_premio: redondear(jornada.porcentaje_premio),
    recompensa_al_cumplir: redondear(objetivo * jornada.valor_hora * (jornada.porcentaje_premio / 100)),
    recompensa: redondear(jornada.recompensa),
    advertencias: [],
    etapas,
    objetivos_anteriores: anterior ? detalle.map(conHoras) : [],
    produccion_anterior: produccionAnterior,
    terminada_en: jornada.terminada_en,
    terminada_por: jornada.terminada_por
  }
}

// Desglose de un día (sin escribir nada).
export async function obtenerJornada(fecha, db = pool) {
  const jornada = await leerJornada(db, fecha)
  if (jornada?.estado === 'TERMINADA') return desdeCopia(db, jornada)
  const etapas = jornada ? await etapasDeJornada(db, fecha) : []
  const parametros = await parametrosVigentes(db, fecha)
  return {
    fecha,
    estado: jornada ? 'ABIERTA' : 'SIN_PLANIFICAR',
    modelo: 'etapas',
    ...calcularRecompensaEquipo({ etapas, valorHora: parametros.valor_hora, porcentajePremio: parametros.porcentaje_premio }),
    etapas,
    objetivos_anteriores: [],
    produccion_anterior: [],
    terminada_en: null,
    terminada_por: null
  }
}

// Historial de días, del más nuevo al más viejo (los abiertos, calculados
// en vivo). `limite` null = sin límite (lo usan las estadísticas).
export async function listarJornadas({ desde = null, hasta = null, limite = 366 } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT j.fecha::text AS fecha, j.estado, j.cumplido, j.objetivo_horas::float8 AS objetivo_horas,
       j.horas_producidas::float8 AS horas_completadas, j.valor_hora::float8 AS valor_hora,
       j.porcentaje_premio::float8 AS porcentaje_premio, j.recompensa::float8 AS recompensa, j.terminada_en
     FROM jornadas_equipo j
     WHERE ($1::date IS NULL OR j.fecha >= $1::date) AND ($2::date IS NULL OR j.fecha <= $2::date)
     ORDER BY j.fecha DESC LIMIT $3`, [desde, hasta, limite])
  return Promise.all(rows.map(async fila => {
    if (fila.estado !== 'ABIERTA') return fila
    const vivo = await obtenerJornada(fila.fecha, db)
    return {
      ...fila,
      cumplido: vivo.cumplido,
      objetivo_horas: vivo.objetivo_horas,
      horas_completadas: vivo.horas_completadas,
      valor_hora: vivo.valor_hora,
      porcentaje_premio: vivo.porcentaje_premio,
      recompensa: 0,
      recompensa_al_cumplir: vivo.recompensa_al_cumplir
    }
  }))
}

// Abre (si hace falta) la jornada de una fecha y la devuelve bloqueada.
async function jornadaEditable(db, fecha, usuarioId) {
  await db.query(
    `INSERT INTO jornadas_equipo (fecha, estado, creado_por) VALUES ($1::date, 'ABIERTA', $2) ON CONFLICT (fecha) DO NOTHING`,
    [fecha, usuarioId])
  const jornada = await leerJornada(db, fecha, true)
  if (jornada.estado === 'TERMINADA') throw fallo(`La producción del ${fechaLegible(fecha)} ya está terminada. Reabrila para cambiarla.`)
  return jornada
}

const motivosOmision = {
  completada: 'ya está completada',
  pedido: 'el pedido no está en curso (terminado, pausado o cancelado)',
  repetida: 'ya está en la producción de este día'
}

// Agrega trabajo a la producción de un día. `seleccion` indica qué:
//   { pedido_id }        todas las etapas pendientes del pedido
//   { pedido_item_id }   todas las etapas pendientes de un producto del pedido
//   { etapas: [ids] }    etapas sueltas
// Se omiten (y se informa por qué) las completadas, las de pedidos que no
// están en curso, las que ya están en el día y las que ya están propuestas
// en otra producción abierta.
export async function agregarEtapas(db, fecha, seleccion = {}, usuarioId = null) {
  const etapasPedidas = Array.isArray(seleccion.etapas) ? seleccion.etapas.map(String).filter(id => /^\d+$/.test(id)) : []
  let filtro
  let valor
  if (seleccion.pedido_id) { filtro = 'e.pedido_id = $2'; valor = seleccion.pedido_id }
  else if (seleccion.pedido_item_id) { filtro = 'e.pedido_item_id = $2'; valor = seleccion.pedido_item_id }
  else if (etapasPedidas.length) { filtro = 'e.id = ANY($2::bigint[])'; valor = etapasPedidas }
  else throw fallo('Indicá el pedido, el producto o las etapas a agregar.')

  await jornadaEditable(db, fecha, usuarioId)
  const { rows } = await db.query(
    `SELECT e.id, e.nombre, e.estado::text AS estado, p.estado::text AS pedido_estado,
       EXISTS (SELECT 1 FROM jornada_etapas je WHERE je.pedido_etapa_id = e.id AND je.fecha = $1::date) AS repetida,
       (SELECT je.fecha::text FROM jornada_etapas je JOIN jornadas_equipo j ON j.fecha = je.fecha
         WHERE je.pedido_etapa_id = e.id AND j.estado = 'ABIERTA' AND je.fecha <> $1::date ORDER BY je.fecha LIMIT 1) AS otra_jornada
     FROM pedido_etapas e JOIN pedidos p ON p.id = e.pedido_id
     WHERE ${filtro} ORDER BY e.pedido_item_id, e.orden, e.id`, [fecha, valor])
  if (!rows.length || (etapasPedidas.length && rows.length < new Set(etapasPedidas).size)) throw fallo('No se encontró el trabajo seleccionado.', 404)

  const agregar = []
  const omitidas = []
  for (const etapa of rows) {
    const motivo = etapa.estado === 'COMPLETADA' ? motivosOmision.completada
      : !['PENDIENTE', 'EN_PRODUCCION'].includes(etapa.pedido_estado) ? motivosOmision.pedido
        : etapa.repetida ? motivosOmision.repetida
          : etapa.otra_jornada ? `ya está en la producción del ${fechaLegible(etapa.otra_jornada)}`
            : null
    if (motivo) omitidas.push({ id: etapa.id, nombre: etapa.nombre, motivo })
    else agregar.push(etapa.id)
  }
  if (!agregar.length) {
    const detalle = omitidas.map(etapa => `"${etapa.nombre}" ${etapa.motivo}`).join('; ')
    throw fallo(`No hay etapas para agregar: ${detalle}.`)
  }
  await db.query('INSERT INTO jornada_etapas (fecha, pedido_etapa_id) SELECT $1::date, UNNEST($2::bigint[]) ON CONFLICT DO NOTHING', [fecha, agregar])
  return { agregadas: agregar.length, omitidas }
}

// Saca una etapa de la producción de un día. Si el día queda sin etapas,
// se borra (vuelve a "sin planificar").
export async function quitarEtapa(db, fecha, etapaId) {
  const jornada = await leerJornada(db, fecha, true)
  if (!jornada) throw fallo('No hay producción cargada para ese día.', 404)
  if (jornada.estado === 'TERMINADA') throw fallo(`La producción del ${fechaLegible(fecha)} ya está terminada. Reabrila para cambiarla.`)
  const { rows } = await db.query('DELETE FROM jornada_etapas WHERE fecha = $1::date AND pedido_etapa_id = $2 RETURNING pedido_etapa_id', [fecha, etapaId])
  if (!rows[0]) throw fallo('Esa etapa no está en la producción del día.', 404)
  const quedan = (await db.query('SELECT COUNT(*)::int AS total FROM jornada_etapas WHERE fecha = $1::date', [fecha])).rows[0].total
  if (!quedan) await db.query('DELETE FROM jornadas_equipo WHERE fecha = $1::date', [fecha])
}

// Borra la producción (abierta) de un día completa.
export async function eliminarJornada(db, fecha) {
  const jornada = await leerJornada(db, fecha, true)
  if (!jornada) throw fallo('No hay producción cargada para ese día.', 404)
  if (jornada.estado === 'TERMINADA') throw fallo('Una producción terminada no se puede eliminar: reabrila primero.')
  await db.query('DELETE FROM jornadas_equipo WHERE fecha = $1::date', [fecha])
}

// El admin verificó el trabajo y marca la producción del día como
// terminada: se calcula el resultado y se guarda la copia.
export async function terminarJornada(db, fecha, usuarioId) {
  const jornada = await leerJornada(db, fecha, true)
  if (!jornada) throw fallo('No hay producción cargada para ese día.', 404)
  if (jornada.estado === 'TERMINADA') throw fallo(`La producción del ${fechaLegible(fecha)} ya está terminada.`)
  const etapas = await etapasDeJornada(db, fecha)
  if (!etapas.length) throw fallo('La producción del día no tiene etapas propuestas.')
  const parametros = await parametrosVigentes(db, fecha)
  const resultado = calcularRecompensaEquipo({ etapas, valorHora: parametros.valor_hora, porcentajePremio: parametros.porcentaje_premio })
  await db.query(
    `UPDATE jornadas_equipo SET estado = 'TERMINADA', objetivo_horas = $2, objetivo_detalle = $3, horas_producidas = $4,
       excedente_horas = $5, valor_hora = $6, porcentaje_premio = $7, recompensa = $8, cumplido = $9,
       terminada_en = NOW(), terminada_por = $10, calculado_en = NOW()
     WHERE fecha = $1::date`,
    [fecha, resultado.objetivo_horas, JSON.stringify(etapas), resultado.horas_completadas, -resultado.horas_pendientes,
      resultado.valor_hora, resultado.porcentaje_premio, resultado.recompensa, resultado.cumplido, usuarioId])
}

// Vuelve a abrir un día terminado (por ejemplo, si se cerró por error). La
// recompensa vuelve a 0 hasta que se termine de nuevo. Los días del modelo
// anterior no tienen etapas y no se pueden reabrir.
export async function reabrirJornada(db, fecha) {
  const jornada = await leerJornada(db, fecha, true)
  if (!jornada) throw fallo('No hay producción cargada para ese día.', 404)
  if (jornada.estado !== 'TERMINADA') throw fallo('La producción de ese día no está terminada.')
  const etapas = await etapasDeJornada(db, fecha)
  if (!etapas.length) throw fallo('Este día no tiene etapas para reabrir (es del sistema anterior o se borraron sus pedidos).')
  const conflicto = (await db.query(
    `SELECT e.nombre, otra.fecha::text AS fecha
     FROM jornada_etapas je
     JOIN pedido_etapas e ON e.id = je.pedido_etapa_id
     JOIN jornada_etapas otra ON otra.pedido_etapa_id = je.pedido_etapa_id AND otra.fecha <> je.fecha
     JOIN jornadas_equipo j ON j.fecha = otra.fecha AND j.estado = 'ABIERTA'
     WHERE je.fecha = $1::date AND e.estado <> 'COMPLETADA' LIMIT 1`, [fecha])).rows[0]
  if (conflicto) throw fallo(`No se puede reabrir: la etapa "${conflicto.nombre}" ya está propuesta en la producción del ${fechaLegible(conflicto.fecha)}.`)
  await db.query(
    `UPDATE jornadas_equipo SET estado = 'ABIERTA', recompensa = 0, cumplido = FALSE, terminada_en = NULL, terminada_por = NULL, calculado_en = NOW()
     WHERE fecha = $1::date`, [fecha])
}
