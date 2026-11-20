import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth'
import { collection, doc, onSnapshot, query, where, writeBatch, setDoc } from 'firebase/firestore'
import { auth, auth2, fs } from './firebase.js'

/* ============================================================
   Capa de datos de MetaFlash.
   Hoy persiste en localStorage (modo demo, un solo navegador).
   Todas las mutaciones pasan por `actions`, así que cambiar a
   Firebase/Firestore es reemplazar load/save sin tocar la UI.
   ============================================================ */


export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
export const now = () => new Date().toISOString()
export const monthKey = (d = new Date()) => {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
export const addMonths = (mk, n) => {
  const [y, m] = mk.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + n, 1))
}
export const monthLabel = (mk) => {
  const [y, m] = mk.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const shiftDate = (iso, n) => {
  if (!iso) return iso
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export const TASK_STATUS = [
  { id: 'pendiente', label: 'Pendiente', color: '#8A94A6' },
  { id: 'progreso', label: 'En progreso', color: '#3B82F6' },
  { id: 'revision', label: 'En revisión', color: '#D97706' },
  { id: 'completada', label: 'Completada', color: '#16A34A' },
]
export const PRIORITY = [
  { id: 'baja', label: 'Baja', color: '#8A94A6' },
  { id: 'media', label: 'Media', color: '#3B82F6' },
  { id: 'alta', label: 'Alta', color: '#DC2626' },
]
export const DELIV_STATUS = {
  borrador: { label: 'Borrador', color: '#8A94A6' },
  aprobacion: { label: 'Esperando aprobación', color: '#D97706' },
  cambios: { label: 'Cambios solicitados', color: '#DC2626' },
  aprobado: { label: 'Aprobado', color: '#16A34A' },
}
export const PROJECT_STATUS = {
  activo: { label: 'Activo', color: '#16A34A' },
  pausado: { label: 'Pausado', color: '#D97706' },
  finalizado: { label: 'Finalizado', color: '#8A94A6' },
}

/* ---------------- Permisos ---------------- */
export function scopeFor(db, user) {
  if (!user) return null
  if (user.role === 'admin') return { ...db, clientIds: db.clients.map((c) => c.id), notifications: db.notifications.filter((n) => n.userId === user.id) }
  if (user.role === 'team') {
    const ids = new Set([
      ...db.projects.filter((p) => p.ownerId === user.id).map((p) => p.clientId),
      ...db.tasks.filter((t) => t.assigneeId === user.id).map((t) => t.clientId),
    ])
    return filterBy(db, ids, false, user)
  }
  return filterBy(db, new Set([user.clientId]), true, user)
}
function filterBy(db, ids, isClient, user) {
  const inC = (x) => ids.has(x.clientId)
  return {
    ...db,
    clientIds: [...ids],
    clients: db.clients.filter((c) => ids.has(c.id)),
    projects: db.projects.filter(inC),
    tasks: db.tasks.filter((t) => inC(t) && (!isClient || t.visibleToClient)),
    deliverables: db.deliverables.filter((d) => inC(d) && (!isClient || d.status !== 'borrador')),
    reports: db.reports.filter((r) => inC(r) && (!isClient || r.published)),
    files: db.files.filter((f) => inC(f) && (!isClient || f.shared)),
    comments: db.comments.filter((c) => inC(c) && (!isClient || !c.internal)),
    news: db.news.filter(inC),
    notifications: db.notifications.filter((n) => n.userId === user.id),
    users: db.users,
  }
}

/* ---------------- Derivados ---------------- */
export function projectProgress(tasks, projectId) {
  const t = tasks.filter((x) => x.projectId === projectId)
  if (!t.length) return 0
  return Math.round((t.filter((x) => x.status === 'completada').length / t.length) * 100)
}
export function monthSummary(db, client, mk) {
  const ads = db.deliverables.filter((d) => d.clientId === client.id && d.month === mk && d.type === 'creatividad')
  const approved = ads.filter((d) => d.status === 'aprobado').length
  const waiting = ads.filter((d) => d.status === 'aprobacion').length
  const included = Number(client.adsPerMonth) || 0
  const pending = Math.max(0, included - approved - waiting)
  const report = db.reports.find((r) => r.clientId === client.id && r.month === mk && r.published)
  const tasks = db.tasks.filter((t) => t.clientId === client.id && t.month === mk)
  const done = tasks.filter((t) => t.status === 'completada').length
  return { included, approved, waiting, pending, report, tasks: tasks.length, done, pct: included ? Math.round((approved / included) * 100) : 0 }
}

/* ---------------- Contexto (Firebase) ---------------- */
const Ctx = createContext(null)
export const COLLECTIONS = ['clients', 'projects', 'tasks', 'deliverables', 'reports', 'files', 'comments', 'notifications', 'news', 'users']
export const OWNERS = ['leonellallanapersonal@gmail.com']
const empty = () => Object.fromEntries(COLLECTIONS.map((k) => [k, []]))
const clean = (o) => JSON.parse(JSON.stringify(o)) // quita undefined (Firestore no los acepta)
/* Tolera perfiles cargados a mano: "Role ", " admin", sin nombre, etc. */
function normUser(raw, id) {
  const u = {}
  for (const [k, v] of Object.entries(raw || {})) u[k.trim().replace(/^./, (c) => c.toLowerCase())] = typeof v === 'string' ? v.trim() : v
  const role = String(u.role || '').toLowerCase()
  return { ...u, id, role: ['admin', 'team', 'client'].includes(role) ? role : 'client', name: u.name || u.email || 'Usuario', email: u.email || '' }
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(empty)
  const dbRef = useRef(db)
  const [authUser, setAuthUser] = useState(undefined) // undefined = cargando
  const [profile, setProfile] = useState(undefined)
  const [profileError, setProfileError] = useState('')
  dbRef.current = db

  useEffect(() => onAuthStateChanged(auth, (u) => { setAuthUser(u); if (!u) { setProfile(null); setDb(empty()) } }), [])

  // Perfil del usuario logueado (rol, cliente)
  useEffect(() => {
    if (!authUser) return
    setProfile(undefined)
    const key = (authUser.email || '').toLowerCase()
    return onSnapshot(doc(fs, 'users', key), { includeMetadataChanges: true }, (s) => {
      setProfileError('')
      const isOwner = OWNERS.includes(key)
      if (!s.exists() && isOwner) {
        // Dueño sin perfil: entra igual como admin y se le recrea el perfil en segundo plano.
        const own = { id: key, name: 'Leonel', email: key, role: 'admin' }
        setProfile((prev) => (prev?.id === own.id ? prev : own))
        if (!s.metadata.fromCache) setDoc(doc(fs, 'users', key), own).catch(() => {})
        return
      }
      if (s.metadata.hasPendingWrites) return
      if (!s.exists() && s.metadata.fromCache) return // esperar respuesta del servidor
      const n = s.exists() ? normUser(s.data(), s.id) : null
      setProfile((prev) => (JSON.stringify(prev) === JSON.stringify(n) ? prev : n))
    }, (e) => { setProfileError(e.code || e.message); setProfile(null) })
  }, [authUser])

  // Suscripciones en tiempo real según el rol
  useEffect(() => {
    if (!profile) return
    const cid = profile.clientId
    const staff = profile.role !== 'client'
    const parts = {}
    const put = (key, part, list) => {
      parts[key] ||= {}
      parts[key][part] = list
      const merged = new Map()
      Object.values(parts[key]).flat().forEach((x) => merged.set(x.id, x))
      setDb((prev) => ({ ...prev, [key]: [...merged.values()] }))
    }
    const sub = (key, q, part = 'all') => onSnapshot(q, (snap) => put(key, part, snap.docs.map((d) => (key === 'users' ? normUser(d.data(), d.id) : { ...d.data(), id: d.id }))), (e) => console.error(key, e))
    const C = (k) => collection(fs, k)
    let unsubs
    if (staff) {
      unsubs = COLLECTIONS.filter((k) => k !== 'notifications').map((k) => sub(k, C(k)))
      unsubs.push(sub('notifications', query(C('notifications'), where('userId', '==', profile.id))))
    } else {
      unsubs = [
        onSnapshot(doc(fs, 'clients', cid), (s) => put('clients', 'all', s.exists() ? [{ ...s.data(), id: s.id }] : [])),
        sub('projects', query(C('projects'), where('clientId', '==', cid))),
        sub('news', query(C('news'), where('clientId', '==', cid))),
        sub('tasks', query(C('tasks'), where('clientId', '==', cid), where('visibleToClient', '==', true))),
        sub('deliverables', query(C('deliverables'), where('clientId', '==', cid), where('status', 'in', ['aprobacion', 'cambios', 'aprobado']))),
        sub('reports', query(C('reports'), where('clientId', '==', cid), where('published', '==', true))),
        sub('files', query(C('files'), where('clientId', '==', cid), where('shared', '==', true))),
        sub('comments', query(C('comments'), where('clientId', '==', cid), where('internal', '==', false))),
        sub('notifications', query(C('notifications'), where('userId', '==', profile.id))),
        sub('users', query(C('users'), where('role', 'in', ['admin', 'team'])), 'staff'),
        onSnapshot(doc(fs, 'users', profile.id), (s) => put('users', 'me', s.exists() ? [normUser(s.data(), s.id)] : [])),
      ]
    }
    return () => unsubs.forEach((u) => u())
  }, [profile?.id, profile?.role, profile?.clientId]) // eslint-disable-line

  const user = profile || null
  const view = useMemo(() => scopeFor(db, user), [db, user])

  // Aplica la mutación localmente (optimista) y escribe en Firestore solo lo que cambió.
  const mutate = useCallback((fn) => {
    const prev = dbRef.current
    const next = structuredClone(prev)
    const out = fn(next)
    dbRef.current = next
    setDb(next)
    const batch = writeBatch(fs)
    let n = 0
    for (const k of COLLECTIONS) {
      const before = new Map(prev[k].map((x) => [x.id, x]))
      const after = new Map(next[k].map((x) => [x.id, x]))
      for (const [id, x] of after) {
        if (JSON.stringify(before.get(id)) !== JSON.stringify(x)) { batch.set(doc(fs, k, id), clean(x)); n++ }
      }
      for (const id of before.keys()) if (!after.has(id)) { batch.delete(doc(fs, k, id)); n++ }
    }
    if (n) batch.commit().catch((e) => { console.error(e); alert('No se pudo guardar: ' + e.message) })
    return out
  }, [])

  const actions = useMemo(() => buildActions(mutate, () => user, () => dbRef.current), [mutate, user])

  // Migración: perfiles viejos guardados por ID interno pasan a guardarse por email.
  const migrated = useRef(new Set())
  useEffect(() => {
    if (profile?.role !== 'admin') return
    const legacy = db.users.filter((u) => u.email && u.id !== u.email.toLowerCase() && !migrated.current.has(u.id))
    if (!legacy.length) return
    legacy.forEach((u) => migrated.current.add(u.id))
    mutate((d) => {
      for (const u of legacy) {
        const nid = u.email.toLowerCase()
        d.users = d.users.filter((x) => x.id !== u.id && x.id !== nid)
        d.users.push({ ...u, id: nid, email: nid })
        d.tasks.forEach((t) => { if (t.assigneeId === u.id) t.assigneeId = nid })
        d.projects.forEach((p) => { if (p.ownerId === u.id) p.ownerId = nid })
      }
    })
  }, [db.users, profile?.role]) // eslint-disable-line


  const login = async (email, password) => {
    try { await signInWithEmailAndPassword(auth, email.trim(), password); return null } catch (e) { return authError(e) }
  }
  // Primer acceso: crea el administrador inicial (solo funciona una vez; lo controlan las reglas).
  const bootstrap = async (name, email, password) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const b = writeBatch(fs)
      b.set(doc(fs, 'users', cred.user.uid), { id: cred.user.uid, name, email: email.trim(), role: 'admin' })
      b.set(doc(fs, 'meta', 'setup'), { by: cred.user.uid, at: now() })
      await b.commit()
      return null
    } catch (e) {
      if (auth.currentUser) await signOut(auth)
      return e.code === 'permission-denied' ? 'Ya existe un administrador. Pedile que te cree el acceso.' : authError(e)
    }
  }
  const logout = () => signOut(auth)
  const loading = authUser === undefined || (authUser && profile === undefined)
  const noProfile = authUser && profile === null

  return <Ctx.Provider value={{ db, view, user, actions, login, logout, bootstrap, loading, noProfile, authUser, profileError }}>{children}</Ctx.Provider>
}
export const useStore = () => useContext(Ctx)

export function authError(e) {
  const m = {
    'auth/invalid-credential': 'Email o contraseña incorrectos.', 'auth/wrong-password': 'Email o contraseña incorrectos.', 'auth/user-not-found': 'Email o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese email ya tiene una cuenta.', 'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/invalid-email': 'El email no es válido.', 'auth/too-many-requests': 'Demasiados intentos. Probá en unos minutos.',
  }
  return m[e.code] || e.message
}

/* Crea una cuenta de acceso (Auth + perfil) sin cerrar la sesión actual. */
/* El perfil se guarda por email: si el email ya tenía cuenta (ej. un cliente borrado),
   se reutiliza y se le manda un email para que elija su contraseña. */
export async function createAccount({ name, email, password, role, clientId }) {
  const key = email.trim().toLowerCase()
  let existed = false
  try {
    await createUserWithEmailAndPassword(auth2, key, password)
    await signOut(auth2)
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e
    existed = true
  }
  await setDoc(doc(fs, 'users', key), clean({ id: key, name, email: key, role, clientId }))
  if (existed) {
    await sendPasswordResetEmail(auth, key).catch(() => {})
    alert(`${key} ya tenía una cuenta de antes, así que la contraseña que pusiste no se aplicó. Le enviamos un email para que elija una nueva.`)
  }
  return key
}
export const sendReset = (email) => sendPasswordResetEmail(auth, email)

/* ---------------- Acciones + notificaciones ---------------- */
function buildActions(mutate, getUser, getDb) {
  const me = () => getUser()?.id
  const notify = (db, userIds, text, link, exclude = me()) => {
    for (const id of new Set(userIds)) {
      if (!id || id === exclude) continue
      db.notifications.unshift({ id: uid(), userId: id, text, link, at: now(), read: false })
    }
  }
  const staffFor = (db, clientId) => {
    const p = db.projects.filter((x) => x.clientId === clientId).map((x) => x.ownerId)
    return [...db.users.filter((u) => u.role === 'admin').map((u) => u.id), ...p]
  }
  const clientUsers = (db, clientId) => db.users.filter((u) => u.role === 'client' && u.clientId === clientId).map((u) => u.id)

  return {
    /* Clientes */
    /* Devuelve un mensaje de error o null */
    async saveClient(c, login) {
      const id = mutate((db) => {
        if (c.id) { Object.assign(db.clients.find((x) => x.id === c.id), c); return c.id }
        const nc = { ...c, id: uid(), createdAt: now(), status: c.status || 'activo' }
        db.clients.push(nc)
        db.projects.push({ id: uid(), clientId: nc.id, name: `MetaFlash — ${nc.name}`, ownerId: me(), status: 'activo', start: new Date().toISOString().slice(0, 10), end: '' })
        return nc.id
      })
      if (!login?.email) return null
      const ex = getDb().users.find((u) => u.role === 'client' && u.clientId === id)
      try {
        if (ex) {
          if (login.name && login.name !== ex.name) mutate((db) => { db.users.find((u) => u.id === ex.id).name = login.name })
          return null
        }
        await createAccount({ name: login.name || c.contact || c.name, email: login.email, password: login.password, role: 'client', clientId: id })
        return null
      } catch (e) { return authError(e) }
    },
    deleteClient(id) {
      mutate((db) => {
        for (const k of ['projects', 'tasks', 'deliverables', 'reports', 'files', 'comments', 'news']) db[k] = db[k].filter((x) => x.clientId !== id)
        const gone = db.users.filter((u) => u.clientId === id).map((u) => u.id)
        db.users = db.users.filter((u) => u.clientId !== id)
        db.notifications = db.notifications.filter((n) => !gone.includes(n.userId))
        db.clients = db.clients.filter((c) => c.id !== id)
      })
    },
    /* Proyectos */
    saveProject(p) {
      mutate((db) => {
        if (p.id) Object.assign(db.projects.find((x) => x.id === p.id), p)
        else db.projects.push({ ...p, id: uid() })
      })
    },
    /* Equipo */
    async saveUser(u) {
      try {
        if (u.id) { mutate((db) => { Object.assign(db.users.find((x) => x.id === u.id), { name: u.name, role: u.role }) }); return null }
        await createAccount(u)
        return null
      } catch (e) { return authError(e) }
    },
    deleteUser(id) { mutate((db) => { db.users = db.users.filter((u) => u.id !== id) }) },
    /* Tareas */
    saveTask(t) {
      let id = t.id
      mutate((db) => {
        const proj = db.projects.find((p) => p.id === t.projectId)
        const clientId = proj?.clientId || t.clientId
        if (t.id) {
          const cur = db.tasks.find((x) => x.id === t.id)
          const reassigned = t.assigneeId && t.assigneeId !== cur.assigneeId
          Object.assign(cur, t, { clientId })
          if (reassigned) notify(db, [t.assigneeId], `Te asignaron la tarea "${t.title}"`, `#/task/${t.id}`)
        } else {
          id = uid()
          const month = t.due ? monthKey(t.due + 'T12:00:00') : monthKey()
          db.tasks.push({ status: 'pendiente', priority: 'media', description: '', month, ...t, id, clientId, createdAt: now() })
          if (t.assigneeId) notify(db, [t.assigneeId], `Nueva tarea asignada: "${t.title}"`, `#/task/${id}`)
        }
      })
      return id
    },
    setTaskStatus(id, status) {
      mutate((db) => {
        const t = db.tasks.find((x) => x.id === id)
        const was = t.status
        t.status = status
        const u = getUser()
        if (status === 'completada' && was !== 'completada' && u?.role === 'client') {
          notify(db, staffFor(db, t.clientId), `${u.name} completó "${t.title}"`, `#/task/${id}`)
        }
      })
    },
    deleteTask(id) { mutate((db) => { db.tasks = db.tasks.filter((t) => t.id !== id) }) },
    duplicateMonth(clientId, fromMk) {
      let n = 0
      mutate((db) => {
        const to = addMonths(fromMk, 1)
        for (const t of db.tasks.filter((x) => x.clientId === clientId && x.month === fromMk)) {
          db.tasks.push({ ...t, id: uid(), status: 'pendiente', month: to, due: shiftDate(t.due, 1), createdAt: now() })
          n++
        }
      })
      return n
    },
    /* Entregables (guiones y creatividades) */
    saveDeliverable(d, versionPayload, send) {
      let id = d.id
      mutate((db) => {
        let cur = d.id && db.deliverables.find((x) => x.id === d.id)
        if (!cur) {
          id = uid()
          cur = { status: 'borrador', versions: [], history: [{ id: uid(), action: 'created', by: me(), at: now(), comment: '' }], createdAt: now(), ...d, id }
          db.deliverables.push(cur)
        } else Object.assign(cur, d)
        if (versionPayload) {
          cur.versions.push({ n: cur.versions.length + 1, ...versionPayload, by: me(), at: now() })
          if (cur.versions.length > 1) cur.history.push({ id: uid(), action: 'version', by: me(), at: now(), comment: `Versión ${cur.versions.length}` })
        }
        if (send) {
          cur.status = 'aprobacion'
          cur.history.push({ id: uid(), action: 'sent', by: me(), at: now(), comment: '' })
          const label = cur.type === 'guion' ? 'guion' : 'creatividad'
          notify(db, clientUsers(db, cur.clientId), `Tenés un ${label} para aprobar: "${cur.title}"`, `#/deliverable/${id}`)
        }
      })
      return id
    },
    decide(id, approved, comment) {
      mutate((db) => {
        const d = db.deliverables.find((x) => x.id === id)
        d.status = approved ? 'aprobado' : 'cambios'
        d.history.push({ id: uid(), action: approved ? 'approved' : 'changes', by: me(), at: now(), comment: comment || '' })
        if (comment) db.comments.push({ id: uid(), targetType: 'deliverable', targetId: id, clientId: d.clientId, text: (approved ? '✅ ' : '✏️ Cambios: ') + comment, by: me(), at: now(), internal: false })
        const name = getUser()?.name
        notify(db, staffFor(db, d.clientId), approved ? `${name} aprobó "${d.title}"` : `${name} pidió cambios en "${d.title}"`, `#/deliverable/${id}`)
      })
    },
    deleteDeliverable(id) { mutate((db) => { db.deliverables = db.deliverables.filter((d) => d.id !== id) }) },
    /* Reportes */
    saveReport(r, publish) {
      let id = r.id
      mutate((db) => {
        let cur = r.id && db.reports.find((x) => x.id === r.id)
        if (!cur) { id = uid(); cur = { ...r, id, published: false, readAt: null }; db.reports.push(cur) } else Object.assign(cur, r)
        if (publish && !cur.published) {
          cur.published = true
          cur.publishedAt = now()
          cur.readAt = null
          notify(db, clientUsers(db, cur.clientId), `Nuevo reporte publicado: ${cur.title}`, `#/report/${id}`)
        }
      })
      return id
    },
    markReportRead(id) {
      mutate((db) => {
        const r = db.reports.find((x) => x.id === id)
        if (r && !r.readAt) r.readAt = now()
      })
    },
    deleteReport(id) { mutate((db) => { db.reports = db.reports.filter((r) => r.id !== id) }) },
    /* Archivos */
    addFile(f) {
      const id = uid()
      mutate((db) => { db.files.push({ shared: true, ...f, id, by: me(), at: now() }) })
      return id
    },
    toggleFileShared(id) { mutate((db) => { const f = db.files.find((x) => x.id === id); f.shared = !f.shared }) },
    deleteFile(id) { mutate((db) => { db.files = db.files.filter((f) => f.id !== id) }) },
    /* Comentarios */
    addComment(targetType, targetId, clientId, text, internal) {
      mutate((db) => {
        db.comments.push({ id: uid(), targetType, targetId, clientId, text, by: me(), at: now(), internal: !!internal })
        const u = getUser()
        const target = targetType === 'task' ? db.tasks.find((t) => t.id === targetId) : db.deliverables.find((d) => d.id === targetId)
        const link = `#/${targetType}/${targetId}`
        const recipients = u.role === 'client'
          ? [...staffFor(db, clientId), target?.assigneeId]
          : [target?.assigneeId, ...(internal ? [] : clientUsers(db, clientId)), ...staffFor(db, clientId)]
        notify(db, recipients.filter((r) => {
          const ru = db.users.find((x) => x.id === r)
          return ru && !(internal && ru.role === 'client')
        }), `${u.name} comentó en "${target?.title}"`, link)
      })
    },
    /* Novedades */
    addNews(clientId, text) {
      mutate((db) => {
        db.news.unshift({ id: uid(), clientId, text, by: me(), at: now() })
        notify(db, clientUsers(db, clientId), `Novedad: ${text.slice(0, 60)}`, '#/')
      })
    },
    deleteNews(id) { mutate((db) => { db.news = db.news.filter((n) => n.id !== id) }) },
    /* Notificaciones */
    readNotification(id) { mutate((db) => { const n = db.notifications.find((x) => x.id === id); if (n) n.read = true }) },
    readAllNotifications() { mutate((db) => { db.notifications.forEach((n) => { if (n.userId === me()) n.read = true }) }) },
  }
}
