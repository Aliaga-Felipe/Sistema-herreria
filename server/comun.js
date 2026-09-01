import jwt from 'jsonwebtoken'
import { pool } from './db.js'

export const secret = process.env.JWT_SECRET || 'solo_para_desarrollo_cambiar_este_secreto'
export const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
export const normalizedRole = rol => String(rol).toLowerCase()
export const sign = user => jwt.sign({ id: user.id, rol: normalizedRole(user.rol), nombre: user.nombre }, secret, { expiresIn: '8h' })
export const auth = (roles = []) => (req, res, next) => {
  try {
    const user = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), secret)
    user.rol = normalizedRole(user.rol)
    if (roles.length && !roles.includes(user.rol)) return res.status(403).json({ error: 'No tenés permisos para esta acción.' })
    req.user = user; next()
  } catch { res.status(401).json({ error: 'Sesión no válida o vencida.' }) }
}

// El enum rol_usuario puede estar en minúscula o mayúscula según cómo se creó la base.
export const rolLiteral = parametro => `(SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = ${parametro})`
export const fallo = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status })
export const entero = valor => { const numero = Number(valor); return Number.isFinite(numero) ? Math.round(numero) : null }
export const decimal = valor => { const numero = Number(valor); return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0 }

// ---------------------------------------------------------------------
// CONFIGURACIÓN
// ---------------------------------------------------------------------
export const configuracionPorDefecto = {
  recompensa_activa: 'true',
  recompensa_valor_hora: '2500',
  recompensa_factor_ahorro: '0.5',
  recompensa_bono_minimo: '0',
  semaforo_tolerancia: '0.1',
  moneda: 'ARS'
}

export async function leerConfiguracion(cliente = pool) {
  const { rows } = await cliente.query('SELECT clave, valor FROM configuracion')
  return { ...configuracionPorDefecto, ...Object.fromEntries(rows.map(fila => [fila.clave, fila.valor])) }
}

// ---------------------------------------------------------------------
// SEMÁFORO Y RECOMPENSAS
// El semáforo compara el tiempo real contra el estimado por el admin.
// Verde si terminó antes de (1 - tolerancia), amarillo dentro del margen,
// rojo si se pasó. El bono se paga solo en verde y es proporcional al
// tiempo ahorrado, con la tarifa y el factor definidos en configuración.
// ---------------------------------------------------------------------
export function calcularSemaforo(minutosEstimados, minutosReales, config = configuracionPorDefecto) {
  const estimado = Number(minutosEstimados)
  const real = Number(minutosReales)
  const base = { minutos_estimados: estimado || null, minutos_reales: Number.isFinite(real) ? real : null }
  if (!estimado || !Number.isFinite(real) || real <= 0) return { ...base, semaforo: null, minutos_ahorrados: 0, monto: 0, puntos: 0, ratio: null }

  const tolerancia = Math.max(0, Number(config.semaforo_tolerancia) || 0)
  const ratio = real / estimado
  const semaforo = ratio <= 1 - tolerancia ? 'VERDE' : ratio <= 1 + tolerancia ? 'AMARILLO' : 'ROJO'
  const ahorrados = Math.max(0, estimado - real)

  const activa = String(config.recompensa_activa) === 'true'
  const valorHora = Number(config.recompensa_valor_hora) || 0
  const factor = Math.min(1, Math.max(0, Number(config.recompensa_factor_ahorro) || 0))
  const bonoMinimo = Number(config.recompensa_bono_minimo) || 0
  const monto = semaforo === 'VERDE' && activa ? decimal(Math.max(bonoMinimo, (ahorrados / 60) * valorHora * factor)) : 0

  return { ...base, semaforo, minutos_ahorrados: ahorrados, monto, puntos: semaforo === 'VERDE' ? ahorrados : 0, ratio }
}

// Registra la recompensa automática de una etapa. La clave única parcial
// sobre pedido_etapa_id / tarea_etapa_id evita duplicados si se reabre.
export async function registrarRecompensa(cliente, { usuarioId, pedidoId = null, pedidoEtapaId = null, tareaEtapaId = null, motivo, resultado }) {
  if (!usuarioId || resultado.semaforo !== 'VERDE' || resultado.monto <= 0) return null
  const { rows } = await cliente.query(
    `INSERT INTO recompensas (usuario_id, pedido_id, pedido_etapa_id, tarea_etapa_id, puntos, monto, motivo, semaforo, minutos_estimados, minutos_reales, minutos_ahorrados, automatica)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'VERDE', $8, $9, $10, TRUE)
     ON CONFLICT DO NOTHING RETURNING id, monto, puntos`,
    [usuarioId, pedidoId, pedidoEtapaId, tareaEtapaId, resultado.puntos, resultado.monto, motivo, resultado.minutos_estimados, resultado.minutos_reales, resultado.minutos_ahorrados]
  )
  return rows[0] || null
}

// Recalcula el estado de un pedido según el avance de sus etapas.
export async function sincronizarPedido(cliente, pedidoId) {
  const { rows } = await cliente.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE estado = 'COMPLETADA')::int AS completadas,
            COUNT(*) FILTER (WHERE estado <> 'PENDIENTE')::int AS iniciadas
     FROM pedido_etapas WHERE pedido_id = $1`, [pedidoId])
  const { total, completadas, iniciadas } = rows[0]
  const estadoActual = (await cliente.query('SELECT estado FROM pedidos WHERE id = $1', [pedidoId])).rows[0]?.estado
  if (['CANCELADO', 'PAUSADO'].includes(estadoActual)) return estadoActual

  const estado = total && completadas === total ? 'TERMINADO' : iniciadas ? 'EN_PRODUCCION' : 'PENDIENTE'
  await cliente.query(
    `UPDATE pedidos SET estado = $1::estado_pedido, actualizado_en = NOW(),
       terminado_en = CASE WHEN $1 = 'TERMINADO' THEN COALESCE(terminado_en, NOW()) ELSE NULL END
     WHERE id = $2`, [estado, pedidoId])
  return estado
}
