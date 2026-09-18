import React, { useEffect, useState } from 'react'
import { api, fecha, iniciales, useData, useSession } from './api.js'
import { Actions, Empty, Heading, Modal, Stat, useAviso } from './ui.jsx'

export default function PanelUsuarios({ intencion, limpiarIntencion, rol }) {
  const usuarios = useData('/usuarios')
  const { session } = useSession()
  const { mostrar, nodo } = useAviso()
  const [creando, setCreando] = useState(false)
  const [clave, setClave] = useState(null)
  const [borrando, setBorrando] = useState(null)
  // Un "admin" común ve esta sección y también puede crear cuentas, pero
  // con permisos acotados: solo restablece la clave de un empleado, solo
  // puede eliminar (de forma permanente) la cuenta de un empleado, y solo
  // puede asignar (al crear o al cambiar el rol) el rol "empleado", nunca
  // "admin". "super_admin" no tiene ninguna de estas restricciones, salvo
  // que tampoco elimina cuentas de admin/super_admin: esas siguen la baja
  // lógica (desactivar/reactivar) para no perder el historial de quién
  // hizo qué.
  const esSuperAdmin = rol === 'super_admin'

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

  // Baja definitiva de un empleado (no de admin/super_admin, que siguen la
  // baja lógica de arriba). No atrapamos el error acá: lo levanta el propio
  // modal de confirmación para mostrarlo ahí (por ejemplo, si el empleado
  // tiene tareas o pedidos asociados y el servidor rechaza el borrado).
  const eliminar = async usuario => {
    await api.del(`/usuarios/${usuario.id}`, usuarios.token)
    setBorrando(null)
    await usuarios.load()
    mostrar(`${usuario.nombre} fue eliminado.`)
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
        <Stat label="Administradores" value={usuarios.data.filter(usuario => usuario.rol === 'admin' || usuario.rol === 'super_admin').length} />
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
                {/* Un "admin" común solo tiene "empleado" para elegir (nunca
                    puede asignar "admin") y no puede tocar el rol de una
                    cuenta "super_admin". Un "super_admin" no tiene esa
                    restricción (tiene permiso total); solo se bloquea el
                    selector para su propia cuenta. La asignación del rol
                    "super_admin" en sí sigue siendo una acción manual, ver
                    server/scripts/configurar-super-admin.js. */}
                <select
                  value={usuario.rol}
                  disabled={String(usuario.id) === String(session.usuario.id) || (usuario.rol === 'super_admin' && !esSuperAdmin)}
                  onChange={event => cambiarRol(usuario, event.target.value)}
                >
                  <option value="empleado">empleado</option>
                  {(esSuperAdmin || usuario.rol === 'admin') && <option value="admin">admin</option>}
                  {usuario.rol === 'super_admin' && <option value="super_admin">super_admin</option>}
                </select>
              </label>

              <div className="card-buttons">
                {/* Un "admin" común solo puede restablecer la clave de un
                    empleado: para las demás filas (otro admin) el botón
                    directamente no se muestra, en vez de mostrarse
                    deshabilitado. "super_admin" lo ve siempre. */}
                {(esSuperAdmin || usuario.rol === 'empleado') && (
                  <button onClick={() => setClave(usuario)}>
                    Restablecer clave
                  </button>
                )}
                {/* A un empleado se lo elimina directamente (baja
                    definitiva, con confirmación en un modal aparte): tanto
                    un "admin" común como "super_admin" ven este botón en
                    esas filas. Para las demás filas (otro admin) sigue
                    existiendo la baja lógica de siempre, pero exclusiva de
                    "super_admin" -un "admin" común nunca la ve, en ninguna
                    fila-, porque ahí sí interesa preservar el historial de
                    quién hizo qué. */}
                {usuario.rol === 'empleado' ? (
                  <button className="danger-link" onClick={() => setBorrando(usuario)}>
                    Eliminar cuenta
                  </button>
                ) : esSuperAdmin && (
                  <button
                    className={usuario.activo ? 'danger-link' : ''}
                    disabled={String(usuario.id) === String(session.usuario.id)}
                    title={String(usuario.id) === String(session.usuario.id) ? 'No podés desactivar tu propia cuenta.' : undefined}
                    onClick={() => alternarActivo(usuario)}
                  >
                    {usuario.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty title="No hay usuarios cargados" text="Creá la primera cuenta de empleado." action={() => setCreando(true)} label="Nuevo empleado" />
      )}

      {creando && <UsuarioModal close={() => setCreando(false)} save={crear} esSuperAdmin={esSuperAdmin} />}
      {clave && <ClaveModal usuario={clave} close={() => setClave(null)} save={restablecer} />}
      {borrando && <EliminarModal usuario={borrando} close={() => setBorrando(null)} save={eliminar} />}
    </>
  )
}

function UsuarioModal({ close, save, esSuperAdmin }) {
  const [form, setForm] = useState({ nombre: '', email: '', contrasena: '', rol: 'empleado' })
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
        <label>Contraseña inicial
          <input required minLength="8" type="password" value={form.contrasena} onChange={cambiar('contrasena')} />
          <small>Mínimo 8 caracteres. Compartila con la persona para su primer ingreso.</small>
        </label>
        <label>Rol
          {/* Un "admin" común solo puede crear cuentas de empleado: la
              opción "admin" solo aparece para "super_admin" (misma regla
              que al cambiar el rol de una cuenta existente). */}
          <select value={form.rol} onChange={cambiar('rol')}>
            <option value="empleado">empleado</option>
            {esSuperAdmin && <option value="admin">admin</option>}
          </select>
        </label>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Crear cuenta" busy={busy} />
      </form>
    </Modal>
  )
}

// Confirmación de la baja definitiva del empleado: el "cartel de alerta"
// pedido antes de ejecutar una acción irreversible. Sus tareas libres
// asignadas quedan sin responsable (no bloquean el borrado, ver
// DELETE /usuarios/:id). Si el servidor igual la rechaza (por ejemplo,
// tiene pedidos o recompensas asociados), el error se muestra acá mismo y
// el modal queda abierto.
function EliminarModal({ usuario, close, save }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await save(usuario) }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Eliminar cuenta" subtitle={usuario.nombre} close={close}>
      <form onSubmit={enviar}>
        <p className="form-error">Esta acción no se puede deshacer: se va a borrar definitivamente la cuenta de {usuario.nombre} ({usuario.email}). No va a poder volver a iniciar sesión. Si tenía tareas asignadas, van a quedar sin responsable para que se las reasignes a otro empleado desde el panel de Tareas.</p>
        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label="Sí, eliminar" busy={busy} />
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
