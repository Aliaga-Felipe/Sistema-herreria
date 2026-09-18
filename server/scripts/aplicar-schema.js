import 'dotenv/config'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { pool } from '../db.js'

// Script de uso único para aplicar (o volver a aplicar) database/schema.sql
// contra la base configurada en DATABASE_URL (.env), sin necesidad de tener
// psql a mano. schema.sql es idempotente -puede correrse sobre una base
// vacía o sobre una ya en uso sin perder datos, ver README.md-, así que
// alcanza con ejecutarlo entero cada vez que cambia (por ejemplo, después
// de una actualización del sistema que agregue una tabla, columna o
// relación nueva). Es la alternativa a "ejecute database/schema.sql" del
// README para quien no tenga psql instalado o no sepa usarlo.
//
// Uso: parado en la carpeta del proyecto:
//
//   node server/scripts/aplicar-schema.js

const directorio = path.dirname(fileURLToPath(import.meta.url))
const rutaSchema = path.join(directorio, '..', '..', 'database', 'schema.sql')

async function main() {
  console.log('== Aplicando database/schema.sql ==\n')
  const sql = readFileSync(rutaSchema, 'utf-8')
  await pool.query(sql)
  console.log('Listo. El esquema de la base de datos quedó al día.')
}

main()
  .catch(error => console.error('\nError al aplicar el esquema:', error.message))
  .finally(() => pool.end())
