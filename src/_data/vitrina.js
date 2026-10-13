// Vitrina de productos: arma los datos listos para la tarjeta de producto
// (partials/product-card.njk) a partir de las fuentes únicas:
//   productos.json (fichas curadas + destacados) · colores.json · categorias.json · site.json (WhatsApp)
// Uso en plantillas: vitrina.indumentaria / vitrina.calzado / vitrina.epp → lista de tarjetas en orden.
const productos = require("./productos.json");
const { colores } = require("./colores.json");
const { categorias } = require("./categorias.json");
const site = require("./site.json");

// id de subcategoría → nombre visible (badge)
const subcats = {};
for (const c of categorias) for (const s of c.subcategorias) subcats[s.id] = s.nombre;

const porId = Object.fromEntries(productos.productos.map((p) => [p.id, p]));
// Fichas del catálogo online (/productos/<id>/): solo productos visibles
const enCatalogo = new Set(require("./catalogo.json").productos.filter((p) => p.visible).map((p) => p.id));

function waUrl(p) {
  const ref = p.codigo ? ` (${p.codigo})` : "";
  const text = `Hola, quiero cotizar ${p.nombre}${ref} para mi empresa.`;
  return `https://wa.me/${site.whatsapp.number}?text=${encodeURIComponent(text)}`;
}

function atributos(p) {
  return (p.atributos || []).map((a) => {
    if (a.tipo === "colores") {
      const lista = a.valores.map((id) => colores[id]).filter(Boolean);
      return {
        tipo: "colores",
        puntos: lista.slice(0, 5),
        extra: Math.max(0, lista.length - 5),
        texto: lista.length > 1 ? `${lista.length} colores` : lista[0] ? lista[0].nombre : "",
        titulo: lista.map((c) => c.nombre).join(", "),
      };
    }
    if (a.tipo === "talles") return { tipo: "talles", texto: a.valor.replace(/ al /g, "–") };
    return { tipo: "texto", texto: a.valor };
  });
}

function tarjeta(id) {
  const p = porId[id];
  if (!p) throw new Error(`vitrina: el destacado "${id}" no existe en productos.json`);
  return {
    id: p.id,
    nombre: p.nombre,
    marca: p.marca,
    codigo: p.codigo,
    descripcion: p.descripcion,
    subcategoria: subcats[p.subcategoria] || "",
    foto: p.foto && p.foto.src ? p.foto.src : null,
    fotoProvisoria: Boolean(p.foto && p.foto.estado === "provisoria"),
    masVendido: Boolean(p.masVendido),
    // Indumentaria de fabricación propia: se personaliza con el logo del cliente
    personalizable: p.linea === "indumentaria" && p.marca === "Diforza",
    atributos: atributos(p),
    wa: waUrl(p),
    url: p.catalogoId && enCatalogo.has(p.catalogoId) ? `/productos/${p.catalogoId}/` : null,
  };
}

const vitrina = {};
for (const [linea, ids] of Object.entries(productos.destacados)) {
  if (Array.isArray(ids)) vitrina[linea] = ids.map(tarjeta);
}
module.exports = vitrina;
