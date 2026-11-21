import { useEffect, useMemo, useState } from 'react'
import { useStore, monthKey, monthLabel, addMonths, fmtMoney } from '../store.jsx'
import { Card, Stat, Empty, Badge, fmtDate, useRoute } from '../ui.jsx'

const HIDDEN = /utm|fbclid|fbc|fbp|p[aá]gina|venta|monto|estado|^ref$|^fecha$|^nombre$/i

function LeadCard({ lead }) {
  const { actions, user } = useStore()
  const [amount, setAmount] = useState('')
  useEffect(() => setAmount(''), [lead.id])
  const extra = Object.entries(lead.data || {}).filter(([k, v]) => v && !HIDDEN.test(k))
  return (
    <div className="lead-card">
      <div className="row between wrap gap">
        <div>
          <h2>{lead.name || 'Sin nombre'}</h2>
          <p className="muted sm">Ref <b>{lead.ref}</b> · {fmtDate(lead.date)}{lead.ad && <> · Anuncio: <b>{lead.ad}</b></>}</p>
        </div>
        {lead.sold && <Badge color="#16A34A">✓ Vendido · {fmtMoney(lead.amount)}</Badge>}
      </div>
      {extra.length > 0 && <dl className="lead-data">{extra.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {lead.sold ? (
        <div className="callout ok mt-s row between wrap gap">
          <span>Venta registrada el {fmtDate(lead.soldAt)} por {fmtMoney(lead.amount)}.{user.role !== 'client' && (lead.capiSent ? ' Enviada a Meta ✓' : ' Pendiente de envío a Meta…')}</span>
          <button className="link" onClick={() => confirm('¿Deshacer esta venta?') && actions.unmarkSold(lead.id)}>Deshacer</button>
        </div>
      ) : (
        <form className="sell-form" onSubmit={(e) => { e.preventDefault(); if (!(Number(amount) > 0)) return alert('Poné el monto de la venta.'); actions.markSold(lead.id, amount) }}>
          <label className="field grow"><span>Monto de la venta</span><input type="number" min="0" step="any" inputMode="decimal" placeholder="Ej.: 150000" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button className="btn success big">✓ Marcar como vendido</button>
        </form>
      )}
    </div>
  )
}

export default function SalesPage() {
  const { view, user } = useStore()
  const { query } = useRoute()
  const staff = user.role !== 'client'
  const [cl, setCl] = useState(staff ? 'all' : user.clientId)
  const [ref, setRef] = useState(query.get('ref') || '')
  const [mk, setMk] = useState(monthKey())
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  useEffect(() => { if (query.get('ref')) setRef(query.get('ref')) }, [query.get('ref')]) // eslint-disable-line

  const leads = view.leads.filter((l) => cl === 'all' || l.clientId === cl)
  const found = ref.trim() && leads.find((l) => l.ref.toLowerCase() === ref.trim().toLowerCase())
  const month = leads.filter((l) => (l.date || '').startsWith(mk))
  const sold = month.filter((l) => l.sold)
  const revenue = sold.reduce((a, l) => a + (Number(l.amount) || 0), 0)

  const byAd = useMemo(() => {
    const m = new Map()
    for (const l of month) {
      const k = l.ad || 'Sin anuncio (orgánico o directo)'
      const r = m.get(k) || { ad: k, leads: 0, sales: 0, revenue: 0 }
      r.leads++
      if (l.sold) { r.sales++; r.revenue += Number(l.amount) || 0 }
      m.set(k, r)
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)
  }, [month])

  let list = month
  if (filter === 'sold') list = list.filter((l) => l.sold)
  if (filter === 'open') list = list.filter((l) => !l.sold)
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    list = leads.filter((l) => [l.ref, l.name, l.ad, ...Object.values(l.data || {})].some((v) => String(v || '').toLowerCase().includes(q)))
  }
  list = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const cname = (id) => view.clients.find((c) => c.id === id)?.name

  return (
    <div>
      <div className="page-h">
        <div><h1>Ventas</h1><p className="muted">{staff ? 'Leads de las landings, ventas registradas y resultados por anuncio.' : 'Registrá tus ventas con el código de referencia del lead.'}</p></div>
        {staff && <select value={cl} onChange={(e) => setCl(e.target.value)}><option value="all">Todos los clientes</option>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      </div>

      <Card title="Registrar una venta" className="mb">
        <div className="ref-input">
          <span>🔎</span>
          <input placeholder="Pegá el código de referencia (ej.: MF-3VM8G)" value={ref} onChange={(e) => setRef(e.target.value)} />
          {ref && <button className="icon-btn" onClick={() => setRef('')}>✕</button>}
        </div>
        {ref.trim() && !found && <p className="muted sm mt-s">No encontramos un lead con ese código. Revisá que esté bien copiado (los leads nuevos tardan unos minutos en aparecer).</p>}
        {found && <LeadCard lead={found} />}
      </Card>

      <div className="row between wrap gap mb">
        <div className="row gap-s"><button className="icon-btn" onClick={() => setMk(addMonths(mk, -1))}>‹</button><b>{monthLabel(mk)}</b><button className="icon-btn" onClick={() => setMk(addMonths(mk, 1))}>›</button></div>
      </div>
      <div className="stats4 card mb">
        <Stat label="Leads" value={month.length} />
        <Stat label="Ventas" value={sold.length} color="#16A34A" />
        <Stat label="Facturación" value={fmtMoney(revenue)} />
        <Stat label="Tasa de cierre" value={month.length ? Math.round((sold.length / month.length) * 100) + '%' : '—'} />
      </div>

      <div className="grid2">
        <Card title="Resultados por anuncio">
          {byAd.length ? (
            <div className="table ads">
              <div className="tr th"><span>Anuncio</span><span>Leads</span><span>Ventas</span><span>Facturación</span></div>
              {byAd.map((r) => <div key={r.ad} className="tr static"><span className="ellipsis" title={r.ad}>{r.ad}</span><span>{r.leads}</span><span>{r.sales}</span><span>{fmtMoney(r.revenue)}</span></div>)}
            </div>
          ) : <p className="muted sm">Sin leads este mes.</p>}
        </Card>
        <Card title="Leads" action={<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="open">Sin vender</option><option value="sold">Vendidos</option></select>}>
          <input className="mb" placeholder="Buscar por nombre, ref o anuncio…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="lead-list">
            {list.slice(0, 100).map((l) => (
              <div key={l.id} className="trow" onClick={() => { setRef(l.ref); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                <div className="grow trow-main"><span>{l.name || 'Sin nombre'}</span><small className="muted">{l.ref} · {fmtDate(l.date)}{staff && cl === 'all' && ' · ' + cname(l.clientId)}</small></div>
                {l.sold ? <Badge color="#16A34A">{fmtMoney(l.amount)}</Badge> : <Badge color="#64748B">Sin vender</Badge>}
              </div>
            ))}
            {!list.length && <Empty icon="💰" title="No hay leads" text={staff ? 'Conectá la planilla de leads del cliente (ver instrucciones en la ficha del cliente).' : 'Cuando lleguen leads de tus anuncios van a aparecer acá.'} />}
          </div>
        </Card>
      </div>
    </div>
  )
}
