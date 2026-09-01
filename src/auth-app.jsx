import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import './styles.css'
import './auth.css'
import './features.css'
import './production.css'
import { SessionContext, api, iniciales, useSession } from './api.js'
import WorkshopPanels, { seccionesAdmin } from './workshop-panels.jsx'
import MisTareas from './mis-tareas.jsx'

function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('atelier_session')) } catch { return null } })
  const start = data => { localStorage.setItem('atelier_session', JSON.stringify(data)); setSession(data) }
  const close = () => { localStorage.removeItem('atelier_session'); setSession(null) }

  return (
    <SessionContext.Provider value={{ session, start, close }}>
      <BrowserRouter>
        <Routes>
          <Route path="/iniciar-sesion" element={<Public><Login /></Public>} />
          <Route path="/registro" element={<Public><Register /></Public>} />
          <Route path="/admin" element={<Protected roles={['admin']}><Admin /></Protected>} />
          <Route path="/mis-tareas" element={<Protected roles={['empleado']}><Empleado /></Protected>} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}

function Landing() {
  const { session } = useSession()
  return <Navigate to={session ? (session.usuario.rol === 'admin' ? '/admin' : '/mis-tareas') : '/iniciar-sesion'} replace />
}
function Public({ children }) { const { session } = useSession(); return session ? <Landing /> : children }
function Protected({ roles, children }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/iniciar-sesion" replace />
  return roles.includes(session.usuario.rol) ? children : <Landing />
}

function AuthPage({ title, description, children, foot }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">El Atelier <span>HUB DE PRODUCCIÓN</span></div>
        <p className="eyebrow">Acceso al sistema</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
        {children}
        {foot && <p className="auth-foot">{foot}</p>}
      </section>
    </main>
  )
}

function Login() {
  const { start } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const data = await api.post('/auth/iniciar-sesion', { email, contrasena: password })
      start(data)
      navigate(data.usuario.rol === 'admin' ? '/admin' : '/mis-tareas', { replace: true })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthPage title="Bienvenido" description="Ingresá con tu cuenta para acceder a tus tareas.">
      <form className="auth-form" onSubmit={submit}>
        <label>Correo electrónico<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Contraseña<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" disabled={busy}>{busy ? 'Ingresando...' : 'Iniciar sesión'}</button>
      </form>
      <p className="auth-foot">¿No tenés cuenta? <NavLink to="/registro">Registrate</NavLink></p>
    </AuthPage>
  )
}

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ nombre: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const change = key => event => setForm({ ...form, [key]: event.target.value })

  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const data = await api.post('/auth/registro', { nombre: form.nombre, email: form.email, contrasena: form.password })
      setNotice(`${data.mensaje} Ya podés iniciar sesión.`)
      setTimeout(() => navigate('/iniciar-sesion'), 1300)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthPage title="Crear cuenta" description="Toda cuenta nueva se registra con el rol de empleado.">
      <form className="auth-form" onSubmit={submit}>
        <label>Nombre completo<input required value={form.nombre} onChange={change('nombre')} /></label>
        <label>Correo electrónico<input required type="email" value={form.email} onChange={change('email')} /></label>
        <label>Contraseña<input required minLength="8" type="password" value={form.password} onChange={change('password')} /><small>Mínimo 8 caracteres.</small></label>
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="form-success">{notice}</p>}
        <button className="primary full" disabled={busy}>{busy ? 'Creando...' : 'Crear cuenta'}</button>
      </form>
      <p className="auth-foot">¿Ya tenés una cuenta? <NavLink to="/iniciar-sesion">Iniciá sesión</NavLink></p>
    </AuthPage>
  )
}

function Shell({ title, secciones = [], seccionActiva, onSeccion, children }) {
  const { session, close } = useSession()

  return (
    <div className="app-shell auth-shell">
      <aside className="sidebar">
        <div className="brand">El Atelier<span>HUB DE PRODUCCIÓN</span></div>

        <nav>
          {secciones.map(([nombre, icono]) => (
            <button key={nombre} className={seccionActiva === nombre ? 'selected' : ''} onClick={() => onSeccion(nombre)}>
              <span className="icon">{icono}</span>{nombre}
            </button>
          ))}
        </nav>

        <div className="side-bottom">
          <div className="user">
            <span>{iniciales(session.usuario.nombre)}</span>
            <div><b>{session.usuario.nombre}</b><small>{session.usuario.rol}</small></div>
          </div>
          <button onClick={close}>↪ Cerrar sesión</button>
        </div>
      </aside>

      <main>
        <header>
          <div className="crumb">{title}</div>
          <span className="role-badge">{session.usuario.rol}</span>
        </header>
        <div className="content auth-content">{children}</div>
      </main>
    </div>
  )
}

function Admin() {
  const users = useData('/usuarios'); const tasks = useData('/tareas'); const { session } = useSession(); const token = session.token; const [message, setMessage] = useState(''); const [section, setSection] = useState('Panel de control')
  const changeRole = async (id, rol) => { try { await request(`/usuarios/${id}/rol`, { method: 'PATCH', body: JSON.stringify({ rol }) }, token); users.load(); setMessage('Rol actualizado.') } catch (err) { setMessage(err.message) } }
  const createProduct = async product => { await request('/tareas', { method: 'POST', body: JSON.stringify(product) }, token); await tasks.load() }
  const updateStage = async (taskId, stageId, realizada) => { await request(`/tareas/${taskId}/etapas/${stageId}`, { method: 'PATCH', body: JSON.stringify({ realizada }) }, token); await tasks.load() }
  const updateStatus = async (taskId, estado) => { await request(`/tareas/${taskId}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }, token); await tasks.load() }
  const administration = <><section className="page-heading"><div><p className="eyebrow">Administrador</p><h1>Administración del sistema</h1><p className="muted">Gestioná usuarios, roles y consultá todos los productos asignados.</p></div></section>{message && <p className="notice">{message}</p>}<section className="stats-grid admin-stats"><Stat label="Usuarios" value={users.data.length}/><Stat label="Empleados" value={users.data.filter(u => u.rol === 'empleado').length}/><Stat label="Productos asignados" value={tasks.data.length}/><Stat label="Terminados" value={tasks.data.filter(t => t.estado === 'REALIZADA').length}/></section><section className="list-panel"><div className="section-heading"><div><h2>Todos los productos de producción</h2><p>Se crean desde “Nuevo producto”.</p></div></div><TaskList tasks={tasks.data} /></section><section className="list-panel users-panel"><div className="section-heading"><div><h2>Usuarios y roles</h2><p>Solo el administrador puede cambiar roles.</p></div></div>{users.loading ? <p>Cargando usuarios...</p> : users.error ? <p className="form-error">{users.error}</p> : <div className="users-table">{users.data.map(user => <div key={user.id}><span><b>{user.nombre}</b><small>{user.email}</small></span><select value={user.rol} onChange={e => changeRole(user.id, e.target.value)}><option value="empleado">empleado</option><option value="admin">admin</option></select></div>)}</div>}</section></>
  return <Shell title={section} adminSection={section} setAdminSection={setSection}><WorkshopPanels section={section} setSection={setSection} users={users.data} tasks={tasks.data} onCreateProduct={createProduct} onUpdateStage={updateStage} onUpdateStatus={updateStatus} administration={administration}/></Shell>
}

function Empleado() {
  return (
    <Shell title="Mis tareas" secciones={[['Mis tareas', '▦']]} seccionActiva="Mis tareas" onSeccion={() => {}}>
      <MisTareas />
    </Shell>
  )
}

createRoot(document.getElementById('root')).render(<App />)
