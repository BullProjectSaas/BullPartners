import { useState } from 'react'
import { useStore, DELIV_STATUS, monthKey, monthLabel, addMonths } from '../store.jsx'
import { Modal, Field, DelivBadge, Comments, Empty, readFile, fmtDateTime, go, Tabs, Badge, useSrc } from '../ui.jsx'

const ACTION_LABEL = { created: 'Creado', sent: 'Enviado a aprobación', approved: 'Aprobado', changes: 'Cambios solicitados', version: 'Nueva versión' }

function Media({ v }) {
  const src = useSrc(v?.url)
  if (!v) return null
  if (v.content != null) return <div className="script">{v.content}</div>
  if (v.mediaType === 'link') return <a className="linkbox" href={v.url} target="_blank" rel="noreferrer">▶ Abrir la pieza<small>{v.url}</small></a>
  if (v.mediaType === 'video') return <video className="media" src={src} controls />
  return <img className="media" src={src} alt="" />
}
function Thumb({ v }) {
  const src = useSrc(v?.url)
  if (v?.mediaType === 'link') return <p>🔗 Pieza en link externo</p>
  return v?.mediaType === 'video' ? <video src={src} muted /> : <img src={src} alt="" />
}

export function DeliverableModal({ id, defaults = {}, onClose }) {
  const { view, user, actions } = useStore()
  const d = id && view.deliverables.find((x) => x.id === id)
  const staff = user.role !== 'client'
  const [meta, setMeta] = useState(() => d ? { title: d.title, month: d.month } : { title: '', type: 'guion', month: monthKey(), clientId: view.clients[0]?.id, ...defaults })
  const [draft, setDraft] = useState('')
  const [media, setMedia] = useState(null)
  const [link, setLink] = useState('')
  const [editing, setEditing] = useState(!d)
  const [showV, setShowV] = useState(null)
  const [reject, setReject] = useState(false)
  const [comment, setComment] = useState('')

  if (id && !d) return <Modal title="Entregable no disponible" onClose={onClose}><p>No existe o no tenés acceso.</p></Modal>

  const type = d?.type || meta.type
  const latest = d?.versions[d.versions.length - 1]
  const shown = showV ? d.versions.find((v) => v.n === showV) : latest
  const userName = (uid) => view.users.find((u) => u.id === uid)?.name || '—'

  const submit = (send) => {
    if (!meta.title.trim()) return alert('Poné un título.')
    let payload = null
    if (type === 'guion' && draft.trim() && draft !== latest?.content) payload = { content: draft }
    const project = view.projects.find((p) => p.clientId === (d?.clientId || meta.clientId))
    if (type === 'creatividad' && link.trim()) payload = { mediaType: 'link', url: link.trim() }
    else if (type === 'creatividad' && media) {
      const fid = actions.addFile({ ...media, clientId: d?.clientId || meta.clientId, projectId: project?.id, shared: true, kind: 'media' })
      payload = { mediaType: media.mime.startsWith('video') ? 'video' : 'image', url: 'file:' + fid, name: media.name }
    }
    if (!d && !payload) return alert(type === 'guion' ? 'Escribí el guion.' : 'Subí la imagen o pegá el link del video.')
    const newId = actions.saveDeliverable(d ? { id: d.id, ...meta } : { ...meta, projectId: project?.id }, payload, send)
    setEditing(false); setDraft(''); setMedia(null); setLink(''); setShowV(null)
    if (!d) { onClose(); go(`#/deliverable/${newId}`) }
  }

  const startEdit = () => { setDraft(latest?.content || ''); setEditing(true) }

  /* ----- Formulario de creación / nueva versión (equipo) ----- */
  const form = (
    <div className="stack">
      {!d && <div className="grid2">
        <Field label="Cliente"><select value={meta.clientId} onChange={(e) => setMeta({ ...meta, clientId: e.target.value })}>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Tipo"><select value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value })}><option value="guion">Guion</option><option value="creatividad">Creatividad (imagen/video)</option></select></Field>
      </div>}
      <div className="grid2">
        <Field label="Título"><input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder={type === 'guion' ? 'Guion #1 — Hook de dolor' : 'Anuncio #1 — Video testimonio'} /></Field>
        <Field label="Mes de producción"><select value={meta.month} onChange={(e) => setMeta({ ...meta, month: e.target.value })}>{[-2, -1, 0, 1, 2].map((n) => { const m = addMonths(monthKey(), n); return <option key={m} value={m}>{monthLabel(m)}</option> })}</select></Field>
      </div>
      {type === 'guion'
        ? <Field label={d ? `Versión ${d.versions.length + 1}` : 'Guion'}><textarea rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={'HOOK: …\n\nDESARROLLO: …\n\nCTA: …'} /></Field>
        : <Field label={d ? `Nueva versión (${d.versions.length + 1})` : 'Pieza'} hint="Imágenes: se comprimen solas. Videos: subilos a Google Drive (compartido con link) y pegá el link abajo.">
          <input type="file" accept="image/*,video/*" onChange={async (e) => { try { setMedia(await readFile(e.target.files[0])) } catch (err) { alert(err.message) } }} />
          {media && (media.mime.startsWith('video') ? <video className="media mt-s" src={media.url} controls /> : <img className="media mt-s" src={media.url} alt="" />)}
          <input className="mt-s" placeholder="…o pegá un link (Google Drive, YouTube, Frame.io)" value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>}
    </div>
  )

  const footer = staff && editing ? <>
    {d && <button className="btn ghost" onClick={() => setEditing(false)}>Cancelar</button>}
    {!d && <button className="btn ghost" onClick={onClose}>Cancelar</button>}
    <span className="grow" />
    <button className="btn" onClick={() => submit(false)}>Guardar borrador</button>
    <button className="btn primary" onClick={() => submit(true)}>Enviar a aprobación</button>
  </> : null

  if (!d) return <Modal title="Nuevo entregable" onClose={onClose} wide footer={footer}>{form}</Modal>

  const client = view.clients.find((c) => c.id === d.clientId)
  return (
    <Modal title={d.title} onClose={onClose} wide footer={footer}>
      <div className="row gap wrap mb">
        <DelivBadge status={d.status} />
        <Badge color="#475569">{type === 'guion' ? '📝 Guion' : '🎨 Creatividad'}</Badge>
        <Badge color="#475569">{monthLabel(d.month)}</Badge>
        {staff && <Badge color="#475569">{client?.name}</Badge>}
        <span className="muted sm">Versión {latest?.n}</span>
      </div>

      {editing ? form : <>
        {showV && <div className="callout">Estás viendo la versión {showV}. <button className="link" onClick={() => setShowV(null)}>Ver la última</button></div>}
        <Media v={shown} />

        {/* Acciones del cliente */}
        {!staff && d.status === 'aprobacion' && !reject && (
          <div className="decide">
            <p><b>¿Qué te parece?</b> Aprobalo o contanos qué cambiar.</p>
            <div className="row gap wrap">
              <button className="btn success big" onClick={() => { actions.decide(d.id, true, ''); onClose() }}>✓ Aprobar</button>
              <button className="btn big" onClick={() => setReject(true)}>✏️ Solicitar cambios</button>
            </div>
          </div>
        )}
        {!staff && reject && (
          <div className="decide">
            <Field label="¿Qué cambios necesitás?"><textarea rows={4} autoFocus value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej.: cambiar el hook por algo más directo, mencionar la promo de 3 cuotas…" /></Field>
            <div className="row gap"><button className="btn ghost" onClick={() => setReject(false)}>Volver</button><button className="btn primary" disabled={!comment.trim()} onClick={() => { actions.decide(d.id, false, comment.trim()); onClose() }}>Enviar solicitud</button></div>
          </div>
        )}
        {!staff && d.status === 'aprobado' && <div className="callout ok">✅ Aprobaste esta pieza. ¡Gracias!</div>}
        {!staff && d.status === 'cambios' && <div className="callout warn">Recibimos tu pedido de cambios. Te avisamos cuando esté la nueva versión.</div>}

        {/* Acciones del equipo */}
        {staff && (
          <div className="row gap wrap mt">
            <button className="btn" onClick={startEdit}>{type === 'guion' ? '✏️ Nueva versión' : '⬆️ Subir nueva versión'}</button>
            {(d.status === 'borrador' || d.status === 'cambios') && <button className="btn primary" onClick={() => actions.saveDeliverable({ id: d.id }, null, true)}>Enviar a aprobación</button>}
            <span className="grow" />
            <button className="btn danger ghost" onClick={() => { if (confirm('¿Eliminar entregable?')) { actions.deleteDeliverable(d.id); onClose() } }}>Eliminar</button>
          </div>
        )}
        {staff && d.status === 'cambios' && (() => {
          const last = [...d.history].reverse().find((h) => h.action === 'changes')
          return last?.comment ? <div className="callout warn mt">✏️ <b>{userName(last.by)} pidió:</b> {last.comment}</div> : null
        })()}
      </>}

      <div className="grid2 mt">
        <div>
          <h4>Historial</h4>
          <ul className="timeline">
            {[...d.history].reverse().map((h) => (
              <li key={h.id}><b>{ACTION_LABEL[h.action]}</b> · {userName(h.by)}<small className="muted"> · {fmtDateTime(h.at)}</small>{h.comment && h.action !== 'version' && <p className="muted">“{h.comment}”</p>}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Versiones</h4>
          <ul className="versions">
            {[...d.versions].reverse().map((v) => (
              <li key={v.n}><button className={'link' + (shown?.n === v.n ? ' strong' : '')} onClick={() => { setEditing(false); setShowV(v.n === latest.n ? null : v.n) }}>Versión {v.n}</button><small className="muted"> · {userName(v.by)} · {fmtDateTime(v.at)}</small></li>
            ))}
          </ul>
        </div>
      </div>
      <h4>Comentarios</h4>
      <Comments targetType="deliverable" targetId={d.id} clientId={d.clientId} />
    </Modal>
  )
}

export function DelivCard({ d, showClient }) {
  const { view } = useStore()
  const v = d.versions[d.versions.length - 1]
  return (
    <button className="dcard" onClick={() => go(`#/deliverable/${d.id}`)}>
      <div className="dthumb">
        {d.type === 'guion' ? <p>{v?.content?.slice(0, 140)}</p> : <Thumb v={v} />}
      </div>
      <div className="dbody">
        <b>{d.title}</b>
        <small className="muted">{showClient && view.clients.find((c) => c.id === d.clientId)?.name + ' · '}{d.type === 'guion' ? 'Guion' : 'Creatividad'} · v{v?.n}</small>
        <DelivBadge status={d.status} />
      </div>
    </button>
  )
}

export default function ApprovalsPage({ clientId, embedded }) {
  const { view, user } = useStore()
  const staff = user.role !== 'client'
  const [tab, setTab] = useState(staff ? 'aprobacion' : 'pending')
  const [type, setType] = useState('all')
  const [creating, setCreating] = useState(false)
  let list = view.deliverables
  if (clientId) list = list.filter((d) => d.clientId === clientId)
  if (type !== 'all') list = list.filter((d) => d.type === type)
  const count = (s) => list.filter((d) => d.status === s).length
  const tabs = staff
    ? [{ id: 'aprobacion', label: 'Esperando cliente', count: count('aprobacion') }, { id: 'cambios', label: 'Cambios solicitados', count: count('cambios') }, { id: 'borrador', label: 'Borradores', count: count('borrador') }, { id: 'aprobado', label: 'Aprobados' }, { id: 'all', label: 'Todos' }]
    : [{ id: 'pending', label: 'Para aprobar', count: count('aprobacion') }, { id: 'all', label: 'Todo' }]
  const shown = list.filter((d) => tab === 'all' || (tab === 'pending' ? d.status === 'aprobacion' : d.status === tab)).sort((a, b) => b.month.localeCompare(a.month))

  return (
    <div>
      {!embedded && <div className="page-h"><div><h1>{staff ? 'Aprobaciones' : 'Aprobaciones'}</h1><p className="muted">{staff ? 'Guiones y creatividades enviados a los clientes.' : 'Revisá y aprobá los guiones y anuncios que preparamos para vos.'}</p></div>
        {staff && <button className="btn primary" onClick={() => setCreating(true)}>+ Nuevo entregable</button>}</div>}
      <div className="toolbar">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="all">Guiones y creatividades</option><option value="guion">Solo guiones</option><option value="creatividad">Solo creatividades</option></select>
        {embedded && staff && <button className="btn primary sm" onClick={() => setCreating(true)}>+ Entregable</button>}
      </div>
      {shown.length ? <div className="dgrid">{shown.map((d) => <DelivCard key={d.id} d={d} showClient={staff && !clientId} />)}</div>
        : <Empty icon="🎉" title={tab === 'pending' ? 'No tenés nada pendiente de aprobar' : 'Nada por acá'} />}
      {creating && <DeliverableModal defaults={clientId ? { clientId } : {}} onClose={() => setCreating(false)} />}
    </div>
  )
}
export { DELIV_STATUS }
