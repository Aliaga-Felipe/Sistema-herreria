import React, { useState } from 'react'
import { publicApi, useMeta } from './api.js'
import { MOSTRAR_HORARIO, usePublicConfig } from './PublicContext.jsx'
import { WhatsAppLink } from './components/WhatsAppButton.jsx'
import Reveal from './components/Reveal.jsx'

const patronEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const formVacio = { nombre: '', email: '', telefono: '', asunto: '', mensaje: '' }

export default function Contacto() {
  const config = usePublicConfig()
  const [form, setForm] = useState(formVacio)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  useMeta('Contacto', `Contactá a ${config.negocio_nombre}: consultas, presupuestos y pedidos a medida.`)

  const cambiar = campo => event => setForm({ ...form, [campo]: event.target.value })

  // El formulario manda la consulta al backend (POST /api/publico/contacto,
  // ver server/rutas/publico.js), que arma y envía el mail al correo que
  // configuró el taller. `enviando` evita un doble envío mientras la
  // consulta está en curso (se ignora un segundo submit y el botón queda
  // deshabilitado), y separa con claridad el estado de éxito del de error.
  const enviar = async event => {
    event.preventDefault()
    if (enviando) return
    if (!form.nombre.trim() || !form.email.trim() || !form.asunto.trim() || !form.mensaje.trim()) {
      setError('Completá nombre, correo, asunto y mensaje.')
      return
    }
    if (!patronEmail.test(form.email.trim())) {
      setError('Ingresá un correo electrónico válido.')
      return
    }
    setEnviando(true); setError(''); setEnviado(false)
    try {
      await publicApi.contacto({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        asunto: form.asunto.trim(),
        mensaje: form.mensaje.trim()
      })
      setEnviado(true)
      setForm(formVacio)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="contenedor contacto-grid">
      <Reveal>
        <p className="eyebrow-public" style={{ marginBottom: 28 }}>Hablemos</p>

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
          {MOSTRAR_HORARIO && config.negocio_horario && (
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
          <p className="nota-form">Completá el formulario y te respondemos por correo a la brevedad.</p>
          <label>Nombre
            <input required value={form.nombre} onChange={cambiar('nombre')} placeholder="Tu nombre" disabled={enviando} />
          </label>
          <label>Correo electrónico
            <input required type="email" value={form.email} onChange={cambiar('email')} placeholder="tu@correo.com" disabled={enviando} />
          </label>
          <label>Teléfono (opcional)
            <input value={form.telefono} onChange={cambiar('telefono')} placeholder="Tu teléfono" disabled={enviando} />
          </label>
          <label>Asunto
            <input required value={form.asunto} onChange={cambiar('asunto')} placeholder="¿Sobre qué querés consultarnos?" disabled={enviando} />
          </label>
          <label>Mensaje
            <textarea required value={form.mensaje} onChange={cambiar('mensaje')} placeholder="Contanos qué estás buscando…" disabled={enviando} />
          </label>

          {error && <p className="form-error">{error}</p>}
          {enviado && <p className="notice">¡Gracias! Tu consulta fue enviada, te vamos a responder a la brevedad.</p>}

          <button className="btn-public btn-madera btn-block" type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar consulta'}
          </button>
        </form>
      </Reveal>
    </div>
  )
}
