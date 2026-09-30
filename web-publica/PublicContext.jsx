import React, { createContext, useContext, useEffect, useState } from 'react'
import { publicApi } from './api.js'

const PublicConfigContext = createContext({ nombre: 'Un atelier' })
export const usePublicConfig = () => useContext(PublicConfigContext)

// Interruptor único para ocultar el horario de atención en todo el sitio
// público (Contacto, Footer, Home) sin tocar el dato: negocio_horario
// sigue guardado en Configuración tal cual, solo deja de mostrarse. Para
// volver a mostrarlo en cualquier momento alcanza con poner esto en true
// de nuevo; no hace falta editar el backend ni la base de datos.
export const MOSTRAR_HORARIO = false

const valoresPorDefecto = {
  negocio_nombre: 'Un atelier',
  negocio_rubro: 'Herrería de diseño',
  negocio_eslogan: 'Un galpón de objetos con historia',
  negocio_descripcion: 'Cuidamos lo que el tiempo dejó en cada objeto y construimos con materiales que todavía tienen mucho por contar.',
  negocio_whatsapp: '',
  negocio_email: '',
  negocio_telefono: '',
  negocio_direccion: '',
  negocio_instagram: '',
  negocio_facebook: '',
  negocio_horario: '',
  moneda: 'ARS'
}

// Carga una única vez los datos públicos del negocio (nombre, WhatsApp,
// redes) desde /api/publico/configuracion y los deja disponibles para
// todo el sitio público sin repetir el fetch en cada página.
export function PublicConfigProvider({ children }) {
  const [config, setConfig] = useState(valoresPorDefecto)

  useEffect(() => {
    let activo = true
    publicApi.configuracion()
      .then(datos => { if (activo) setConfig({ ...valoresPorDefecto, ...datos }) })
      .catch(() => {})
    return () => { activo = false }
  }, [])

  return <PublicConfigContext.Provider value={config}>{children}</PublicConfigContext.Provider>
}
