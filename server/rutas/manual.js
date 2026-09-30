import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { auth, fallo } from '../comun.js'

// Entrega el PDF del manual de usuario. Es el mismo contenido de la sección
// "Manual de usuario" del panel (ver src/manual-contenido.js). Requiere
// sesión iniciada (cualquier rol); no se publica como archivo suelto.
// El PDF se regenera con `node scripts/generar-manual-pdf.mjs`.
const router = Router()
const archivo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'manual', 'manual-de-usuario.pdf')

router.get('/pdf', auth(), (_req, res, next) => {
  if (!fs.existsSync(archivo)) return next(fallo('El PDF del manual todavía no está disponible.', 404))
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename="Manual-de-usuario-Un-atelier.pdf"')
  res.setHeader('Cache-Control', 'private, no-store')
  fs.createReadStream(archivo).on('error', next).pipe(res)
})

export default router
