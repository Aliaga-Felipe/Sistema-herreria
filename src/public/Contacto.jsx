import React, { useState } from 'react'
import { useMeta } from '../public-api.js'
import { usePublicConfig } from './PublicContext.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'
import Reveal from './components/Reveal.jsx'

export default function Contacto() {
  const config = usePublicConfig()
  const [form, setForm] = useState({ nombre: '', email: '', mensaje: '' })
  useMeta('Contacto', `Contactá a ${config.negocio_nombre}: consultas, presupuestos y pedidos a medida.`)

  const cambiar = campo => event => setForm({ ...form, [campo]: event.target.value })

  // No hay un backend de mensajería propio en el sistema, así que el
  // formulario abre el cliente de correo del visitante con todo prellenado
  // en vez de simular un envío que en realidad no se guarda en ningún lado.
  const enviar = event => {
    event.preventDefault()
    const asunto = encodeURIComponent(`Consulta desde la web — ${form.nombre || 'Sin nombre'}`)
    const cuerpo = encodeURIComponent(`${form.mensaje}\n\n— ${form.nombre}\n${form.email}`)
    window.location.href = `mailto:${config.negocio_email || ''}?subject=${asunto}&body=${cuerpo}`
  }

  return (
    <div className="contenedor contacto-grid">
      <Reveal>
        <p className="eyebrow-public">Hablemos</p>
        <h1 style={{ fontFamily: 'var(--fuente-display)', fontSize: 'clamp(2rem, 4.5vw, 2.8rem)', marginBottom: 28 }}>Contacto</h1>

        <div className="contacto-datos">
          {config.negocio_whatsapp && (
            <article>
              <span className="icono">✆</span>
              <div><b>WhatsApp</b><p>{config.negocio_whatsapp}</p></div>
            </article>
          )}
          {config.negocio_email && (
            <article>
              <span className="icono">✉</span>
              <div><b>Correo</b><a href={`mailto:${config.negocio_email}`}>{config.negocio_email}</a></div>
            </article>
          )}
          {config.negocio_direccion && (
            <article>
              <span className="icono">⌂</span>
              <div><b>Taller</b><p>{config.negocio_direccion}</p></div>
            </article>
          )}
          {config.negocio_horario && (
            <article>
              <span className="icono">◷</span>
              <div><b>Horario</b><p>{config.negocio_horario}</p></div>
            </article>
          )}
        </div>

        {(config.negocio_instagram || config.negocio_facebook) && (
          <div className="redes-public">
            {config.negocio_instagram && <a href={config.negocio_instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
            {config.negocio_facebook && <a href={config.negocio_facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
          </div>
        )}

        {config.negocio_whatsapp && (
          <div style={{ marginTop: 32 }}>
            <WhatsAppLink numero={config.negocio_whatsapp} mensaje="Hola, quisiera hacer una consulta.">
              Escribir por WhatsApp
            </WhatsAppLink>
          </div>
        )}
      </Reveal>

      <Reveal>
        <form className="form-publico" onSubmit={enviar}>
          <p className="nota-form">Completá el formulario y se va a abrir tu programa de correo con el mensaje listo para enviar.</p>
          <label>Nombre
            <input required value={form.nombre} onChange={cambiar('nombre')} placeholder="Tu nombre" />
          </label>
          <label>Correo electrónico
            <input required type="email" value={form.email} onChange={cambiar('email')} placeholder="tu@correo.com" />
          </label>
          <label>Mensaje
            <textarea required value={form.mensaje} onChange={cambiar('mensaje')} placeholder="Contanos qué estás buscando…" />
          </label>
          <button className="btn-public btn-madera btn-block" type="submit">Enviar consulta</button>
        </form>
      </Reveal>
    </div>
  )
}
