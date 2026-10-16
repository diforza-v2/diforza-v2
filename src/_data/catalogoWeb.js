// Catálogo online (/productos/): arma todo lo que necesitan las páginas a partir de las fuentes únicas
//   catalogo.json (productos) · categorias.json (líneas y subcategorías) · colores.json · site.json (WhatsApp)
// Salida (catalogoWeb.*):
//   productos     → productos visibles, listos para la ficha (/productos/<id>/) y la tarjeta (p.card)
//   lineas        → 3 líneas con sus subcategorías (solo las que tienen productos), para /productos/<linea>/
//   subcategorias → lista plana para /productos/<linea>/<subcategoria>/
//   facetas       → filtros del catálogo completo (cada línea y subcategoría trae las suyas)
const { productos: TODOS } = require("./catalogo.json");
const { categorias } = require("./categorias.json");
const { colores } = require("./colores.json");
const site = require("./site.json");
const { subcategorias: ORDEN } = require("./orden.json");

const BASE = "/productos";
const urlProducto = (id) => `${BASE}/${id}/`;
const urlLinea = (l) => `${BASE}/${l}/`;
const urlSub = (l, s) => `${BASE}/${l}/${s}/`;

// id de subcategoría → { nombre, linea }
const SUBS = {};
for (const c of categorias) for (const s of c.subcategorias) SUBS[s.id] = { ...s, linea: c.id, lineaNombre: c.nombre };

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const talles = (t) => (!t || t === "—" ? null : t.replace(/ al /g, "–"));
const ventas = (p) => (p.ventasEneJun2026 && p.ventasEneJun2026.unidades) || 0;
const empresas = (p) => (p.ventasEneJun2026 && p.ventasEneJun2026.empresas) || 0;

function wa(nombre, variante, codigo) {
  const v = variante ? ` (${variante})` : "";
  const c = codigo ? ` — cód. ${codigo}` : "";
  const text = `Hola, quiero cotizar ${nombre}${v}${c} para mi empresa.`;
  return `https://wa.me/${site.whatsapp.number}?text=${encodeURIComponent(text)}`;
}

const visibles = TODOS.filter((p) => p.visible && SUBS[p.subcategoria]);

// "Más vendido": los 3 primeros de cada subcategoría por empresas que lo compran (mínimo 5 empresas)
const masVendidos = new Set();
for (const sub of Object.keys(SUBS)) {
  visibles
    .filter((p) => p.subcategoria === sub && empresas(p) >= 5)
    .sort((a, b) => empresas(b) - empresas(a) || ventas(b) - ventas(a))
    .slice(0, 3)
    .forEach((p) => masVendidos.add(p.id));
}

function variantes(p) {
  const vs = p.variantes && p.variantes.length ? p.variantes : [{ color: (p.colores || [])[0], foto: p.foto }];
  return vs.map((v, i) => {
    const col = colores[v.color] || null;
    const nombreColor = v.colorFabricante || (col && col.nombre) || "";
    // La etiqueta (clase, gramaje, montaje…) manda; si coincide con el color no se repite.
    const etiqueta = v.etiqueta && v.etiqueta !== nombreColor ? v.etiqueta : null;
    const nombre = etiqueta && col && p.colores && new Set(p.colores).size > 1 ? `${col.nombre} · ${etiqueta}` : etiqueta || nombreColor;
    return {
      i,
      slug: String(i + 1),
      color: v.color,
      hex: col ? col.hex : null,
      colorNombre: col ? col.nombre : nombreColor,
      nombre,
      etiqueta,
      foto: v.foto || p.foto || null,
      fotoGenerada: Boolean(v.fotoGenerada),
      ficha: v.fichaTecnica || p.fichaTecnica || null,
      wa: wa(p.nombreWeb || p.nombre, vs.length > 1 ? nombre : null, (p.codigosERP || [])[0]),
    };
  });
}

function atributosCard(p, vars) {
  const out = [];
  const cols = [...new Set((p.colores || []).filter((c) => colores[c]))].map((c) => colores[c]);
  if (cols.length > 1) {
    out.push({ tipo: "colores", puntos: cols.slice(0, 5), extra: Math.max(0, cols.length - 5), texto: `${cols.length} colores`, titulo: cols.map((c) => c.nombre).join(", ") });
  }
  const etqs = [...new Set(vars.map((v) => v.etiqueta).filter(Boolean))];
  if (etqs.length > 1) out.push({ tipo: "texto", texto: `${etqs.length} versiones` });
  const t = talles(p.talles);
  if (t && !/^Único/.test(t) && out.length < 2) out.push({ tipo: "talles", texto: t });
  return out;
}

const productos = visibles.map((p) => {
  const sub = SUBS[p.subcategoria];
  const vars = variantes(p);
  const nombre = p.nombreWeb || p.nombre;
  const fotos = [...new Set([...vars.map((v) => v.foto), ...(p.galeria || [])].filter(Boolean))];
  const tambienEn = (p.tambienEn || []).filter((s) => SUBS[s] && s !== p.subcategoria);
  const specs = Object.entries(p.specs || {})
    .filter(([, v]) => v)
    .map(([k, v]) => ({ k: k.charAt(0).toUpperCase() + k.slice(1), v }));
  const out = {
    id: p.id,
    url: urlProducto(p.id),
    nombre,
    marca: p.marca,
    lineaMarca: p.lineaMarca && !/distribuidor/i.test(p.lineaMarca) ? p.lineaMarca : null,
    distribuidor: p.lineaMarca && /distribuidor/i.test(p.lineaMarca) ? p.lineaMarca.replace(/\s*\(distribuidor\)/i, "") : null,
    linea: { id: sub.linea, nombre: sub.lineaNombre, url: urlLinea(sub.linea) },
    sub: { id: p.subcategoria, nombre: sub.nombre, url: urlSub(sub.linea, p.subcategoria) },
    tambienEn: tambienEn.map((s) => ({ id: s, nombre: SUBS[s].nombre, url: urlSub(SUBS[s].linea, s), linea: SUBS[s].linea })),
    descripcion: p.descripcion || "",
    descripcionLarga: p.descripcionLarga || "",
    beneficios: p.beneficios || [],
    usos: p.usos || [],
    specs,
    talles: talles(p.talles),
    codigo: (p.codigosERP || [])[0] || null,
    variantes: vars,
    hayColores: new Set(vars.map((v) => v.color)).size > 1,
    fotos,
    ficha: vars.find((v) => v.ficha) ? vars.find((v) => v.ficha).ficha : null,
    masVendido: masVendidos.has(p.id),
    personalizable: sub.linea === "indumentaria" && p.marca === "Diforza",
    ventas: ventas(p),
    empresas: empresas(p),
  };
  out.card = {
    id: p.id,
    url: out.url,
    nombre,
    marca: p.marca,
    codigo: out.codigo,
    descripcion: out.descripcion,
    subcategoria: sub.nombre,
    foto: vars[0].foto,
    masVendido: out.masVendido,
    personalizable: out.personalizable,
    atributos: atributosCard(p, vars),
    wa: wa(nombre, null, out.codigo),
  };
  return out;
});

// Orden por defecto (16 oct): agrupado según orden.json (líneas y subcategorías en el orden de categorias.json;
// dentro de cada subcategoría, el orden curado). Lo que no figure en orden.json va al final, por ventas y A–Z.
const porVentas = (a, b) => b.empresas - a.empresas || b.ventas - a.ventas || a.nombre.localeCompare(b.nombre, "es");
const POS_SUB = {};
categorias.forEach((c, li) => c.subcategorias.forEach((s, si) => (POS_SUB[s.id] = li * 100 + si)));
const posEn = (p, sid) => {
  const i = (ORDEN[sid] || []).indexOf(p.id);
  return i < 0 ? 9999 : i;
};
// Ordena una lista según la subcategoría con la que cada producto aparece en ese listado (subcat propia, o la de tambienEn si se pide una)
function ordenarEn(items, subDe) {
  return items.sort((a, b) => {
    const sa = subDe(a), sb = subDe(b);
    return POS_SUB[sa] - POS_SUB[sb] || posEn(a, sa) - posEn(b, sb) || porVentas(a, b);
  });
}
ordenarEn(productos, (p) => p.sub.id);
const porId = Object.fromEntries(productos.map((p) => [p.id, p]));

// Relacionados: misma subcategoría (y las de tambienEn), hasta 8
for (const p of productos) {
  const subs = new Set([p.sub.id, ...p.tambienEn.map((t) => t.id)]);
  p.relacionados = productos.filter((q) => q.id !== p.id && (subs.has(q.sub.id) || q.tambienEn.some((t) => subs.has(t.id)))).slice(0, 8).map((q) => q.card);
}

const enSub = (sid) => ordenarEn(productos.filter((p) => p.sub.id === sid || p.tambienEn.some((t) => t.id === sid)), () => sid);

// Facetas de un listado: subcategorías, marcas y colores presentes (con cantidad), para los filtros
const slug = (t) => sinTildes(t).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
function facetas(items, soloLinea) {
  const cuenta = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const subs = cuenta(items.flatMap((p) => [p.sub.id, ...p.tambienEn.map((t) => t.id)]));
  const marcas = cuenta(items.map((p) => p.marca));
  const cols = cuenta(items.flatMap((p) => [...new Set(p.variantes.map((v) => v.color).filter((c) => colores[c]))]));
  return {
    subcategorias: categorias.filter((c) => !soloLinea || c.id === soloLinea).flatMap((c) => c.subcategorias.filter((s) => subs.has(s.id)).map((s) => ({ id: s.id, nombre: s.nombre, linea: c.id, lineaNombre: c.nombre, n: subs.get(s.id) }))),
    marcas: [...marcas].map(([m, n]) => ({ id: slug(m), nombre: m, n })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es")),
    colores: [...cols].map(([c, n]) => ({ id: c, nombre: colores[c].nombre, hex: colores[c].hex, n })).sort((a, b) => b.n - a.n),
  };
}
for (const p of productos) {
  p.filtro = {
    l: p.linea.id,
    s: [p.sub.id, ...p.tambienEn.map((t) => t.id)].join(" "),
    m: slug(p.marca),
    c: [...new Set(p.variantes.map((v) => v.color).filter(Boolean))].join(" "),
    t: sinTildes([p.nombre, p.marca, p.lineaMarca, p.distribuidor, p.sub.nombre, p.descripcion, ...p.usos, ...((TODOS.find((x) => x.id === p.id) || {}).codigosERP || [])].filter(Boolean).join(" ")),
  };
}

const subcategorias = [];
const lineas = categorias.map((c) => {
  const subs = c.subcategorias
    .map((s) => {
      const items = enSub(s.id);
      if (!items.length) return null;
      const portada = items.find((p) => p.fotos.length) || items[0];
      const o = { id: s.id, nombre: s.nombre, incluye: s.incluye || "", linea: { id: c.id, nombre: c.nombre, url: urlLinea(c.id), landing: c.href }, url: urlSub(c.id, s.id), total: items.length, portada: portada.fotos[0] || null, productos: items, facetas: facetas(items) };
      subcategorias.push(o);
      return o;
    })
    .filter(Boolean);
  // En la página de la línea, un producto de otra línea (tambienEn) se ubica en su subcategoría de esta línea
  const items = ordenarEn(
    productos.filter((p) => p.linea.id === c.id || p.tambienEn.some((t) => t.linea === c.id)),
    (p) => (p.linea.id === c.id ? p.sub.id : p.tambienEn.find((t) => t.linea === c.id).id)
  );
  return { id: c.id, nombre: c.nombre, landing: c.href, portadas: subs.map((x) => x.portada).filter(Boolean).slice(0, 3), url: urlLinea(c.id), total: items.length, subcategorias: subs, productos: items, facetas: facetas(items, c.id) };
});


// Categorías hermanas (pie de la página de subcategoría)
for (const l of lineas) for (const sc of l.subcategorias) sc.hermanas = l.subcategorias.filter((h) => h.id !== sc.id).map((h) => ({ nombre: h.nombre, url: h.url, total: h.total }));

module.exports = { base: BASE, productos, porId, lineas, subcategorias, facetas: facetas(productos), total: productos.length };
