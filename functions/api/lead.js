/**
 * POST /api/lead — Formularios del sitio → Kommo (Cloudflare Pages Function).
 *
 * Recibe los formularios de cotización (landings y home) y de descarga del
 * catálogo, y crea en Kommo contacto + empresa + lead + nota + tarea.
 * Doc: 02_sitio-web/19_formularios_kommo.md (y 05_formulario_y_flujo_de_lead.md).
 *
 * Variables de entorno (Cloudflare Pages → Settings → Variables and secrets):
 *   KOMMO_TOKEN       (secreto) token de larga duración de la integración privada
 *                     "Formulario web Diforza". Sin token → solo respaldo en KV.
 *   KOMMO_SUBDOMAIN   opcional, por defecto "marketingdiforza".
 *   TURNSTILE_SECRET  (secreto, opcional) si está, se exige el captcha Turnstile.
 *   META_CAPI_TOKEN   (secreto) token de la API de conversiones del dataset
 *                     Diforza_Web 1644320683756405. Sin token → no se envía a Meta.
 *   META_TEST_EVENT_CODE  opcional: código de "Probar eventos" (Administrador de
 *                     eventos). Con código, los eventos van solo a la pestaña de prueba.
 *   META_API_VERSION  opcional, por defecto "v23.0".
 * Meta CAPI (doc 08 §8): Lead (cotización) / CatalogDownload (catálogo) con el
 * mismo event_id que el píxel del navegador → Meta deduplica. En *.pages.dev
 * solo se envía si hay META_TEST_EVENT_CODE (staging no ensucia el dataset).
 * Bindings:
 *   LEADS             (KV, opcional) respaldo de cada lead, haya llegado o no a Kommo.
 *
 * Nunca se pierde un lead en silencio: se guarda en KV antes de ir a Kommo y
 * se marca el resultado. Si no hay ni KV ni Kommo, responde 502 y el navegador
 * ofrece WhatsApp con los datos.
 */

// ── IDs de Kommo (cuenta marketingdiforza, leídos por API el 14 oct 2026) ──
const K = {
  pipeline: 14527267,            // Ventas B2B
  status: 112222659,             // Nuevo / sin calificar
  user: 15908979,                // Marketing Diforza
  lead: {
    empresa: 428294,
    rubro: 428296,               // Rubro / industria (texto)
    productos: 428300,           // Productos de interés (texto)
    origen: 427906,              // select
    categoria: 435720,           // multiselect Categoria de Interés
    utm_content: 332674, utm_medium: 332676, utm_campaign: 332678,
    utm_source: 332680, utm_term: 332682, utm_referrer: 332684,
    referrer: 332686, gclientid: 332688, gclid: 332690, fbclid: 332692,
  },
  origen: { meta: 342838, google: 342840, landing: 342842, organico: 342844 },
  categoria: { indumentaria: 349496, calzado: 349492, epp: 349498, guantes: 349494, senalizacion: 349504 },
  company: { rubro: 433804 },
  rubroEmpresa: {                // texto del <select> del sitio → enum Rubro de Empresa
    'Industria / Manufactura': 347732,
    'Construcción y obra': 347730,
    'Logística y transporte': 347734,
    'Alimentos y bebidas': 347738,
    'Laboratorio y farmacéutica': 347736,
    'Química y petroquímica': 347732,
    'Agro': 347742,
    'Minería y energía': 347740,
    'Servicios y mantenimiento': 347744,
    'Sector público': 347744,
    'Otro': 347744,
  },
};

const LANDING_CAT = {           // landingId → Categoria de Interés
  'l2-indumentaria': 'indumentaria',
  'calzado': 'calzado',
  'l3-epp': 'epp',
  'ziao': 'indumentaria',
  'marca-libus': 'epp',          // páginas de marca /marcas/<slug>/ (20 oct 2026)
  'marca-conwork': 'calzado',
  'marca-ombu': 'calzado',
  'marca-bls': 'epp',
  'marca-de-pascale': 'epp',
  'marca-worksafe': 'epp',
  'marca-sky': 'epp',
  'marca-conoflex': 'epp',
  'marca-funcional': 'calzado',
  'marca-voran': 'calzado',
  'marca-diforza': 'indumentaria', // 21 oct 2026
  'agio': 'indumentaria',          // /agio/ (21 oct 2026)
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 20000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const s = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function onRequestPost({ request, env }) {
  // 1. Leer y validar
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  let d;
  try { d = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_json' }, 400); }

  if (s(d.website)) return json({ ok: true, id: 'hp' }); // honeypot: el bot cree que salió

  const tipo = d.tipo_lead === 'catalogo' ? 'catalogo' : 'cotizacion';
  const lead = {
    id: s(d.event_id, 64) || crypto.randomUUID(),
    tipo,
    nombre: s(d.nombre, 120),
    empresa: s(d.empresa, 160),
    email: s(d.email, 160).toLowerCase(),
    telefono: s(d.telefono, 40),
    rubro: s(d.rubro, 80),
    mensaje: s(d.mensaje, 3000),
    producto: s(d.producto_interes, 300),
    categorias: Array.isArray(d.categorias) ? d.categorias.map((c) => s(c, 60)).filter(Boolean).slice(0, 10) : [],
    landing: s(d.landing, 60),
    pagina: s(d.pagina, 300),
    attr: sanitizeAttr(d.attr),
    ts: new Date().toISOString(),
    ip_country: request.headers.get('cf-ipcountry') || '',
    ua: s(request.headers.get('user-agent'), 300),
  };

  const missing = [];
  if (!lead.empresa) missing.push('empresa');
  if (!EMAIL_RE.test(lead.email)) missing.push('email');
  if (tipo === 'cotizacion') {
    if (!lead.nombre) missing.push('nombre');
    if (lead.telefono.replace(/\D/g, '').length < 8) missing.push('telefono');
  }
  if (!d.consentimiento) missing.push('consentimiento');
  if (missing.length) return json({ ok: false, error: 'invalid', fields: missing }, 422);

  // 2. Antispam Turnstile (solo si está configurado)
  if (env.TURNSTILE_SECRET) {
    const okCaptcha = await verifyTurnstile(env.TURNSTILE_SECRET, s(d['cf-turnstile-response'], 4000), request.headers.get('cf-connecting-ip'));
    if (!okCaptcha) return json({ ok: false, error: 'captcha' }, 403);
  }

  // 3. Respaldo en KV
  const kvKey = `lead:${lead.ts}:${lead.id}`;
  let saved = false;
  if (env.LEADS) {
    try { await env.LEADS.put(kvKey, JSON.stringify({ lead, kommo: { status: 'pending' } })); saved = true; }
    catch (e) { console.error('kv_put_failed', e && e.message); }
  }

  // 4. Kommo y Meta CAPI en paralelo (Meta nunca bloquea ni hace fallar el lead)
  const kommoP = (async () => {
    if (!env.KOMMO_TOKEN) return { status: 'off' };
    try {
      const leadId = await sendToKommo(lead, env);
      return { status: 'ok', lead_id: leadId };
    } catch (e) {
      const k = { status: 'error', error: String((e && e.message) || e).slice(0, 500) };
      console.error('kommo_failed', k.error);
      return k;
    }
  })();
  const metaP = sendToMeta(lead, request, env).catch((e) => {
    const m = { status: 'error', error: String((e && e.message) || e).slice(0, 300) };
    console.error('meta_capi_failed', m.error);
    return m;
  });
  const [kommo, meta] = await Promise.all([kommoP, metaP]);
  if (saved) {
    try { await env.LEADS.put(kvKey, JSON.stringify({ lead, kommo, meta, updated: new Date().toISOString() })); } catch {}
  }

  if (kommo.status === 'ok' || saved) return json({ ok: true, id: lead.id, kommo: kommo.status });
  return json({ ok: false, error: 'unavailable', id: lead.id }, 502);
}

// Cualquier otro método (GET, etc.) → 405. El POST lo atiende onRequestPost.
export const onRequest = () => json({ ok: false, error: 'method' }, 405);

// ───────────────────────── helpers ─────────────────────────

function sanitizeAttr(a) {
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'referrer', 'landing_page', 'ga_client_id', 'fbp', 'fbc'];
  const out = {};
  if (a && typeof a === 'object') for (const k of keys) { const v = s(a[k], 500); if (v) out[k] = v; }
  return out;
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const j = await r.json();
    return !!j.success;
  } catch { return true; } // si Turnstile no responde, no se pierde el lead
}

function origenDe(attr) {
  const src = (attr.utm_source || '').toLowerCase();
  if (attr.gclid || attr.gbraid || attr.wbraid || /google|adwords/.test(src)) return K.origen.google;
  if (attr.fbclid || /facebook|instagram|^fb$|^ig$|meta/.test(src)) return K.origen.meta;
  return K.origen.organico;
}

function cf(id, value) {
  return value ? { field_id: id, values: [{ value }] } : null;
}

async function kommoFetch(env, path, init = {}) {
  const base = `https://${env.KOMMO_SUBDOMAIN || 'marketingdiforza'}.kommo.com/api/v4`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(base + path, {
      ...init,
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${env.KOMMO_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) },
    });
    if (r.status === 204) return null;
    const text = await r.text();
    if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} → ${r.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  } finally { clearTimeout(t); }
}

async function findContact(env, lead) {
  const tries = [lead.email];
  const digits = lead.telefono.replace(/\D/g, '');
  if (digits.length >= 8) tries.push(digits.slice(-8)); // últimos 8: evita diferencias de prefijo (54 9 11…)
  for (const q of tries) {
    if (!q) continue;
    const r = await kommoFetch(env, `/contacts?limit=5&query=${encodeURIComponent(q)}`);
    const c = r && r._embedded && r._embedded.contacts && r._embedded.contacts[0];
    if (c) return c.id;
  }
  return null;
}

async function findCompany(env, name) {
  const r = await kommoFetch(env, `/companies?limit=10&query=${encodeURIComponent(name)}`);
  const list = (r && r._embedded && r._embedded.companies) || [];
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const hit = list.find((c) => norm(c.name) === norm(name));
  return hit ? hit.id : null;
}

async function sendToKommo(lead, env) {
  const a = lead.attr;
  const [contactId, companyId] = await Promise.all([findContact(env, lead), findCompany(env, lead.empresa)]);

  // Categoría de interés: la de la landing + las tildadas en el formulario
  const cats = new Set();
  if (LANDING_CAT[lead.landing]) cats.add(K.categoria[LANDING_CAT[lead.landing]]);
  for (const c of lead.categorias) {
    const k = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const [name, id] of Object.entries(K.categoria)) if (k.includes(name)) cats.add(id);
  }

  const trackingFields = [
    cf(K.lead.utm_source, a.utm_source), cf(K.lead.utm_medium, a.utm_medium),
    cf(K.lead.utm_campaign, a.utm_campaign), cf(K.lead.utm_content, a.utm_content),
    cf(K.lead.utm_term, a.utm_term), cf(K.lead.referrer, a.referrer),
    cf(K.lead.gclid, a.gclid), cf(K.lead.fbclid, a.fbclid), cf(K.lead.gclientid, a.ga_client_id),
  ].filter(Boolean);

  const baseFields = [
    cf(K.lead.empresa, lead.empresa),
    cf(K.lead.rubro, lead.rubro),
    cf(K.lead.productos, lead.producto),
    { field_id: K.lead.origen, values: [{ enum_id: origenDe(a) }] },
    cats.size ? { field_id: K.lead.categoria, values: [...cats].map((enum_id) => ({ enum_id })) } : null,
  ].filter(Boolean);

  const contact = contactId ? { id: contactId } : {
    first_name: lead.nombre || lead.empresa,
    custom_fields_values: [
      { field_code: 'EMAIL', values: [{ value: lead.email, enum_code: 'WORK' }] },
      lead.telefono ? { field_code: 'PHONE', values: [{ value: lead.telefono, enum_code: 'WORK' }] } : null,
    ].filter(Boolean),
  };
  const company = companyId ? { id: companyId } : {
    name: lead.empresa,
    custom_fields_values: K.rubroEmpresa[lead.rubro]
      ? [{ field_id: K.company.rubro, values: [{ enum_id: K.rubroEmpresa[lead.rubro] }] }] : undefined,
  };

  const tipoTxt = lead.tipo === 'catalogo' ? 'Catálogo' : 'Cotización';
  const build = (fields) => [{
    name: `Web · ${tipoTxt} · ${lead.empresa}`,
    pipeline_id: K.pipeline,
    status_id: K.status,
    responsible_user_id: K.user,
    custom_fields_values: fields,
    _embedded: {
      tags: [{ name: 'Formulario web' }, { name: tipoTxt }],
      contacts: [contact],
      companies: [company],
    },
  }];

  let res;
  try {
    res = await kommoFetch(env, '/leads/complex', { method: 'POST', body: JSON.stringify(build([...baseFields, ...trackingFields])) });
  } catch (e) {
    // Si Kommo rechaza algún campo de tracking, se reintenta sin ellos (quedan en la nota)
    if (!/→ 4\d\d/.test(e.message)) throw e;
    res = await kommoFetch(env, '/leads/complex', { method: 'POST', body: JSON.stringify(build(baseFields)) });
  }
  const leadId = res && res[0] && res[0].id;
  if (!leadId) throw new Error('complex sin id: ' + JSON.stringify(res).slice(0, 200));

  // Nota con todo el detalle + tarea (no bloquean: si fallan, el lead ya está creado)
  const nota = [
    `📝 Formulario web — ${tipoTxt}`,
    lead.nombre && `Nombre: ${lead.nombre}`,
    `Empresa: ${lead.empresa}`,
    `Email: ${lead.email}`,
    lead.telefono && `Teléfono: ${lead.telefono}`,
    lead.rubro && `Rubro: ${lead.rubro}`,
    lead.producto && `Producto: ${lead.producto}`,
    lead.categorias.length && `Categorías: ${lead.categorias.join(', ')}`,
    lead.mensaje && `Mensaje: ${lead.mensaje}`,
    '',
    `Landing: ${lead.landing || '-'} · Página: ${lead.pagina || '-'}`,
    a.landing_page && `Primera página de la visita: ${a.landing_page}`,
    Object.keys(a).filter((k) => /^utm_|clid|braid/.test(k)).map((k) => `${k}: ${a[k]}`).join(' · '),
    a.referrer && `Referrer: ${a.referrer}`,
    contactId && '(Contacto existente: se vinculó al ya cargado)',
    `ID web: ${lead.id}`,
  ].filter(Boolean).join('\n');

  await Promise.allSettled([
    kommoFetch(env, `/leads/${leadId}/notes`, { method: 'POST', body: JSON.stringify([{ note_type: 'common', params: { text: nota } }]) }),
    kommoFetch(env, '/tasks', {
      method: 'POST',
      body: JSON.stringify([{
        text: lead.tipo === 'catalogo'
          ? `Lead web: descargó el catálogo (${lead.empresa}). Contactar y ofrecer cotización.`
          : `Lead web: pidió cotización (${lead.empresa}). Contactar.`,
        complete_till: venceTarea(lead.tipo),
        entity_id: leadId,
        entity_type: 'leads',
        task_type_id: 1,
        responsible_user_id: K.user,
      }]),
    }),
  ]);
  return leadId;
}

/** Vencimiento de la tarea en horario laboral (L–V 8–17 h, Buenos Aires = UTC-3).
 *  Cotización: 2 h hábiles. Catálogo: fin del día hábil siguiente. */
function venceTarea(tipo) {
  const AR = -3 * 3600e3;
  let t = new Date(Date.now() + AR); // "hora local" expresada en UTC
  const habil = (d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
  const toNextOpen = (d) => {
    d = new Date(d);
    if (d.getUTCHours() >= 17) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(8, 0, 0, 0); }
    if (d.getUTCHours() < 8) d.setUTCHours(8, 0, 0, 0);
    while (!habil(d)) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(8, 0, 0, 0); }
    return d;
  };
  t = toNextOpen(t);
  if (tipo === 'catalogo') {
    t.setUTCDate(t.getUTCDate() + 1);
    while (!habil(t)) t.setUTCDate(t.getUTCDate() + 1);
    t.setUTCHours(17, 0, 0, 0);
  } else {
    const fin = new Date(t); fin.setUTCHours(17, 0, 0, 0);
    t = new Date(t.getTime() + 2 * 3600e3);
    if (t > fin) {
      const resto = t.getTime() - fin.getTime(); // lo que no entra hoy pasa al día hábil siguiente
      t = new Date(toNextOpen(new Date(fin.getTime() + 60e3)).getTime() + resto);
    }
  }
  return Math.floor((t.getTime() - AR) / 1000);
}

// ───────────────────────── Meta CAPI ─────────────────────────

const META_DATASET = '1644320683756405';

async function sha256(v) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Teléfono AR normalizado para Meta (solo dígitos con código de país).
 *  Devuelve variantes con y sin el 9 de celulares para mejorar la coincidencia. */
function phonesAR(tel) {
  let d = (tel || '').replace(/\D/g, '');
  if (!d) return [];
  d = d.replace(/^00/, '');
  if (d.startsWith('54')) d = d.slice(2);
  d = d.replace(/^0/, '');
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.length === 12) {                     // característica + 15 + número (ej. 11 15 5555-1234)
    for (const i of [2, 3, 4]) if (d.slice(i, i + 2) === '15') { d = d.slice(0, i) + d.slice(i + 2); break; }
  }
  if (d.length < 8) return [];
  return ['54' + d, '549' + d];
}

function normName(n) {
  return (n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñ]/g, '');
}

async function sendToMeta(lead, request, env) {
  if (!env.META_CAPI_TOKEN) return { status: 'off' };
  const url = new URL(request.url);
  const staging = /\.pages\.dev$|^localhost$|^127\./.test(url.hostname);
  if (staging && !env.META_TEST_EVENT_CODE) return { status: 'skipped_staging' };

  const a = lead.attr;
  let fbc = a.fbc;
  if (!fbc && a.fbclid) fbc = `fb.1.${Date.now()}.${a.fbclid}`;
  const [first] = (lead.nombre || '').trim().split(/\s+/);
  const user_data = {
    em: [await sha256(lead.email)],
    ph: await Promise.all(phonesAR(lead.telefono).map(sha256)),
    fn: normName(first) ? [await sha256(normName(first))] : undefined,
    country: [await sha256('ar')],
    external_id: [await sha256(lead.email)],
    client_ip_address: request.headers.get('cf-connecting-ip') || undefined,
    client_user_agent: lead.ua || undefined,
    fbp: a.fbp || undefined,
    fbc: fbc || undefined,
  };
  if (!user_data.ph.length) delete user_data.ph;

  const event = {
    event_name: lead.tipo === 'catalogo' ? 'CatalogDownload' : 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    event_id: lead.id,                       // = eventID del píxel (deduplicación)
    action_source: 'website',
    event_source_url: url.origin + (lead.pagina || '/'),
    user_data,
    custom_data: {
      content_category: lead.tipo,
      content_name: lead.landing || undefined,
      lead_type: lead.tipo,
    },
  };
  const body = { data: [event] };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;

  const ver = env.META_API_VERSION || 'v23.0';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${META_DATASET}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 250)}`);
    return { status: 'ok', test: !!env.META_TEST_EVENT_CODE, event: event.event_name };
  } finally { clearTimeout(t); }
}
