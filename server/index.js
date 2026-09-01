import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import autenticacion from './rutas/autenticacion.js'
import usuarios from './rutas/usuarios.js'
import tareas from './rutas/tareas.js'
import productos from './rutas/productos.js'
import clientes from './rutas/clientes.js'
import pedidos from './rutas/pedidos.js'
import recompensas from './rutas/recompensas.js'
import estadisticas from './rutas/estadisticas.js'
import configuracion from './rutas/configuracion.js'

const app = express()
const port = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/auth', autenticacion)
app.use('/api/usuarios', usuarios)
app.use('/api/tareas', tareas)
app.use('/api/productos', productos)
app.use('/api/clientes', clientes)
app.use('/api/pedidos', pedidos)
app.use('/api/recompensas', recompensas)
app.use('/api/estadisticas', estadisticas)
app.use('/api/configuracion', configuracion)

app.use((error, _, res, __) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos (correo o código repetido).' })
  if (error.code === '23503') return res.status(409).json({ error: 'No se puede completar: el registro está referenciado por otros datos.' })
  res.status(error.status || 500).json({ error: error.message || 'Ocurrió un error inesperado.' })
})

app.listen(port, () => console.log(`API de El Atelier lista en el puerto ${port}`))
