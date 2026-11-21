/**
 * MetaFlash · Conexión con la planilla de leads
 * ------------------------------------------------------------------
 * La app NO copia los leads: consulta la planilla en el momento.
 *  - Buscar un lead por su código ref (y de qué anuncio vino).
 *  - Marcar la venta: escribe Venta / Monto en la planilla y envía la compra a Meta (CAPI).
 *  - Resumen del mes por anuncio (leads, ventas, facturación).
 *
 * Instalación (proyecto NUEVO de Apps Script, no el de la landing):
 *  1. script.new → pegar este archivo → completar MF.
 *  2. Implementar → Nueva implementación → Aplicación web →
 *     Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario → Implementar.
 *  3. Copiar la URL de la aplicación web y pegarla en MetaFlash (Editar cliente → Planilla de leads).
 */
var MF = {
  KEY: 'PEGAR_CLAVE',            // la misma clave que muestra MetaFlash en Editar cliente → Planilla de leads
  SHEET_ID: '17s0Za78bjPDidNHKtgfRBzCE5X-IgwS0krHuDsT7cx8',
  SHEET_NAME: 'Leads',
  PIXEL_ID: 'PEGAR_PIXEL_ID',
  CAPI_TOKEN: 'PEGAR_TOKEN_CAPI',
  CURRENCY: 'ARS',
}

function doGet(e) {
  var p = (e && e.parameter) || {}
  try {
    if (!MF.KEY || MF.KEY === 'PEGAR_CLAVE' || p.key !== MF.KEY) return mfOut_({ error: 'Clave incorrecta. Revisá la conexión de la planilla en MetaFlash.' })
    if (p.action === 'ping') return mfOut_({ ok: true, sheet: mfHoja_().getName() })
    if (p.action === 'find') return mfOut_(mfBuscar_(p.ref))
    if (p.action === 'sell') return mfOut_(mfVender_(p.ref, p.amount))
    if (p.action === 'unsell') return mfOut_(mfDeshacer_(p.ref))
    if (p.action === 'summary') return mfOut_(mfResumen_(p.month))
    return mfOut_({ error: 'Acción desconocida' })
  } catch (err) {
    return mfOut_({ error: String(err && err.message || err) })
  }
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
    ref: find(/^ref/i), date: find(/^fecha/i), name: find(/^nombre/i),
    campaign: find(/utm_campaign/i), adset: find(/utm_term/i), ad: find(/utm_content/i),
    fbclid: find(/fbclid/i), fbp: find(/^_?fbp$/i), fbc: find(/^_?fbc$/i), page: find(/p[aá]gina|^url/i),
    phone: find(/tel[eé]fono|whats|celular|^tel$/i), email: find(/e-?mail|correo/i), ua: find(/agent/i),
    sold: find(/^venta$/i), amount: find(/^monto/i),
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
    if (k && row[i] !== '' && row[i] != null && !/utm|fbclid|fbc|fbp|p[aá]gina|agent|^venta$|^monto|^ref|^fecha|^nombre/i.test(k)) data[k] = get(i)
  })
  return {
    ref: get(c.ref), name: get(c.name), date: mfFecha_(c.date >= 0 ? row[c.date] : ''),
    campaign: get(c.campaign), adset: get(c.adset), ad: get(c.ad), data: data,
    sold: c.sold >= 0 && mfVendido_(row[c.sold]), amount: c.amount >= 0 ? mfMonto_(row[c.amount]) : 0,
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
    lead.sold = true; lead.amount = value
    var meta = yaVendido ? { skipped: true } : mfPurchase_(t, t.values[r], lead)
    return { lead: lead, meta: meta }
  } finally {
    lock.releaseLock()
  }
}

function mfDeshacer_(ref) {
  var t = mfLeer_()
  var r = mfFila_(t, ref)
  if (r < 0) return { error: 'No encontré ese código en la planilla.' }
  if (t.c.sold >= 0) t.sh.getRange(r + 1, t.c.sold + 1).setValue('')
  if (t.c.amount >= 0) t.sh.getRange(r + 1, t.c.amount + 1).setValue('')
  t.values[r][t.c.sold] = ''; t.values[r][t.c.amount] = ''
  return { lead: mfLead_(t, t.values[r]) }
}

function mfResumen_(month) {
  var t = mfLeer_()
  var byAd = {}, leads = [], total = { leads: 0, sales: 0, revenue: 0 }
  for (var r = 1; r < t.values.length; r++) {
    var row = t.values[r]
    if (!String(row[t.c.ref] || '').trim()) continue
    var l = mfLead_(t, row)
    if (month && l.date.indexOf(month) !== 0) continue
    var k = l.ad || ''
    var a = byAd[k] || (byAd[k] = { ad: k, campaign: l.campaign, adset: l.adset, leads: 0, sales: 0, revenue: 0 })
    a.leads++; total.leads++
    if (l.sold) { a.sales++; a.revenue += l.amount; total.sales++; total.revenue += l.amount }
    leads.push({ ref: l.ref, name: l.name, date: l.date, ad: l.ad, sold: l.sold, amount: l.amount })
  }
  var list = Object.keys(byAd).map(function (k) { return byAd[k] }).sort(function (a, b) { return b.revenue - a.revenue || b.leads - a.leads })
  leads.sort(function (a, b) { return a.date < b.date ? 1 : -1 })
  return { total: total, byAd: list, leads: leads }
}

/* ---------- Meta · API de Conversiones ---------- */
function mfSha_(v) {
  if (!v) return null
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8)
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2) }).join('')
}

function mfPurchase_(t, row, lead) {
  if (!MF.PIXEL_ID || MF.PIXEL_ID === 'PEGAR_PIXEL_ID') return { sent: false, error: 'Falta configurar el píxel' }
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
  var resp = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + MF.PIXEL_ID + '/events?access_token=' + encodeURIComponent(MF.CAPI_TOKEN), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ data: [event] }),
  })
  var ok = resp.getResponseCode() === 200
  if (!ok) Logger.log('Meta rechazó la venta ' + lead.ref + ': ' + resp.getContentText())
  return { sent: ok, error: ok ? null : resp.getContentText().slice(0, 300) }
}

/* Para probar desde el editor: elegí esta función y tocá Ejecutar. */
function mfProbar() {
  Logger.log(JSON.stringify(mfResumen_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM')).total))
}
