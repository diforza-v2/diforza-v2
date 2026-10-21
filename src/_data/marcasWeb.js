// Páginas de marca (/marcas/<slug>/): une el contenido de marcas.json con los productos
// visibles de esa marca del catálogo online (catalogoWeb.js), agrupados por subcategoría
// en el orden del catálogo. Producto nuevo de la marca en catalogo.json → aparece solo.
const { lista } = require("./marcas.json");
const catalogoWeb = require("./catalogoWeb.js");

const BASE = "/marcas";

const marcas = lista.map((m) => {
  const items = catalogoWeb.productos.filter((p) => p.marca === m.marca);
  const grupos = [];
  for (const p of items) {
    let g = grupos.find((x) => x.id === p.sub.id);
    if (!g) grupos.push((g = { id: p.sub.id, nombre: p.sub.nombre, url: p.sub.url, productos: [] }));
    g.productos.push(p);
  }
  // Orden de los grupos: el de marcas.json (ordenGrupos) y después el del catálogo
  if (m.ordenGrupos) {
    const pos = (id) => (m.ordenGrupos.indexOf(id) + 1 || 999);
    grupos.sort((a, b) => pos(a.id) - pos(b.id));
  }
  const productos = grupos.flatMap((g) => g.productos);
  const porId = Object.fromEntries(items.map((p) => [p.id, p]));
  const fotos = (m.hero.fotos || [])
    .map((id) => porId[id])
    .filter((p) => p && p.fotos.length)
    .map((p) => ({ src: p.fotos[0], alt: p.nombre, url: p.url }));
  return {
    ...m,
    url: `${BASE}/${m.slug}/`,
    total: items.length,
    productos,
    grupos,
    fotos,
  };
});

// marca (como figura en catalogo.json) → URL de su página, para linkear desde fichas
const url = Object.fromEntries(marcas.map((m) => [m.marca, m.url]));

module.exports = { base: BASE, lista: marcas, url };
