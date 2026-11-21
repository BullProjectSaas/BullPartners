import { useCallback, useEffect, useState } from 'react'
import { useStore, monthKey, monthLabel, addMonths, fmtMoney, sheetApi } from '../store.jsx'
import { Card, Stat, Empty, Badge, fmtDate, useRoute } from '../ui.jsx'

function LeadCard({ lead, client, onChange }) {
  const { actions, user } = useStore()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setAmount(''); setMsg('') }, [lead.ref])
  const staff = user.role !== 'client'
  const extra = Object.entries(lead.data || {})

  const sell = async (e) => {
    e.preventDefault()
    if (!(Number(amount) > 0)) return alert('Poné el monto de la venta.')
    setBusy(true)
    try {
      const r = await sheetApi(client, { action: 'sell', ref: lead.ref, amount })
      onChange(r.lead)
      actions.notifySale(client.id, r.lead)
      setMsg(r.meta?.sent ? 'Venta registrada y enviada a Meta ✓' : r.meta?.skipped ? 'Venta actualizada.' : `Venta registrada en la planilla. ${staff ? 'Meta no la recibió: ' + (r.meta?.error || '') : ''}`)
    } catch (err) { alert(err.message) }
    setBusy(false)
  }
  const undo = async () => {
    if (!confirm('¿Deshacer esta venta? (La compra ya enviada a Meta no se puede borrar)')) return
    setBusy(true)
    try { const r = await sheetApi(client, { action: 'unsell', ref: lead.ref }); onChange(r.lead); setMsg('') } catch (err) { alert(err.message) }
    setBusy(false)
  }

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
          <span>{msg || `Venta registrada por ${fmtMoney(lead.amount)}.`}</span>
          <button className="link" disabled={busy} onClick={undo}>Deshacer</button>
        </div>
      ) : (
        <form className="sell-form" onSubmit={sell}>
          <label className="field grow"><span>Monto de la venta</span><input type="number" min="0" step="any" inputMode="decimal" placeholder="Ej.: 150000" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button className="btn success big" disabled={busy}>{busy ? 'Guardando…' : '✓ Marcar como vendido'}</button>
        </form>
      )}
    </div>
  )
}

export default function SalesPage() {
  const { view, user } = useStore()
  const { query } = useRoute()
  const staff = user.role !== 'client'
  const [cid, setCid] = useState(() => (staff ? (view.clients.find((c) => c.salesUrl) || view.clients[0])?.id : user.clientId))
  const client = view.clients.find((c) => c.id === cid)
  const [ref, setRef] = useState(query.get('ref') || '')
  const [lead, setLead] = useState(null)
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [mk, setMk] = useState(monthKey())
  const [sum, setSum] = useState(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')

  const loadSummary = useCallback(async () => {
    if (!client?.salesUrl) return
    setSum(null); setErr('')
    try { setSum(await sheetApi(client, { action: 'summary', month: mk })) } catch (e) { setErr(e.message) }
  }, [client?.salesUrl, client?.salesKey, mk]) // eslint-disable-line
  useEffect(() => { loadSummary() }, [loadSummary])

  const search = async (code = ref) => {
    if (!code.trim()) return
    setSearching(true); setNotFound(false); setLead(null)
    try {
      const r = await sheetApi(client, { action: 'find', ref: code.trim() })
      if (r.lead) setLead(r.lead); else setNotFound(true)
    } catch (e) { alert(e.message) }
    setSearching(false)
  }
  useEffect(() => { if (query.get('ref') && client?.salesUrl) { setRef(query.get('ref')); search(query.get('ref')) } }, [query.get('ref'), client?.salesUrl]) // eslint-disable-line

  const onLeadChange = (l) => { setLead(l); loadSummary() }

  if (!client) return <Empty title="No hay clientes" />
  const notConnected = !client.salesUrl

  let list = sum?.leads || []
  if (filter === 'sold') list = list.filter((l) => l.sold)
  if (filter === 'open') list = list.filter((l) => !l.sold)
  const t = sum?.total

  return (
    <div>
      <div className="page-h">
        <div><h1>Ventas</h1><p className="muted">{staff ? 'Ventas registradas por los clientes y resultados por anuncio, leídos de su planilla de leads.' : 'Registrá tus ventas con el código de referencia del lead.'}</p></div>
        {staff && <select value={cid} onChange={(e) => { setCid(e.target.value); setLead(null); setRef('') }}>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.salesUrl ? '' : ' (sin planilla)'}</option>)}</select>}
      </div>

      {notConnected ? (
        <Card><Empty icon="🔗" title="La planilla de leads no está conectada" text={staff ? 'Entrá al cliente → Editar cliente → "Planilla de leads" y pegá la URL de la aplicación web.' : 'Pronto vas a poder registrar tus ventas acá.'} /></Card>
      ) : <>
        <Card title="Registrar una venta" className="mb">
          <form className="ref-input" onSubmit={(e) => { e.preventDefault(); search() }}>
            <span>🔎</span>
            <input placeholder="Pegá el código de referencia (ej.: MF-3VM8G)" value={ref} onChange={(e) => { setRef(e.target.value); setNotFound(false) }} />
            <button className="btn primary" disabled={searching || !ref.trim()}>{searching ? 'Buscando…' : 'Buscar'}</button>
          </form>
          {notFound && <p className="muted sm mt-s">No encontramos un lead con ese código. Revisá que esté bien copiado.</p>}
          {lead && <LeadCard lead={lead} client={client} onChange={onLeadChange} />}
        </Card>

        <div className="row gap-s mb"><button className="icon-btn" onClick={() => setMk(addMonths(mk, -1))}>‹</button><b>{monthLabel(mk)}</b><button className="icon-btn" onClick={() => setMk(addMonths(mk, 1))}>›</button></div>
        {err && <div className="callout warn mb">{err}</div>}
        <div className="stats4 card mb">
          <Stat label="Leads" value={t ? t.leads : '…'} />
          <Stat label="Ventas" value={t ? t.sales : '…'} color="#16A34A" />
          <Stat label="Facturación" value={t ? fmtMoney(t.revenue) : '…'} />
          <Stat label="Tasa de cierre" value={t ? (t.leads ? Math.round((t.sales / t.leads) * 100) + '%' : '—') : '…'} />
        </div>

        <div className="grid2">
          <Card title="Resultados por anuncio">
            {!sum ? <p className="muted sm">Cargando…</p> : sum.byAd.length ? (
              <div className="table ads">
                <div className="tr th"><span>Anuncio</span><span>Leads</span><span>Ventas</span><span>Facturación</span></div>
                {sum.byAd.map((r) => <div key={r.ad} className="tr static"><span className="ellipsis" title={r.ad}>{r.ad || 'Sin anuncio (orgánico o directo)'}</span><span>{r.leads}</span><span>{r.sales}</span><span>{fmtMoney(r.revenue)}</span></div>)}
              </div>
            ) : <p className="muted sm">Sin leads este mes.</p>}
          </Card>
          <Card title="Leads del mes" action={<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="open">Sin vender</option><option value="sold">Vendidos</option></select>}>
            <div className="lead-list">
              {list.map((l) => (
                <div key={l.ref} className="trow" onClick={() => { setRef(l.ref); search(l.ref); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                  <div className="grow trow-main"><span>{l.name || 'Sin nombre'}</span><small className="muted">{l.ref} · {fmtDate(l.date)}{l.ad && ' · ' + l.ad}</small></div>
                  {l.sold ? <Badge color="#16A34A">{fmtMoney(l.amount)}</Badge> : <Badge color="#64748B">Sin vender</Badge>}
                </div>
              ))}
              {sum && !list.length && <p className="muted sm">Sin leads.</p>}
            </div>
          </Card>
        </div>
      </>}
    </div>
  )
}
