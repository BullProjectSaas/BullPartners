import { useCallback, useEffect, useState } from 'react'
import { useStore, monthKey, monthLabel, addMonths, fmtMoney, sheetApi } from '../store.jsx'
import { Card, Stat, Empty, Badge, Modal, fmtDate, useRoute } from '../ui.jsx'
import SalesChart from './SalesChart.jsx'
import { computeSummary } from '../salesMath.js'

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
      setMsg(r.meta?.sent ? 'Venta registrada y enviada a Meta ✓' : r.meta?.skipped ? 'Venta actualizada.' : staff ? 'Venta registrada en la planilla. Meta rechazó el envío: ' + (r.meta?.error || 'sin detalle') : 'Venta registrada ✓')
    } catch (err) { alert(err.message) }
    setBusy(false)
  }
  const resend = async () => {
    setBusy(true)
    try {
      const r = await sheetApi(client, { action: 'capi', ref: lead.ref })
      setMsg(r.meta?.sent ? 'Compra enviada a Meta ✓' : 'Meta rechazó el envío: ' + (r.meta?.error || 'sin detalle'))
    } catch (err) { setMsg('Error: ' + err.message) }
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
          <span className="row gap">
            {staff && <button className="link" disabled={busy} onClick={resend}>Enviar a Meta</button>}
            <button className="link" disabled={busy} onClick={undo}>Deshacer</button>
          </span>
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
  const { view, user, actions } = useStore()
  const { query } = useRoute()
  const staff = user.role !== 'client'
  const [cid, setCid] = useState(() => (staff ? query.get('client') || (view.clients.find((c) => c.salesUrl) || view.clients[0])?.id : user.clientId))
  const client = view.clients.find((c) => c.id === cid)
  const [ref, setRef] = useState(query.get('ref') || '')
  const [lead, setLead] = useState(null)
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [range, setRange] = useState(() => presetRange('month'))
  const [sum, setSum] = useState(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('campaigns')
  const [camp, setCamp] = useState(null)

  const loadSummary = useCallback(async () => {
    if (!client?.salesUrl) return
    setSum(null); setErr('')
    try {
      const q = { since: range.since, until: range.until }
      const [rows, spend] = await Promise.all([sheetApi(client, { action: 'rows', ...q }), sheetApi(client, { action: 'spend', ...q }).catch((e) => ({ hasSpend: false, error: e.message }))])
      setSum(computeSummary(rows.rows, spend, range.since, range.until))
    } catch (e) { setErr(e.message) }
  }, [client?.salesUrl, client?.salesKey, range.since, range.until]) // eslint-disable-line
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
  useEffect(() => { if (query.get('ref') && client?.salesUrl) { setRef(query.get('ref')); search(query.get('ref')); setSellOpen(true) } }, [query.get('ref'), client?.salesUrl]) // eslint-disable-line

  const onLeadChange = (l) => { setLead(l); loadSummary() }

  if (!client) return <Empty title="No hay clientes" />
  const notConnected = !client.salesUrl

  let list = sum?.leads || []
  if (filter === 'sold') list = list.filter((l) => l.sold)
  if (filter === 'open') list = list.filter((l) => !l.sold)
  const excluded = new Set(client?.excludedCampaigns || [])
  const isOn = (name) => !excluded.has(name || '')
  const t = sum && (excluded.size ? recalcTotal(sum, isOn) : sum.total)
  const shownCampaigns = (sum?.campaigns || []).filter((r) => staff || isOn(r.campaign))
  const toggleCamp = (name) => {
    const next = new Set(excluded)
    next.has(name || '') ? next.delete(name || '') : next.add(name || '')
    actions.setExcludedCampaigns(client.id, [...next])
  }

  return (
    <div>
      <div className="page-h">
        <div><h1>Ventas</h1><p className="muted">{staff ? 'Ventas registradas por los clientes y resultados por anuncio, leídos de su planilla de leads.' : 'Registrá tus ventas con el código de referencia del lead.'}</p></div>
        <div className="row gap-s wrap">
        {!notConnected && <button className="btn primary big" onClick={() => setSellOpen(true)}>💰 Registrar venta</button>}
        {staff && <select value={cid} onChange={(e) => { setCid(e.target.value); setLead(null); setRef('') }}>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.salesUrl ? '' : ' (sin planilla)'}</option>)}</select>}
        </div>
      </div>

      {notConnected ? (
        <Card><Empty icon="🔗" title="La planilla de leads no está conectada" text={staff ? 'Entrá al cliente → Editar cliente → "Planilla de leads" y pegá la URL de la aplicación web.' : 'Pronto vas a poder registrar tus ventas acá.'} /></Card>
      ) : <>
        {sellOpen && <Modal title="Registrar venta" wide onClose={() => { setSellOpen(false); setLead(null); setRef(''); setNotFound(false) }}>
          <p className="muted sm mb">Pegá el código de referencia que te llegó con el lead.</p>
          <form className="ref-input" onSubmit={(e) => { e.preventDefault(); search() }}>
            <span>🔎</span>
            <input autoFocus placeholder="Pegá el código de referencia (ej.: MF-3VM8G)" value={ref} onChange={(e) => { setRef(e.target.value); setNotFound(false) }} />
            <button className="btn primary" disabled={searching || !ref.trim()}>{searching ? 'Buscando…' : 'Buscar'}</button>
          </form>
          {notFound && <p className="muted sm mt-s">No encontramos un lead con ese código. Revisá que esté bien copiado.</p>}
          {lead && <LeadCard lead={lead} client={client} onChange={onLeadChange} />}
        </Modal>}

        <div className="range-bar">
          <select value={range.preset} onChange={(e) => setRange(e.target.value === 'custom' ? { ...range, preset: 'custom' } : presetRange(e.target.value))}>
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {range.preset === 'custom' ? <>
            <input type="date" value={range.since} max={range.until} onChange={(e) => e.target.value && setRange({ ...range, since: e.target.value })} />
            <span className="muted sm">a</span>
            <input type="date" value={range.until} min={range.since} onChange={(e) => e.target.value && setRange({ ...range, until: e.target.value })} />
          </> : <span className="muted sm">{fmtRange(range)}</span>}
        </div>
        {err && <div className="callout warn mb">{err}</div>}
        {staff && sum?.metaError && <div className="callout warn mb">{sum.metaError}</div>}
        <div className="stats4 card mb">
          {sum?.hasSpend && <Stat label="Inversión" value={fmtMoney(t.spend)} />}
          <Stat label="Leads" value={t ? t.leads : '…'} sub={sum?.hasSpend && t.cpl != null ? `${fmtMoney(t.cpl)} por lead` : null} />
          <Stat label="Ventas" value={t ? t.sales : '…'} color="#16A34A" sub={sum?.hasSpend && t.cps != null ? `${fmtMoney(t.cps)} por venta` : null} />
          <Stat label="Facturación" value={t ? fmtMoney(t.revenue) : '…'} />
          {sum?.hasSpend && <Stat label="ROAS" value={fmtRoas(t.roas)} color={t.roas >= 1 ? '#16A34A' : t.roas != null ? '#DC2626' : undefined} />}
          <Stat label="Tasa de cierre" value={t ? fmtPct(t.closeRate ?? (t.leads ? t.sales / t.leads : null)) : '…'} />
          <Stat label="Tiempo a la venta" value={t ? fmtDays(t.avgDays) : '…'} sub="promedio desde el lead" />
        </div>

        <Card className="mb" title="Inversión y facturación">
          {!sum ? <p className="muted sm">Cargando…</p> : <SalesChart daily={(sum.daily || []).filter((d) => isOn(d.campaign))} since={range.since} until={range.until} hasSpend={sum.hasSpend} />}
        </Card>

        <Card className="mb" title={<div className="tabs inline">
          <button className={tab === 'campaigns' ? 'on' : ''} onClick={() => { setTab('campaigns'); setCamp(null) }}>Por campaña</button>
          <button className={tab === 'ads' ? 'on' : ''} onClick={() => setTab('ads')}>Por anuncio</button>
        </div>} action={tab === 'ads' && camp != null && <button className="chip" onClick={() => setCamp(null)}>{camp || 'Sin campaña'} ✕</button>}>
          {!sum ? <p className="muted sm">Cargando…</p> : tab === 'campaigns' ? (
            shownCampaigns.length ? (
              <div className={'rtable' + (staff ? ' with-check' : '')}>
                {staff && <p className="muted sm mb">Destildá las campañas que no querés que cuenten en las métricas (el cliente no las ve).</p>}
                <div className="rt-h">{staff && <span title="Cuenta en las métricas">✓</span>}<span>Campaña</span>{sum.hasSpend && <span>Inversión</span>}<span>Leads</span><span>Ventas</span><span>Cierre</span><span>Facturación</span>{sum.hasSpend && <span>ROAS</span>}<span>Días a venta</span></div>
                {shownCampaigns.map((r) => (
                  <div key={r.campaign} className={'rt-r click' + (isOn(r.campaign) ? '' : ' off')} onClick={() => { setCamp(r.campaign || ''); setTab('ads') }} title="Ver anuncios de esta campaña">
                    {staff && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isOn(r.campaign)} onChange={() => toggleCamp(r.campaign)} title="Cuenta en las métricas" /></span>}
                    <span className="ellipsis"><b>{r.campaign || 'Sin campaña (orgánico o directo)'}</b></span>
                    {sum.hasSpend && <span>{r.spend != null ? fmtMoney(r.spend) : '—'}</span>}
                    <span>{r.leads}</span><span>{r.sales}</span><span>{fmtPct(r.closeRate)}</span><span>{fmtMoney(r.revenue)}</span>
                    {sum.hasSpend && <span className={r.roas >= 1 ? 'pos' : r.roas != null ? 'neg' : ''}>{fmtRoas(r.roas)}</span>}
                    <span>{fmtDays(r.avgDays)} <span className="muted">›</span></span>
                  </div>
                ))}
              </div>
            ) : <p className="muted sm">Sin datos este mes.</p>
          ) : (
            <div className="rtable">
              <div className="rt-h"><span>Anuncio</span>{sum.hasSpend && <span>Inversión</span>}<span>Leads</span><span>Ventas</span><span>Cierre</span><span>Facturación</span>{sum.hasSpend && <span>ROAS</span>}<span>Días a venta</span></div>
              {(sum.ads || []).filter((r) => (camp == null ? isOn(r.campaign) : (r.campaign || '') === camp) && (staff || isOn(r.campaign))).map((r) => (
                <div key={(r.campaign || '') + '|' + (r.ad || '')} className="rt-r">
                  <span className="ellipsis" title={r.ad}><b>{r.ad || 'Sin anuncio'}</b>{camp == null && <small className="muted block ellipsis">{r.campaign}</small>}</span>
                  {sum.hasSpend && <span>{r.spend != null ? fmtMoney(r.spend) : '—'}</span>}
                  <span>{r.leads}</span><span>{r.sales}</span><span>{fmtPct(r.closeRate)}</span><span>{fmtMoney(r.revenue)}</span>
                  {sum.hasSpend && <span className={r.roas >= 1 ? 'pos' : r.roas != null ? 'neg' : ''}>{fmtRoas(r.roas)}</span>}
                  <span>{fmtDays(r.avgDays)}</span>
                </div>
              ))}
            </div>
          )}
          {sum && !sum.hasSpend && staff && <p className="muted sm mt-s">Para ver inversión, ROAS y costo por venta, completá la cuenta publicitaria y el token de Ads en el script de la planilla.</p>}
        </Card>

        <div>
          <Card title="Leads del período" action={<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="open">Sin vender</option><option value="sold">Vendidos</option></select>}>
            <div className="lead-list">
              {list.map((l) => (
                <div key={l.ref} className="trow" onClick={() => { setRef(l.ref); search(l.ref); setSellOpen(true) }}>
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

const fmtPct = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const fmtRoas = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ',') + 'x')
const fmtDays = (v) => (v == null ? '—' : v < 1 ? 'mismo día' : Math.round(v) + (Math.round(v) === 1 ? ' día' : ' días'))

function recalcTotal(sum, isOn) {
  const t = { leads: 0, sales: 0, revenue: 0, spend: sum.hasSpend ? 0 : null }
  let days = 0, dn = 0
  for (const c of sum.campaigns.filter((c) => isOn(c.campaign))) {
    t.leads += c.leads; t.sales += c.sales; t.revenue += c.revenue
    if (sum.hasSpend) t.spend += c.spend || 0
    if (c.avgDays != null) { days += c.avgDays * c.sales; dn += c.sales }
  }
  t.closeRate = t.leads ? t.sales / t.leads : null
  t.roas = t.spend ? t.revenue / t.spend : null
  t.cpl = t.spend != null && t.leads ? t.spend / t.leads : null
  t.cps = t.spend != null && t.sales ? t.spend / t.sales : null
  t.avgDays = dn ? days / dn : null
  return t
}

const PRESETS = [['month', 'Este mes'], ['lastMonth', 'Mes pasado'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['year', 'Este año'], ['custom', 'Personalizado']]
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function presetRange(k) {
  const t = new Date()
  let a = new Date(t), b = new Date(t)
  if (k === 'month') a = new Date(t.getFullYear(), t.getMonth(), 1)
  else if (k === 'lastMonth') { a = new Date(t.getFullYear(), t.getMonth() - 1, 1); b = new Date(t.getFullYear(), t.getMonth(), 0) }
  else if (k === 'year') a = new Date(t.getFullYear(), 0, 1)
  else a.setDate(t.getDate() - Number(k) + 1)
  return { preset: k, since: ymd(a), until: ymd(b) }
}
function fmtRange(r) {
  const f = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f(r.since)} – ${f(r.until)}`
}
