import { useEffect, useState } from 'react'
import { useStore, sheetApi, fmtMoney, getIntegration, adminApi } from '../store.jsx'
import { computeSummary } from '../salesMath.js'
import { Empty, go } from '../ui.jsx'

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const RANGES = [['yesterday', 'Ayer'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['month', 'Este mes']]
function rangeOf(k) {
  const t = new Date()
  if (k === 'yesterday') { const y = new Date(t); y.setDate(t.getDate() - 1); return { since: ymd(y), until: ymd(y) } }
  if (k === 'month') return { since: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), until: ymd(t) }
  const a = new Date(t); a.setDate(t.getDate() - Number(k) + 1)
  return { since: ymd(a), until: ymd(t) }
}
const roasTxt = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ',') + 'x')
const daysTxt = (v) => (v == null ? '—' : v < 1 ? 'mismo día' : Math.round(v) + (Math.round(v) === 1 ? ' día' : ' días'))

/* Carga y calcula los datos de un cliente para el rango. */
async function loadClient(client, range) {
  const q = { since: range.since, until: range.until }
  const off = new Set(client.excludedCampaigns || [])
  const isOn = (c) => !off.has(c || '')
  const [rows, spend] = await Promise.all([
    sheetApi(client, { action: 'rows', ...q }),
    sheetApi(client, { action: 'spend', ...q }).catch((e) => ({ hasSpend: false, error: e.message })),
  ])
  const sum = computeSummary(
    (rows.rows || []).filter((r) => isOn(r.campaign)),
    spend.hasSpend ? { ...spend, rows: (spend.rows || []).filter((r) => isOn(r.campaign_name)), daily: (spend.daily || []).filter((d) => isOn(d.campaign_name)) } : spend,
    range.since, range.until,
  )
  // costo por lead por día (para la tendencia)
  const byDay = {}
  for (const d of sum.daily) { const x = (byDay[d.date] ||= { spend: 0, leads: 0 }); x.spend += d.spend; x.leads += d.leads }
  const days = []
  for (let x = new Date(range.since + 'T12:00:00'); ymd(x) <= range.until; x.setDate(x.getDate() + 1)) {
    const k = ymd(x), v = byDay[k] || { spend: 0, leads: 0 }
    days.push({ date: k, spend: v.spend, leads: v.leads, cpl: v.leads ? v.spend / v.leads : null })
  }
  return { sum, days }
}

/* Estado de campañas desde Meta (activas / pausadas), respetando las campañas excluidas. */
async function loadCampaigns(client, account) {
  if (!account) return null
  const r = await sheetApi(client, { action: 'meta', path: `act_${account}/campaigns?fields=name,effective_status&limit=200` })
  const off = new Set(client.excludedCampaigns || [])
  const list = (r.data || []).filter((c) => !off.has(c.name))
  return { active: list.filter((c) => c.effective_status === 'ACTIVE').length, total: list.length }
}

function Trend({ days }) {
  const [hover, setHover] = useState(null)
  const pts = days.filter((d) => d.cpl != null)
  if (pts.length < 2) return <span className="muted sm">sin datos</span>
  const w = 76, h = 26, vals = pts.map((d) => d.cpl), mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1
  const xy = pts.map((d, i) => [3 + (i * (w - 6)) / (pts.length - 1), h - 4 - ((d.cpl - mn) / r) * (h - 8)])
  const n = Math.max(1, Math.floor(pts.length / 3))
  const avg = (a) => a.reduce((s, d) => s + d.cpl, 0) / a.length
  const first = avg(pts.slice(0, n)), last = avg(pts.slice(-n)), ch = (last - first) / first
  const good = ch <= 0
  const hp = hover != null ? pts[hover] : null
  return (
    <div className="trend" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={h}>
        <polyline fill="none" stroke="var(--muted)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" points={xy.map((p) => p.join(',')).join(' ')} />
        <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="3.5" fill={good ? '#16A34A' : '#DC2626'} stroke="var(--panel)" strokeWidth="2" />
        {hp && <circle cx={xy[hover][0]} cy={xy[hover][1]} r="3" fill="var(--text)" />}
        {xy.map((p, i) => <rect key={i} x={p[0] - (w / pts.length) / 2} y="0" width={w / pts.length} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onClick={(e) => { e.stopPropagation(); setHover(hover === i ? null : i) }} />)}
      </svg>
      <small className={good ? 'pos' : 'neg'}>{good ? '▼' : '▲'} {Math.abs(Math.round(ch * 100))}%</small>
      {hp && <div className="tip trend-tip"><b>{new Date(hp.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</b><div>Costo por lead <span>{fmtMoney(hp.cpl)}</span></div><div className="muted">{hp.leads} leads · {fmtMoney(hp.spend)}</div></div>}
    </div>
  )
}

export default function OverviewPage() {
  const { view } = useStore()
  const [rk, setRk] = useState('7')
  const [data, setData] = useState({})
  const order = (c) => (data[c.id]?.none ? -1 : data[c.id]?.sum?.total?.spend || 0)
  const clients = view.clients.filter((c) => c.status !== 'finalizado')
  const sorted = [...clients].sort((a, b) => order(b) - order(a) || a.name.localeCompare(b.name))
  const range = rangeOf(rk)

  useEffect(() => {
    let alive = true
    setData({})
    const integP = getIntegration().catch(() => null)
    for (const c of clients) {
      if (!c.salesUrl) { setData((p) => ({ ...p, [c.id]: { none: true } })); continue }
      loadClient(c, range)
        .then((r) => alive && setData((p) => ({ ...p, [c.id]: { ...p[c.id], ...r } })))
        .catch((e) => alive && setData((p) => ({ ...p, [c.id]: { ...p[c.id], error: e.message } })))
      ;(c.adAccountId ? Promise.resolve(c.adAccountId) : integP.then((integ) => adminApi(integ, { action: 'config', client: c.salesKey }).then((r) => r.config?.adAccountId)).catch(() => null))
        .then((acc) => loadCampaigns(c, acc))
        .then((camps) => alive && setData((p) => ({ ...p, [c.id]: { ...p[c.id], camps: camps || { unknown: true } } })))
        .catch(() => alive && setData((p) => ({ ...p, [c.id]: { ...p[c.id], camps: { unknown: true } } })))
    }
    return () => { alive = false }
  }, [rk, clients.map((c) => c.id + c.salesUrl).join()]) // eslint-disable-line

  const loaded = clients.map((c) => data[c.id]?.sum).filter(Boolean)
  const T = loaded.reduce((a, s) => ({ spend: a.spend + (s.total.spend || 0), leads: a.leads + s.total.leads, sales: a.sales + s.total.sales, revenue: a.revenue + s.total.revenue }), { spend: 0, leads: 0, sales: 0, revenue: 0 })

  return (
    <div>
      <div className="page-h">
        <div><h1>Panorama de clientes</h1><p className="muted">Todas las cuentas de un vistazo. Tocá un cliente para ver su detalle.</p></div>
        <div className="seg">{RANGES.map(([k, l]) => <button key={k} className={rk === k ? 'on' : ''} onClick={() => setRk(k)}>{l}</button>)}</div>
      </div>

      <div className="kpis mb">
        <div className="kpi"><span>Inversión total</span><b>{fmtMoney(T.spend)}</b></div>
        <div className="kpi"><span>Leads</span><b>{T.leads}</b></div>
        <div className="kpi"><span>Costo por lead</span><b>{T.leads ? fmtMoney(T.spend / T.leads) : '—'}</b></div>
        <div className="kpi"><span>Ventas</span><b>{T.sales}</b></div>
        <div className="kpi"><span>Facturación</span><b>{fmtMoney(T.revenue)}</b></div>
        <div className="kpi"><span>ROAS</span><b className={T.spend ? (T.revenue / T.spend >= 1 ? 'pos' : 'neg') : ''}>{T.spend ? roasTxt(T.revenue / T.spend) : '—'}</b></div>
      </div>
      {loaded.length < clients.filter((c) => c.salesUrl).length && <p className="muted sm mb">Cargando {clients.filter((c) => c.salesUrl).length - loaded.length} clientes…</p>}

      {clients.length ? (
        <div className="card flush ov-wrap">
          <table className="ov">
            <thead><tr><th>Cliente</th><th className="l">Campañas</th><th>Inversión</th><th>Leads</th><th>CPL</th><th>Ventas</th><th>Facturación</th><th>ROAS</th><th>Días a venta</th><th>Tendencia CPL</th></tr></thead>
            <tbody>
              {sorted.map((c) => {
                const d = data[c.id] || {}
                const t = d.sum?.total
                const camps = d.camps
                const warn = camps?.active && t && (t.spend || 0) > 0 && t.leads === 0
                return (
                  <tr key={c.id} onClick={() => go(`#/sales?client=${c.id}`)}>
                    <td><div className="cli"><span className="logo-c xs2">{c.name[0]}</span><b>{c.name}</b></div></td>
                    <td className="l">
                      {d.none ? <span className="pill off">Sin conectar</span>
                        : !camps ? <span className="muted sm">…</span>
                          : camps.unknown ? <span className="muted sm">—</span>
                          : warn ? <span className="pill warn"><i />{camps.active} activa{camps.active > 1 ? 's' : ''} · sin leads</span>
                            : camps.active ? <span className="pill on"><i />{camps.active} activa{camps.active > 1 ? 's' : ''}</span>
                              : <span className="pill off"><i />Pausadas</span>}
                    </td>
                    {d.error ? <td colSpan="8" className="neg sm">{d.error}</td>
                      : !t ? <td colSpan="8" className="muted sm">{d.none ? 'Conectá su planilla en Editar cliente' : 'Cargando…'}</td>
                        : <>
                          <td>{t.spend ? fmtMoney(t.spend) : '—'}</td>
                          <td>{t.leads || '—'}</td>
                          <td>{t.cpl != null ? fmtMoney(t.cpl) : '—'}</td>
                          <td>{t.sales || '—'}</td>
                          <td>{t.revenue ? fmtMoney(t.revenue) : '—'}</td>
                          <td className={t.roas == null ? '' : t.roas >= 1 ? 'pos' : 'neg'}>{roasTxt(t.roas)}</td>
                          <td>{daysTxt(t.avgDays)}</td>
                          <td><Trend days={d.days || []} /></td>
                        </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="card"><Empty title="Todavía no hay clientes" /></div>}
      <p className="muted sm mt-s">Tendencia: compara el costo por lead de los primeros días con el de los últimos. <span className="pos">▼ Baja = mejora</span> · <span className="neg">▲ Sube = empeora</span>.</p>
    </div>
  )
}
