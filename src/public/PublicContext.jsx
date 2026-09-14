import React, { createContext, useContext, useEffect, useState } from 'react'
import { publicApi } from '../public-api.js'

const PublicConfigContext = createContext({ nombre: 'El Atelier' })
export const usePublicConfig = () => useContext(PublicConfigContext)

const valoresPorDefecto = {
  negocio_nombre: 'El Atelier',
  negocio_eslogan: 'Diseño que perdura',
  negocio_descripcion: 'Muebles y piezas de herrería artesanal, diseñados y fabricados a medida.',
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
