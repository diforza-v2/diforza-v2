# Diforza — sitio y landings

Sitio estático generado con **[11ty (Eleventy)](https://www.11ty.dev/)**. El HTML final es el mismo de siempre (sin frameworks en el navegador); 11ty solo arma las páginas a partir de piezas compartidas.

## Cómo trabajar

```bash
npm install                 # una sola vez (o cuando cambie package.json)
npx playwright install chromium   # una sola vez: navegador para el test visual
npm start                   # servidor local con recarga en vivo → http://localhost:8080
npm run build               # genera _site/ (lo que se publica, CSS minificado)
npm run lint:css            # revisa las convenciones del CSS (Stylelint)
npm run format              # formatea el CSS (Prettier)
npm run test:visual:baseline  # captura el sitio actual como referencia (antes de un cambio)
npm run test:visual           # compara contra la referencia: 0 píxeles distintos = OK
```

> No uses Live Server para este proyecto: mostraría los archivos fuente, no el sitio armado.

## Estructura

```
src/
├─ _data/site.json            ← datos globales: WhatsApp, teléfono, email, dirección, horario, legales, menú, CTAs, catálogo, tienda, redes
├─ _data/home.json            ← contenido de la home: categorías, destacados por línea, FAQ, sección de contacto
├─ _includes/
│  ├─ layouts/base.njk        ← esqueleto de TODAS las páginas (<head>, header, footer, scripts)
│  └─ partials/               ← header, footer, WhatsApp flotante, ventana del catálogo (catalog-modal), datos de contacto y redes (contact-items, social-links), schema FAQ (faq-schema), fuentes, íconos
├─ assets/
│  ├─ css/main.css            ← punto de entrada único (Lightning CSS → un solo main.css minificado)
│  ├─ css/settings/           ← tokens (colores, tipografía, radios, capas) y breakpoints: @media (--lg)
│  ├─ css/base/               ← reset y estilos globales
│  ├─ css/components/         ← piezas reutilizables: botón, badge, formulario, tarjeta de producto…
│  ├─ css/layout/             ← header y footer
│  ├─ css/sections/           ← secciones: compartidas (hero, solve, benefits, faq), home/ y landing/
│  ├─ css/utilities.css       ← utilidades (lista cerrada)
│  └─ js/main.js, landing.js  ← main.js en todas; landing.js en las páginas de categoría
├─ _includes/sections/landing/ ← secciones de la plantilla de landing (hero, trust, products, faq, quote…)
├─ _data/landings/            ← contenido de cada landing (indumentaria.json, epp.json, calzado.json)
├─ img/                       ← imágenes compartidas
├─ assets/docs/               ← catálogo PDF sin precios (lo descarga la ventana del catálogo)
├─ politica-de-privacidad/    ← /politica-de-privacidad/
├─ index.njk                  ← home  →  /
├─ indumentaria-de-trabajo/   ← landing  →  /indumentaria-de-trabajo/
│  ├─ index.njk               ← solo front matter (landingKey: indumentaria)
│  └─ img/                    ← imágenes propias de la landing
├─ epp-proteccion-industrial/ ← landing  →  /epp-proteccion-industrial/
└─ calzado-de-seguridad/      ← landing  →  /calzado-de-seguridad/
_dev/                         ← material de trabajo (PSD, originales, notas, versiones viejas). NO se publica.
_site/                        ← salida del build. NO se edita ni se sube a git.
```

## Reglas

- **Header, footer y WhatsApp se editan en un solo lugar** (`src/_includes/partials/` y `src/_data/site.json`). Nunca copiar ese HTML dentro de una página.
- **Número de WhatsApp:** `src/_data/site.json` → `whatsapp.number`. Lo usan los links, el botón flotante y el JS de "Consultar producto".
- **Landings de categoría = plantilla + datos.** El HTML de cada sección está una sola vez en `src/_includes/sections/landing/` y el contenido de cada landing en `src/_data/landings/<clave>.json`. El `index.njk` de la landing solo tiene el front matter (título SEO, descripción, `landingKey`, `waText`, `catalogName`).
- **Nueva landing (ej. calzado):** copiar `src/_data/landings/epp.json` → `calzado.json` y cambiar textos, productos y fotos; crear `src/<slug>/index.njk` copiando el de EPP con `landingKey: calzado`; fotos en `src/<slug>/img/`; si el hero necesita otro encuadre de foto, agregar el modificador `hero--calzado` en `sections/hero.css`; sumarla al footer en `site.json`.
- **Formato de los textos en los JSON:** `[[texto]]` = marca de pendiente ([VALIDAR]/[PENDIENTE]) que se ve con borde naranja; se permite `<br>` para cortes de línea. Íconos: nombre de `src/_data/icons.json`. Reseñas: por nombre de `src/_data/reviews.json`. Opciones de rubro y tamaño del formulario: `src/_data/landingForm.json`.
- **Campos útiles del JSON:** `confianza.agrupado` (franja con grupo de marcas distribuidas), `lineas.tituloAncho`, ítems de `lineas` con `descripcion` (formato largo), `productos.specs` (iguales para todos) o `specs` por producto, `categoria` del producto (tilda la categoría en el formulario), `cotizacion.campoVariable` (`select` o `chips`), `secciones` (orden/selección de secciones; si no está, va el orden estándar).
- Rutas de imágenes y assets siempre **absolutas** (`/img/...`, `/<slug>/img/...`, `/assets/...`).
- **CSS:** guía práctica en **`_dev/notas/css-guia.md`** (leer antes de tocar estilos); plan y decisiones en `_dev/prompts/refactor-css.md` (BEM en inglés, tokens, capas, breakpoints con nombre). El JS engancha por `data-js="…"`, no por clases de estilo (excepciones: `.reveal`, `.field`). Colores, tamaños de fuente, pesos, radios y z-index **siempre por token** (`settings/tokens.css`; el linter lo exige); en componentes nuevos usar los semánticos (`--color-primary`, `--color-text`…). Regla dura: cero cambio visual (verificar con `npm run test:visual`). Breakpoints: usar los nombres de `src/assets/css/settings/media.css`.
- **CTA principal = WhatsApp** (`site.cta.whatsapp`, texto por página con `waText` en el front matter). **Ventana del catálogo:** cualquier link con `data-js="catalogo"` la abre (lógica en `main.js`); el PDF está en `site.catalogo.pdf`. Eventos al dataLayer: `catalog_open`, `generate_lead` (lead_type=catalogo), `catalog_redownload`.
- **Tienda online:** oculta con `site.tienda.mostrar: false`; con `true` vuelven los links.
- **FAQ:** cada página genera su schema `FAQPage` con `partials/faq-schema.njk` (omite respuestas con `[[…]]` o "a confirmar").
- **Si agregás un archivo nuevo en `src/_data/`, reiniciá `npm start`** (11ty no siempre lo detecta en caliente).
- Lo que no va al sitio (PSD, originales, scripts, notas) va en `_dev/`.

## Publicación (GitHub + Cloudflare Pages)

- Repo: `github.com/diforza-v2/diforza-v2` (organización `diforza-v2`). Se trabaja **directo en `main`**.
- Cada `git push` a `main` publica en **https://diforza.pages.dev** (Cloudflare Pages, proyecto `diforza`).
- Build command: `npm run build` · Output directory: `_site` · Node 22 (`NODE_VERSION=22` y `.nvmrc`).
- `src/_headers` agrega `X-Robots-Tag: noindex` mientras no haya dominio propio: **borrarlo al conectar el dominio**.
- Las ramas que no son `main` publican una vista previa en `https://<rama>.diforza.pages.dev`.
- Detalle, pendientes (dominio, 404, formularios → Kommo) y cómo volver atrás: `../18_infraestructura_y_publicacion.md`.


## ⚠️ Fotos de productos: miniaturas

Después de sumar o cambiar fotos en `src/img/catalogo/`, correr:

```
python _dev/scripts/miniaturas.py
```

Genera `src/img/catalogo/480/` (las usan las tarjetas de producto vía `srcset`). Si falta una miniatura, el build lo avisa (`[miniaturas] FALTA …`) y la tarjeta usa la foto grande.
