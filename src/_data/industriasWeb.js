// Páginas por industria (/construccion/ …) — PROTOTIPO 26 oct 2026. Resuelve industrias.json contra el catálogo:
// cada grupo trae sus tarjetas (ids no visibles se omiten) y el link "Ver todo" (línea o subcategoría);
// las categorías traen nombre corto, ícono y cantidad (mismos íconos y nombres que la venta cruzada).
const I = require("./industrias.json");
const CRUCE = require("./cruceLineas.json");
const { porId, lineas, subcategorias } = require("./catalogoWeb.js");

const ICONO = { ...CRUCE.puesto.iconos, ...Object.fromEntries(Object.values(CRUCE.lineas).flatMap((c) => c.subs.map(([sid, icono]) => [sid, icono]))) };
const NOMBRE = Object.fromEntries(Object.values(CRUCE.lineas).flatMap((c) => c.subs.map(([sid, , nombre]) => [sid, nombre])));
const SUB = new Map(subcategorias.map((s) => [s.id, s]));
const LINEA = new Map(lineas.map((l) => [l.id, l]));

// BLOQUEO (26 oct): solo se generan las industrias con "publicar": true. Con la variable de entorno
// INDUSTRIAS_BORRADOR=1 se generan todas (vista previa local). Sin industrias publicadas no se crea ninguna página.
const verBorradores = process.env.INDUSTRIAS_BORRADOR === "1";
const lista = I.lista.filter((ind) => ind.publicar === true || verBorradores).map((ind) => ({
  ...ind,
  grupos: ind.grupos.map((g) => {
    const destino = g.link && SUB.has(g.link) ? SUB.get(g.link) : LINEA.get(g.linea);
    return { ...g, items: g.productos.map((id) => porId[id]).filter(Boolean).map((p) => p.card), url: destino.url, total: destino.total, linkTexto: g.link ? `Ver toda la ${(NOMBRE[g.link] || destino.nombre).toLowerCase()} (${destino.total})` : `${CRUCE.lineas[g.linea].cta} (${destino.total})` };
  }),
  categorias: ind.categorias.filter((id) => SUB.has(id)).map((id) => {
    const s = SUB.get(id);
    const unidad = CRUCE.lineas[s.linea.id].unidad;
    return { id, nombre: NOMBRE[id] || s.nombre, url: s.url, icono: ICONO[id], texto: `${s.total} ${s.total === 1 ? unidad.replace(/s$/, "") : unidad}` };
  }),
}));

module.exports = { lista, proximas: I.proximas };
