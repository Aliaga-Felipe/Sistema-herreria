import nodemailer from 'nodemailer'
import { fallo } from './comun.js'

// -----------------------------------------------------------------------
// ENVÍO DE MAILS (formulario de Contacto de la web pública)
// Usa SMTP genérico (nodemailer): funciona con Gmail, un proveedor propio
// o cualquier casilla que dé host/puerto/usuario/contraseña SMTP. Las
// credenciales viven SOLO acá, vía variables de entorno (ver .env.example):
// nunca llegan al frontend ni se guardan en la base de datos.
// -----------------------------------------------------------------------
let transportador
let intentoTransportador = false

function obtenerTransportador() {
  // Se arma una sola vez y se reutiliza (evita reabrir la conexión SMTP en
  // cada consulta). Si las variables no están completas, queda en null y
  // enviarConsulta() avisa con un mensaje claro en vez de fallar recién al
  // primer intento de envío con un error críptico de nodemailer.
  if (intentoTransportador) return transportador
  intentoTransportador = true
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null
  const puerto = Number(SMTP_PORT) || 587
  transportador = nodemailer.createTransport({
    host: SMTP_HOST,
    port: puerto,
    secure: puerto === 465, // 465 = SSL directo; 587/25 usan STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
  })
  return transportador
}

// Arma y envía el mail de una consulta del formulario público de Contacto.
// `destino` es el correo receptor (mail_receptor_consultas o, si no está
// configurado, negocio_email como respaldo), resuelto por quien llama.
export async function enviarConsulta({ nombre, email, telefono, asunto, mensaje }, destino) {
  const transporte = obtenerTransportador()
  if (!transporte) throw fallo('El servidor todavía no tiene configurado el envío de mails (variables SMTP_HOST, SMTP_USER y SMTP_PASSWORD en .env). Avisale al administrador del sistema.', 503)

  const texto = [
    'Nueva consulta desde el formulario de Contacto de la web.',
    '',
    `Nombre: ${nombre}`,
    `Correo: ${email}`,
    telefono ? `Teléfono: ${telefono}` : null,
    `Asunto: ${asunto}`,
    '',
    'Mensaje:',
    mensaje
  ].filter(linea => linea !== null).join('\n')

  try {
    await transporte.sendMail({
      // Gmail (y la mayoría de los SMTP) no dejan mandar un mail con el
      // "De" real de un tercero: sólo aceptan el "De" de la casilla
      // autenticada (si no, lo rechazan o lo reescriben por SPF/DKIM). Lo
      // más cerca que se puede llegar a "llega desde el mail del usuario"
      // sin romper la entrega es: el nombre visible es el del usuario, la
      // dirección real sigue siendo la casilla configurada, y "Responder a"
      // apunta directo al correo del usuario — así, al tocar "Responder" en
      // el mail recibido, le contestás directo a él.
      from: { name: `${nombre} (vía web)`, address: process.env.SMTP_USER },
      to: destino,
      replyTo: email,
      subject: `Consulta web: ${asunto}`,
      text: texto
    })
  } catch (error) {
    // Un fallo del servidor SMTP (credenciales, host caído, etc.) no tiene
    // por qué exponer el detalle técnico al visitante de la web.
    throw fallo('No se pudo enviar la consulta. Probá de nuevo en unos minutos o escribinos por WhatsApp.', 502)
  }
}

// Mail con el código de verificación en dos pasos del inicio de sesión (ver
// rutas/autenticacion.js). Nunca se registra el código en los logs; si el envío
// falla, el detalle técnico queda sólo en el servidor y la persona recibe un
// mensaje genérico (no se puede iniciar sesión sin recibir el código).
export async function enviarCodigoAcceso(destino, codigo, minutosDeVida) {
  const transporte = obtenerTransportador()
  if (!transporte) {
    throw fallo('No se pueden enviar códigos de verificación: el servidor no tiene configurado el correo saliente (SMTP_HOST, SMTP_USER y SMTP_PASSWORD en .env). Avisale al administrador del sistema.', 503)
  }
  try {
    await transporte.sendMail({
      from: { name: 'Un atelier', address: process.env.SMTP_USER },
      to: destino,
      subject: 'Tu código de verificación de Un atelier',
      text: [
        'Tu código para ingresar a Un atelier es:',
        '',
        `    ${codigo}`,
        '',
        `Vence en ${minutosDeVida} minutos y sirve una sola vez.`,
        'Si no intentaste ingresar, ignorá este mensaje y avisale al administrador: alguien pudo haber conseguido tu contraseña.',
        'Nunca compartas este código con nadie.'
      ].join('\n')
    })
  } catch (error) {
    console.error(`[2fa] No se pudo enviar el código de verificación (${error.code || error.name}).`)
    throw fallo('No pudimos enviarte el código de verificación. Probá de nuevo en unos minutos.', 503)
  }
}

