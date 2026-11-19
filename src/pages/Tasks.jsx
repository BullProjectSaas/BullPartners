import { useState } from 'react'
import { useStore, TASK_STATUS, PRIORITY, monthKey } from '../store.jsx'
import { Avatar, StatusBadge, PriorityBadge, Modal, Field, UserSelect, FilePicker, FileList, Comments, Empty, fmtDate, isOverdue, go, Badge } from '../ui.jsx'

/* ---------- Modal de tarea (crear / editar / ver) ---------- */
export function TaskModal({ taskId, defaults = {}, onClose }) {
  const { view, user, actions } = useStore()
  const existing = taskId && view.tasks.find((t) => t.id === taskId)
  const staff = user.role !== 'client'
  const [f, setF] = useState(() => existing ? { ...existing } : {
    ...Object.fromEntries(Object.entries(defaults).filter(([, v]) => v !== undefined)),
    title: '', description: '', priority: 'media', visibleToClient: false,
    projectId: defaults.projectId || view.projects[0]?.id, assigneeId: defaults.assigneeId || null, due: defaults.due || '', status: defaults.status || 'pendiente',
  })
  if (taskId && !existing) return <Modal title="Tarea no disponible" onClose={onClose}><p>Esta tarea no existe o no tenés acceso.</p></Modal>
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }))
  const project = view.projects.find((p) => p.id === f.projectId)
  const client = view.clients.find((c) => c.id === project?.clientId)
  const assignable = view.users.filter((u) => u.role !== 'client' || u.clientId === project?.clientId)
  const files = existing ? view.files.filter((x) => x.taskId === existing.id) : []

  const save = () => {
    if (!f.title.trim()) return alert('La tarea necesita un título.')
    if (!f.projectId) return alert('Elegí un proyecto.')
    const assignee = view.users.find((u) => u.id === f.assigneeId)
    const data = { ...f, visibleToClient: f.visibleToClient || assignee?.role === 'client' }
    actions.saveTask(data)
    onClose()
  }

  /* Vista simple para el cliente */
  if (!staff) {
    const mine = existing.assigneeId === user.id
    return (
      <Modal title={existing.title} onClose={onClose}>
        <div className="row gap wrap mb"><StatusBadge status={existing.status} />{existing.due && <Badge color={isOverdue(existing) ? '#DC2626' : '#64748B'}>Vence {fmtDate(existing.due)}</Badge>}</div>
        {existing.description && <p className="pre">{existing.description}</p>}
        {mine && (
          existing.status === 'completada'
            ? <div className="callout ok">✅ Marcaste esta tarea como completada. <button className="link" onClick={() => actions.setTaskStatus(existing.id, 'pendiente')}>Deshacer</button></div>
            : <button className="btn primary big" onClick={() => { actions.setTaskStatus(existing.id, 'completada'); onClose() }}>✓ Marcar como completada</button>
        )}
        <h4>Archivos</h4>
        <FileList files={files} />
        <div className="mt-s"><FilePicker label="Subir archivos (fotos, videos, documentos)" onFiles={(fs) => fs.forEach((x) => actions.addFile({ ...x, clientId: existing.clientId, projectId: existing.projectId, taskId: existing.id, shared: true }))} /></div>
        <h4>Comentarios</h4>
        <Comments targetType="task" targetId={existing.id} clientId={existing.clientId} />
      </Modal>
    )
  }

  return (
    <Modal title={existing ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose} wide
      footer={<>
        {existing && <button className="btn danger ghost" onClick={() => { if (confirm('¿Eliminar tarea?')) { actions.deleteTask(existing.id); onClose() } }}>Eliminar</button>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>{existing ? 'Guardar' : 'Crear tarea'}</button>
      </>}>
      <div className="task-grid">
        <div>
          <input className="title-input" autoFocus={!existing} placeholder="Título de la tarea" value={f.title} onChange={set('title')} />
          <textarea rows={4} placeholder="Descripción (opcional)" value={f.description} onChange={set('description')} />
          {existing && <>
            <h4>Archivos</h4>
            <FileList files={files} canManage />
            <div className="mt-s"><FilePicker onFiles={(fs) => fs.forEach((x) => actions.addFile({ ...x, clientId: existing.clientId, projectId: existing.projectId, taskId: existing.id, shared: existing.visibleToClient }))} /></div>
            <h4>Comentarios</h4>
            <Comments targetType="task" targetId={existing.id} clientId={existing.clientId} />
          </>}
          {!existing && <p className="muted sm">Podrás adjuntar archivos y comentar después de crearla.</p>}
        </div>
        <aside className="props">
          <Field label="Proyecto">
            <select value={f.projectId || ''} onChange={set('projectId')}>
              {view.projects.map((p) => <option key={p.id} value={p.id}>{view.clients.find((c) => c.id === p.clientId)?.name} · {p.name}</option>)}
            </select>
          </Field>
          <Field label="Estado"><select value={f.status} onChange={set('status')}>{TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
          <Field label="Responsable"><UserSelect users={assignable} value={f.assigneeId} onChange={set('assigneeId')} /></Field>
          <Field label="Vencimiento"><input type="date" value={f.due || ''} onChange={set('due')} /></Field>
          <Field label="Prioridad"><select value={f.priority} onChange={set('priority')}>{PRIORITY.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
          <label className="toggle">
            <input type="checkbox" checked={!!f.visibleToClient} onChange={set('visibleToClient')} />
            <span><b>Visible para el cliente</b><small>{f.visibleToClient ? `${client?.name || 'El cliente'} la verá en su portal` : 'Tarea interna, el cliente no la ve'}</small></span>
          </label>
        </aside>
      </div>
    </Modal>
  )
}

/* ---------- Fila y tarjeta ---------- */
export function TaskRow({ t, showClient = true, onOpen }) {
  const { view } = useStore()
  const u = view.users.find((x) => x.id === t.assigneeId)
  const c = view.clients.find((x) => x.id === t.clientId)
  return (
    <div className="trow" onClick={() => (onOpen ? onOpen(t.id) : go(`#/task/${t.id}`))}>
      <span className="dot lg" style={{ background: TASK_STATUS.find((s) => s.id === t.status).color }} />
      <div className="grow trow-main">
        <span className={t.status === 'completada' ? 'done' : ''}>{t.title}</span>
        <small className="muted">{showClient && c?.name}{!t.visibleToClient && <> · 🔒 interna</>}</small>
      </div>
      <span className="hide-m"><PriorityBadge p={t.priority} /></span>
      <span className={'due' + (isOverdue(t) ? ' late' : '')}>{fmtDate(t.due)}</span>
      <Avatar user={u} />
    </div>
  )
}

/* ---------- Página Tareas ---------- */
export default function TasksPage({ clientId, embedded }) {
  const { view, user, actions } = useStore()
  const [mode, setMode] = useState(() => localStorage.getItem('mf:taskmode') || 'list')
  const [who, setWho] = useState('all')
  const [cl, setCl] = useState(clientId || 'all')
  const [vis, setVis] = useState('all')
  const [month, setMonth] = useState('all')
  const [creating, setCreating] = useState(false)
  const [drag, setDrag] = useState(null)
  const setM = (m) => { setMode(m); localStorage.setItem('mf:taskmode', m) }

  let tasks = view.tasks
  if (cl !== 'all') tasks = tasks.filter((t) => t.clientId === cl)
  if (who === 'me') tasks = tasks.filter((t) => t.assigneeId === user.id)
  if (who === 'client') tasks = tasks.filter((t) => view.users.find((u) => u.id === t.assigneeId)?.role === 'client')
  if (vis === 'internal') tasks = tasks.filter((t) => !t.visibleToClient)
  if (vis === 'client') tasks = tasks.filter((t) => t.visibleToClient)
  if (month === 'current') tasks = tasks.filter((t) => t.month === monthKey())
  tasks = [...tasks].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))

  const defaultProject = cl !== 'all' ? view.projects.find((p) => p.clientId === cl)?.id : undefined

  return (
    <div>
      {!embedded && <div className="page-h"><div><h1>Tareas</h1><p className="muted">Todas las tareas de los clientes en un solo lugar.</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ Nueva tarea</button></div>}
      <div className="toolbar">
        <div className="seg">
          <button className={mode === 'list' ? 'on' : ''} onClick={() => setM('list')}>☰ Lista</button>
          <button className={mode === 'kanban' ? 'on' : ''} onClick={() => setM('kanban')}>▦ Tablero</button>
        </div>
        {!clientId && <select value={cl} onChange={(e) => setCl(e.target.value)}><option value="all">Todos los clientes</option>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <select value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Todos los responsables</option><option value="me">Mis tareas</option><option value="client">Asignadas al cliente</option></select>
        <select value={vis} onChange={(e) => setVis(e.target.value)}><option value="all">Internas y del cliente</option><option value="internal">Solo internas</option><option value="client">Visibles al cliente</option></select>
        <select value={month} onChange={(e) => setMonth(e.target.value)}><option value="all">Todos los meses</option><option value="current">Mes actual</option></select>
        {embedded && <button className="btn primary sm" onClick={() => setCreating(true)}>+ Tarea</button>}
      </div>

      {mode === 'list' ? (
        <div className="card flush">
          {TASK_STATUS.map((s) => {
            const g = tasks.filter((t) => t.status === s.id)
            if (!g.length) return null
            return (
              <div key={s.id} className="group">
                <div className="group-h"><StatusBadge status={s.id} /><span className="muted sm">{g.length}</span></div>
                {g.map((t) => <TaskRow key={t.id} t={t} showClient={!clientId} />)}
              </div>
            )
          })}
          {!tasks.length && <Empty title="No hay tareas con estos filtros" />}
        </div>
      ) : (
        <div className="kanban">
          {TASK_STATUS.map((s) => {
            const g = tasks.filter((t) => t.status === s.id)
            return (
              <div key={s.id} className="kcol" onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag) actions.setTaskStatus(drag, s.id); setDrag(null) }}>
                <div className="kcol-h"><StatusBadge status={s.id} /><span className="muted sm">{g.length}</span></div>
                {g.map((t) => {
                  const u = view.users.find((x) => x.id === t.assigneeId)
                  return (
                    <div key={t.id} className="kcard" draggable onDragStart={() => setDrag(t.id)} onClick={() => go(`#/task/${t.id}`)}>
                      <b>{t.title}</b>
                      {!clientId && <small className="muted">{view.clients.find((c) => c.id === t.clientId)?.name}</small>}
                      <div className="row between mt-s">
                        <div className="row gap-s"><PriorityBadge p={t.priority} />{!t.visibleToClient && <span title="Interna">🔒</span>}</div>
                        <div className="row gap-s"><span className={'due' + (isOverdue(t) ? ' late' : '')}>{fmtDate(t.due)}</span><Avatar user={u} size={22} /></div>
                      </div>
                    </div>
                  )
                })}
                <button className="kadd" onClick={() => setCreating({ status: s.id })}>+ Agregar</button>
              </div>
            )
          })}
        </div>
      )}
      {creating && <TaskModal defaults={{ projectId: defaultProject, ...(typeof creating === 'object' ? creating : {}) }} onClose={() => setCreating(false)} />}
    </div>
  )
}
