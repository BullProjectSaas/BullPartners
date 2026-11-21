/**
 * MetaFlash · Sincronización de leads + envío de ventas a Meta (CAPI)
 * ------------------------------------------------------------------
 * Se pega en el Apps Script de la planilla de leads (Extensiones → Apps Script),
 * como un archivo nuevo. No toca el script de la landing.
 *
 * Qué hace (cada 5 minutos):
 *  1. Manda los leads nuevos de la planilla a MetaFlash (el cliente los ve en "Ventas").
 *  2. Cuando el cliente marca un lead como vendido en MetaFlash:
 *     - envía el evento Purchase a Meta por la API de Conversiones,
 *     - escribe "Sí" y el monto en las columnas Venta / Monto de la planilla.
 *
 * Instalación: completá MF_CONFIG y ejecutá una vez la función mfInstalar.
 */
var MF_CONFIG = {
  CLIENT_ID: 'PEGAR_ID_DEL_CLIENTE',        // MetaFlash → Clientes → (cliente) → botón "ID para planilla"
  ROBOT_EMAIL: 'PEGAR_EMAIL_ROBOT',         // usuario "Equipo" creado en MetaFlash solo para este script
  ROBOT_PASSWORD: 'PEGAR_CONTRASEÑA_ROBOT',
  PIXEL_ID: 'PEGAR_PIXEL_ID',
  CAPI_TOKEN: 'PEGAR_TOKEN_CAPI',
  CURRENCY: 'ARS',
  SHEET_ID: '17s0Za78bjPDidNHKtgfRBzCE5X-IgwS0krHuDsT7cx8', // ID de la planilla (está en su link, entre /d/ y /edit)
  SHEET_NAME: 'Leads',
  SITE_URL: 'https://sociosdetoros.com',
}

var MF_FIREBASE = {
  API_KEY: 'AIzaSyDXX7LN9xM9UP4U8G-aBAGu7a9ySF-0KZM',
  PROJECT: 'metaflash-bull',
}

/* ---------- Instalación ---------- */
function mfInstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'mfSincronizar') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('mfSincronizar').timeBased().everyMinutes(5).create()
  PropertiesService.getScriptProperties().deleteProperty('MF_LAST_ROW')
  mfSincronizar()
  Logger.log('Listo: MetaFlash se sincroniza cada 5 minutos.')
}

/* Vuelve a mandar todos los leads (por si se editaron filas viejas). */
function mfResincronizarTodo() {
  PropertiesService.getScriptProperties().deleteProperty('MF_LAST_ROW')
  mfSincronizar()
}

function mfSincronizar() {
  var lock = LockService.getScriptLock()
  if (!lock.tryLock(30000)) return
  try {
    mfSubirLeads_()
    mfProcesarVentas_()
  } finally {
    lock.releaseLock()
  }
}

function mfHoja_() {
  var ss = MF_CONFIG.SHEET_ID ? SpreadsheetApp.openById(MF_CONFIG.SHEET_ID) : SpreadsheetApp.getActive()
  var sh = ss.getSheetByName(MF_CONFIG.SHEET_NAME)
  if (!sh) throw new Error('No encuentro la hoja "' + MF_CONFIG.SHEET_NAME + '" en la planilla')
  return sh
}

/* ---------- 1. Leads → MetaFlash ---------- */
function mfColumnas_(headers) {
  var find = function (re) {
    for (var i = 0; i < headers.length; i++) if (re.test(String(headers[i]).trim())) return i
    return -1
  }
  return {
    ref: find(/^ref/i), date: find(/^fecha/i), name: find(/^nombre/i),
    campaign: find(/utm_campaign/i), adset: find(/utm_term/i), ad: find(/utm_content/i),
    fbclid: find(/fbclid/i), fbp: find(/^_?fbp$/i), fbc: find(/^_?fbc$/i),
    page: find(/p[aá]gina|^url/i), phone: find(/tel[eé]fono|whats|celular|^tel$/i), email: find(/e-?mail|correo/i),
    ua: find(/agent/i), sold: find(/^venta$/i), amount: find(/^monto/i),
  }
}

function mfFecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm")
  var m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return ''
  var p = function (n) { return ('0' + n).slice(-2) }
  return m[3] + '-' + p(m[2]) + '-' + p(m[1]) + 'T' + p(m[4] || 0) + ':' + p(m[5] || 0)
}

function mfSubirLeads_() {
  var sh = mfHoja_()
  var values = sh.getDataRange().getValues()
  if (values.length < 2) return
  var headers = values[0]
  var c = mfColumnas_(headers)
  if (c.ref < 0) throw new Error('No encuentro la columna "Ref" en la hoja ' + MF_CONFIG.SHEET_NAME)
  var props = PropertiesService.getScriptProperties()
  var last = Number(props.getProperty('MF_LAST_ROW') || 1)
  var firstRun = last <= 1
  var writes = []
  var get = function (row, i) { return i >= 0 ? String(row[i] == null ? '' : row[i]).trim() : '' }

  for (var r = last; r < values.length; r++) {
    var row = values[r]
    var ref = get(row, c.ref)
    if (!ref) continue
    var data = {}
    headers.forEach(function (h, i) { if (h && row[i] !== '' && row[i] != null) data[String(h).trim()] = row[i] instanceof Date ? mfFecha_(row[i]) : String(row[i]) })
    var doc = {
      id: ref, ref: ref, clientId: MF_CONFIG.CLIENT_ID, date: mfFecha_(c.date >= 0 ? row[c.date] : ''),
      name: get(row, c.name), campaign: get(row, c.campaign), adset: get(row, c.adset), ad: get(row, c.ad),
      fbclid: get(row, c.fbclid), page: get(row, c.page), data: data,
    }
    var mask = Object.keys(doc)
    // En la primera carga se respetan las ventas que ya estaban marcadas en la planilla (sin reenviarlas a Meta).
    var venta = get(row, c.sold).toLowerCase()
    if (firstRun && /^(s[ií]|si|vendid|true|x|1)/.test(venta)) {
      doc.sold = true; doc.amount = Number(String(get(row, c.amount)).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
      doc.capiSent = true
      mask = mask.concat(['sold', 'amount', 'capiSent'])
    }
    writes.push({ update: { name: mfDocName_('leads/' + mfDocId_(ref)), fields: mfToFields_(doc) }, updateMask: { fieldPaths: mask.map(mfFieldPath_) } })
  }
  for (var i = 0; i < writes.length; i += 400) mfCommit_(writes.slice(i, i + 400))
  props.setProperty('MF_LAST_ROW', String(values.length))
  if (writes.length) Logger.log(writes.length + ' leads enviados a MetaFlash')
}

/* ---------- 2. Ventas → Meta (CAPI) + planilla ---------- */
function mfProcesarVentas_() {
  var res = mfFetch_('post', ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'leads' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'clientId' }, op: 'EQUAL', value: { stringValue: MF_CONFIG.CLIENT_ID } } },
        { fieldFilter: { field: { fieldPath: 'sold' }, op: 'EQUAL', value: { booleanValue: true } } },
        { fieldFilter: { field: { fieldPath: 'capiSent' }, op: 'EQUAL', value: { booleanValue: false } } },
      ] } },
    },
  })
  var leads = (res || []).filter(function (x) { return x.document }).map(function (x) { return mfFromFields_(x.document.fields) })
  if (!leads.length) return

  var sh = mfHoja_()
  var values = sh.getDataRange().getValues()
  var c = mfColumnas_(values[0])

  leads.forEach(function (l) {
    var rowIdx = -1
    for (var r = 1; r < values.length; r++) if (String(values[r][c.ref]).trim() === l.ref) { rowIdx = r; break }
    var row = rowIdx > 0 ? values[rowIdx] : []
    var cell = function (i) { return i >= 0 && row[i] != null ? String(row[i]).trim() : '' }

    var ok = mfEnviarPurchase_(l, cell(c.phone), cell(c.email), cell(c.fbp), cell(c.fbc), cell(c.ua))
    if (!ok) return
    mfCommit_([{ update: { name: mfDocName_('leads/' + mfDocId_(l.id)), fields: mfToFields_({ capiSent: true, capiAt: new Date().toISOString() }) }, updateMask: { fieldPaths: ['capiSent', 'capiAt'] } }])
    if (rowIdx > 0) {
      if (c.sold >= 0) sh.getRange(rowIdx + 1, c.sold + 1).setValue('Sí')
      if (c.amount >= 0) sh.getRange(rowIdx + 1, c.amount + 1).setValue(l.amount)
    }
  })
}

function mfSha_(v) {
  if (!v) return null
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8)
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2) }).join('')
}

function mfEnviarPurchase_(l, phone, email, fbp, fbc, ua) {
  var leadMs = l.date ? new Date(l.date).getTime() : Date.now()
  var user = {}
  if (fbc) user.fbc = fbc
  else if (l.fbclid) user.fbc = 'fb.1.' + leadMs + '.' + l.fbclid
  if (fbp) user.fbp = fbp
  var ph = phone.replace(/\D/g, '')
  if (ph) user.ph = [mfSha_(ph)]
  if (email) user.em = [mfSha_(email.toLowerCase())]
  if (l.name) user.fn = [mfSha_(l.name.split(' ')[0].toLowerCase())]
  user.external_id = [mfSha_(l.ref)]
  var event = {
    event_name: 'Purchase',
    event_time: Math.floor(new Date(l.soldAt || Date.now()).getTime() / 1000),
    event_id: 'purchase_' + l.ref,
    action_source: ua ? 'website' : 'system_generated',
    user_data: user,
    custom_data: { value: Number(l.amount) || 0, currency: MF_CONFIG.CURRENCY, content_name: l.ad || '' },
  }
  if (ua) { user.client_user_agent = ua; event.event_source_url = l.page || MF_CONFIG.SITE_URL }
  var resp = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + MF_CONFIG.PIXEL_ID + '/events?access_token=' + encodeURIComponent(MF_CONFIG.CAPI_TOKEN), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ data: [event] }),
  })
  if (resp.getResponseCode() !== 200) {
    Logger.log('Meta rechazó la venta ' + l.ref + ': ' + resp.getContentText())
    return false
  }
  Logger.log('Venta ' + l.ref + ' enviada a Meta (' + l.amount + ' ' + MF_CONFIG.CURRENCY + ')')
  return true
}

/* ---------- Firestore (con el usuario robot de MetaFlash) ---------- */
function mfToken_() {
  var cache = CacheService.getScriptCache()
  var t = cache.get('MF_TOKEN')
  if (t) return t
  var resp = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + MF_FIREBASE.API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ email: MF_CONFIG.ROBOT_EMAIL, password: MF_CONFIG.ROBOT_PASSWORD, returnSecureToken: true }),
  })
  if (resp.getResponseCode() !== 200) throw new Error('No pude entrar a MetaFlash con el usuario robot: ' + resp.getContentText())
  t = JSON.parse(resp.getContentText()).idToken
  cache.put('MF_TOKEN', t, 3000)
  return t
}
function mfBase_() { return 'projects/' + MF_FIREBASE.PROJECT + '/databases/(default)/documents' }
function mfDocName_(path) { return mfBase_() + '/' + path }
function mfDocId_(ref) { return String(ref).replace(/\//g, '_') }
function mfFieldPath_(k) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k.replace(/`/g, '\\`') + '`' }
function mfFetch_(method, suffix, body) {
  var resp = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + mfBase_() + suffix, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + mfToken_() }, payload: body ? JSON.stringify(body) : undefined,
  })
  if (resp.getResponseCode() >= 300) throw new Error('MetaFlash respondió ' + resp.getResponseCode() + ': ' + resp.getContentText())
  return JSON.parse(resp.getContentText() || '{}')
}
function mfCommit_(writes) { if (writes.length) mfFetch_('post', ':commit', { writes: writes }) }

function mfToValue_(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'object') return { mapValue: { fields: mfToFields_(v) } }
  return { stringValue: String(v) }
}
function mfToFields_(o) { var f = {}; Object.keys(o).forEach(function (k) { f[k] = mfToValue_(o[k]) }); return f }
function mfFromValue_(v) {
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('mapValue' in v) return mfFromFields_(v.mapValue.fields || {})
  return null
}
function mfFromFields_(f) { var o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = mfFromValue_(f[k]) }); return o }
