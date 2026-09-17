import 'dotenv/config'
import readline from 'readline'
import bcrypt from 'bcrypt'
import { pool } from '../db.js'

// Script de uso único para crear la PRIMERA cuenta de administrador.
// A propósito no existe una ruta HTTP para esto: crear un admin es una
// acción sensible y se hace a mano, directo en la base (así lo dice el
// propio comentario en rutas/autenticacion.js: "El primer admin se
// carga a mano en la base y desde ahí da de alta al resto").
//
// Uso: corré esto una sola vez desde la terminal, parado en la carpeta
// del proyecto:
//
//   node server/scripts/crear-admin.js
//
// Te va a pedir nombre, correo y contraseña por consola. Ese texto no
// se guarda en ningún archivo ni queda visible para nadie más que vos:
// solo se usa en el momento para crear la cuenta.

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const preguntar = texto => new Promise(resolve => rl.question(texto, resolve))

async function main() {
  console.log('== Crear cuenta de administrador ==\n')

  const nombre = (await preguntar('Nombre completo: ')).trim()
  const email = (await preguntar('Correo electrónico: ')).trim().toLowerCase()
  const contrasena = await preguntar('Contraseña (mínimo 8 caracteres): ')
  const confirmacion = await preguntar('Repetí la contraseña: ')

  rl.close()

  if (!nombre) { console.error('\nEl nombre no puede estar vacío.'); return }
  if (!email.includes('@')) { console.error('\nEl correo no parece válido.'); return }
  if (!contrasena || contrasena.length < 8) { console.error('\nLa contraseña debe tener al menos 8 caracteres.'); return }
  if (contrasena !== confirmacion) { console.error('\nLas contraseñas no coinciden.'); return }

  const existente = await pool.query('SELECT id, LOWER(rol::text) AS rol FROM usuarios WHERE email = $1', [email])
  if (existente.rows[0]) {
    console.error(
      `\nYa existe una cuenta con ese correo (rol actual: ${existente.rows[0].rol}).\n` +
      'Si ya podés iniciar sesión con algún admin, es más simple ascenderla desde el panel de Usuarios (cambiando su Rol a "admin"). ' +
      'Si no tenés forma de entrar, avisame y la ascendemos directo en la base con otro script.'
    )
    return
  }

  const hash = await bcrypt.hash(contrasena, 12)
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
     VALUES ($1, $2, $3, (SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = 'admin'))
     RETURNING id, nombre, email, LOWER(rol::text) AS rol`,
    [nombre, email, hash]
  )

  const creado = rows[0]
  console.log(`\nListo. Se creó la cuenta de administrador:\n  ${creado.nombre} <${creado.email}> — rol ${creado.rol}\n\nYa podés iniciar sesión en /iniciar-sesion con ese correo y la contraseña que elegiste.`)
}

main()
  .catch(error => console.error('\nError:', error.message))
  .finally(() => pool.end())
