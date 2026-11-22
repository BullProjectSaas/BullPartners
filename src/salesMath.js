/* Cálculos de Ventas hechos en la app (el script solo entrega datos crudos). */
const key = (v) => String(v || '').trim().toLowerCase()

export function computeSummary(rows, spend, since, until) {
  const inR = (d) => { d = String(d || '').slice(0, 10); return d >= since && d <= until }
  const camps = {}, ads = {}, daily = {}, leads = []
  const total = blank({})
  const day = (d, campaign) => {
    const k = d + '|' + key(campaign)
    return daily[k] || (daily[k] = { date: d, campaign: campaign || '', spend: 0, revenue: 0, sales: 0, leads: 0 })
  }
  for (const l of rows || []) {
    const saleDay = String(l.soldDate || l.date || '').slice(0, 10)
    const leadIn = inR(l.date), saleIn = l.sold && inR(saleDay)
    if (!leadIn && !saleIn) continue
    const ck = key(l.campaign), ak = ck + '|' + key(l.ad)
    const cmp = camps[ck] || (camps[ck] = blank({ campaign: l.campaign }))
    const ad = ads[ak] || (ads[ak] = blank({ ad: l.ad, campaign: l.campaign, adset: l.adset }))
    for (const o of [cmp, ad, total]) {
      if (leadIn) o.leads++
      if (saleIn) {
        o.sales++; o.revenue += Number(l.amount) || 0
        if (l.soldDate && l.date) { o._days += (new Date(l.soldDate) - new Date(l.date)) / 86400000; o._dn++ }
      }
    }
    if (leadIn) { day(l.date.slice(0, 10), l.campaign).leads++; leads.push(l) }
    if (saleIn) { const d = day(saleDay, l.campaign); d.sales++; d.revenue += Number(l.amount) || 0 }
  }
  const hasSpend = !!spend?.hasSpend
  if (hasSpend) {
    total.spend = 0
    for (const m of spend.rows || []) {
      const ck = key(m.campaign_name), ak = ck + '|' + key(m.ad_name), v = Number(m.spend) || 0
      const cmp = camps[ck] || (camps[ck] = blank({ campaign: m.campaign_name }))
      const ad = ads[ak] || (ads[ak] = blank({ ad: m.ad_name, campaign: m.campaign_name, adset: m.adset_name }))
      for (const o of [cmp, ad, total]) o.spend = (o.spend || 0) + v
    }
    for (const d of spend.daily || []) day(d.date_start, d.campaign_name).spend += Number(d.spend) || 0
  }
  const order = (a, b) => (b.revenue - a.revenue) || ((b.spend || 0) - (a.spend || 0)) || (b.leads - a.leads)
  return {
    total: finish(total),
    campaigns: Object.values(camps).map(finish).sort(order),
    ads: Object.values(ads).map(finish).sort(order),
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    leads: leads.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    hasSpend,
    metaError: spend?.error || null,
  }
}

function blank(o) { return Object.assign(o, { leads: 0, sales: 0, revenue: 0, spend: null, _days: 0, _dn: 0 }) }
function finish(o) {
  o.closeRate = o.leads ? o.sales / o.leads : null
  o.roas = o.spend ? o.revenue / o.spend : null
  o.cpl = o.spend != null && o.leads ? o.spend / o.leads : null
  o.cps = o.spend != null && o.sales ? o.spend / o.sales : null
  o.avgDays = o._dn ? o._days / o._dn : null
  delete o._days; delete o._dn
  return o
}
