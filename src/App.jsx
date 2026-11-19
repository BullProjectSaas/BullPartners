import { useState } from 'react'
import { useStore } from './store.jsx'
import { useRoute, go, Avatar } from './ui.jsx'
import { AdminHome, ClientHome, NotificationsPage } from './pages/Home.jsx'
import ClientsPage, { ClientDetail } from './pages/Clients.jsx'
import TasksPage, { TaskModal } from './pages/Tasks.jsx'
import ApprovalsPage, { DeliverableModal } from './pages/Deliverables.jsx'
import ReportsPage, { ReportModal } from './pages/Reports.jsx'
import CalendarPage from './pages/Calendar.jsx'
import FilesPage from './pages/Files.jsx'
import TeamPage from './pages/Team.jsx'

function Login() {
  const { login } = useStore()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const demo = [['Admin', 'admin@bull.com', 'admin123'], ['Equipo', 'sofia@bull.com', 'equipo123'], ['Cliente', 'cliente@abc.com', 'cliente123']]
  return (
    <div className="login">
      <form className="login-card" onSubmit={(e) => { e.preventDefault(); if (!login(email, pw)) setErr('Email o contraseña incorrectos.') }}>
        <div className="brand big"><span className="brand-mark">⚡</span><div><b>MetaFlash</b><small>by Bull Partners</small></div></div>
        <h2>Ingresá a tu espacio</h2>
        <label className="field"><span>Email</span><input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Contraseña</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn primary big">Ingresar</button>
        <div className="demo">
          <small className="muted">Accesos de demostración</small>
          <div className="row gap-s wrap">{demo.map(([l, e, p]) => <button type="button" key={l} className="chip" onClick={() => { setEmail(e); setPw(p) }}>{l}</button>)}</div>
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
  const { user, view, logout, resetDemo } = useStore()
  const { parts } = useRoute()
  const [menu, setMenu] = useState(false)
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
            {user.role === 'admin' && <button className="btn ghost sm" title="Vuelve a los datos de ejemplo" onClick={() => confirm('¿Restaurar los datos de demostración? Se pierde todo lo cargado.') && resetDemo()}>Reset demo</button>}
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
