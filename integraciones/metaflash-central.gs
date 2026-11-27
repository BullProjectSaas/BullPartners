/**
 * MetaFlash · Script central (todas las planillas y cuentas publicitarias)
 * ------------------------------------------------------------------
 * Un solo script para todos los clientes. La configuración de cada cliente
 * (planilla, píxel, cuenta publicitaria) se carga desde la app MetaFlash.
 *
 * Instalación (una sola vez):
 *  1. script.new → pegar este archivo → completar ADMIN_KEY y ADS_TOKEN → Cmd+S.
 *  2. Implementar → Nueva implementación → Aplicación web →
 *     Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario → Implementar.
 *  3. En MetaFlash → Equipo → "Conexión con Meta y planillas": pegar la URL y la ADMIN_KEY.
 */
var MF_SETTINGS = {
  ADMIN_KEY: 'PEGAR_CLAVE_ADMIN',   // inventala (larga); la misma va en MetaFlash → Equipo
  ADS_TOKEN: 'PEGAR_TOKEN_ADS',     // token del usuario del sistema con ads_read
}

// Se completa en cada pedido con la configuración del cliente.
var MF = { KEY: '', SHEET_ID: '', SHEET_NAME: 'Leads', PIXEL_ID: '', CAPI_TOKEN: '', CURRENCY: 'ARS', AD_ACCOUNT_ID: '', ADS_TOKEN: MF_SETTINGS.ADS_TOKEN }

function doGet(e) {
  var p = (e && e.parameter) || {}
  try {
    var esAdmin = String(MF_SETTINGS.ADMIN_KEY).length >= 8 && !/^PEGAR/.test(MF_SETTINGS.ADMIN_KEY) && p.admin === MF_SETTINGS.ADMIN_KEY
    // --- Acciones de administración (desde MetaFlash, solo el equipo) ---
    if (p.admin != null) {
      if (!esAdmin) return mfOut_({ error: 'Clave de administrador incorrecta.' })
      if (p.action === 'test') return mfOut_(mfProbarToken_())
      if (p.action === 'accounts') return mfOut_(mfCuentas_())
      if (p.action === 'register') return mfOut_(mfRegistrar_(p))
      if (p.action === 'config') return mfOut_({ config: mfConfigPublica_(mfConfig_(p.client)) })
      return mfOut_({ error: 'Acción desconocida' })
    }
    // --- Acciones del cliente (con la clave de su conexión) ---
    var cfg = mfConfig_(p.key)
    if (!cfg) return mfOut_({ error: 'La planilla de este cliente todavía no está conectada.' })
    MF.SHEET_ID = cfg.sheetId; MF.SHEET_NAME = cfg.sheetName || 'Leads'; MF.PIXEL_ID = cfg.pixelId || ''
    MF.CAPI_TOKEN = cfg.capiToken || ''; MF.AD_ACCOUNT_ID = cfg.adAccountId || ''; MF.CURRENCY = cfg.currency || 'ARS'
    if (p.action === 'ping') return mfOut_({ ok: true, sheet: mfHoja_().getName() })
    if (p.action === 'find') return mfOut_(mfBuscar_(p.ref))
    if (p.action === 'sell') return mfOut_(mfVender_(p.ref, p.amount))
    if (p.action === 'unsell') return mfOut_(mfDeshacer_(p.ref))
    if (p.action === 'summary') return mfOut_(mfResumen_(mfRango_(p)))
    // Puente: datos crudos; los cálculos los hace la app (así el script casi no cambia).
    if (p.action === 'rows') return mfOut_(mfFilas_(mfRango_(p)))
    // Lectura general de Meta (solo GET y solo dentro de la cuenta publicitaria de este cliente).
    if (p.action === 'meta') return mfOut_(mfMeta_(p.path))
    if (p.action === 'spend') { var rg = mfRango_(p); var sp = mfInversion_(rg.since, rg.until); return mfOut_({ hasSpend: !!sp.rows, rows: sp.rows || [], daily: sp.daily || [], error: sp.error || null }) }
    if (p.action === 'capi') return mfOut_(mfReenviar_(p.ref))
    return mfOut_({ error: 'Acción desconocida' })
  } catch (err) {
    return mfOut_({ error: String(err && err.message || err) })
  }
}

/* ---------- Configuración por cliente (guardada en las propiedades del script) ---------- */
function mfConfig_(key) {
  if (!key || String(key).length < 8) return null
  var raw = PropertiesService.getScriptProperties().getProperty('client:' + key)
  return raw ? JSON.parse(raw) : null
}
function mfConfigPublica_(c) {
  if (!c) return null
  return { sheetId: c.sheetId, sheetName: c.sheetName, pixelId: c.pixelId, adAccountId: c.adAccountId, currency: c.currency, hasCapiToken: !!c.capiToken, sheetTitle: c.sheetTitle }
}
function mfRegistrar_(p) {
  if (!p.client || String(p.client).length < 8) return { error: 'Falta la clave del cliente.' }
  var prev = mfConfig_(p.client) || {}
  var m = String(p.sheet || '').match(/\/d\/([a-zA-Z0-9-_]+)/)
  var sheetId = m ? m[1] : String(p.sheet || prev.sheetId || '').trim()
  if (!sheetId) return { error: 'Falta el link de la planilla.' }
  var ss
  try { ss = SpreadsheetApp.openById(sheetId) } catch (err) { return { error: 'No puedo abrir esa planilla. ¿Está compartida con la cuenta de Google dueña del script?' } }
  var sheetName = String(p.sheetName || prev.sheetName || 'Leads').trim()
  var sh = ss.getSheetByName(sheetName)
  if (!sh) return { error: 'La planilla no tiene una hoja llamada "' + sheetName + '".' }
  var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
  var c = mfCols_(headers)
  if (c.ref < 0) return { error: 'La hoja "' + sheetName + '" no tiene una columna "Ref".' }
  var cfg = {
    sheetId: sheetId, sheetName: sheetName, sheetTitle: ss.getName(),
    pixelId: String(p.pixel != null ? p.pixel : prev.pixelId || '').trim(),
    capiToken: String(p.capi || '').trim() || prev.capiToken || '',
    adAccountId: String(p.account != null ? p.account : prev.adAccountId || '').replace(/^act_/, '').trim(),
    currency: String(p.currency || prev.currency || 'ARS').trim(),
  }
  PropertiesService.getScriptProperties().setProperty('client:' + p.client, JSON.stringify(cfg))
  return { ok: true, config: mfConfigPublica_(cfg), warnings: [
    c.ad < 0 ? 'No encontré la columna utm_content (anuncio): no se va a poder atribuir por anuncio.' : null,
    c.sold < 0 || c.amount < 0 ? 'Faltan las columnas "Venta" y/o "Monto": agregalas para poder marcar ventas.' : null,
  ].filter(Boolean) }
}

/* ---------- Meta Ads (token del portafolio) ---------- */
function mfAdsGet_(path) {
  var resp = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + path + (path.indexOf('?') < 0 ? '?' : '&') + 'access_token=' + encodeURIComponent(String(MF_SETTINGS.ADS_TOKEN).trim()), { muteHttpExceptions: true })
  var body = JSON.parse(resp.getContentText())
  if (body.error) throw new Error('Meta: ' + (body.error.error_user_msg || body.error.message))
  return body
}
function mfProbarToken_() {
  if (!/^EAA/.test(String(MF_SETTINGS.ADS_TOKEN).trim())) return { error: 'Falta pegar el token de Meta (ADS_TOKEN) en el script.' }
  var me = mfAdsGet_('me?fields=id,name')
  var n = mfCuentas_().accounts.length
  return { ok: true, name: me.name, accounts: n }
}
function mfCuentas_() {
  var out = [], path = 'me/adaccounts?fields=name,account_id,currency,account_status&limit=200'
  while (path) {
    var b = mfAdsGet_(path)
    out = out.concat((b.data || []).map(function (a) { return { id: a.account_id, name: a.name, currency: a.currency, active: a.account_status === 1 } }))
    path = b.paging && b.paging.next ? b.paging.next.replace('https://graph.facebook.com/v21.0/', '').replace(/&access_token=[^&]*/, '') : null
  }
  out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)) })
  return { accounts: out }
}

function mfOut_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON) }

function mfHoja_() {
  var sh = SpreadsheetApp.openById(MF.SHEET_ID).getSheetByName(MF.SHEET_NAME)
  if (!sh) throw new Error('No encuentro la hoja "' + MF.SHEET_NAME + '"')
  return sh
}

function mfCols_(headers) {
  var find = function (re) {
    for (var i = 0; i < headers.length; i++) if (re.test(String(headers[i]).trim())) return i
    return -1
  }
  return {
    ref: find(/^ref/i), date: find(/^fecha$/i), name: find(/^nombre/i),
    campaign: find(/utm_campaign/i), adset: find(/utm_term/i), ad: find(/utm_content/i),
    fbclid: find(/fbclid/i), fbp: find(/^_?fbp$/i), fbc: find(/^_?fbc$/i), page: find(/p[aá]gina|^url/i),
    phone: find(/tel[eé]fono|whats|celular|^tel$/i), email: find(/e-?mail|correo/i), ua: find(/agent/i),
    sold: find(/^venta$/i), amount: find(/^monto/i), soldDate: find(/^fecha\s*(de\s*)?venta/i),
  }
}

function mfFecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm")
  var m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return ''
  var p = function (n) { return ('0' + n).slice(-2) }
  return m[3] + '-' + p(m[2]) + '-' + p(m[1]) + 'T' + p(m[4] || 0) + ':' + p(m[5] || 0)
}

function mfMonto_(v) {
  if (typeof v === 'number') return v
  var s = String(v || '').replace(/[^\d.,-]/g, '')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/[.,]/g, '')
  return Number(s) || 0
}

function mfVendido_(v) { return /^(s[ií]|vendid|true|x|1)/i.test(String(v || '').trim()) }

function mfLeer_() {
  var sh = mfHoja_()
  var values = sh.getDataRange().getValues()
  return { sh: sh, values: values, headers: values[0], c: mfCols_(values[0]) }
}

function mfLead_(t, row) {
  var c = t.c
  var get = function (i) { return i >= 0 && row[i] != null ? String(row[i] instanceof Date ? mfFecha_(row[i]) : row[i]).trim() : '' }
  var data = {}
  t.headers.forEach(function (h, i) {
    var k = String(h).trim()
    if (k && row[i] !== '' && row[i] != null && !/utm|fbclid|fbc|fbp|p[aá]gina|agent|^venta$|^monto|^ref|^fecha|^nombre|^meta$/i.test(k)) data[k] = get(i)
  })
  return {
    ref: get(c.ref), name: get(c.name), date: mfFecha_(c.date >= 0 ? row[c.date] : ''),
    campaign: get(c.campaign), adset: get(c.adset), ad: get(c.ad), data: data,
    sold: c.sold >= 0 && mfVendido_(row[c.sold]), amount: c.amount >= 0 ? mfMonto_(row[c.amount]) : 0,
    soldDate: c.soldDate >= 0 ? mfFecha_(row[c.soldDate]) : '',
  }
}

function mfFila_(t, ref) {
  ref = String(ref || '').trim().toLowerCase()
  if (!ref) return -1
  for (var r = 1; r < t.values.length; r++) if (String(t.values[r][t.c.ref]).trim().toLowerCase() === ref) return r
  return -1
}

function mfBuscar_(ref) {
  var t = mfLeer_()
  var r = mfFila_(t, ref)
  return r < 0 ? { lead: null } : { lead: mfLead_(t, t.values[r]) }
}

function mfVender_(ref, amount) {
  var lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    var t = mfLeer_()
    var r = mfFila_(t, ref)
    if (r < 0) return { error: 'No encontré ese código en la planilla.' }
    var lead = mfLead_(t, t.values[r])
    var value = mfMonto_(amount)
    if (!(value > 0)) return { error: 'El monto no es válido.' }
    if (t.c.sold < 0 || t.c.amount < 0) return { error: 'La planilla necesita las columnas "Venta" y "Monto".' }
    var yaVendido = lead.sold
    t.sh.getRange(r + 1, t.c.sold + 1).setValue('Sí')
    t.sh.getRange(r + 1, t.c.amount + 1).setValue(value)
    if (!yaVendido) {
      var cf = t.c.soldDate >= 0 ? t.c.soldDate : mfColumna_(t, 'Fecha venta')
      lead.soldDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
      t.sh.getRange(r + 1, cf + 1).setValue(lead.soldDate)
      lead.soldDate = mfFecha_(lead.soldDate)
    }
    lead.sold = true; lead.amount = value
    var meta = yaVendido ? { skipped: true } : mfPurchase_(t, t.values[r], lead)
    if (!yaVendido) mfEstadoMeta_(t, r, meta)
    return { lead: lead, meta: meta }
  } finally {
    lock.releaseLock()
  }
}

/* Reenvía la compra a Meta (desde la app, para el equipo) y devuelve el resultado exacto. */
function mfReenviar_(ref) {
  var t = mfLeer_()
  var r = mfFila_(t, ref)
  if (r < 0) return { error: 'No encontré ese código en la planilla.' }
  var lead = mfLead_(t, t.values[r])
  if (!lead.sold) return { error: 'Ese lead no está marcado como vendido.' }
  var meta = mfPurchase_(t, t.values[r], lead)
  mfEstadoMeta_(t, r, meta)
  return { lead: lead, meta: meta }
}

/* Devuelve el índice de una columna; la crea al final si no existe. */
function mfColumna_(t, titulo) {
  for (var i = 0; i < t.headers.length; i++) if (String(t.headers[i]).trim().toLowerCase() === titulo.toLowerCase()) return i
  var col = t.sh.getLastColumn()
  t.sh.getRange(1, col + 1).setValue(titulo).setFontWeight('bold')
  t.headers.push(titulo)
  return col
}

/* Escribe el resultado del envío en la columna "Meta" de la planilla (la crea si no existe). */
function mfEstadoMeta_(t, r, meta) {
  var col = -1
  for (var i = 0; i < t.headers.length; i++) if (String(t.headers[i]).trim() === 'Meta') col = i
  if (col < 0) {
    col = t.sh.getLastColumn()
    t.sh.getRange(1, col + 1).setValue('Meta').setFontWeight('bold')
    t.headers.push('Meta')
  }
  var txt = meta.sent ? '✓ Enviado ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM HH:mm') : '✗ ' + (meta.error || 'Error')
  t.sh.getRange(r + 1, col + 1).setValue(txt)
}

function mfDeshacer_(ref) {
  var t = mfLeer_()
  var r = mfFila_(t, ref)
  if (r < 0) return { error: 'No encontré ese código en la planilla.' }
  if (t.c.sold >= 0) t.sh.getRange(r + 1, t.c.sold + 1).setValue('')
  if (t.c.amount >= 0) t.sh.getRange(r + 1, t.c.amount + 1).setValue('')
  if (t.c.soldDate >= 0) { t.sh.getRange(r + 1, t.c.soldDate + 1).setValue(''); t.values[r][t.c.soldDate] = '' }
  t.values[r][t.c.sold] = ''; t.values[r][t.c.amount] = ''
  return { lead: mfLead_(t, t.values[r]) }
}

function mfKey_(v) { return String(v || '').trim().toLowerCase() }

/* Rango de fechas: ?since=AAAA-MM-DD&until=AAAA-MM-DD, o ?month=AAAA-MM (compatibilidad). */
function mfRango_(p) {
  var re = /^\d{4}-\d{2}-\d{2}$/
  if (re.test(p.since || '') && re.test(p.until || '')) return { since: p.since, until: p.until }
  var m = String(p.month || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM')).match(/^(\d{4})-(\d{2})$/)
  var last = new Date(Number(m[1]), Number(m[2]), 0).getDate()
  return { since: m[1] + '-' + m[2] + '-01', until: m[1] + '-' + m[2] + '-' + ('0' + last).slice(-2) }
}

function mfResumen_(rango) {
  var t = mfLeer_()
  var since = rango.since, until = rango.until
  var dentro = function (d) { d = String(d || '').slice(0, 10); return d >= since && d <= until }
  var ads = {}, camps = {}, leads = [], daily = {}
  var total = { leads: 0, sales: 0, revenue: 0, spend: null, days: 0, daysN: 0 }
  var nuevo = function (o) { o.leads = 0; o.sales = 0; o.revenue = 0; o.spend = null; o.days = 0; o.daysN = 0; return o }
  var dia = function (d, camp) { var k = d + '|' + mfKey_(camp); return daily[k] || (daily[k] = { date: d, campaign: camp || '', spend: 0, revenue: 0, sales: 0, leads: 0 }) }
  for (var r = 1; r < t.values.length; r++) {
    var row = t.values[r]
    if (!String(row[t.c.ref] || '').trim()) continue
    var l = mfLead_(t, row)
    // El lead cuenta por su fecha; la venta, por la fecha en que se vendió.
    var saleDay = (l.soldDate || l.date || '').slice(0, 10)
    var leadIn = dentro(l.date), saleIn = l.sold && dentro(saleDay)
    if (!leadIn && !saleIn) continue
    var ck = mfKey_(l.campaign), ak = ck + '|' + mfKey_(l.ad)
    var cmp = camps[ck] || (camps[ck] = nuevo({ campaign: l.campaign }))
    var ad = ads[ak] || (ads[ak] = nuevo({ ad: l.ad, campaign: l.campaign, adset: l.adset }))
    ;[cmp, ad, total].forEach(function (o) {
      if (leadIn) o.leads++
      if (saleIn) {
        o.sales++; o.revenue += l.amount
        if (l.soldDate && l.date) { o.days += (new Date(l.soldDate) - new Date(l.date)) / 86400000; o.daysN++ }
      }
    })
    if (leadIn) { dia(l.date.slice(0, 10), l.campaign).leads++; leads.push({ ref: l.ref, name: l.name, date: l.date, ad: l.ad, campaign: l.campaign, sold: l.sold, amount: l.amount }) }
    if (saleIn) { var dd = dia(saleDay, l.campaign); dd.sales++; dd.revenue += l.amount }
  }
  // Inversión de Meta Ads (si está configurada)
  var meta = mfInversion_(since, until)
  if (meta.rows) {
    total.spend = 0
    meta.rows.forEach(function (m) {
      var ck = mfKey_(m.campaign_name), ak = ck + '|' + mfKey_(m.ad_name)
      var spend = Number(m.spend) || 0
      var cmp = camps[ck] || (camps[ck] = nuevo({ campaign: m.campaign_name }))
      var ad = ads[ak] || (ads[ak] = nuevo({ ad: m.ad_name, campaign: m.campaign_name, adset: m.adset_name }))
      ;[cmp, ad, total].forEach(function (o) { o.spend = (o.spend || 0) + spend })
      ad.impressions = (ad.impressions || 0) + Number(m.impressions || 0)
      ad.clicks = (ad.clicks || 0) + Number(m.clicks || 0)
    })
    ;(meta.daily || []).forEach(function (d) { dia(d.date_start, d.campaign_name).spend += Number(d.spend) || 0 })
  }
  var fin = function (o) {
    o.closeRate = o.leads ? o.sales / o.leads : null
    o.roas = o.spend ? o.revenue / o.spend : null
    o.cpl = o.spend != null && o.leads ? o.spend / o.leads : null
    o.cps = o.spend != null && o.sales ? o.spend / o.sales : null
    o.avgDays = o.daysN ? o.days / o.daysN : null
    delete o.days; delete o.daysN
    return o
  }
  var orden = function (a, b) { return (b.revenue - a.revenue) || ((b.spend || 0) - (a.spend || 0)) || (b.leads - a.leads) }
  leads.sort(function (a, b) { return a.date < b.date ? 1 : -1 })
  return {
    since: since, until: until,
    total: fin(total),
    campaigns: Object.keys(camps).map(function (k) { return fin(camps[k]) }).sort(orden),
    ads: Object.keys(ads).map(function (k) { return fin(ads[k]) }).sort(orden),
    daily: Object.keys(daily).sort().map(function (k) { return daily[k] }),
    leads: leads,
    metaError: meta.error || null,
    hasSpend: !!meta.rows,
  }
}

function mfMeta_(path) {
  var acc = String(MF.AD_ACCOUNT_ID || '').trim()
  if (!/^\d+$/.test(acc)) return { error: 'Este cliente no tiene cuenta publicitaria.' }
  path = String(path || '').replace(/^\/+/, '')
  if (path.indexOf('act_' + acc) !== 0 || /access_token/i.test(path)) return { error: 'Consulta no permitida.' }
  var cache = CacheService.getScriptCache(), key = 'MF_META_' + Utilities.base64Encode(path).slice(0, 200)
  var hit = cache.get(key)
  if (hit) return JSON.parse(hit)
  try {
    var out = mfAdsGet_(path)
    try { cache.put(key, JSON.stringify(out), 300) } catch (x) {}
    return out
  } catch (err) { return { error: String(err && err.message || err) } }
}

/* Filas de la planilla con lead o venta dentro del rango (sin cálculos). */
function mfFilas_(rango) {
  var t = mfLeer_(), out = []
  var dentro = function (d) { d = String(d || '').slice(0, 10); return d >= rango.since && d <= rango.until }
  for (var r = 1; r < t.values.length; r++) {
    var row = t.values[r]
    if (!String(row[t.c.ref] || '').trim()) continue
    var l = mfLead_(t, row)
    if (!dentro(l.date) && !(l.sold && dentro(l.soldDate || l.date))) continue
    out.push({ ref: l.ref, name: l.name, date: l.date, campaign: l.campaign, adset: l.adset, ad: l.ad, sold: l.sold, amount: l.amount, soldDate: l.soldDate })
  }
  return { rows: out }
}

/* Inversión de Meta Ads del rango: por anuncio y por día (caché de 30 minutos). */
function mfInversion_(since, until) {
  if (!/^\d+$/.test(String(MF.AD_ACCOUNT_ID).trim()) || !/^EAA/.test(String(MF.ADS_TOKEN).trim())) return {}
  var cacheKey = 'MF_SPEND3_' + MF.AD_ACCOUNT_ID + '_' + since + '_' + until
  var cache = CacheService.getScriptCache()
  var hit = cache.get(cacheKey)
  if (hit) return JSON.parse(hit)
  var base = 'https://graph.facebook.com/v21.0/act_' + String(MF.AD_ACCOUNT_ID).trim() + '/insights?limit=500&time_range=' +
    encodeURIComponent(JSON.stringify({ since: since, until: until })) + '&access_token=' + encodeURIComponent(String(MF.ADS_TOKEN).trim())
  var traer = function (url) {
    var rows = []
    while (url) {
      var body = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText())
      if (body.error) throw new Error('Meta Ads: ' + (body.error.error_user_msg || body.error.message))
      rows = rows.concat(body.data || [])
      url = body.paging && body.paging.next
    }
    return rows
  }
  var out
  try {
    out = {
      rows: traer(base + '&level=ad&fields=campaign_name,adset_name,ad_name,spend,impressions,clicks'),
      daily: traer(base + '&level=campaign&time_increment=1&fields=campaign_name,spend'),
    }
  } catch (err) {
    return { error: String(err && err.message || err) }
  }
  try { cache.put(cacheKey, JSON.stringify(out), 1800) } catch (x) {}
  return out
}

/* ---------- Meta · API de Conversiones ---------- */
function mfSha_(v) {
  if (!v) return null
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8)
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2) }).join('')
}

function mfPurchase_(t, row, lead) {
  if (!/^\d+$/.test(String(MF.PIXEL_ID).trim())) return { sent: false, error: 'Falta configurar el píxel' }
  if (!/^EAA/.test(String(MF.CAPI_TOKEN).trim())) return { sent: false, error: 'Falta configurar el token de CAPI' }
  var c = t.c
  var cell = function (i) { return i >= 0 && row[i] != null ? String(row[i]).trim() : '' }
  var user = {}
  var fbclid = cell(c.fbclid), fbc = cell(c.fbc), fbp = cell(c.fbp), ua = cell(c.ua)
  var leadMs = lead.date ? new Date(lead.date).getTime() : Date.now()
  if (fbc) user.fbc = fbc
  else if (fbclid) user.fbc = 'fb.1.' + leadMs + '.' + fbclid
  if (fbp) user.fbp = fbp
  var ph = cell(c.phone).replace(/\D/g, '')
  if (ph) user.ph = [mfSha_(ph)]
  if (cell(c.email)) user.em = [mfSha_(cell(c.email).toLowerCase())]
  if (lead.name) user.fn = [mfSha_(lead.name.split(' ')[0].toLowerCase())]
  user.external_id = [mfSha_(lead.ref)]
  var event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: 'purchase_' + lead.ref,
    action_source: ua ? 'website' : 'system_generated',
    user_data: user,
    custom_data: { value: lead.amount, currency: MF.CURRENCY, content_name: lead.ad || '' },
  }
  if (ua) { user.client_user_agent = ua; event.event_source_url = cell(c.page) || 'https://sociosdetoros.com' }
  var resp
  try {
    resp = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + MF.PIXEL_ID + '/events?access_token=' + encodeURIComponent(String(MF.CAPI_TOKEN).trim()), {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ data: [event] }),
    })
  } catch (err) {
    return { sent: false, error: 'No se pudo conectar con Meta: ' + (err && err.message || err) }
  }
  var ok = resp.getResponseCode() === 200
  var body = resp.getContentText()
  var msg = null
  if (!ok) {
    try { var e = JSON.parse(body).error; msg = (e.error_user_msg || e.message) + ' (código ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' } catch (x) { msg = body.slice(0, 300) }
    console.log('Meta rechazó la venta ' + lead.ref + ': ' + body)
  }
  return { sent: ok, error: msg, response: ok ? body.slice(0, 200) : null }
}

/* Para probar desde el editor: elegí esta función y tocá Ejecutar. */
function mfProbar() {
  Logger.log(JSON.stringify(mfResumen_(mfRango_({})).total))
}
