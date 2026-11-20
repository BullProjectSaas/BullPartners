import { useStore, monthKey, monthLabel, monthSummary } from '../store.jsx'
import { Card, Stat, Empty, Progress, Badge, go, today, fmtDateTime, isOverdue } from '../ui.jsx'
import { TaskRow } from './Tasks.jsx'
import { DelivCard } from './Deliverables.jsx'
import { ReportRow } from './Reports.jsx'

export function AdminHome() {
  const { view, user } = useStore()
  const mine = view.tasks.filter((t) => t.assigneeId === user.id && t.status !== 'completada').sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))
  const overdue = view.tasks.filter(isOverdue)
  const waiting = view.deliverables.filter((d) => d.status === 'aprobacion')
  const changes = view.deliverables.filter((d) => d.status === 'cambios')
  const unread = view.reports.filter((r) => r.published && !r.readAt)
  const mk = monthKey()
  const h = new Date().getHours()
  return (
    <div>
      <div className="page-h"><div><h1>{h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'}, {user.name.split(' ')[0]}</h1><p className="muted">Esto es lo que pasa hoy en MetaFlash.</p></div></div>
      <div className="stats4 card">
        <Stat label="Clientes activos" value={view.clients.filter((c) => c.status === 'activo').length} />
        <Stat label="Esperando aprobación" value={waiting.length} color="#D97706" />
        <Stat label="Cambios solicitados" value={changes.length} color="#DC2626" />
        <Stat label="Tareas vencidas" value={overdue.length} color={overdue.length ? '#DC2626' : undefined} />
      </div>
      <div className="grid2 mt">
        <Card title="Cambios solicitados por clientes" action={<button className="link sm" onClick={() => go('#/approvals')}>Ver todo</button>}>
          {changes.length ? <div className="dgrid sm">{changes.map((d) => <DelivCard key={d.id} d={d} showClient />)}</div> : <p className="muted sm">Ningún cliente pidió cambios. 👌</p>}
        </Card>
        <Card title="Mis tareas" action={<button className="link sm" onClick={() => go('#/tasks')}>Ver todas</button>}>
          {mine.length ? mine.slice(0, 7).map((t) => <TaskRow key={t.id} t={t} />) : <p className="muted sm">No tenés tareas pendientes.</p>}
        </Card>
      </div>
      <Card title={`Producción de ${monthLabel(mk)}`} className="mt">
        <div className="table">
          <div className="tr th"><span>Cliente</span><span>Anuncios</span><span className="hide-m">Aprob.</span><span className="hide-m">Esperando</span><span className="hide-m">Pend.</span><span>Reporte</span></div>
          {view.clients.map((c) => {
            const s = monthSummary(view, c, mk)
            return (
              <div key={c.id} className="tr" onClick={() => go(`#/clients/${c.id}`)}>
                <span><b>{c.name}</b></span>
                <span className="row gap-s"><Progress value={s.pct} color="#16A34A" /><small>{s.approved}/{s.included}</small></span>
                <span className="hide-m">{s.approved}</span><span className="hide-m">{s.waiting}</span><span className="hide-m">{s.pending}</span>
                <span>{s.report ? <Badge color="#16A34A">Publicado</Badge> : <Badge color="#64748B">Pendiente</Badge>}</span>
              </div>
            )
          })}
        </div>
      </Card>
      <div className="grid2 mt">
        <Card title="Esperando aprobación del cliente">
          {waiting.length ? <div className="dgrid sm">{waiting.map((d) => <DelivCard key={d.id} d={d} showClient />)}</div> : <p className="muted sm">Nada esperando.</p>}
        </Card>
        <Card title="Reportes sin leer por el cliente">
          {unread.length ? unread.map((r) => <ReportRow key={r.id} r={r} showClient />) : <p className="muted sm">Todos los reportes fueron leídos.</p>}
        </Card>
      </div>
    </div>
  )
}

export function ClientHome() {
  const { view, user } = useStore()
  const client = view.clients[0]
  if (!client) return <Empty title="Tu cuenta no tiene un servicio asociado" />
  const todo = view.tasks.filter((t) => t.assigneeId === user.id && t.status !== 'completada').sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))
  const scripts = view.deliverables.filter((d) => d.status === 'aprobacion' && d.type === 'guion')
  const ads = view.deliverables.filter((d) => d.status === 'aprobacion' && d.type === 'creatividad')
  const reports = view.reports.slice().sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3)
  const actions = todo.length + scripts.length + ads.length
  const team = view.tasks.filter((t) => t.status !== 'completada' && view.users.find((u) => u.id === t.assigneeId)?.role !== 'client')
  return (
    <div className="client-home">
      <div className="hero">
        <div>
          <small>MetaFlash · {client.name}</small>
          <h1>Hola, {user.name.split(' ')[0].split('(')[0]} 👋</h1>
          <p>{actions ? <>Tenés <b>{actions} {actions === 1 ? 'cosa' : 'cosas'}</b> para revisar. El resto lo hacemos nosotros.</> : 'Estás al día. Nosotros seguimos trabajando en tu servicio.'}</p>
        </div>
        <Badge color={client.status === 'activo' ? '#16A34A' : '#D97706'}>● Servicio {client.status === 'activo' ? 'activo' : client.status}</Badge>
      </div>

      {actions > 0 && (
        <Card title="Lo que necesitamos de vos">
          {[...scripts, ...ads].map((d) => (
            <div key={d.id} className="action-row" onClick={() => go(`#/deliverable/${d.id}`)}>
              <span className="ficon">{d.type === 'guion' ? '📝' : '🎨'}</span>
              <div className="grow"><b>{d.type === 'guion' ? 'Aprobar guion' : 'Aprobar anuncio'}: {d.title}</b><small className="muted">Revisalo y aprobalo o pedinos cambios</small></div>
              <span className="btn primary sm">Revisar</span>
            </div>
          ))}
          {todo.map((t) => (
            <div key={t.id} className="action-row" onClick={() => go(`#/task/${t.id}`)}>
              <span className="ficon">📌</span>
              <div className="grow"><b>{t.title}</b><small className={isOverdue(t) ? 'late' : 'muted'}>{t.due ? (isOverdue(t) ? 'Venció el ' : 'Vence el ') + new Date(t.due + 'T12:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : 'Sin fecha'}</small></div>
              <span className="btn sm">Abrir</span>
            </div>
          ))}
        </Card>
      )}


      <div className="grid2">
        <Card title="En qué estamos trabajando">
          {team.length ? team.slice(0, 6).map((t) => <div key={t.id} className="trow static"><span className="dot lg" style={{ background: t.status === 'progreso' ? '#3B82F6' : t.status === 'revision' ? '#D97706' : '#8A94A6' }} /><span className="grow">{t.title}</span><small className="muted">{t.status === 'progreso' ? 'En progreso' : t.status === 'revision' ? 'En revisión' : 'Próximamente'}</small></div>)
            : <p className="muted sm">Pronto vas a ver acá las próximas tareas.</p>}
        </Card>
        <Card title="Últimos reportes" action={<button className="link sm" onClick={() => go('#/reports')}>Ver todos</button>}>
          {reports.length ? reports.map((r) => <ReportRow key={r.id} r={r} />) : <p className="muted sm">Tu primer reporte llega a fin de mes.</p>}
        </Card>
      </div>

      <Card title="Novedades">
        {view.news.length ? view.news.slice(0, 5).map((n) => <div key={n.id} className="news"><p>{n.text}</p><small className="muted">{fmtDateTime(n.at)}</small></div>) : <p className="muted sm">Sin novedades por ahora.</p>}
      </Card>
    </div>
  )
}

export function NotificationsPage() {
  const { view, actions } = useStore()
  const list = view.notifications
  return (
    <div>
      <div className="page-h"><div><h1>Notificaciones</h1></div>{list.some((n) => !n.read) && <button className="btn ghost" onClick={actions.readAllNotifications}>Marcar todas como leídas</button>}</div>
      <div className="card flush">
        {list.length ? list.map((n) => (
          <div key={n.id} className={'notif' + (n.read ? '' : ' unread')} onClick={() => { actions.readNotification(n.id); go(n.link) }}>
            <span className="dot" /><div className="grow"><p>{n.text}</p><small className="muted">{fmtDateTime(n.at)}</small></div>
          </div>
        )) : <Empty icon="🔔" title="Sin notificaciones" />}
      </div>
    </div>
  )
}
export { today }
