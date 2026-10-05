import { pool } from './db.js'

export const fechaDeHoy = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}
export const validarFechaDia = valor => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) ? valor : null)

export async function parametrosVigentes(db, fecha) {
  const { rows } = await db.query(`SELECT valor_hora::float8 AS valor_hora, porcentaje_premio::float8 AS porcentaje_premio, vigente_desde
    FROM parametros_recompensa_historial WHERE vigente_desde <= $1::date ORDER BY vigente_desde DESC, id DESC LIMIT 1`, [fecha])
  return rows[0] || { valor_hora: 0, porcentaje_premio: 100, vigente_desde: null }
}

async function etapasDelDia(db, fecha) {
  return (await db.query(`SELECT d.pedido_etapa_id AS etapa_id, d.horas_hombre::float8 AS horas_hombre,
      e.nombre AS etapa, e.estado, p.codigo AS pedido, i.producto_id, pr.nombre AS producto
    FROM produccion_diaria_etapas d JOIN pedido_etapas e ON e.id = d.pedido_etapa_id
    JOIN pedidos p ON p.id = e.pedido_id JOIN pedido_items i ON i.id = e.pedido_item_id
    JOIN productos pr ON pr.id = i.producto_id WHERE d.fecha = $1::date ORDER BY p.codigo, i.id, e.orden`, [fecha])).rows
}

async function datosDelDia(db, fecha) {
  const guardada = (await db.query('SELECT * FROM jornadas_equipo WHERE fecha = $1::date', [fecha])).rows[0]
  const cerrado = Boolean(guardada) && fecha < fechaDeHoy()
  const parametros = await parametrosVigentes(db, fecha)
  const filas = cerrado ? (guardada.objetivo_detalle || []) : await etapasDelDia(db, fecha)
  const legado = cerrado && filas.length > 0 && filas.some(f => !f.etapa_id)
  const objetivos = filas.map(f => ({ ...f, cantidad: 1, tiempo_estandar: Number(f.horas_hombre) || 0 }))
  const producciones = objetivos.filter(f => f.estado === 'COMPLETADA')
  return { objetivos, producciones, objetivoGuardado: cerrado ? Number(guardada.objetivo_horas) : null, parametros, cerrado, guardada: legado ? guardada : null, legado }
}

const redondear = n => Math.round((Number(n) || 0) * 100) / 100
const armarResultado = (fecha, datos) => {
  if (datos.legado) return {
    fecha, objetivo_horas: Number(datos.guardada.objetivo_horas) || 0,
    horas_producidas: Number(datos.guardada.horas_producidas) || 0,
    excedente_horas: Number(datos.guardada.excedente_horas) || 0,
    cumplido: Number(datos.guardada.objetivo_horas) > 0 && Number(datos.guardada.horas_producidas) >= Number(datos.guardada.objetivo_horas), valor_hora: Number(datos.guardada.valor_hora) || 0,
    porcentaje_premio: Number(datos.guardada.porcentaje_premio) || 100, recompensa: Number(datos.guardada.recompensa) || 0,
    productos_sin_tiempo_estandar: [], advertencias: [], objetivo_congelado: true,
    objetivos: datos.objetivos.map(f => ({ ...f, horas_hombre: (Number(f.cantidad) || 0) * (Number(f.tiempo_estandar) || 0), estado: 'HISTÓRICO' })),
    produccion: []
  }
  const objetivo = datos.objetivoGuardado ?? datos.objetivos.reduce((s, f) => s + Number(f.horas_hombre || 0), 0)
  const producido = datos.producciones.reduce((s, f) => s + Number(f.horas_hombre || 0), 0)
  const valorHora = Number(datos.parametros.valor_hora) || 0
  const cumplido = objetivo > 0 && producido >= objetivo
  const detalle = (lista) => lista.map(f => ({ ...f, horas_equivalentes: redondear(f.horas_hombre), cantidad: 1, tiempo_estandar: f.horas_hombre }))
  return {
    fecha, objetivo_horas: redondear(objetivo), horas_producidas: redondear(producido),
    excedente_horas: redondear(producido - objetivo), cumplido, valor_hora: valorHora,
    porcentaje_premio: 100, recompensa: cumplido ? redondear(objetivo * valorHora) : 0,
    productos_sin_tiempo_estandar: [], advertencias: objetivo ? [] : ['No hay etapas asignadas a la producción diaria.'],
    objetivo_congelado: datos.cerrado, objetivos: detalle(datos.objetivos), produccion: detalle(datos.producciones)
  }
}

export async function obtenerJornada(fecha, db = pool) {
  return armarResultado(fecha, await datosDelDia(db, fecha))
}

export async function guardarJornada(db, fecha) {
  const datos = await datosDelDia(db, fecha)
  const resultado = armarResultado(fecha, datos)
  const detalle = resultado.objetivos.map(({ etapa_id, etapa, pedido, producto_id, producto, horas_hombre, estado }) => ({ etapa_id, etapa, pedido, producto_id, producto, horas_hombre, estado }))
  await db.query(`INSERT INTO jornadas_equipo (fecha, objetivo_horas, objetivo_detalle, horas_producidas, excedente_horas, valor_hora, porcentaje_premio, recompensa, calculado_en)
    VALUES ($1,$2,$3,$4,$5,$6,100,$7,NOW()) ON CONFLICT (fecha) DO UPDATE SET objetivo_horas=EXCLUDED.objetivo_horas,
    objetivo_detalle=EXCLUDED.objetivo_detalle, horas_producidas=EXCLUDED.horas_producidas, excedente_horas=EXCLUDED.excedente_horas,
    valor_hora=EXCLUDED.valor_hora, porcentaje_premio=100, recompensa=EXCLUDED.recompensa, calculado_en=NOW()`,
  [fecha, resultado.objetivo_horas, JSON.stringify(detalle), resultado.horas_producidas, resultado.excedente_horas, resultado.valor_hora, resultado.recompensa])
  return resultado
}

export async function refrescarHoy(db = pool) {
  const hoy = fechaDeHoy()
  if ((await db.query('SELECT 1 FROM jornadas_equipo WHERE fecha = $1', [hoy])).rows[0]) await guardarJornada(db, hoy)
}
