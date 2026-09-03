import React, { useEffect, useState } from 'react'
import { api, fecha, iniciales, useData, useSession } from './api.js'
import { Actions, Empty, Heading, Modal, Stat, useAviso } from './ui.jsx'

export default function PanelUsuarios({ intencion, limpiarIntencion }) {
  const usuarios = useData('/usuarios')
  const { session } = useSession()
  const { mostrar, nodo } = useAviso()
  const [creando, setCreando] = useState(false)
  const [clave, setClave] = useState(null)

  useEffect(() => {
    if (intencion === 'nuevo') { setCreando(true); limpiarIntencion?.() }
  }, [intencion])

  const empleados = usuarios.data.filter(usuario => usuario.rol === 'empleado')

  const crear = async datos => {
    await api.post('/usuarios', datos, usuarios.token)
    setCreando(false)
    await usuarios.load()
    mostrar('Empleado creado. Ya puede iniciar sesión con esa contraseña.')
  }

  const cambiarRol = async (usuario, rol) => {
    try {
      await api.patch(`/usuarios/${usuario.id}/rol`, { rol }, usuarios.token)
      await usuarios.load()
      mostrar(`${usuario.nombre} ahora es ${rol}.`)
    } catch (error) { mostrar(error.message, 'error') }
  }

  const alternarActivo = async usuario => {
    try {
      await api.patch(`/usuarios/${usuario.id}/activo`, { activo: !usuario.activo }, usuarios.token)
      await usuarios.load()
      mostrar(usuario.activo ? 'Cuenta desactivada.' : 'Cuenta reactivada.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const restablecer = async (usuario, contrasena) => {
    await api.patch(`/usuarios/${usuario.id}/contrasena`, { contrasena }, usuarios.token)
    setClave(null)
    mostrar(`Contraseña de ${usuario.nombre} restablecida.`)
  }

  return (
    <>
      <Heading kicker="Personas del taller" title="Usuarios" text="El administrador da de alta a los empleados; cada uno accede con su propio correo y contraseña.">
        <button className="primary" onClick={() => setCreando(true)}>+ Nuevo empleado</button>
      </Heading>

      {nodo}

      <section className="stats-grid dashboard-stats">
        <Stat label="Usuarios" value={usuarios.data.length} />
        <Stat label="Empleados activos" value={empleados.filter(usuario => usuario.activo).length} />
        <Stat label="Administradores" value={usuarios.data.filter(usuario => usuario.rol === 'admin').length} />
        <Stat label="Cuentas desactivadas" value={usuarios.data.filter(usuario => !usuario.activo).length} />
      </section>

      {usuarios.loading ? <p>Cargando usuarios...</p> : usuarios.error ? <p className="form-error">{usuarios.error}</p> : usuarios.data.length ? (
        <section className="employee-grid">
          {usuarios.data.map(usuario => (
            <article className={`employee-card ${usuario.activo ? '' : 'inactivo'}`} key={usuario.id}>
              <span className="avatar">{iniciales(usuario.nombre)}</span>

              <div>
                <h3>{usuario.nombre}</h3>
                <p>{usuario.email}</p>
                <small>{usuario.telefono || 'Sin teléfono'} · alta {fecha(usuario.creado_en)}</small>
              </div>

              <label className="status-control">
                Rol
                <select
                  value={usuario.rol}
                  disabled={String(usuario.id) === String(session.usuario.id)}
                  onChange={event => cambiarRol(usuario, event.target.value)}
                >
                  <option value="empleado">empleado</option>
                  <option value="admin">admin</option>
                </select>
              </label>

              <div className="card-buttons">
                <button onClick={() => setClave(usuario)}>Restablecer clave</button>
                <button
                  className={usuario.activo ? 'danger-link' : ''}
                  disabled={String(usuario.id) === String(session.usuario.id)}
                  onClick={() => alternarActivo(usuario)}
                >
                  {usuario.activo ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay usuarios cargados" text="Creá la primera cuenta de empleado." action={() => setCreando(true)} label="Nuevo empleado" />
      )}

      {creando && <UsuarioModal close={() => setCreando(false)} save={crear} />}
      {clave && <ClaveModal usuario={clave} close={() => setClave(null)} save={restablecer} />}
    </>
  )
}

function UsuarioModal({ close, save }) {
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', contrasena: '', rol: 'empleado' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cambiar = clave => event => setForm({ ...form, [clave]: event.target.value })

  const enviar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await save(form) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Nuevo empleado" subtitle="La cuenta queda activa de inmediato con la contraseña que definas." close={close}>
      <form onSubmit={enviar}>
        <label>Nombre completo<input required value={form.nombre} onChange={cambiar('nombre')} /></label>
        <label>Correo electrónico<input required type="email" value={form.email} onChange={cambiar('email')} /></label>
        <label>Teléfono<input value={form.telefono} onChange={cambiar('telefono')} placeholder="Opcional" /></label>
        <label>Contraseña inicial
          <input required minLength="8" type="password" value={form.contrasena} onChange={cambiar('contrasena')} />
          <small>Mínimo 8 caracteres. Compartila con la persona para su primer ingreso.</small>
        </label>
        <label>Rol
          <select value={form.rol} onChange={cambiar('rol')}>
            <option value="empleado">empleado</option>
            <option value="admin">admin</option>
          </select>
        </label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Crear cuenta" busy={busy} />
      </form>
    </Modal>
  )
}

function ClaveModal({ usuario, close, save }) {
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await save(usuario, contrasena) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Restablecer contraseña" subtitle={usuario.nombre} close={close}>
      <form onSubmit={enviar}>
        <label>Nueva contraseña
          <input required minLength="8" type="password" value={contrasena} onChange={event => setContrasena(event.target.value)} />
          <small>Mínimo 8 caracteres.</small>
        </label>
        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Restablecer" busy={busy} />
      </form>
    </Modal>
  )
}
