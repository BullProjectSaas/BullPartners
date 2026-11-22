import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtMoney } from '../store.jsx'

const compact = (n) => {
  const a = Math.abs(n)
  if (a >= 1e6) return '$' + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M'
  if (a >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-AR') + 'k'
  return '$' + Math.round(n)
}
const parse = (d) => new Date(d + 'T12:00:00')
const iso = (d) => d.toISOString().slice(0, 10)

/* Agrupa la serie diaria: por día (≤ 45 días), por semana (≤ 200) o por mes. */
function buckets(daily, since, until) {
  const days = Math.round((parse(until) - parse(since)) / 86400000) + 1
  const unit = days <= 45 ? 'day' : days <= 200 ? 'week' : 'month'
  const map = new Map()
  const keyOf = (d) => {
    if (unit === 'day') return d
    const x = parse(d)
    if (unit === 'month') return d.slice(0, 7)
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // lunes
    return iso(x)
  }
  // todos los periodos del rango, aunque no tengan datos
  for (let x = parse(since); x <= parse(until); x.setDate(x.getDate() + 1)) {
    const k = keyOf(iso(x))
    if (!map.has(k)) map.set(k, { key: k, spend: 0, revenue: 0, sales: 0, leads: 0, from: iso(x), to: iso(x) })
    map.get(k).to = iso(x)
  }
  for (const d of daily || []) {
    const b = map.get(keyOf(d.date))
    if (b) { b.spend += d.spend || 0; b.revenue += d.revenue || 0; b.sales += d.sales || 0; b.leads += d.leads || 0 }
  }
  return { unit, list: [...map.values()] }
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const label = (b, unit, long) => cap(rawLabel(b, unit, long))
const rawLabel = (b, unit, long) => {
  const f = parse(b.from)
  if (unit === 'month') return f.toLocaleDateString('es-AR', { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined })
  if (unit === 'week') return long ? `Semana del ${f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} al ${parse(b.to).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  return long ? f.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : String(f.getDate())
}

export default function SalesChart({ daily, since, until, hasSpend }) {
  const wrap = useRef(null)
  const [w, setW] = useState(700)
  const [hover, setHover] = useState(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const { unit, list } = useMemo(() => buckets(daily, since, until), [daily, since, until])
  const series = hasSpend ? [['spend', 'Inversión', 'var(--s-spend)'], ['revenue', 'Facturación', 'var(--s-rev)']] : [['revenue', 'Facturación', 'var(--s-rev)']]

  const H = 220, padL = 46, padR = 8, padT = 10, padB = 24
  const max = Math.max(1, ...list.flatMap((b) => series.map(([k]) => b[k])))
  const step = niceStep(max / 4)
  const top = Math.ceil(max / step) * step
  const iw = Math.max(10, w - padL - padR), ih = H - padT - padB
  const slot = iw / list.length
  const barW = Math.max(1.5, Math.min(18, (slot - 4) / series.length - 2))
  const y = (v) => padT + ih - (v / top) * ih
  const every = Math.ceil(list.length / Math.max(1, Math.floor(iw / 34)))
  const hb = hover != null ? list[hover] : null

  return (
    <div className="chart" ref={wrap}>
      <div className="chart-legend">
        {series.map(([k, name, color]) => <span key={k}><i style={{ background: color }} />{name}</span>)}
        <span className="muted sm">{unit === 'day' ? 'por día' : unit === 'week' ? 'por semana' : 'por mes'}</span>
      </div>
      <div className="chart-box" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label="Inversión y facturación en el tiempo">
          {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className="grid" />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="axis">{compact(v)}</text>
            </g>
          ))}
          {list.map((b, i) => {
            const x0 = padL + i * slot + (slot - series.length * (barW + 2) + 2) / 2
            return (
              <g key={b.key}>
                {hover === i && <rect x={padL + i * slot} y={padT} width={slot} height={ih} className="hover-band" />}
                {series.map(([k, , color], j) => {
                  const v = b[k]
                  if (!v) return null
                  const h = Math.max(2, padT + ih - y(v))
                  const r = Math.min(4, barW / 2, h)
                  const x = x0 + j * (barW + 2)
                  return <path key={k} fill={color} d={`M${x},${padT + ih} V${padT + ih - h + r} Q${x},${padT + ih - h} ${x + r},${padT + ih - h} H${x + barW - r} Q${x + barW},${padT + ih - h} ${x + barW},${padT + ih - h + r} V${padT + ih} Z`} />
                })}
                {i % every === 0 && <text x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="axis">{label(b, unit)}</text>}
                <rect x={padL + i * slot} y={0} width={slot} height={H} fill="transparent"
                  onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />
              </g>
            )
          })}
          <line x1={padL} x2={w - padR} y1={padT + ih} y2={padT + ih} className="baseline" />
        </svg>
        {hb && (
          <div className="tip" style={{ left: Math.min(Math.max(padL + hover * slot + slot / 2, 90), w - 90) }}>
            <b>{label(hb, unit, true)}</b>
            {hasSpend && <div><i style={{ background: 'var(--s-spend)' }} />Inversión <span>{fmtMoney(hb.spend)}</span></div>}
            <div><i style={{ background: 'var(--s-rev)' }} />Facturación <span>{fmtMoney(hb.revenue)}</span></div>
            <div className="muted">{hb.leads} leads · {hb.sales} ventas{hasSpend && hb.spend ? ` · ROAS ${(hb.revenue / hb.spend).toFixed(1).replace('.', ',')}x` : ''}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}
