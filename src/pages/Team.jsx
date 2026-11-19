import { useState } from 'react'
import { useStore, sendReset } from '../store.jsx'
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

export default function TeamPage() {
  const { view, user } = useStore()
  const [edit, setEdit] = useState(null)
  const staff = view.users.filter((u) => u.role !== 'client')
  const clients = view.users.filter((u) => u.role === 'client')
  const open = (t) => view.tasks.filter((x) => x.assigneeId === t.id && x.status !== 'completada').length
  return (
    <div>
      <div className="page-h"><div><h1>Equipo y accesos</h1><p className="muted">Quién puede entrar a MetaFlash.</p></div>{user.role === 'admin' && <button className="btn primary" onClick={() => setEdit({})}>+ Miembro</button>}</div>
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
