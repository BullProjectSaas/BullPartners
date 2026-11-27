import { useEffect, useState } from 'react'
import { useStore, sendReset, getIntegration, saveIntegration, adminApi } from '../store.jsx'
import { Modal, Field, Avatar, Badge } from '../ui.jsx'

function UserModal({ u, onClose }) {
  const { actions, view } = useStore()
  const [f, setF] = useState(u ? { ...u, password: '' } : { name: '', email: '', password: '', role: 'team' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.name.trim() || !f.email.trim()) return alert('Completá nombre y email.')
    if (!u && f.password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.')
    setBusy(true)
    const err = await actions.saveUser(f)
    setBusy(false)
    if (err) return alert(err)
    onClose()
  }
  return (
    <Modal title={u ? 'Editar miembro' : 'Nuevo miembro del equipo'} onClose={onClose} footer={<>
      {u && <button className="btn danger ghost" onClick={() => { if (confirm('¿Eliminar usuario?')) { actions.deleteUser(u.id); onClose() } }}>Eliminar</button>}
      <span className="grow" /><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></>}>
      <Field label="Nombre"><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Email"><input type="email" disabled={!!u} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      {u ? <button className="btn ghost sm mb" onClick={() => sendReset(u.email).then(() => alert('Le enviamos un email para cambiar la contraseña.'), (e) => alert(e.message))}>✉️ Enviar email para cambiar contraseña</button>
        : <Field label="Contraseña inicial" hint="Mínimo 6 caracteres. Después la puede cambiar."><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
      <Field label="Rol"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="team">Equipo interno</option><option value="admin">Administrador</option></select></Field>
    </Modal>
  )
}

function IntegrationCard() {
  const [v, setV] = useState({ url: '', adminKey: '' })
  const [saved, setSaved] = useState(null) // lo guardado en la base
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const test = async (vals) => {
    setBusy(true); setMsg('')
    try {
      const r = await adminApi(vals, { action: 'test' })
      setMsg(`✓ Conectado a Meta como "${r.name}" · ${r.accounts} cuentas publicitarias`)
      return true
    } catch (e) { setMsg('✗ ' + e.message); return false } finally { setBusy(false) }
  }
  useEffect(() => {
    getIntegration().then((d) => {
      setV(d); setSaved(d)
      if (d.url && d.adminKey) test(d); else setEditing(true)
    }).catch(() => setEditing(true))
  }, []) // eslint-disable-line
  const save = async () => {
    try { await saveIntegration(v) } catch (e) { return setMsg('✗ ' + (/permission/i.test(e.message) ? 'Firebase no deja guardar: falta pegar las reglas nuevas en Firebase → Firestore → Reglas.' : e.message)) }
    setSaved(v)
    if (await test(v)) setEditing(false)
  }
  const ok = msg.startsWith('✓')
  return (
    <div className="card mb">
      <div className="card-h">
        <h3>Conexión con Meta y planillas</h3>
        {!editing && <button className="btn ghost sm" onClick={() => setEditing(true)}>Editar</button>}
      </div>
      {!editing ? (
        <p className={'sm ' + (busy ? 'muted' : ok ? 'pos' : 'neg')}>{busy ? 'Comprobando conexión…' : msg || '—'}</p>
      ) : <>
        <p className="muted sm mb">Script central de Google (integraciones/metaflash-central.gs). Se configura una sola vez.</p>
        <div className="grid2">
          <label className="field"><span>URL de la aplicación web</span><input name="mf-script-url" autoComplete="off" value={v.url} placeholder="https://script.google.com/macros/s/…/exec" onChange={(e) => setV({ ...v, url: e.target.value.trim() })} /></label>
          <label className="field"><span>Clave de administrador (ADMIN_KEY)</span><input name="mf-admin-key" autoComplete="off" spellCheck={false} className="code" value={v.adminKey} onChange={(e) => setV({ ...v, adminKey: e.target.value.trim() })} /></label>
        </div>
        <div className="row gap wrap">
          <button className="btn primary" disabled={busy || !v.url || !v.adminKey} onClick={save}>{busy ? 'Probando…' : 'Guardar y probar'}</button>
          {saved?.url && <button className="btn ghost" onClick={() => { setV(saved); setEditing(false); test(saved) }}>Cancelar</button>}
          {msg && <span className={'sm ' + (ok ? 'pos' : 'neg')}>{msg}</span>}
        </div>
      </>}
    </div>
  )
}

export default function TeamPage() {
  const { view, user } = useStore()
  const [edit, setEdit] = useState(null)
  const staff = view.users.filter((u) => u.role !== 'client')
  const clients = view.users.filter((u) => u.role === 'client')
  const open = (t) => view.tasks.filter((x) => x.assigneeId === t.id && x.status !== 'completada').length
  return (
    <div>
      <div className="page-h"><div><h1>Equipo y accesos</h1><p className="muted">Quién puede entrar a MetaFlash.</p></div>{user.role === 'admin' && <button className="btn primary" onClick={() => setEdit({})}>+ Miembro</button>}</div>
      {user.role === 'admin' && <IntegrationCard />}
      <div className="card flush mb">
        {staff.map((u) => (
          <div key={u.id} className="trow" onClick={() => user.role === 'admin' && setEdit(u)}>
            <Avatar user={u} size={32} /><div className="grow trow-main"><span>{u.name}</span><small className="muted">{u.email}</small></div>
            <span className="muted sm hide-m">{open(u)} tareas abiertas</span>
            <Badge color={u.role === 'admin' ? '#7C3AED' : '#3B82F6'}>{u.role === 'admin' ? 'Admin' : 'Equipo'}</Badge>
          </div>
        ))}
      </div>
      <h3>Accesos de clientes</h3>
      <p className="muted sm">Se gestionan desde la ficha de cada cliente (Editar cliente).</p>
      <div className="card flush">
        {clients.map((u) => (
          <div key={u.id} className="trow" onClick={() => (window.location.hash = `#/clients/${u.clientId}`)}>
            <Avatar user={u} size={32} /><div className="grow trow-main"><span>{u.name}</span><small className="muted">{u.email}</small></div>
            <Badge color="#0891B2">{view.clients.find((c) => c.id === u.clientId)?.name}</Badge>
          </div>
        ))}
      </div>
      {edit && <UserModal u={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </div>
  )
}
