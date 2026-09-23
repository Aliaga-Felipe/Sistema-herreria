import 'dotenv/config'
import readline from 'readline'
import { pool } from '../db.js'

// Script de uso único para activar el rol "super_admin" y ascender una
// cuenta existente a ese rol. Igual que crear-admin.js, esto se hace a
// mano y no por una ruta HTTP: es una acción sensible (ver el
// comentario junto a auth(['super_admin']) en rutas/usuarios.js y
// rutas/configuracion.js).
//
// Uso: corré esto una sola vez desde la terminal, parado en la carpeta
// del proyecto (necesitás haber creado antes la cuenta con
// crear-admin.js, o cualquier otra cuenta que ya exista):
//
//   node server/scripts/configurar-super-admin.js

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const preguntar = texto => new Promise(resolve => rl.question(texto, resolve))

async function main() {
  console.log('== Activar el rol "super_admin" ==\n')

  // 1) Agrega el valor al enum si todavía no existe (no rompe nada si ya está).
  await pool.query("ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'super_admin'")

  // 2) Pide el correo de la cuenta a ascender.
  const email = (await preguntar('Correo de la cuenta a ascender a super_admin: ')).trim().toLowerCase()
  rl.close()

  if (!email) { console.error('\nEl correo no puede estar vacío.'); return }

  const { rows } = await pool.query(
    `UPDATE usuarios SET
       rol = (SELECT enumlabel::rol_usuario FROM pg_enum WHERE enumtypid = 'rol_usuario'::regtype AND LOWER(enumlabel) = 'super_admin'),
       actualizado_en = NOW()
     WHERE email = $1
     RETURNING id, nombre, email, LOWER(rol::text) AS rol`,
    [email]
  )

  if (!rows[0]) {
    console.error(`\nNo encontré ninguna cuenta con el correo "${email}". Revisá que sea el mismo correo con el que se registró o se creó (con crear-admin.js).`)
    return
  }

  console.log(`\nListo. ${rows[0].nombre} <${rows[0].email}> ahora es "${rows[0].rol}".\nSi tenía la sesión abierta, tiene que cerrar sesión y volver a entrar para ver las secciones nuevas.`)
}

main()
  .catch(error => console.error('\nError:', error.message))
  .finally(() => pool.end())
