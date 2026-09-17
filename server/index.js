import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import autenticacion from './rutas/autenticacion.js'
import usuarios from './rutas/usuarios.js'
import tareas from './rutas/tareas.js'
import productos from './rutas/productos.js'
import categorias from './rutas/categorias.js'
import clientes from './rutas/clientes.js'
import pedidos from './rutas/pedidos.js'
import recompensas from './rutas/recompensas.js'
import estadisticas from './rutas/estadisticas.js'
import configuracion from './rutas/configuracion.js'
import materiales from './rutas/materiales.js'
import produccion from './rutas/produccion.js'
import presupuestos from './rutas/presupuestos.js'
import publico from './rutas/publico.js'

const app = express()
const port = process.env.PORT || 3001
const directorio = path.dirname(fileURLToPath(import.meta.url))

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json())

// Imágenes de productos subidas desde el panel (server/uploads/productos).
// Sirven tanto al panel interno como a la web pública, sin pasar por la API.
app.use('/uploads', express.static(path.join(directorio, 'uploads')))

// Catálogo público: sin JWT, sólo lectura de productos activos.
app.use('/api/publico', publico)

app.use('/api/auth', autenticacion)
app.use('/api/usuarios', usuarios)
app.use('/api/tareas', tareas)
app.use('/api/productos', productos)
app.use('/api/categorias', categorias)
app.use('/api/clientes', clientes)
app.use('/api/pedidos', pedidos)
app.use('/api/recompensas', recompensas)
app.use('/api/estadisticas', estadisticas)
app.use('/api/configuracion', configuracion)
app.use('/api/materiales', materiales)
app.use('/api/produccion', produccion)
app.use('/api/presupuestos', presupuestos)

app.use((error, _, res, __) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos (correo o código repetido).' })
  if (error.code === '23503') return res.status(409).json({ error: 'No se puede completar: el registro está referenciado por otros datos.' })
  res.status(error.status || 500).json({ error: error.message || 'Ocurrió un error inesperado.' })
})

app.listen(port, () => console.log(`API de El Atelier lista en el puerto ${port}`))
