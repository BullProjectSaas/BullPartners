import { useEffect, useState } from 'react'
import { useStore, TASK_STATUS, PRIORITY, DELIV_STATUS } from './store.jsx'

/* -------- Router hash mínimo (compatible con GitHub Pages) -------- */
export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [path, qs] = hash.slice(1).split('?')
  const parts = path.split('/').filter(Boolean)
  return { parts, query: new URLSearchParams(qs || '') }
}
export const go = (h) => { window.location.hash = h }

/* -------- Formato -------- */
export const fmtDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—')
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const today = () => new Date().toISOString().slice(0, 10)
export const isOverdue = (t) => t.due && t.status !== 'completada' && t.due < today()

/* -------- Átomos -------- */
export function Badge({ color, children, soft = true }) {
  return <span className="badge" style={{ color, background: soft ? color + '18' : color, borderColor: color + '33' }}>{children}</span>
}
export const StatusBadge = ({ status }) => {
  const s = TASK_STATUS.find((x) => x.id === status)
  return <Badge color={s.color}><span className="dot" style={{ background: s.color }} />{s.label}</Badge>
}
export const PriorityBadge = ({ p }) => {
  const s = PRIORITY.find((x) => x.id === p) || PRIORITY[1]
  return <Badge color={s.color}>{s.label}</Badge>
}
export const DelivBadge = ({ status }) => {
  const s = DELIV_STATUS[status]
  return <Badge color={s.color}><span className="dot" style={{ background: s.color }} />{s.label}</Badge>
}
export function Avatar({ user, size = 24 }) {
  if (!user) return <span className="avatar empty" style={{ width: size, height: size }}>?</span>
  const ini = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const hue = [...user.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return <span className="avatar" title={user.name} style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 55% 92%)`, color: `hsl(${hue} 50% 35%)` }}>{ini}</span>
}
export function Progress({ value, color = 'var(--accent)' }) {
  return <div className="progress"><div style={{ width: `${Math.min(100, value)}%`, background: color }} /></div>
}
export function Empty({ icon = '✓', title, text, action }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><b>{title}</b>{text && <p>{text}</p>}{action}</div>
}
export function Card({ title, action, children, className = '' }) {
  return (
    <section className={'card ' + className}>
      {(title || action) && <header className="card-h"><h3>{title}</h3>{action}</header>}
      {children}
    </section>
  )
}
export function Stat({ label, value, sub, color }) {
  return <div className="stat"><span>{label}</span><b style={{ color }}>{value}</b>{sub && <small>{sub}</small>}</div>
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <header className="modal-h"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></header>
        <div className="modal-b">{children}</div>
        {footer && <footer className="modal-f">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function UserSelect({ value, onChange, users, allowEmpty = true }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">Sin asignar</option>}
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role === 'client' ? ' (cliente)' : ''}</option>)}
    </select>
  )
}

/* -------- Archivos -------- */
/* Sin Firebase Storage los archivos se guardan dentro de la base (máx. ~1 MB por documento).
   Las imágenes se comprimen solas; para videos o archivos grandes se usa un link (Drive, etc.). */
const MAX_B64 = 950000
const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob) })
async function compressImage(file) {
  const img = await createImageBitmap(file)
  for (const [side, q] of [[1600, 0.85], [1280, 0.75], [1024, 0.7], [800, 0.6]]) {
    const k = Math.min(1, side / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    const url = c.toDataURL('image/jpeg', q)
    if (url.length < MAX_B64) return url
  }
  throw new Error(`"${file.name}" es demasiado grande.`)
}
export async function readFile(file) {
  if (file.type.startsWith('image/') && !file.type.includes('gif') && !file.type.includes('svg')) {
    const url = await compressImage(file)
    return { name: file.name, size: Math.round(url.length * 0.75), mime: 'image/jpeg', url }
  }
  const url = await toDataUrl(file)
  if (url.length > MAX_B64) throw new Error(`"${file.name}" supera ~700 KB. Por ahora subilo a Google Drive y pegá el link en un comentario.`)
  return { name: file.name, size: file.size, mime: file.type, url }
}
/* Resuelve referencias "file:<id>" a su contenido */
export function useSrc(url) {
  const { view } = useStore()
  if (url?.startsWith('file:')) return view.files.find((f) => f.id === url.slice(5))?.url
  return url
}
export function FilePicker({ onFiles, label = 'Adjuntar archivo', accept }) {
  return (
    <label className="btn ghost sm">
      📎 {label}
      <input type="file" hidden multiple accept={accept} onChange={async (e) => {
        const out = []
        for (const f of e.target.files) {
          try { out.push(await readFile(f)) } catch (err) { alert(err.message) }
        }
        e.target.value = ''
        if (out.length) onFiles(out)
      }} />
    </label>
  )
}
export const fileIcon = (mime = '') => (mime.startsWith('image') ? '🖼️' : mime.startsWith('video') ? '🎬' : mime.includes('pdf') ? '📕' : '📄')
export const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB')

export function FileList({ files, canManage }) {
  const { actions, view } = useStore()
  if (!files.length) return <p className="muted sm">Sin archivos todavía.</p>
  return (
    <ul className="files">
      {files.map((f) => (
        <li key={f.id}>
          {f.mime?.startsWith('image') ? <img src={f.url} alt="" /> : <span className="ficon">{fileIcon(f.mime)}</span>}
          <div className="grow">
            <a href={f.url} download={f.name} target="_blank" rel="noreferrer">{f.name}</a>
            <small className="muted">{fmtSize(f.size)} · {view.users.find((u) => u.id === f.by)?.name} · {fmtDate(f.at)}</small>
          </div>
          {canManage && (
            <>
              <button className="chip" onClick={() => actions.toggleFileShared(f.id)} title="Visible para el cliente">{f.shared ? '👁 Compartido' : '🔒 Interno'}</button>
              <button className="icon-btn" onClick={() => confirm('¿Eliminar archivo?') && actions.deleteFile(f.id)}>🗑</button>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/* -------- Comentarios -------- */
export function Comments({ targetType, targetId, clientId }) {
  const { view, user, actions } = useStore()
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const list = view.comments.filter((c) => c.targetType === targetType && c.targetId === targetId)
  const staff = user.role !== 'client'
  const send = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    actions.addComment(targetType, targetId, clientId, text.trim(), staff && internal)
    setText('')
  }
  return (
    <div className="comments">
      {list.length === 0 && <p className="muted sm">Todavía no hay comentarios.</p>}
      {list.map((c) => {
        const u = view.users.find((x) => x.id === c.by)
        return (
          <div key={c.id} className={'comment' + (c.internal ? ' internal' : '')}>
            <Avatar user={u} size={28} />
            <div>
              <div className="comment-h"><b>{u?.name || 'Usuario'}</b><small>{fmtDateTime(c.at)}</small>{c.internal && <Badge color="#7C3AED">Interno</Badge>}</div>
              <p>{c.text}</p>
            </div>
          </div>
        )
      })}
      <form onSubmit={send} className="comment-form">
        <textarea rows={2} placeholder="Escribí un comentario…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e) }} />
        <div className="row between">
          {staff ? <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Solo equipo interno</label> : <span />}
          <button className="btn primary sm" disabled={!text.trim()}>Comentar</button>
        </div>
      </form>
    </div>
  )
}

/* -------- Modo oscuro (se guarda en este dispositivo) -------- */
const THEME_KEY = 'mf:theme'
export function applyStoredTheme() {
  let t = 'light'
  try { t = localStorage.getItem(THEME_KEY) || 'light' } catch { /* noop */ }
  document.documentElement.dataset.theme = t
}
export function ThemeToggle() {
  const [t, setT] = useState(() => document.documentElement.dataset.theme || 'light')
  const toggle = () => {
    const n = t === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = n
    try { localStorage.setItem(THEME_KEY, n) } catch { /* noop */ }
    setT(n)
  }
  return <button className="btn ghost sm theme-btn" onClick={(e) => { e.stopPropagation(); toggle() }}>{t === 'dark' ? '☀️ Modo claro' : '🌙 Modo oscuro'}</button>
}

/* -------- Videos por link (Drive, YouTube, Loom, Fathom, Vimeo) con vista previa -------- */
export function embedUrl(url = '') {
  const u = url.trim()
  let m
  if ((m = u.match(/drive\.google\.com\/file\/d\/([^/?#]+)/))) return `https://drive.google.com/file/d/${m[1]}/preview`
  if ((m = u.match(/drive\.google\.com\/open\?id=([^&#]+)/))) return `https://drive.google.com/file/d/${m[1]}/preview`
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/))) return `https://www.youtube.com/embed/${m[1]}`
  if ((m = u.match(/loom\.com\/(?:share|embed)\/([\w]+)/))) return `https://www.loom.com/embed/${m[1]}`
  if ((m = u.match(/fathom\.video\/(?:share|embed)\/([\w-]+)/))) return `https://fathom.video/embed/${m[1]}`
  if ((m = u.match(/vimeo\.com\/(\d+)/))) return `https://player.vimeo.com/video/${m[1]}`
  return null
}
export function VideoEmbed({ url, vertical }) {
  if (!url) return null
  const src = embedUrl(url)
  return (
    <div className="embed-wrap">
      {src ? <div className={'embed' + (vertical ? ' vertical' : '')}><iframe src={src} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="video" /></div>
        : <div className="linkbox">No se puede previsualizar este link</div>}
      <a className="sm link" href={url} target="_blank" rel="noreferrer">Abrir en una pestaña nueva ↗</a>
    </div>
  )
}
