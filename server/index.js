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
import produccion from './rutas/produccion.js'
import presupuestos from './rutas/presupuestos.js'
import manual from './rutas/manual.js'
import publico from './rutas/publico.js'
import { cabecerasSeguras } from './seguridad.js'
import { enProduccion } from './comun.js'

const app = express()
const port = process.env.PORT || 3001
const directorio = path.dirname(fileURLToPath(import.meta.url))

// Detrás de nginx (el VPS) hay que confiar en el proxy para que req.ip sea la
// IP real del visitante (la usan los límites de solicitudes). TRUST_PROXY
// puede fijarse en .env (cantidad de proxies, por defecto 1 en producción).
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : (enProduccion ? 1 : false))
app.disable('x-powered-by')
app.use(cabecerasSeguras)

// CORS: sólo los orígenes listados en CLIENT_URL (separados por coma). En
// producción el panel y la API salen del mismo dominio, así que no hace falta
// abrir nada más; nunca se usa "*".
const origenesPermitidos = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(origen => origen.trim().replace(/\/$/, '')).filter(Boolean)
app.use(cors({
  origin: (origen, callback) => callback(null, !origen || origenesPermitidos.includes(origen)),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '200kb' }))

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
app.use('/api/produccion', produccion)
app.use('/api/presupuestos', presupuestos)
app.use('/api/manual', manual)

// En producción el mismo servidor entrega el frontend ya compilado (dist/,
// generado con "npm run build"): panel y web pública en un solo dominio.
// Cualquier ruta que no sea /api, /uploads ni /assets devuelve index.html
// para que React Router resuelva la página (por ejemplo al recargar
// /productos/:slug).
// En desarrollo dist/ no hace falta: el frontend lo sirve Vite.
const directorioDist = path.join(directorio, '..', 'dist')
app.use(express.static(directorioDist))
app.get(/^\/(?!api\/|uploads\/|assets\/).*/, (_, res, next) => {
  res.sendFile(path.join(directorioDist, 'index.html'), error => error && next())
})

// Rutas de la API que no existen: JSON, no la página del sitio.
app.use('/api', (_, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))

// Manejo central de errores. Los errores "esperados" (creados con fallo(), con
// un status y un mensaje pensado para la persona) se devuelven tal cual; los
// inesperados (fallos de la base, bugs) NUNCA muestran su detalle al cliente:
// se registran en el servidor y se responde un mensaje genérico.
app.use((error, req, res, __) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos (correo o código repetido).' })
  if (error.code === '23503') return res.status(409).json({ error: 'No se puede completar: el registro está referenciado por otros datos.' })
  if (error.code === '22P02' || error.code === '22003' || error.code === '22007') return res.status(400).json({ error: 'Alguno de los datos enviados no tiene un formato válido.' })
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'La solicitud no tiene un formato válido.' })
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud es demasiado grande.' })
  if (error.status && error.status < 600) {
    if (error.reintentarEnSeg) res.set('Retry-After', String(error.reintentarEnSeg))
    return res.status(error.status).json({ error: error.message })
  }
  console.error(`[error] ${req.method} ${req.path}:`, error.stack || error)
  res.status(500).json({ error: 'Ocurrió un error inesperado. Probá de nuevo; si sigue pasando, avisale al administrador.' })
})

app.listen(port, () => console.log(`API de Un atelier lista en el puerto ${port}`))
