import { useState } from 'react'
import { useStore, sendReset } from './store.jsx'
import { useRoute, go, Avatar, ThemeToggle } from './ui.jsx'
import { AdminHome, ClientHome, NotificationsPage } from './pages/Home.jsx'
import ClientsPage, { ClientDetail } from './pages/Clients.jsx'
import TasksPage, { TaskModal } from './pages/Tasks.jsx'
import ApprovalsPage, { DeliverableModal } from './pages/Deliverables.jsx'
import ReportsPage, { ReportModal } from './pages/Reports.jsx'
import CalendarPage from './pages/Calendar.jsx'
import FilesPage from './pages/Files.jsx'
import TeamPage from './pages/Team.jsx'

function Login() {
  const { login, bootstrap } = useStore()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    const r = mode === 'login' ? await login(email, pw) : await bootstrap(name.trim() || email, email, pw)
    setBusy(false)
    if (r) setErr(r)
  }
  const reset = async () => {
    if (!email) return setErr('Escribí tu email y volvé a tocar "Olvidé mi contraseña".')
    try { await sendReset(email.trim()); setErr(''); alert('Te enviamos un email para crear una nueva contraseña.') } catch (e) { setErr(e.message) }
  }
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big"><span className="brand-mark">⚡</span><div><b>MetaFlash</b><small>by Bull Partners</small></div></div>
        <h2>{mode === 'login' ? 'Ingresá a tu espacio' : 'Crear administrador inicial'}</h2>
        {mode === 'setup' && <p className="muted sm mb">Solo se usa una vez, para crear la primera cuenta de Bull Partners.</p>}
        {mode === 'setup' && <label className="field"><span>Tu nombre</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>}
        <label className="field"><span>Email</span><input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Contraseña</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn primary big" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear administrador'}</button>
        <div className="demo row between">
          {mode === 'login' ? <button type="button" className="link sm" onClick={reset}>Olvidé mi contraseña</button> : <span />}
          <button type="button" className="link sm muted" onClick={() => { setMode(mode === 'login' ? 'setup' : 'login'); setErr('') }}>{mode === 'login' ? 'Primera vez (configuración)' : '‹ Volver al ingreso'}</button>
        </div>
      </form>
    </div>
  )
}

const STAFF_NAV = [
  ['', '🏠', 'Inicio'], ['clients', '👥', 'Clientes'], ['tasks', '✓', 'Tareas'], ['approvals', '🖼', 'Aprobaciones'],
  ['calendar', '📅', 'Calendario'], ['reports', '📊', 'Reportes'], ['files', '📁', 'Archivos'], ['team', '⚙︎', 'Equipo'],
]
const CLIENT_NAV = [['', '🏠', 'Inicio'], ['approvals', '✅', 'Aprobar'], ['reports', '📊', 'Reportes'], ['files', '📁', 'Archivos'], ['calendar', '📅', 'Calendario']]
const MODAL_BG = { task: 'tasks', deliverable: 'approvals', report: 'reports' }

export default function App() {
  const { user, view, logout, loading, noProfile } = useStore()
  const { parts } = useRoute()
  const [menu, setMenu] = useState(false)
  if (loading) return <div className="login"><p className="muted">Cargando…</p></div>
  if (noProfile) return <div className="login"><div className="login-card"><h2>Tu cuenta no tiene acceso</h2><p className="muted">Pedile a Bull Partners que te habilite.</p><button className="btn mt" onClick={logout}>Salir</button></div></div>
  if (!user) return <Login />

  const staff = user.role !== 'client'
  let [page, id] = parts
  let modal = null
  if (MODAL_BG[page]) {
    const close = () => (window.history.length > 1 ? window.history.back() : go('#/'))
    if (page === 'task') modal = <TaskModal key={id} taskId={id} onClose={close} />
    if (page === 'deliverable') modal = <DeliverableModal key={id} id={id} onClose={close} />
    if (page === 'report') modal = <ReportModal key={id} id={id} onClose={close} />
    page = staff ? MODAL_BG[page] : ''
    id = undefined
  }
  page = page || ''
  const nav = staff ? STAFF_NAV.filter(([k]) => k !== 'team' || user.role === 'admin') : CLIENT_NAV
  const unread = view.notifications.filter((n) => !n.read).length
  const pendingApprovals = view.deliverables.filter((d) => d.status === (staff ? 'cambios' : 'aprobacion')).length
  const unreadReports = !staff ? view.reports.filter((r) => !r.readAt).length : 0

  let body
  if (page === '') body = staff ? <AdminHome /> : <ClientHome />
  else if (page === 'clients' && staff) body = id ? <ClientDetail key={id} id={id} /> : <ClientsPage />
  else if (page === 'tasks' && staff) body = <TasksPage />
  else if (page === 'approvals') body = <ApprovalsPage />
  else if (page === 'calendar') body = <CalendarPage />
  else if (page === 'reports') body = <ReportsPage />
  else if (page === 'files') body = <FilesPage />
  else if (page === 'team' && user.role === 'admin') body = <TeamPage />
  else if (page === 'notifications') body = <NotificationsPage />
  else body = staff ? <AdminHome /> : <ClientHome />

  const badge = (k) => (k === 'approvals' ? pendingApprovals : k === 'reports' ? unreadReports : 0)

  return (
    <div className={'shell' + (staff ? '' : ' client')}>
      <aside className={'side' + (menu ? ' open' : '')} onClick={() => setMenu(false)}>
        <div className="brand"><span className="brand-mark">⚡</span><div><b>MetaFlash</b><small>{staff ? 'Bull Partners' : view.clients[0]?.name}</small></div></div>
        <nav>
          {nav.map(([k, icon, label]) => (
            <a key={k} href={`#/${k}`} className={page === k ? 'on' : ''}><span className="nav-i">{icon}</span>{label}{badge(k) > 0 && <span className="count">{badge(k)}</span>}</a>
          ))}
        </nav>
        {staff && view.clients.length > 0 && <div className="side-clients">
          <small>Clientes</small>
          {view.clients.map((c) => <a key={c.id} href={`#/clients/${c.id}`} className={page === 'clients' && parts[1] === c.id ? 'on' : ''}><span className="logo-c xs">{c.name[0]}</span>{c.name}</a>)}
        </div>}
        <div className="side-foot">
          <div className="row gap-s"><Avatar user={user} size={30} /><div className="grow"><b className="sm">{user.name}</b><small className="muted">{user.role === 'admin' ? 'Administrador' : user.role === 'team' ? 'Equipo' : 'Cliente'}</small></div></div>
          <div className="row gap-s mt-s">
            <button className="btn ghost sm" onClick={logout}>Salir</button>
          </div>
          <div>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <button className="icon-btn burger" onClick={() => setMenu(true)}>☰</button>
          <span className="grow" />
          <a href="#/notifications" className="bell" aria-label="Notificaciones">🔔{unread > 0 && <span className="count">{unread}</span>}</a>
        </header>
        <main className="content">{body}</main>
      </div>
      {!staff && (
        <nav className="bottom-nav">
          {CLIENT_NAV.slice(0, 4).map(([k, icon, label]) => <a key={k} href={`#/${k}`} className={page === k ? 'on' : ''}><span>{icon}</span>{label}{badge(k) > 0 && <i className="count">{badge(k)}</i>}</a>)}
        </nav>
      )}
      {modal}
    </div>
  )
}
