import crypto from 'crypto'
import { fallo } from './comun.js'

// =====================================================================
// HERRAMIENTAS DE SEGURIDAD COMPARTIDAS
// Sin dependencias externas. Los contadores viven en memoria del proceso:
// alcanza para un único servidor (el VPS con pm2 en modo "fork", ver
// DESPLIEGUE.md); si algún día se corre más de una instancia, hay que
// moverlos a la base o a Redis.
// =====================================================================

// ---------------------------------------------------------------------
// LIMITADOR DE SOLICITUDES (rate limiting)
// limitador({ ventanaMs, max, clave, mensaje }) devuelve un middleware que
// deja pasar como máximo `max` solicitudes por ventana y por "clave"
// (por defecto la IP). Al pasarse responde 429 con Retry-After.
// `limitador.consumir(clave)` permite usarlo a mano (por ejemplo por correo).
// ---------------------------------------------------------------------
const limitadores = []
setInterval(() => {
  const ahora = Date.now()
  for (const contadores of limitadores) {
    for (const [clave, registro] of contadores) if (registro.reinicio <= ahora) contadores.delete(clave)
  }
}, 60_000).unref()

export function crearLimitador({ ventanaMs, max, mensaje = 'Demasiadas solicitudes. Probá de nuevo en unos minutos.' }) {
  const contadores = new Map()
  limitadores.push(contadores)
  // Suma 1 a la clave y devuelve { permitido, restanteMs }.
  const consumir = clave => {
    const ahora = Date.now()
    let registro = contadores.get(clave)
    if (!registro || registro.reinicio <= ahora) { registro = { cuenta: 0, reinicio: ahora + ventanaMs }; contadores.set(clave, registro) }
    registro.cuenta += 1
    return { permitido: registro.cuenta <= max, restanteMs: registro.reinicio - ahora }
  }
  const limpiar = clave => contadores.delete(clave)
  const exigir = (clave) => {
    const { permitido, restanteMs } = consumir(clave)
    if (!permitido) throw Object.assign(fallo(mensaje, 429), { reintentarEnSeg: Math.ceil(restanteMs / 1000) })
  }
  const middleware = (obtenerClave = req => req.ip) => (req, res, next) => {
    const { permitido, restanteMs } = consumir(String(obtenerClave(req)))
    if (!permitido) {
      res.set('Retry-After', String(Math.ceil(restanteMs / 1000)))
      return res.status(429).json({ error: mensaje })
    }
    next()
  }
  return { consumir, limpiar, exigir, middleware }
}

// ---------------------------------------------------------------------
// CABECERAS DE SEGURIDAD
// Sin CSP a propósito: la web pública carga fuentes y mapas de terceros y
// una política mal armada rompería la página. Las demás cabeceras no
// afectan al funcionamiento.
// ---------------------------------------------------------------------
export const cabecerasSeguras = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  })
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  next()
}

// ---------------------------------------------------------------------
// TEXTO DEL USUARIO
// Para datos que terminan en un mail o se muestran: quita caracteres de
// control (evita inyección de cabeceras con saltos de línea), etiquetas HTML
// y espacios de más, y limita el largo. `multilinea` conserva los saltos de
// línea del mensaje.
// ---------------------------------------------------------------------
export function limpiarTexto(valor, { max = 200, multilinea = false } = {}) {
  if (valor === undefined || valor === null) return ''
  let texto = typeof valor === 'string' ? valor : String(valor)
  texto = texto.normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(multilinea ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[​-‏‪-‮⁠﻿]/g, '')
  texto = multilinea
    ? texto.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : texto.replace(/\s+/g, ' ')
  return texto.trim().slice(0, max)
}

// Los parámetros de URL pueden llegar como arreglo u objeto (?q=a&q=b):
// se fuerzan a texto simple antes de usarlos.
export const textoDeConsulta = valor => (typeof valor === 'string' ? valor : Array.isArray(valor) ? String(valor[0] ?? '') : '')

// ---------------------------------------------------------------------
// CÓDIGOS DE UN SOLO USO (2FA)
// El código nunca se guarda: sólo su hash HMAC-SHA256 con una sal propia
// del desafío y un "pimiento" (pepper) que sale del secreto del servidor.
// ---------------------------------------------------------------------
export const generarCodigo = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
export const generarSal = () => crypto.randomBytes(16).toString('hex')
export const hashCodigo = (codigo, sal, pepper) => crypto.createHmac('sha256', pepper).update(`${sal}:${codigo}`).digest('hex')
export function igualesSeguro(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
export const generarIdDesafio = () => crypto.randomBytes(24).toString('base64url')

// Contraseñas nuevas: 8 a 72 bytes (bcrypt ignora lo que pase de 72, así que
// más largo daría una falsa sensación de seguridad).
export function validarContrasenaNueva(valor) {
  if (typeof valor !== 'string' || valor.length < 8) throw fallo('La contraseña debe tener al menos 8 caracteres.')
  if (Buffer.byteLength(valor) > 72) throw fallo('La contraseña es demasiado larga (máximo 72 caracteres).')
  if (/^\s+$/.test(valor) || /^(.)\1+$/.test(valor)) throw fallo('Elegí una contraseña menos predecible.')
  return valor
}
