import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'

/* ============================================================
   Capa de datos de MetaFlash.
   Hoy persiste en localStorage (modo demo, un solo navegador).
   Todas las mutaciones pasan por `actions`, así que cambiar a
   Firebase/Firestore es reemplazar load/save sin tocar la UI.
   ============================================================ */

const KEY = 'metaflash:v1'
const SESSION = 'metaflash:session'

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

/* ---------------- Datos de ejemplo ---------------- */
function seed() {
  const mk = monthKey()
  const prev = addMonths(mk, -1)
  const d = (offset) => {
    const x = new Date()
    x.setDate(x.getDate() + offset)
    return x.toISOString().slice(0, 10)
  }
  const users = [
    { id: 'u_admin', name: 'Admin Bull', email: 'admin@bull.com', password: 'admin123', role: 'admin' },
    { id: 'u_sofi', name: 'Sofía Ruiz', email: 'sofia@bull.com', password: 'equipo123', role: 'team' },
    { id: 'u_tomi', name: 'Tomás Díaz', email: 'tomas@bull.com', password: 'equipo123', role: 'team' },
    { id: 'u_abc', name: 'Laura (Empresa ABC)', email: 'cliente@abc.com', password: 'cliente123', role: 'client', clientId: 'c_abc' },
    { id: 'u_nova', name: 'Martín (Nova Fit)', email: 'cliente@novafit.com', password: 'cliente123', role: 'client', clientId: 'c_nova' },
  ]
  const clients = [
    { id: 'c_abc', name: 'Empresa ABC', contact: 'Laura Gómez', email: 'cliente@abc.com', adsPerMonth: 5, status: 'activo', createdAt: now() },
    { id: 'c_nova', name: 'Nova Fit', contact: 'Martín Pérez', email: 'cliente@novafit.com', adsPerMonth: 4, status: 'activo', createdAt: now() },
  ]
  const projects = [
    { id: 'p_abc', clientId: 'c_abc', name: 'MetaFlash — Empresa ABC', ownerId: 'u_sofi', status: 'activo', start: d(-40), end: d(140) },
    { id: 'p_nova', clientId: 'c_nova', name: 'MetaFlash — Nova Fit', ownerId: 'u_tomi', status: 'activo', start: d(-10), end: d(170) },
  ]
  const T = (o) => ({ id: uid(), description: '', priority: 'media', status: 'pendiente', visibleToClient: false, month: mk, createdAt: now(), ...o })
  const tasks = [
    T({ projectId: 'p_abc', clientId: 'c_abc', title: 'Enviar fotos de productos nuevos', description: 'Necesitamos 5-10 fotos en buena calidad de la nueva línea.', assigneeId: 'u_abc', due: d(2), priority: 'alta', visibleToClient: true }),
    T({ projectId: 'p_abc', clientId: 'c_abc', title: 'Completar brief del mes', description: 'Promociones, fechas clave y objetivos del mes.', assigneeId: 'u_abc', due: d(-1), visibleToClient: true }),
    T({ projectId: 'p_abc', clientId: 'c_abc', title: 'Investigación de competencia', assigneeId: 'u_sofi', due: d(1), status: 'progreso' }),
    T({ projectId: 'p_abc', clientId: 'c_abc', title: 'Edición de video anuncio #3', assigneeId: 'u_tomi', due: d(4), status: 'revision' }),
    T({ projectId: 'p_abc', clientId: 'c_abc', title: 'Configurar campañas del mes', assigneeId: 'u_sofi', due: d(-3), status: 'completada' }),
    T({ projectId: 'p_abc', clientId: 'c_abc', title: 'Reunión de kickoff mensual', assigneeId: 'u_sofi', due: d(-8), status: 'completada', visibleToClient: true }),
    T({ projectId: 'p_nova', clientId: 'c_nova', title: 'Grabar testimonios de socios', assigneeId: 'u_nova', due: d(5), visibleToClient: true }),
    T({ projectId: 'p_nova', clientId: 'c_nova', title: 'Guiones de anuncios del mes', assigneeId: 'u_tomi', due: d(3), status: 'progreso' }),
    T({ projectId: 'p_abc', clientId: 'c_abc', title: 'Configurar campañas del mes', assigneeId: 'u_sofi', due: shiftDate(d(-3), -1), status: 'completada', month: prev }),
  ]
  const hist = (action, by, comment) => ({ id: uid(), action, by, comment: comment || '', at: now() })
  const deliverables = [
    {
      id: uid(), clientId: 'c_abc', projectId: 'p_abc', month: mk, type: 'guion', title: 'Guion #1 — "Ahorrá tiempo"', status: 'aprobacion', createdAt: now(),
      versions: [{ n: 1, content: 'HOOK: ¿Seguís perdiendo horas en tareas que podrías automatizar?\n\nDESARROLLO: En Empresa ABC te ayudamos a...\n\nCTA: Escribinos por WhatsApp y pedí tu demo gratis.', by: 'u_sofi', at: now() }],
      history: [hist('created', 'u_sofi'), hist('sent', 'u_sofi')],
    },
    {
      id: uid(), clientId: 'c_abc', projectId: 'p_abc', month: mk, type: 'guion', title: 'Guion #2 — Testimonio', status: 'aprobado', createdAt: now(),
      versions: [{ n: 1, content: 'Versión inicial...', by: 'u_sofi', at: now() }, { n: 2, content: 'HOOK: "Pensé que no iba a funcionar..."\n\nTestimonio de cliente real + CTA a WhatsApp.', by: 'u_sofi', at: now() }],
      history: [hist('sent', 'u_sofi'), hist('changes', 'u_abc', 'Prefiero un tono más cercano.'), hist('sent', 'u_sofi'), hist('approved', 'u_abc')],
    },
    { id: uid(), clientId: 'c_abc', projectId: 'p_abc', month: mk, type: 'creatividad', title: 'Anuncio #1 — Imagen promo', status: 'aprobado', createdAt: now(), versions: [{ n: 1, mediaType: 'image', url: 'https://picsum.photos/seed/bull1/800/800', by: 'u_tomi', at: now() }], history: [hist('sent', 'u_tomi'), hist('approved', 'u_abc')] },
    { id: uid(), clientId: 'c_abc', projectId: 'p_abc', month: mk, type: 'creatividad', title: 'Anuncio #2 — Carrusel', status: 'aprobado', createdAt: now(), versions: [{ n: 1, mediaType: 'image', url: 'https://picsum.photos/seed/bull2/800/800', by: 'u_tomi', at: now() }], history: [hist('sent', 'u_tomi'), hist('approved', 'u_abc')] },
    { id: uid(), clientId: 'c_abc', projectId: 'p_abc', month: mk, type: 'creatividad', title: 'Anuncio #3 — Video testimonio', status: 'aprobacion', createdAt: now(), versions: [{ n: 1, mediaType: 'image', url: 'https://picsum.photos/seed/bull3/800/800', by: 'u_tomi', at: now() }], history: [hist('sent', 'u_tomi')] },
  ]
  const reports = [
    {
      id: uid(), clientId: 'c_abc', month: prev, title: `Reporte ${monthLabel(prev)}`, published: true, publishedAt: now(), readAt: null,
      metrics: [{ label: 'Inversión', value: '$450.000' }, { label: 'Conversaciones', value: '312' }, { label: 'Costo por conversación', value: '$1.442' }, { label: 'Ventas reportadas', value: '41' }],
      conclusions: 'El anuncio de testimonio fue el de mejor rendimiento, con un costo por conversación 28% menor al promedio.',
      nextSteps: 'Producir 2 variantes más del testimonio y probar un nuevo público de intereses.',
    },
  ]
  const news = [
    { id: uid(), clientId: 'c_abc', text: 'Lanzamos las campañas del mes. Primeros resultados en 7 días.', by: 'u_sofi', at: now() },
  ]
  return { users, clients, projects, tasks, deliverables, reports, files: [], comments: [], notifications: [], news }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* noop */ }
  return seed()
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

/* ---------------- Contexto ---------------- */
const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load)
  const [userId, setUserId] = useState(() => localStorage.getItem(SESSION))

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch (e) { alert('No hay más espacio de almacenamiento local. Borrá archivos grandes.'); console.error(e) }
  }, [db])

  // Sincroniza entre pestañas (ej.: admin en una pestaña y cliente en otra).
  useEffect(() => {
    const on = (e) => { if (e.key === KEY && e.newValue) setDb(JSON.parse(e.newValue)) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])

  const user = db.users.find((u) => u.id === userId) || null
  const view = useMemo(() => scopeFor(db, user), [db, user])

  const mutate = useCallback((fn) => setDb((prev) => {
    const next = structuredClone(prev)
    fn(next)
    return next
  }), [])

  const actions = useMemo(() => buildActions(mutate, () => user), [mutate, user])

  const login = (email, password) => {
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password)
    if (!u) return false
    localStorage.setItem(SESSION, u.id)
    setUserId(u.id)
    return true
  }
  const logout = () => { localStorage.removeItem(SESSION); setUserId(null) }
  const resetDemo = () => { setDb(seed()) }

  return <Ctx.Provider value={{ db, view, user, actions, login, logout, resetDemo }}>{children}</Ctx.Provider>
}
export const useStore = () => useContext(Ctx)

/* ---------------- Acciones + notificaciones ---------------- */
function buildActions(mutate, getUser) {
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
    saveClient(c, login) {
      mutate((db) => {
        if (c.id) Object.assign(db.clients.find((x) => x.id === c.id), c)
        else {
          c = { ...c, id: uid(), createdAt: now(), status: c.status || 'activo' }
          db.clients.push(c)
          db.projects.push({ id: uid(), clientId: c.id, name: `MetaFlash — ${c.name}`, ownerId: me(), status: 'activo', start: new Date().toISOString().slice(0, 10), end: '' })
        }
        if (login?.email && login?.password) {
          const ex = db.users.find((u) => u.role === 'client' && u.clientId === c.id)
          if (ex) Object.assign(ex, { email: login.email, password: login.password, name: login.name || ex.name })
          else db.users.push({ id: uid(), role: 'client', clientId: c.id, name: login.name || c.contact || c.name, email: login.email, password: login.password })
        }
      })
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
    saveUser(u) {
      mutate((db) => {
        if (u.id) Object.assign(db.users.find((x) => x.id === u.id), u)
        else db.users.push({ ...u, id: uid() })
      })
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
      mutate((db) => { db.files.push({ shared: true, ...f, id: uid(), by: me(), at: now() }) })
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
