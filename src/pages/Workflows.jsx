import { useState } from 'react'
import { useStore, uid, PRIORITY } from '../store.jsx'
import { Modal, Field, Empty, Badge } from '../ui.jsx'

const newTask = () => ({ id: uid(), title: '', assignee: '', priority: 'media', dueDays: '', visibleToClient: false, description: '' })
const newBlock = (n) => ({ id: uid(), name: `Bloque ${n}`, tasks: [newTask()] })

function WorkflowModal({ wf, onClose }) {
  const { view, actions } = useStore()
  const [f, setF] = useState(() => (wf ? structuredClone(wf) : { name: '', description: '', blocks: [newBlock(1)] }))
  const staff = view.users.filter((u) => u.role !== 'client')
  const setBlock = (bi, patch) => setF((p) => ({ ...p, blocks: p.blocks.map((b, i) => (i === bi ? { ...b, ...patch } : b)) }))
  const setTask = (bi, ti, patch) => setBlock(bi, { tasks: f.blocks[bi].tasks.map((t, i) => (i === ti ? { ...t, ...patch } : t)) })
  const move = (bi, d) => setF((p) => {
    const b = [...p.blocks]; const j = bi + d
    if (j < 0 || j >= b.length) return p
    ;[b[bi], b[j]] = [b[j], b[bi]]
    return { ...p, blocks: b }
  })
  const save = () => {
    if (!f.name.trim()) return alert('Poné un nombre al flujo.')
    const blocks = f.blocks.map((b) => ({ ...b, tasks: b.tasks.filter((t) => t.title.trim()) })).filter((b) => b.tasks.length)
    if (!blocks.length) return alert('Agregá al menos una tarea.')
    actions.saveWorkflow({ ...f, blocks })
    onClose()
  }
  return (
    <Modal title={wf ? 'Editar flujo' : 'Nuevo flujo'} wide onClose={onClose} footer={<>
      {wf && <button className="btn danger ghost" onClick={() => { if (confirm('¿Eliminar este flujo? Los clientes que ya lo tienen no se ven afectados.')) { actions.deleteWorkflow(wf.id); onClose() } }}>Eliminar</button>}
      <span className="grow" /><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar flujo</button>
    </>}>
      <div className="grid2">
        <Field label="Nombre del flujo"><input autoFocus value={f.name} placeholder="Ej.: Onboarding MetaFlash" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Descripción (opcional)"><input value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <p className="muted sm mb">Los bloques se activan en orden: las tareas del bloque siguiente aparecen recién cuando se completan todas las del anterior. "Vence en" cuenta los días desde que se activa el bloque.</p>
      {f.blocks.map((b, bi) => (
        <div key={b.id} className="wf-block">
          <div className="row gap-s mb">
            <span className="wf-num">{bi + 1}</span>
            <input className="grow wf-name" value={b.name} onChange={(e) => setBlock(bi, { name: e.target.value })} />
            <button className="icon-btn" title="Subir" onClick={() => move(bi, -1)}>↑</button>
            <button className="icon-btn" title="Bajar" onClick={() => move(bi, 1)}>↓</button>
            {f.blocks.length > 1 && <button className="icon-btn" title="Eliminar bloque" onClick={() => setF({ ...f, blocks: f.blocks.filter((_, i) => i !== bi) })}>✕</button>}
          </div>
          <div className="wf-tasks">
            <div className="wf-th"><span>Tarea</span><span>Responsable</span><span>Vence en</span><span>Prioridad</span><span title="La ve el cliente">Cliente</span><span /></div>
            {b.tasks.map((t, ti) => (
              <div key={t.id} className="wf-tr">
                <input value={t.title} placeholder="Ej.: Pedir accesos de Meta" onChange={(e) => setTask(bi, ti, { title: e.target.value })} />
                <select value={t.assignee} onChange={(e) => setTask(bi, ti, { assignee: e.target.value })}>
                  <option value="">Sin asignar</option>
                  <option value="client">El cliente</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <span className="row gap-s"><input type="number" min="0" value={t.dueDays} placeholder="—" onChange={(e) => setTask(bi, ti, { dueDays: e.target.value })} /><small className="muted">días</small></span>
                <select value={t.priority} onChange={(e) => setTask(bi, ti, { priority: e.target.value })}>{PRIORITY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                <span className="center"><input type="checkbox" checked={t.assignee === 'client' || !!t.visibleToClient} disabled={t.assignee === 'client'} onChange={(e) => setTask(bi, ti, { visibleToClient: e.target.checked })} /></span>
                <button className="icon-btn" onClick={() => setBlock(bi, { tasks: b.tasks.filter((_, i) => i !== ti) })}>✕</button>
              </div>
            ))}
            <button className="btn ghost sm mt-s" onClick={() => setBlock(bi, { tasks: [...b.tasks, newTask()] })}>+ Tarea</button>
          </div>
          {bi < f.blocks.length - 1 && <div className="wf-arrow">↓ cuando se completa, se activa</div>}
        </div>
      ))}
      <button className="btn mt" onClick={() => setF({ ...f, blocks: [...f.blocks, newBlock(f.blocks.length + 1)] })}>+ Bloque</button>
    </Modal>
  )
}

export default function WorkflowsPage() {
  const { view } = useStore()
  const [edit, setEdit] = useState(null)
  const list = view.workflows || []
  return (
    <div>
      <div className="page-h"><div><h1>Flujos de trabajo</h1><p className="muted">Bloques de tareas estandarizados que se aplican a los clientes. Cada bloque se activa cuando se completa el anterior.</p></div>
        <button className="btn primary" onClick={() => setEdit({})}>+ Nuevo flujo</button></div>
      {list.length ? (
        <div className="cgrid">
          {list.map((w) => (
            <button key={w.id} className="ccard" onClick={() => setEdit(w)}>
              <div><b>{w.name}</b>{w.description && <small className="muted">{w.description}</small>}</div>
              <div className="wf-chain">
                {w.blocks.map((b, i) => <span key={b.id}>{i > 0 && <i>→</i>}<Badge color="#475569">{b.name} · {b.tasks.length}</Badge></span>)}
              </div>
              <small className="muted">{view.allTasks ? new Set(view.allTasks.filter((t) => t.workflowId === w.id).map((t) => t.clientId)).size : 0} clientes con este flujo</small>
            </button>
          ))}
        </div>
      ) : <div className="card"><Empty icon="🧩" title="Todavía no hay flujos" text="Creá tu primer flujo, por ejemplo: Onboarding → Producción → Lanzamiento." action={<button className="btn primary" onClick={() => setEdit({})}>Crear flujo</button>} /></div>}
      {edit && <WorkflowModal wf={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </div>
  )
}

/* Estado de los flujos aplicados a un cliente (para su ficha) */
export function ClientFlows({ clientId }) {
  const { view, user, actions } = useStore()
  const [pick, setPick] = useState(false)
  const tasks = (view.allTasks || []).filter((t) => t.clientId === clientId && t.flowId)
  const flows = {}
  for (const t of tasks) (flows[t.flowId] ||= { name: t.flowName, blocks: {} }).blocks[t.blockIndex] ||= { name: t.blockName, tasks: [] }
  for (const t of tasks) flows[t.flowId].blocks[t.blockIndex].tasks.push(t)
  return (
    <div className="card">
      <div className="card-h"><h3>Flujos de trabajo</h3>{user.role === 'admin' && <button className="btn ghost sm" onClick={() => setPick(true)}>+ Aplicar flujo</button>}</div>
      {!Object.keys(flows).length && <p className="muted sm">Este cliente no tiene flujos aplicados.</p>}
      {Object.entries(flows).map(([fid, fl]) => (
        <div key={fid} className="mb">
          <b className="sm">{fl.name}</b>
          <div className="wf-chain mt-s">
            {Object.keys(fl.blocks).sort((a, b) => a - b).map((k, i) => {
              const bl = fl.blocks[k]
              const done = bl.tasks.filter((t) => t.status === 'completada').length
              const state = bl.tasks.some((t) => t.locked) ? 'wait' : done === bl.tasks.length ? 'done' : 'active'
              return (
                <span key={k}>{i > 0 && <i>→</i>}
                  <Badge color={state === 'done' ? '#16A34A' : state === 'active' ? '#2563EB' : '#94A3B8'}>
                    {state === 'done' ? '✓ ' : state === 'active' ? '● ' : '⏸ '}{bl.name} · {done}/{bl.tasks.length}
                  </Badge>
                </span>
              )
            })}
          </div>
        </div>
      ))}
      {pick && <Modal title="Aplicar flujo" onClose={() => setPick(false)}>
        {(view.workflows || []).length ? (view.workflows || []).map((w) => (
          <div key={w.id} className="trow" onClick={() => { if (confirm(`¿Aplicar "${w.name}" a este cliente?`)) { actions.applyWorkflows(clientId, [w.id]); setPick(false) } }}>
            <div className="grow trow-main"><span>{w.name}</span><small className="muted">{w.blocks.map((b) => b.name).join(' → ')}</small></div>
          </div>
        )) : <p className="muted sm">Primero creá un flujo en la sección Flujos.</p>}
      </Modal>}
    </div>
  )
}

/* Selector de flujos al crear un cliente */
export function WorkflowPicker({ value, onChange }) {
  const { view } = useStore()
  const list = view.workflows || []
  if (!list.length) return null
  return (
    <>
      <h4>Flujos de trabajo</h4>
      <p className="muted sm mb">Elegí los flujos para este cliente. Se activa el primer bloque de cada uno.</p>
      {list.map((w) => (
        <label key={w.id} className="toggle mb">
          <input type="checkbox" checked={value.includes(w.id)} onChange={(e) => onChange(e.target.checked ? [...value, w.id] : value.filter((x) => x !== w.id))} />
          <span><b>{w.name}</b><small>{w.blocks.map((b) => b.name).join(' → ')}</small></span>
        </label>
      ))}
    </>
  )
}
