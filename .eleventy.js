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
  eleventyConfig.addPassthroughCopy("src/img");     // imágenes compartidas
  eleventyConfig.addPassthroughCopy("src/*/img");   // imágenes propias de cada landing

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
