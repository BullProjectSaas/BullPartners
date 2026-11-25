# MetaFlash ↔ Landings — Contrato de integración

Documento para el chat/skill que crea las landings de clientes de Bull Partners.
Si una landing cumple este contrato, funciona con MetaFlash sin tocar nada más.

---

## 1. Qué es MetaFlash y cómo usa la landing

MetaFlash es la app de gestión de Bull Partners (https://bullprojectsaas.github.io/BullPartners/).
Cada cliente tiene un portal donde, entre otras cosas, **registra sus ventas** y ve **métricas por campaña y anuncio**.

Flujo completo:

```
Anuncio de Meta (con UTMs dinámicas)
  → Landing del cliente (formulario corto)
      → dispara el evento Lead en el píxel del cliente
      → guarda el lead en la planilla de Google del cliente (con un código Ref)
      → abre WhatsApp del cliente con el Ref en el mensaje
  → El cliente vende por WhatsApp
  → En MetaFlash pega el Ref, pone el monto y toca "Vendido"
      → MetaFlash escribe Venta/Monto/Fecha venta en la planilla
      → MetaFlash envía el evento Purchase a Meta por CAPI (con fbclid, _fbp, _fbc, user agent…)
  → MetaFlash cruza: venta → lead (por Ref) → anuncio (por utm_content = nombre del anuncio en Meta)
     → inversión de Meta → ROAS, costo por lead, costo por venta, tasa de cierre, por campaña y anuncio
```

**La landing NO necesita el token de CAPI ni nada de MetaFlash.** Solo tiene que:
1. Disparar el Lead del píxel.
2. Guardar el lead en la planilla con las columnas exactas de abajo.
3. Mostrar/enviar el Ref.

MetaFlash lee la planilla a través de un script central (Apps Script "App de gestión - Bull Partners") que ya existe y **no hay que tocar**.

---

## 2. La planilla del cliente (Google Sheets)

- **Una planilla por cliente**, en la **cuenta de Google de Bull Partners** (la misma dueña del script central). Si la crea otra cuenta, compartirla como **Editor** con la cuenta de Bull Partners.
- Hoja llamada **`Leads`**.
- Fila 1 = encabezados. **Los nombres tienen que ser exactamente estos** (MetaFlash los busca por nombre; el orden puede variar, las preguntas del formulario van en el medio):

| Columna | La llena | Contenido / formato |
|---|---|---|
| `Fecha` | landing | `dd/MM/yyyy HH:mm`, zona `America/Argentina/Buenos_Aires` |
| `Ref` | landing | Código único del lead, ej. `MF-3VM8G` (ver §4). **Obligatoria.** |
| `Nombre` | landing | Lo que escribió el lead |
| *(preguntas del formulario)* | landing | Una columna por pregunta, con el nombre que quieras (ej. `Negocio`, `Rubro`, `Cuándo comenzar`, `Presupuesto`). MetaFlash las muestra en la ficha del lead. |
| `utm_source` | landing | de la URL |
| `utm_medium` | landing | de la URL |
| `utm_campaign (campaña)` | landing | de la URL — **nombre de la campaña** |
| `utm_term (conjunto)` | landing | de la URL — nombre del conjunto |
| `utm_content (anuncio)` | landing | de la URL — **nombre exacto del anuncio**. Clave para la atribución. |
| `fbclid` | landing | de la URL |
| `_fbp` | landing | cookie `_fbp` del píxel |
| `_fbc` | landing | cookie `_fbc`; si no existe y hay fbclid: `fb.1.<timestamp_ms>.<fbclid>` |
| `User agent` | landing | `navigator.userAgent` |
| `Página` | landing | `location.href` sin query (o con, da igual) |
| `Venta` | **MetaFlash** | La landing la deja vacía. MetaFlash escribe `Sí`. |
| `Monto` | **MetaFlash** | La landing la deja vacía. |
| `Fecha venta` | **MetaFlash** | La landing la deja vacía (si no existe, MetaFlash la crea). |
| `Meta` | **MetaFlash** | Resultado del envío a CAPI (si no existe, MetaFlash la crea). |

Reglas:
- **Nunca** escribir en `Venta`, `Monto`, `Fecha venta`, `Meta` desde la landing (ni sobrescribirlas al actualizar un lead).
- **Ref único**: si el mismo Ref llega dos veces, actualizar esa fila (no duplicar).
- No renombrar columnas después de conectado el cliente.
- **No pedir email ni teléfono en la landing** (decisión de embudo). La coincidencia en Meta se apoya en fbclid/_fbp/_fbc/user agent.

---

## 3. UTMs de los anuncios (obligatorio)

En **todos** los anuncios del cliente, en "Parámetros de URL":

```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}
```

Así `utm_content` = nombre del anuncio en Meta, y MetaFlash cruza la inversión de cada anuncio con sus leads y ventas.
Si se cambia el nombre de un anuncio, los leads nuevos usan el nombre nuevo.

---

## 4. Código Ref

- Formato: `MF-` + 5 caracteres en mayúscula, sin ambiguos (sin 0/O/1/I/L). Ej.: `MF-3VM8G`.
- Se genera en la landing al enviar el formulario.
- Se usa como **`eventID` del Lead** del píxel (deduplicación).
- Va en el **mensaje de WhatsApp** prellenado, para que el cliente lo copie al registrar la venta. Ej.:
  `Hola! Quiero info. Mi código es MF-3VM8G`

---

## 5. Código de la landing (JS, al enviar el formulario)

```html
<script>
  // Píxel del cliente ya instalado (fbq('init', 'PIXEL_ID'); fbq('track', 'PageView');)
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/XXXX/exec' // script de captura de ESTA planilla
  const WHATSAPP = '549XXXXXXXXXX' // número del cliente, sin + ni espacios

  function mfRef() {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let s = ''; for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)]
    return 'MF-' + s
  }
  function cookie(n) { const m = document.cookie.match('(^|;)\\s*' + n + '=([^;]*)'); return m ? decodeURIComponent(m[2]) : '' }

  function enviarLead(respuestas /* { nombre, negocio, rubro, cuando, presupuesto, ... } */) {
    const q = new URLSearchParams(location.search)
    const ref = mfRef()
    const fbclid = q.get('fbclid') || ''
    const fbc = cookie('_fbc') || (fbclid ? 'fb.1.' + Date.now() + '.' + fbclid : '')
    const d = Object.assign({}, respuestas, {
      ref,
      utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '', utm_term: q.get('utm_term') || '', utm_content: q.get('utm_content') || '',
      fbclid, fbp: cookie('_fbp'), fbc, ua: navigator.userAgent, pagina: location.origin + location.pathname,
    })
    // 1) Lead en el píxel, con el Ref como eventID
    if (window.fbq) fbq('track', 'Lead', {}, { eventID: ref })
    // 2) Guardar en la planilla (POST sin preflight + respaldo por imagen)
    const body = JSON.stringify(d)
    try { navigator.sendBeacon(APPS_SCRIPT_URL, new Blob([body], { type: 'text/plain' })) } catch (e) {}
    new Image().src = APPS_SCRIPT_URL + '?d=' + encodeURIComponent(body)
    // 3) WhatsApp con el Ref
    const msg = `Hola! Quiero más información. Mi código es ${ref}`
    location.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`
  }
</script>
```

(Si la landing ya tiene su propia lógica, lo importante es que mande estos campos con estas claves.)

---

## 6. Apps Script de captura (uno por planilla de cliente)

Pegarlo en la planilla del cliente (Extensiones → Apps Script), **Implementar → Aplicación web → Ejecutar como: Yo · Acceso: Cualquier usuario**, y usar esa URL como `APPS_SCRIPT_URL` en la landing.
Ajustar solo `CAMPOS` en la parte de "preguntas del formulario".

```js
const HOJA = 'Leads';

// [Columna de la planilla, clave que manda la landing]. '' = la llena MetaFlash.
const CAMPOS = [
  ['Fecha', 'fecha'], ['Ref', 'ref'], ['Nombre', 'nombre'],
  // ---- Preguntas del formulario (ajustar por cliente) ----
  ['Negocio', 'negocio'], ['Rubro', 'rubro'], ['Cuándo comenzar', 'cuando'], ['Presupuesto', 'presupuesto'],
  // ---- Fijas (no tocar) ----
  ['utm_source', 'utm_source'], ['utm_medium', 'utm_medium'],
  ['utm_campaign (campaña)', 'utm_campaign'], ['utm_term (conjunto)', 'utm_term'], ['utm_content (anuncio)', 'utm_content'],
  ['fbclid', 'fbclid'], ['_fbp', 'fbp'], ['_fbc', 'fbc'], ['User agent', 'ua'], ['Página', 'pagina'],
  ['Venta', ''], ['Monto', ''], ['Fecha venta', ''], ['Meta', ''],
];

function doGet(e) {
  if (e && e.parameter && e.parameter.d) guardar(e.parameter.d);
  return ContentService.createTextOutput('ok');
}
function doPost(e) {
  if (e && e.postData && e.postData.contents) guardar(e.postData.contents);
  return ContentService.createTextOutput('ok');
}

function guardar(texto) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(texto);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = ss.getSheetByName(HOJA);
    if (!hoja) {
      hoja = ss.insertSheet(HOJA);
      hoja.appendRow(CAMPOS.map(c => c[0]));
      hoja.setFrozenRows(1);
      hoja.getRange(1, 1, 1, CAMPOS.length).setFontWeight('bold');
    }
    // Encabezados actuales; agrega los que falten
    let headers = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0].map(String);
    CAMPOS.forEach(([titulo]) => {
      if (headers.indexOf(titulo) === -1) {
        hoja.getRange(1, headers.length + 1).setValue(titulo).setFontWeight('bold');
        headers.push(titulo);
      }
    });
    d.fecha = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
    const colRef = headers.indexOf('Ref') + 1;
    let fila = 0;
    if (d.ref && hoja.getLastRow() > 1) {
      const hallado = hoja.getRange(2, colRef, hoja.getLastRow() - 1, 1)
        .createTextFinder(String(d.ref)).matchEntireCell(true).findNext();
      if (hallado) fila = hallado.getRow();
    }
    if (fila) {
      // Actualiza solo lo que llegó con contenido (nunca Fecha, Venta, Monto, Fecha venta, Meta)
      CAMPOS.forEach(([titulo, clave]) => {
        if (!clave || clave === 'fecha') return;
        const v = d[clave];
        if (v !== undefined && v !== '') hoja.getRange(fila, headers.indexOf(titulo) + 1).setValue(v);
      });
    } else {
      hoja.appendRow(headers.map(h => {
        const c = CAMPOS.find(x => x[0] === h);
        return c && c[1] && d[c[1]] !== undefined ? d[c[1]] : '';
      }));
    }
  } finally {
    lock.releaseLock();
  }
}
```

> Importante: este script es **solo de captura** y vive en la planilla del cliente. No confundir con el script central de MetaFlash ("App de gestión - Bull Partners"), que es único y no se toca.

---

## 7. Alta del cliente en MetaFlash (después de publicar la landing)

1. Meta: compartir la **cuenta publicitaria** del cliente con el portafolio Bull Partners y asignarla al usuario del sistema **MetaFlash** (Ver rendimiento).
2. Events Manager → píxel del cliente → Configuración → **Generar token de API de conversiones**.
3. MetaFlash → Clientes → **+ Nuevo cliente** → completar datos y acceso del cliente.
4. **Editar cliente → Métricas y ventas**: cuenta publicitaria (lista), link de la planilla, hoja `Leads`, ID del píxel, token CAPI → Guardar. (Si MetaFlash avisa que falta alguna columna, corregir la planilla.)
5. Pasarle al cliente su email y contraseña.

---

## 8. Prueba antes de lanzar (checklist)

1. Abrir la landing con UTMs de prueba:
   `?utm_source=fb&utm_medium=paid_social&utm_campaign=TEST&utm_term=TEST&utm_content=TEST_AD&fbclid=TEST123`
2. Completar el formulario → se abre WhatsApp con el Ref.
3. En la planilla aparece la fila con **Ref, UTMs, fbclid, _fbp, _fbc, User agent, Página** completos.
4. Events Manager → Probar eventos: llega **Lead** con el mismo Ref como event ID.
5. En MetaFlash → Ventas → **Registrar venta** → pegar el Ref → aparece el lead con su anuncio.
6. (Opcional) Marcar vendido con monto chico → en la planilla aparece `Sí`, monto, Fecha venta y `✓ Enviado` en Meta → **Deshacer** después de probar.
