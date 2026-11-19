import { useState } from 'react'
import { useStore, TASK_STATUS } from '../store.jsx'
import { go, today } from '../ui.jsx'

export default function CalendarPage() {
  const { view, user } = useStore()
  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(today())

  const events = []
  for (const t of view.tasks) if (t.due) events.push({ date: t.due, label: t.title, color: TASK_STATUS.find((s) => s.id === t.status).color, link: `#/task/${t.id}`, kind: 'Tarea', done: t.status === 'completada', client: t.clientId })
  for (const p of view.projects) {
    if (p.start) events.push({ date: p.start, label: `Inicio: ${p.name}`, color: '#7C3AED', link: user.role === 'client' ? '#/' : `#/clients/${p.clientId}`, kind: 'Proyecto', client: p.clientId })
    if (p.end) events.push({ date: p.end, label: `Fin: ${p.name}`, color: '#7C3AED', link: user.role === 'client' ? '#/' : `#/clients/${p.clientId}`, kind: 'Proyecto', client: p.clientId })
  }
  for (const r of view.reports) if (r.publishedAt) events.push({ date: r.publishedAt.slice(0, 10), label: `Reporte: ${r.title}`, color: '#0891B2', link: `#/report/${r.id}`, kind: 'Reporte', client: r.clientId })

  const y = cur.getFullYear(), m = cur.getMonth()
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((startDow + days) / 7) * 7 }, (_, i) => {
    const day = i - startDow + 1
    if (day < 1 || day > days) return null
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })
  const on = (d) => events.filter((e) => e.date === d)
  const cname = (id) => view.clients.find((c) => c.id === id)?.name

  return (
    <div>
      <div className="page-h"><div><h1>Calendario</h1><p className="muted">Vencimientos, entregas y fechas importantes.</p></div>
        <div className="row gap-s">
          <button className="btn ghost" onClick={() => setCur(new Date(y, m - 1, 1))}>‹</button>
          <b className="cal-title">{cur.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</b>
          <button className="btn ghost" onClick={() => setCur(new Date(y, m + 1, 1))}>›</button>
          <button className="btn ghost sm" onClick={() => { const d = new Date(); setCur(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(today()) }}>Hoy</button>
        </div>
      </div>
      <div className="cal-wrap">
        <div className="card flush cal">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((d, i) => (
            <div key={i} className={'cal-cell' + (!d ? ' off' : '') + (d === today() ? ' today' : '') + (d === sel ? ' sel' : '')} onClick={() => d && setSel(d)}>
              {d && <span className="cal-n">{Number(d.slice(8))}</span>}
              {d && on(d).slice(0, 3).map((e, j) => <div key={j} className={'cal-ev' + (e.done ? ' done' : '')} style={{ borderColor: e.color }} onClick={(ev) => { ev.stopPropagation(); go(e.link) }}>{e.label}</div>)}
              {d && on(d).length > 3 && <small className="muted">+{on(d).length - 3} más</small>}
              {d && on(d).length > 0 && <span className="cal-dots">{on(d).slice(0, 4).map((e, j) => <i key={j} style={{ background: e.color }} />)}</span>}
            </div>
          ))}
        </div>
        <div className="card">
          <h3>{new Date(sel + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {on(sel).length === 0 && <p className="muted sm">Sin eventos este día.</p>}
          {on(sel).map((e, i) => (
            <div key={i} className="trow" onClick={() => go(e.link)}>
              <span className="dot lg" style={{ background: e.color }} />
              <div className="grow trow-main"><span className={e.done ? 'done' : ''}>{e.label}</span><small className="muted">{e.kind}{user.role !== 'client' && ' · ' + cname(e.client)}</small></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
