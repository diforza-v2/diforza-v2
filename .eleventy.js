// Configuración de 11ty — sitio Diforza
// Fuente: src/  ·  Salida (lo que se publica en Cloudflare Pages): _site/
const path = require("node:path");
const fs = require("node:fs");
const browserslist = require("browserslist");
const { bundleAsync, browserslistToTargets } = require("lightningcss");

const CSS_DIR = path.join("src", "assets", "css");
const targets = browserslistToTargets(browserslist());

module.exports = function (eleventyConfig) {
  // Archivos que se copian tal cual (no se procesan como plantillas)
  eleventyConfig.addPassthroughCopy("src/assets/js");
  eleventyConfig.addPassthroughCopy("src/assets/docs"); // catálogo PDF
  eleventyConfig.addPassthroughCopy("src/assets/fonts"); // fuentes self-hosted (woff2)
  eleventyConfig.addPassthroughCopy("src/img");     // imágenes compartidas
  eleventyConfig.addPassthroughCopy("src/*/img");   // imágenes propias de cada landing
  eleventyConfig.addPassthroughCopy("src/_headers"); // encabezados de Cloudflare Pages (hoy: noindex)
  eleventyConfig.addPassthroughCopy("src/_redirects"); // 301 de TiendaNube → sitio nuevo (doc 20 §6)

  // ---- CSS con Lightning CSS ----
  // Solo se compila main.css (punto de entrada único). El resto son parciales:
  // se incluyen con @import desde main.css y no se publican sueltos.
  eleventyConfig.addTemplateFormats("css");
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: async function (_content, inputPath) {
      if (path.normalize(inputPath) !== path.join(CSS_DIR, "main.css")) return; // parcial → no se publica
      const minify = process.env.ELEVENTY_RUN_MODE === "build";
      return async () => {
        const { code } = await bundleAsync({
          filename: inputPath,
          minify,
          targets,
          drafts: { customMedia: true },
          resolver: {
            read: (file) => fs.readFileSync(file, "utf8"),
          },
        });
        return code.toString();
      };
    },
  });
  eleventyConfig.addWatchTarget("src/assets/");

  // Año para el copyright del footer
  eleventyConfig.addGlobalData("year", () => new Date().getFullYear());

  // Textos de los JSON de landings: [[texto]] → marca de placeholder [VALIDAR]/[PENDIENTE]
  eleventyConfig.addFilter("rich", (s) =>
    s == null ? "" : String(s).replace(/\[\[(.+?)\]\]/g, '<span class="placeholder">$1</span>')
  );


  // Lista de rutas → URLs absolutas (schema.org del catálogo)
  // Lista de objetos → lista de un campo (p. ej. nombres de marcas)
  eleventyConfig.addFilter("pluck", (list, key) => (list || []).map((o) => o[key]));
  // ["A","B","C"] → "A, B y C"
  eleventyConfig.addFilter("listaY", (l) => (!l || !l.length ? "" : l.length === 1 ? l[0] : l.slice(0, -1).join(", ") + " y " + l[l.length - 1]));
  eleventyConfig.addFilter("absUrls", (list, base) => (list || []).map((u) => (base || "") + u));

  // ---- SEO (doc 20 §5) ----
  // Título: "<texto> | Diforza" si entra en 60 caracteres; si no, solo el texto (Google corta ~60).
  eleventyConfig.addFilter("seoTitle", (t) => {
    t = String(t || "").trim();
    return (t + " | Diforza").length <= 60 ? t + " | Diforza" : t;
  });
  // Meta description: espacios normalizados y recorte en palabra completa (máx. 158 + "…").
  eleventyConfig.addFilter("clip", (t, max = 158) => {
    t = String(t || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "…";
  });
  // URL absoluta a partir de una ruta del sitio ("/x/" → "https://www.diforza.com.ar/x/").
  eleventyConfig.addFilter("abs", (u, base) => (!u ? "" : /^https?:/.test(u) ? u : (base || "") + u));
  // Fecha ISO (yyyy-mm-dd) para el sitemap.
  eleventyConfig.addFilter("isoDate", (d) => new Date(d || Date.now()).toISOString().slice(0, 10));

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
