import { useEffect, useState } from 'react'
import { useStore, monthKey, monthLabel, addMonths } from '../store.jsx'
import { Modal, Field, Empty, Badge, fmtDate, go } from '../ui.jsx'

const DEFAULT_METRICS = ['Inversión', 'Conversaciones', 'Costo por conversación', 'Ventas reportadas']

export function ReportModal({ id, defaults = {}, onClose }) {
  const { view, user, actions } = useStore()
  const r = id && view.reports.find((x) => x.id === id)
  const staff = user.role !== 'client'
  const [edit, setEdit] = useState(!r)
  const [f, setF] = useState(() => r ? structuredClone(r) : {
    clientId: defaults.clientId || view.clients[0]?.id, month: addMonths(monthKey(), -1), title: '',
    metrics: DEFAULT_METRICS.map((label) => ({ label, value: '' })), conclusions: '', nextSteps: '',
  })
  useEffect(() => { if (r && !staff && !r.readAt) actions.markReportRead(r.id) }, [r?.id]) // eslint-disable-line
  if (id && !r) return <Modal title="Reporte no disponible" onClose={onClose}><p>No existe o no tenés acceso.</p></Modal>

  const save = (publish) => {
    if (!f.clientId) return alert('Elegí un cliente.')
    const title = f.title.trim() || `Reporte ${monthLabel(f.month)}`
    const newId = actions.saveReport({ ...f, title, metrics: f.metrics.filter((m) => m.label.trim()) }, publish)
    setEdit(false)
    if (!r) { onClose(); go(`#/report/${newId}`) }
  }
  const setM = (i, k, v) => setF((p) => ({ ...p, metrics: p.metrics.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }))

  if (edit) return (
    <Modal title={r ? 'Editar reporte' : 'Nuevo reporte'} onClose={onClose} wide footer={<>
      <button className="btn ghost" onClick={() => (r ? setEdit(false) : onClose())}>Cancelar</button><span className="grow" />
      <button className="btn" onClick={() => save(false)}>Guardar borrador</button>
      {!r?.published && <button className="btn primary" onClick={() => save(true)}>Publicar al cliente</button>}
      {r?.published && <button className="btn primary" onClick={() => save(false)}>Guardar cambios</button>}
    </>}>
      <div className="grid3">
        <Field label="Cliente"><select value={f.clientId} disabled={!!r} onChange={(e) => setF({ ...f, clientId: e.target.value })}>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Período"><select value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })}>{[-3, -2, -1, 0].map((n) => { const m = addMonths(monthKey(), n); return <option key={m} value={m}>{monthLabel(m)}</option> })}</select></Field>
        <Field label="Título"><input value={f.title} placeholder={`Reporte ${monthLabel(f.month)}`} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      </div>
      <h4>Métricas</h4>
      <div className="metrics-edit">
        {f.metrics.map((m, i) => (
          <div key={i} className="row gap">
            <input value={m.label} placeholder="Métrica" onChange={(e) => setM(i, 'label', e.target.value)} />
            <input value={m.value} placeholder="Valor" onChange={(e) => setM(i, 'value', e.target.value)} />
            <button className="icon-btn" onClick={() => setF({ ...f, metrics: f.metrics.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button className="btn ghost sm" onClick={() => setF({ ...f, metrics: [...f.metrics, { label: '', value: '' }] })}>+ Métrica</button>
      </div>
      <Field label="Conclusiones"><textarea rows={4} value={f.conclusions} onChange={(e) => setF({ ...f, conclusions: e.target.value })} /></Field>
      <Field label="Próximos pasos"><textarea rows={3} value={f.nextSteps} onChange={(e) => setF({ ...f, nextSteps: e.target.value })} /></Field>
    </Modal>
  )

  const client = view.clients.find((c) => c.id === r.clientId)
  return (
    <Modal title={r.title} onClose={onClose} wide footer={staff ? <>
      <button className="btn danger ghost" onClick={() => { if (confirm('¿Eliminar reporte?')) { actions.deleteReport(r.id); onClose() } }}>Eliminar</button><span className="grow" />
      <button className="btn" onClick={() => setEdit(true)}>Editar</button>
      {!r.published && <button className="btn primary" onClick={() => actions.saveReport({ id: r.id }, true)}>Publicar al cliente</button>}
    </> : null}>
      <div className="row gap wrap mb">
        <Badge color="#475569">{monthLabel(r.month)}</Badge>
        {staff && <Badge color="#475569">{client?.name}</Badge>}
        {staff && (r.published ? (r.readAt ? <Badge color="#16A34A">👁 Leído por el cliente {fmtDate(r.readAt)}</Badge> : <Badge color="#D97706">Publicado · sin leer</Badge>) : <Badge color="#8A94A6">Borrador</Badge>)}
      </div>
      <div className="metrics">{r.metrics.map((m, i) => <div key={i} className="metric"><small>{m.label}</small><b>{m.value || '—'}</b></div>)}</div>
      {r.conclusions && <><h4>Conclusiones</h4><p className="pre">{r.conclusions}</p></>}
      {r.nextSteps && <><h4>Próximos pasos</h4><p className="pre">{r.nextSteps}</p></>}
    </Modal>
  )
}

export function ReportRow({ r, showClient }) {
  const { view, user } = useStore()
  const staff = user.role !== 'client'
  return (
    <div className="trow" onClick={() => go(`#/report/${r.id}`)}>
      <span className="ficon">📊</span>
      <div className="grow trow-main"><span>{r.title}</span><small className="muted">{showClient && view.clients.find((c) => c.id === r.clientId)?.name + ' · '}{monthLabel(r.month)}</small></div>
      {!r.published ? <Badge color="#8A94A6">Borrador</Badge> : r.readAt ? <Badge color="#16A34A">{staff ? 'Leído' : 'Visto'}</Badge> : <Badge color="#D97706">{staff ? 'Sin leer' : 'Nuevo'}</Badge>}
    </div>
  )
}

export default function ReportsPage({ clientId, embedded }) {
  const { view, user } = useStore()
  const staff = user.role === 'admin'
  const [creating, setCreating] = useState(false)
  const list = view.reports.filter((r) => !clientId || r.clientId === clientId).sort((a, b) => b.month.localeCompare(a.month))
  return (
    <div>
      {!embedded && <div className="page-h"><div><h1>Reportes</h1><p className="muted">{user.role === 'client' ? 'Resultados de tus campañas mes a mes.' : 'Reportes de resultados publicados a los clientes.'}</p></div>
        {staff && <button className="btn primary" onClick={() => setCreating(true)}>+ Nuevo reporte</button>}</div>}
      {embedded && staff && <div className="toolbar"><span className="grow" /><button className="btn primary sm" onClick={() => setCreating(true)}>+ Reporte</button></div>}
      <div className="card flush">{list.length ? list.map((r) => <ReportRow key={r.id} r={r} showClient={!clientId && user.role !== 'client'} />) : <Empty icon="📊" title="Todavía no hay reportes" />}</div>
      {creating && <ReportModal defaults={{ clientId }} onClose={() => setCreating(false)} />}
    </div>
  )
}
