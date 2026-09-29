import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import './styles.css'
import './auth.css'
import './features.css'
import './production.css'
import { SessionContext, api, iniciales, useSession } from './api.js'
import WorkshopPanels, { seccionesPara } from './workshop-panels.jsx'
import MisTareas from './mis-tareas.jsx'
// La web pública vive en /web-publica, fuera de /src, para no mezclarse
// con los archivos del sistema interno (paneles, auth, etc.).
import PublicLayout from '../web-publica/PublicLayout.jsx'
import Home from '../web-publica/Home.jsx'
import Catalogo from '../web-publica/Catalogo.jsx'
import ProductoDetalle from '../web-publica/ProductoDetalle.jsx'
import Contacto from '../web-publica/Contacto.jsx'
// Adaptación a móvil/tablet del panel interno. Va última para que sus
// media queries tengan prioridad sobre las hojas de arriba sin tocar
// ninguna regla de escritorio.
import './responsive.css'

// "admin" y "super_admin" comparten el panel (Shell); lo que cambia entre
// ellos es qué secciones ve cada uno (ver seccionesPara en workshop-panels.jsx).
const esRolAdministrativo = rol => rol === 'admin' || rol === 'super_admin'

function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('atelier_session')) } catch { return null } })
  const start = data => { localStorage.setItem('atelier_session', JSON.stringify(data)); setSession(data) }
  const close = () => { localStorage.removeItem('atelier_session'); setSession(null) }

  return (
    <SessionContext.Provider value={{ session, start, close }}>
      <BrowserRouter>
        <Routes>
          <Route path="/iniciar-sesion" element={<Public><Login /></Public>} />
          <Route path="/admin" element={<Protected roles={['admin', 'super_admin']}><Admin /></Protected>} />
          <Route path="/mis-tareas" element={<Protected roles={['empleado']}><Empleado /></Protected>} />

          {/* Web pública: catálogo de la herrería, sin login. */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/productos" element={<Catalogo />} />
            <Route path="/productos/:slug" element={<ProductoDetalle />} />
            <Route path="/contacto" element={<Contacto />} />
            <Route path="*" element={<PublicNotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}

function Landing() {
  const { session } = useSession()
  return <Navigate to={session ? (esRolAdministrativo(session.usuario.rol) ? '/admin' : '/mis-tareas') : '/iniciar-sesion'} replace />
}
function Public({ children }) { const { session } = useSession(); return session ? <Landing /> : children }

function PublicNotFound() {
  return (
    <div className="estado-vacio-publico" style={{ paddingTop: '180px', paddingBottom: '120px' }}>
      <span>◇</span>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 10 }}>No encontramos esta página</h1>
      <p>Puede que el enlace esté roto o la página ya no exista.</p>
      <NavLink className="btn-public btn-fantasma" to="/" style={{ marginTop: 20, display: 'inline-flex' }}>Volver al inicio</NavLink>
    </div>
  )
}
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
      navigate(esRolAdministrativo(data.usuario.rol) ? '/admin' : '/mis-tareas', { replace: true })
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
    </AuthPage>
  )
}

function Shell({ title, secciones = [], seccionActiva, onSeccion, children }) {
  const { session, close } = useSession()
  // Menú hamburguesa (solo móvil): en pantallas chicas la misma barra
  // lateral se convierte en un panel deslizable. En escritorio la clase
  // "abierta" no tiene ningún efecto (ver responsive.css).
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cerrarMenu = () => setMenuAbierto(false)

  useEffect(() => {
    if (!menuAbierto) return undefined
    const alTeclear = event => { if (event.key === 'Escape') setMenuAbierto(false) }
    // Si se agranda la ventana a escritorio con el menú abierto, se cierra.
    const escritorio = window.matchMedia('(min-width: 768px)')
    const alCambiar = event => { if (event.matches) setMenuAbierto(false) }
    const raiz = document.documentElement
    const overflowPrevio = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    window.addEventListener('keydown', alTeclear)
    escritorio.addEventListener('change', alCambiar)
    return () => {
      raiz.style.overflow = overflowPrevio
      window.removeEventListener('keydown', alTeclear)
      escritorio.removeEventListener('change', alCambiar)
    }
  }, [menuAbierto])

  const elegirSeccion = nombre => { if (menuAbierto) { cerrarMenu(); window.scrollTo(0, 0) } onSeccion(nombre) }

  return (
    <div className="app-shell auth-shell">
      <div className={`sidebar-fondo ${menuAbierto ? 'abierto' : ''}`} onClick={cerrarMenu} aria-hidden="true" />
      <aside id="menu-panel" className={`sidebar ${menuAbierto ? 'abierta' : ''}`}>
        <div className="brand">El Atelier<span>HUB DE PRODUCCIÓN</span></div>

        <nav>
          {secciones.map(([nombre, icono]) => (
            <button key={nombre} className={seccionActiva === nombre ? 'selected' : ''} onClick={() => elegirSeccion(nombre)}>
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
          <button
            type="button"
            className={`menu-toggle ${menuAbierto ? 'abierto' : ''}`}
            onClick={() => setMenuAbierto(!menuAbierto)}
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuAbierto}
            aria-controls="menu-panel"
          >
            <span /><span /><span />
          </button>
          <div className="crumb">{title}</div>
          <span className={`role-badge ${session.usuario.rol}`} title={session.usuario.rol}>
            {session.usuario.rol === 'super_admin' ? 'S' : session.usuario.rol === 'admin' ? 'A' : 'O'}
          </span>
        </header>
        <div className="content auth-content">{children}</div>
      </main>
    </div>
  )
}

function Admin() {
  const { session } = useSession()
  const [section, setSection] = useState('Panel de control')
  const rol = session.usuario.rol
  return (
    <Shell title={section} secciones={seccionesPara(rol)} seccionActiva={section} onSeccion={setSection}>
      <WorkshopPanels section={section} setSection={setSection} rol={rol} />
    </Shell>
  )
}

function Empleado() {
  return (
    <Shell title="Mis tareas" secciones={[['Mis tareas', '▦']]} seccionActiva="Mis tareas" onSeccion={() => {}}>
      <MisTareas />
    </Shell>
  )
}

createRoot(document.getElementById('root')).render(<App />)
