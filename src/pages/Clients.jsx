import { useEffect, useState } from 'react'
import { useStore, sendReset, getIntegration, adminApi, getPendingSecret, savePendingSecret, deletePendingSecret, monthKey, monthLabel, addMonths, monthSummary, projectProgress, PROJECT_STATUS } from '../store.jsx'
import { Modal, Field, Card, Progress, Badge, Empty, Avatar, Tabs, Stat, UserSelect, go, fmtDate, fmtDateTime } from '../ui.jsx'
import TasksPage, { TaskRow } from './Tasks.jsx'
import { ClientFlows, WorkflowPicker } from './Workflows.jsx'
import ApprovalsPage, { DelivCard } from './Deliverables.jsx'
import ReportsPage from './Reports.jsx'
import FilesPage from './Files.jsx'

function SalesConnection({ f, conn, setConn }) {
  const [accounts, setAccounts] = useState(null)
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    getIntegration().then(async (integ) => {
      try {
        const [acc, cfg] = await Promise.all([adminApi(integ, { action: 'accounts' }), adminApi(integ, { action: 'config', client: f.salesKey })])
        setAccounts(acc.accounts)
        const c = cfg.config
        if (c) setConn((p) => ({ ...p, sheet: `https://docs.google.com/spreadsheets/d/${c.sheetId}/edit`, sheetName: c.sheetName || 'Leads', pixel: c.pixelId || '', account: c.adAccountId || '', currency: c.currency || '', hasCapi: c.hasCapiToken, title: c.sheetTitle }))
        else {
          const pc = f.pendingConn || {}
          const sec = await getPendingSecret(f.salesKey).catch(() => null)
          setConn((p) => ({ ...p, pixel: pc.pixel || '', account: pc.account || '', currency: pc.currency || '', sheetName: pc.sheetName || 'Leads', hasCapi: !!sec?.capi }))
        }
      } catch (e) { setErr(e.message) }
      setLoaded(true)
    })
  }, []) // eslint-disable-line
  const set = (k) => (e) => setConn((p) => ({ ...p, [k]: e.target.value, dirty: true }))
  return (
    <>
      <h4>Métricas y ventas</h4>
      {err && <div className="callout warn">{err}</div>}
      {!loaded ? <p className="muted sm">Cargando conexión…</p> : <>
        <Field label="Cuenta publicitaria">
          <select value={conn.account} onChange={(e) => { const a = accounts?.find((x) => x.id === e.target.value); setConn((p) => ({ ...p, account: e.target.value, currency: a?.currency || p.currency, dirty: true })) }}>
            <option value="">Sin cuenta publicitaria</option>
            {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.id}{a.active ? '' : ' (inactiva)'}</option>)}
          </select>
        </Field>
        <Field label="Link de la planilla de leads" hint={conn.title ? `Conectada: ${conn.title}` : 'Podés dejarla vacía y cargarla después: el píxel, la cuenta y el token quedan guardados. La planilla tiene que estar en la cuenta de Google del script (o compartida con ella).'}>
          <input value={conn.sheet} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={set('sheet')} />
        </Field>
        <div className="grid2">
          <Field label="Nombre de la hoja"><input value={conn.sheetName} onChange={set('sheetName')} /></Field>
          <Field label="Píxel (ID del conjunto de datos)"><input value={conn.pixel} inputMode="numeric" onChange={set('pixel')} /></Field>
        </div>
        <Field label="Token de API de conversiones" hint={conn.hasCapi ? 'Ya hay un token guardado. Dejalo vacío para mantenerlo.' : 'Events Manager → píxel → Configuración → Generar token de acceso.'}>
          <input type="password" autoComplete="new-password" name="mf-capi-token" value={conn.capi} placeholder={conn.hasCapi ? '••••••••' : 'EAA…'} onChange={set('capi')} />
        </Field>
      </>}
    </>
  )
}

export function ClientModal({ client, onClose }) {
  const { actions, view } = useStore()
  const login = client && view.users.find((u) => u.role === 'client' && u.clientId === client.id)
  const [f, setF] = useState(() => ({ salesKey: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10), ...(client || { name: '', contact: '', email: '', status: 'activo' }) }))
  const [acc, setAcc] = useState({ name: login?.name || '', email: login?.email || '', password: '' })
  const [busy, setBusy] = useState(false)
  const [flows, setFlows] = useState([])
  const [conn, setConn] = useState({ sheet: '', sheetName: 'Leads', pixel: '', capi: '', account: '', currency: '', dirty: false })
  const save = async () => {
    if (!f.name.trim()) return alert('Poné el nombre del cliente.')
    if (conn.dirty) {
      setBusy(true)
      try {
        if (!conn.sheet.trim()) {
          // Sin planilla todavía: se guarda en la app y se conecta cuando se cargue la planilla.
          if (conn.capi.trim()) await savePendingSecret(f.salesKey, { capi: conn.capi.trim() })
          f.pendingConn = { pixel: conn.pixel.trim(), account: conn.account, currency: conn.currency, sheetName: conn.sheetName }
        } else {
          const integ = await getIntegration()
          const sec = conn.capi.trim() ? null : await getPendingSecret(f.salesKey).catch(() => null)
          const r = await adminApi(integ, { action: 'register', client: f.salesKey, sheet: conn.sheet, sheetName: conn.sheetName, pixel: conn.pixel, capi: conn.capi.trim() || sec?.capi || '', account: conn.account, currency: conn.currency })
          f.salesUrl = integ.url
          f.adAccountId = conn.account || null
          f.pendingConn = null
          if (sec?.capi) await deletePendingSecret(f.salesKey).catch(() => {})
          if (r.warnings?.length) alert(r.warnings.join('\n'))
        }
      } catch (e) { setBusy(false); return alert('No se pudo guardar la conexión: ' + e.message) }
    }
    if (!login && acc.email && acc.password.length < 6) return alert('La contraseña del cliente debe tener al menos 6 caracteres.')
    setBusy(true)
    const err = await actions.saveClient(f, acc.email ? acc : null, client ? [] : flows)
    setBusy(false)
    if (err) return alert('El cliente se guardó, pero no se pudo crear su acceso: ' + err)
    onClose()
  }
  return (
    <Modal title={client ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose} footer={<>
      {client && <button className="btn danger ghost" onClick={() => { if (confirm(`¿Eliminar ${client.name} y todos sus datos?`)) { actions.deleteClient(client.id); onClose(); go('#/clients') } }}>Eliminar</button>}
      <span className="grow" /><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></>}>
      <Field label="Nombre de la empresa"><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Contacto"><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
      </div>
      <Field label="Estado del servicio"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="activo">Activo</option><option value="pausado">Pausado</option><option value="finalizado">Finalizado</option></select></Field>
      {!client && <WorkflowPicker value={flows} onChange={setFlows} />}
      <SalesConnection f={f} setF={setF} conn={conn} setConn={setConn} />
      <h4>Acceso al portal del cliente</h4>
      <div className="grid2">
        <Field label="Email de acceso"><input type="email" disabled={!!login} value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} /></Field>
        {login ? <Field label="Contraseña"><button type="button" className="btn ghost sm" onClick={() => sendReset(login.email).then(() => alert('Le enviamos un email para cambiar la contraseña.'), (e) => alert(e.message))}>✉️ Enviar email para cambiarla</button></Field>
          : <Field label="Contraseña inicial" hint="Mínimo 6 caracteres"><input value={acc.password} onChange={(e) => setAcc({ ...acc, password: e.target.value })} /></Field>}
      </div>
      <Field label="Nombre visible"><input value={acc.name} placeholder={f.contact} onChange={(e) => setAcc({ ...acc, name: e.target.value })} /></Field>
    </Modal>
  )
}

function ProjectModal({ project, clientId, onClose }) {
  const { actions, view } = useStore()
  const [f, setF] = useState(project ? { ...project } : { clientId, name: '', ownerId: null, status: 'activo', start: new Date().toISOString().slice(0, 10), end: '' })
  return (
    <Modal title={project ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={onClose} footer={<>{project && <button className="btn danger ghost" onClick={() => { if (confirm('¿Eliminar este proyecto? Sus tareas y entregables se conservan.')) { actions.deleteProject(project.id); onClose() } }}>Eliminar</button>}<span className="grow" /><button className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn primary" onClick={() => { if (!f.name.trim()) return alert('Poné un nombre.'); actions.saveProject(f); onClose() }}>Guardar</button></>}>
      <Field label="Nombre"><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Responsable"><UserSelect users={view.users.filter((u) => u.role !== 'client')} value={f.ownerId} onChange={(v) => setF({ ...f, ownerId: v })} /></Field>
        <Field label="Estado"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="Inicio"><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Finalización"><input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

export function MonthPanel({ client, compact }) {
  const { view, user, actions } = useStore()
  const [mk, setMk] = useState(monthKey())
  const s = monthSummary(view, client, mk)
  const items = view.deliverables.filter((d) => d.clientId === client.id && d.month === mk)
  return (
    <Card title={<span className="row gap-s"><button className="icon-btn" onClick={() => setMk(addMonths(mk, -1))}>‹</button>{monthLabel(mk)}<button className="icon-btn" onClick={() => setMk(addMonths(mk, 1))}>›</button></span>}
      action={user.role !== 'client' && !compact && <button className="btn ghost sm" onClick={() => {
        if (!confirm(`¿Copiar las tareas de ${monthLabel(mk)} a ${monthLabel(addMonths(mk, 1))}? Se crean como pendientes.`)) return
        const n = actions.duplicateMonth(client.id, mk)
        alert(n ? `${n} tareas copiadas a ${monthLabel(addMonths(mk, 1))}.` : 'Este mes no tiene tareas para copiar.')
      }}>⧉ Duplicar tareas al mes siguiente</button>}>
      <div className="stats4">
        <Stat label="Anuncios del mes" value={s.total} />
        <Stat label="Aprobados" value={s.approved} color="#16A34A" />
        <Stat label="Esperando aprobación" value={s.waiting} color="#D97706" />
        <Stat label="Con cambios pedidos" value={s.changes} color="#DC2626" />
      </div>
      <div className="row between mt-s sm">
        <span className="muted">Tareas del mes: {s.done}/{s.tasks} completadas</span>
        {s.report ? <button className="link" onClick={() => go(`#/report/${s.report.id}`)}>📊 Reporte mensual publicado</button> : <span className="muted">📊 Reporte mensual pendiente</span>}
      </div>
      {!compact && items.length > 0 && <div className="dgrid mt">{items.map((d) => <DelivCard key={d.id} d={d} />)}</div>}
    </Card>
  )
}

function ClientOverview({ client }) {
  const { view, user, actions } = useStore()
  const [proj, setProj] = useState(null)
  const [news, setNews] = useState('')
  const projects = view.projects.filter((p) => p.clientId === client.id)
  const clientTasks = view.tasks.filter((t) => t.clientId === client.id && t.visibleToClient && t.status !== 'completada' && view.users.find((u) => u.id === t.assigneeId)?.role === 'client')
  return (
    <div className="stack">
      <MonthPanel client={client} />
      <ClientFlows clientId={client.id} />
      <div className="grid2">
        <Card title="Proyectos" action={user.role === 'admin' && <button className="btn ghost sm" onClick={() => setProj({})}>+ Proyecto</button>}>
          {projects.map((p) => {
            const pct = projectProgress(view.tasks, p.id)
            return (
              <div key={p.id} className="proj" onClick={() => user.role === 'admin' && setProj(p)}>
                <div className="row between"><b>{p.name}</b><Badge color={PROJECT_STATUS[p.status].color}>{PROJECT_STATUS[p.status].label}</Badge></div>
                <div className="row gap-s muted sm"><Avatar user={view.users.find((u) => u.id === p.ownerId)} size={18} />{view.users.find((u) => u.id === p.ownerId)?.name || 'Sin responsable'} · {fmtDate(p.start)} → {fmtDate(p.end)}</div>
                <div className="row gap-s"><Progress value={pct} /><small>{pct}%</small></div>
              </div>
            )
          })}
          {!projects.length && <p className="muted sm">Sin proyectos.</p>}
        </Card>
        <Card title="Esperando al cliente">
          {clientTasks.length ? clientTasks.map((t) => <TaskRow key={t.id} t={t} showClient={false} />) : <p className="muted sm">El cliente no tiene tareas pendientes.</p>}
        </Card>
      </div>
      <Card title="Novedades para el cliente">
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (news.trim()) { actions.addNews(client.id, news.trim()); setNews('') } }}>
          <input className="grow" placeholder="Ej.: Lanzamos la nueva campaña de promociones 🚀" value={news} onChange={(e) => setNews(e.target.value)} />
          <button className="btn primary" disabled={!news.trim()}>Publicar</button>
        </form>
        {view.news.filter((n) => n.clientId === client.id).map((n) => (
          <div key={n.id} className="news"><p>{n.text}</p><small className="muted">{fmtDateTime(n.at)}</small><button className="icon-btn" onClick={() => actions.deleteNews(n.id)}>✕</button></div>
        ))}
      </Card>
      {proj && <ProjectModal project={proj.id ? proj : null} clientId={client.id} onClose={() => setProj(null)} />}
    </div>
  )
}

export function ClientDetail({ id }) {
  const { view, user } = useStore()
  const { query } = { query: new URLSearchParams(window.location.hash.split('?')[1] || '') }
  const [tab, setTabState] = useState(query.get('tab') || 'overview')
  const [editing, setEditing] = useState(false)
  const client = view.clients.find((c) => c.id === id)
  if (!client) return <Empty title="Cliente no encontrado" action={<button className="btn" onClick={() => go('#/clients')}>Volver</button>} />
  const setTab = (t) => { setTabState(t); history.replaceState(null, '', `#/clients/${id}?tab=${t}`) }
  const waiting = view.deliverables.filter((d) => d.clientId === id && d.status === 'aprobacion').length
  const changes = view.deliverables.filter((d) => d.clientId === id && d.status === 'cambios').length
  return (
    <div>
      <button className="link sm" onClick={() => go('#/clients')}>‹ Clientes</button>
      <div className="page-h">
        <div className="row gap"><span className="logo-c">{client.name[0]}</span><div><h1>{client.name}</h1><p className="muted">{client.contact && <>{client.contact} · </>}<Badge color={PROJECT_STATUS[client.status]?.color || '#16A34A'}>{PROJECT_STATUS[client.status]?.label || 'Activo'}</Badge></p></div></div>
        {user.role === 'admin' && <div className="row gap-s wrap">
          {!client.salesUrl && <button className="btn ghost sm" onClick={() => setEditing(true)}>🔗 Conectar planilla de leads</button>}
          <button className="btn" onClick={() => setEditing(true)}>Editar cliente</button>
        </div>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Resumen' }, { id: 'tasks', label: 'Tareas' },
        { id: 'approvals', label: 'Entregables', count: waiting + changes }, { id: 'reports', label: 'Reportes' }, { id: 'files', label: 'Archivos' },
      ]} />
      <div className="mt">
        {tab === 'overview' && <ClientOverview client={client} />}
        {tab === 'tasks' && <TasksPage clientId={id} embedded />}
        {tab === 'approvals' && <ApprovalsPage clientId={id} embedded />}
        {tab === 'reports' && <ReportsPage clientId={id} embedded />}
        {tab === 'files' && <FilesPage clientId={id} embedded />}
      </div>
      {editing && <ClientModal client={client} onClose={() => setEditing(false)} />}
    </div>
  )
}

export default function ClientsPage() {
  const { view, user } = useStore()
  const [creating, setCreating] = useState(false)
  return (
    <div>
      <div className="page-h"><div><h1>Clientes</h1><p className="muted">{view.clients.length} clientes MetaFlash</p></div>
        {user.role === 'admin' && <button className="btn primary" onClick={() => setCreating(true)}>+ Nuevo cliente</button>}</div>
      <div className="cgrid">
        {view.clients.map((c) => {
          const s = monthSummary(view, c, monthKey())
          const pending = view.deliverables.filter((d) => d.clientId === c.id && d.status === 'aprobacion').length
          const changes = view.deliverables.filter((d) => d.clientId === c.id && d.status === 'cambios').length
          const late = view.tasks.filter((t) => t.clientId === c.id && t.status !== 'completada' && t.due && t.due < new Date().toISOString().slice(0, 10)).length
          return (
            <button key={c.id} className="ccard" onClick={() => go(`#/clients/${c.id}`)}>
              <div className="row gap"><span className="logo-c">{c.name[0]}</span><div className="grow"><b>{c.name}</b><small className="muted">{c.contact}</small></div>
                {c.status !== 'activo' && <Badge color="#D97706">{PROJECT_STATUS[c.status]?.label}</Badge>}</div>
              <div className="row between sm"><span className="muted">{monthLabel(monthKey())}</span><span>{s.approved} aprobado{s.approved === 1 ? '' : 's'} de {s.total} anuncio{s.total === 1 ? '' : 's'}</span></div>
              <div className="row gap-s wrap">
                {pending > 0 && <Badge color="#D97706">{pending} esperando aprobación</Badge>}
                {changes > 0 && <Badge color="#DC2626">{changes} con cambios</Badge>}
                {late > 0 && <Badge color="#DC2626">{late} vencidas</Badge>}
                {!s.report && <Badge color="#64748B">Reporte pendiente</Badge>}
              </div>
            </button>
          )
        })}
      </div>
      {!view.clients.length && <Empty title="Todavía no hay clientes" action={user.role === 'admin' && <button className="btn primary" onClick={() => setCreating(true)}>Crear el primero</button>} />}
      {creating && <ClientModal onClose={() => setCreating(false)} />}
    </div>
  )
}
