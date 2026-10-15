/* Catálogo online (/productos/).
   1) Ficha de producto — variantes: cambian foto, nombre, ficha técnica y el mensaje de WhatsApp; ?v=<n> en la URL.
      Galería: miniaturas que cambian la foto principal.
   2) Listados (catálogo, línea, subcategoría) — buscador, filtros (categoría, marca, color) con contadores,
      orden y "Ver más" de a 24. Estado en la URL (?q=&sub=&marca=&color=&orden=) para compartir links. */
(function(){
  var pdp = document.querySelector('[data-js="pdp"]');
  if (!pdp) return;
  var img = pdp.querySelector('[data-js="pdp-img"]');
  var gen = pdp.querySelector('[data-js="pdp-gen"]');
  var name = pdp.querySelector('[data-js="pdp-var-name"]');
  var wa = pdp.querySelector('[data-js="wa-producto"]');
  var ficha = pdp.querySelector('[data-js="pdp-ficha"]');
  var thumbs = Array.prototype.slice.call(pdp.querySelectorAll('[data-js="pdp-thumb"]'));
  var vars = Array.prototype.slice.call(pdp.querySelectorAll('[data-js="pdp-variant"]'));

  function show(src, isGen){
    if (!img || !src) return;
    if (img.getAttribute('src') !== src){
      img.classList.add('is-loading');
      var pre = new Image();
      pre.onload = pre.onerror = function(){ img.src = src; img.classList.remove('is-loading'); };
      pre.src = src;
    }
    if (gen) gen.hidden = !isGen;
    thumbs.forEach(function(t){
      var on = t.getAttribute('data-src') === src;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
    });
  }

  thumbs.forEach(function(t){
    t.addEventListener('click', function(){
      var v = vars.filter(function(b){ return b.getAttribute('data-foto') === t.getAttribute('data-src'); })[0];
      show(t.getAttribute('data-src'), v ? v.getAttribute('data-gen') === 'si' : false);
    });
  });

  function select(btn, push){
    vars.forEach(function(b){
      var on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (name) name.textContent = btn.getAttribute('data-name');
    if (wa) wa.href = btn.getAttribute('data-wa');
    var f = btn.getAttribute('data-ficha');
    if (ficha && f) ficha.href = f;
    if (img) img.alt = img.alt.split(' — ')[0] + ' — ' + btn.getAttribute('data-name');
    show(btn.getAttribute('data-foto'), btn.getAttribute('data-gen') === 'si');
    if (push && window.history && history.replaceState){
      var u = new URL(location.href);
      u.searchParams.set('v', btn.getAttribute('data-v'));
      history.replaceState(null, '', u);
    }
  }
  vars.forEach(function(b){ b.addEventListener('click', function(){ select(b, true); }); });

  // Variante desde la URL (?v=2)
  var q = new URLSearchParams(location.search).get('v');
  if (q){
    var b = vars.filter(function(x){ return x.getAttribute('data-v') === q; })[0];
    if (b) select(b, false);
  }

  // Medición: clic en la ficha técnica
  if (ficha) ficha.addEventListener('click', function(){
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'ficha_tecnica', prod_id: ficha.getAttribute('data-prod-id'), file_name: (ficha.getAttribute('href') || '').split('/').pop(), page_path: location.pathname });
  });
})();

(function(){
  var root = document.querySelector('[data-js="catalog"]');
  if (!root) return;
  var PAGE = 24;
  var grid = root.querySelector('[data-js="cat-grid"]');
  var items = Array.prototype.slice.call(grid.querySelectorAll('[data-js="cat-item"]'));
  var panel = root.querySelector('[data-js="cat-filters"]');
  var scrim = root.querySelector('.catalog-filters__scrim');
  var openBtn = root.querySelector('[data-js="cat-filters-open"]');
  var countEl = root.querySelector('[data-js="cat-count"]');
  var countWord = root.querySelector('[data-js="cat-count-word"]');
  var countBtn = root.querySelector('[data-js="cat-count-btn"]');
  var badge = root.querySelector('[data-js="cat-badge"]');
  var chips = root.querySelector('[data-js="cat-chips"]');
  var empty = root.querySelector('[data-js="cat-empty"]');
  var more = root.querySelector('[data-js="cat-more"]');
  var sort = root.querySelector('[data-js="cat-sort"]');
  var search = document.querySelector('[data-js="cat-search"]');
  var qInput = search ? search.querySelector('input[name="q"]') : null;
  var boxes = Array.prototype.slice.call(root.querySelectorAll('.catalog-filters input[type="checkbox"]'));
  var shown = PAGE;

  var norm = function(s){ return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  var KEY = { sub: 's', marca: 'm', color: 'c' };

  function state(){
    var st = { q: qInput ? norm(qInput.value) : '', sub: [], marca: [], color: [] };
    boxes.forEach(function(b){ if (b.checked) st[b.name].push(b.value); });
    return st;
  }
  function has(el, attr, vals){
    if (!vals.length) return true;
    var own = (el.getAttribute('data-' + attr) || '').split(' ');
    return vals.some(function(v){ return own.indexOf(v) > -1; });
  }
  function matchQ(el, q){
    if (!q) return true;
    var t = el.getAttribute('data-t') || '';
    return q.split(/\s+/).every(function(w){ return t.indexOf(w) > -1; });
  }
  // Coincide con todo menos la faceta `skip` (para los contadores de esa faceta)
  function match(el, st, skip){
    if (!matchQ(el, st.q)) return false;
    for (var f in KEY){ if (f !== skip && !has(el, KEY[f], st[f])) return false; }
    return true;
  }

  function sortItems(){
    var o = sort ? sort.value : 'vendidos';
    var arr = items.slice();
    if (o === 'az' || o === 'za'){
      arr.sort(function(a, b){ return a.getAttribute('data-n').localeCompare(b.getAttribute('data-n'), 'es'); });
      if (o === 'za') arr.reverse();
    } else {
      arr.sort(function(a, b){ return a.getAttribute('data-i') - b.getAttribute('data-i'); });
    }
    arr.forEach(function(el){ grid.appendChild(el); });
    items = arr;
  }

  function label(name, val){
    var b = boxes.filter(function(x){ return x.name === name && x.value === val; })[0];
    if (!b) return val;
    var l = b.parentNode.querySelector('.catalog-check__label, .visually-hidden');
    return l ? l.textContent : val;
  }

  function render(resetPage){
    if (resetPage) shown = PAGE;
    var st = state();
    var list = items.filter(function(el){ return match(el, st); });
    items.forEach(function(el){ el.hidden = true; });
    list.forEach(function(el, i){ el.hidden = i >= shown; });
    var n = list.length;
    countEl.textContent = n;
    countWord.textContent = n === 1 ? 'producto' : 'productos';
    if (countBtn) countBtn.textContent = n;
    empty.hidden = n > 0;
    more.hidden = n <= shown;
    if (!more.hidden) more.textContent = 'Ver más productos (' + (n - shown) + ')';

    // Contadores por faceta (teniendo en cuenta las demás)
    boxes.forEach(function(b){
      var c = items.filter(function(el){ return match(el, st, b.name) && has(el, KEY[b.name], [b.value]); }).length;
      var nEl = b.parentNode.querySelector('[data-n]');
      if (nEl) nEl.textContent = c;
      b.parentNode.classList.toggle('is-empty', c === 0 && !b.checked);
    });

    // Chips de filtros activos
    var act = [];
    if (st.q) act.push({ k: 'q', v: qInput.value.trim(), t: '“' + qInput.value.trim() + '”' });
    ['sub', 'marca', 'color'].forEach(function(f){ st[f].forEach(function(v){ act.push({ k: f, v: v, t: label(f, v) }); }); });
    chips.innerHTML = '';
    act.forEach(function(a){
      var c = document.createElement('button');
      c.type = 'button'; c.className = 'catalog-chip';
      c.innerHTML = '<span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      c.firstChild.textContent = a.t;
      c.setAttribute('aria-label', 'Quitar filtro ' + a.t);
      c.addEventListener('click', function(){
        if (a.k === 'q') qInput.value = '';
        else boxes.forEach(function(b){ if (b.name === a.k && b.value === a.v) b.checked = false; });
        update();
      });
      chips.appendChild(c);
    });
    if (act.length > 1){
      var cl = document.createElement('button');
      cl.type = 'button'; cl.className = 'catalog-chip catalog-chip--clear'; cl.textContent = 'Limpiar todo';
      cl.addEventListener('click', clearAll);
      chips.appendChild(cl);
    }
    chips.hidden = !act.length;
    var nf = st.sub.length + st.marca.length + st.color.length;
    if (badge){ badge.hidden = !nf; badge.textContent = nf; }
    return st;
  }

  function toUrl(st){
    if (!window.history || !history.replaceState) return;
    var u = new URL(location.href);
    ['q', 'sub', 'marca', 'color', 'orden'].forEach(function(k){ u.searchParams.delete(k); });
    if (st.q) u.searchParams.set('q', qInput.value.trim());
    ['sub', 'marca', 'color'].forEach(function(f){ if (st[f].length) u.searchParams.set(f, st[f].join(',')); });
    if (sort && sort.value !== 'vendidos') u.searchParams.set('orden', sort.value);
    history.replaceState(null, '', u);
  }
  var tSearch = null;
  function update(){ toUrl(render(true)); }
  var lastQ = '', tQ;
  function trackSearch(){
    var q = qInput ? qInput.value.trim() : '';
    if (q.length < 3 || q === lastQ) return;
    lastQ = q;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'search', search_term: q, results: parseInt(countEl.textContent, 10) || 0, page_path: location.pathname });
  }
  function track(st){
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'catalog_filter', search_term: st.q || undefined, filtros: ['sub', 'marca', 'color'].map(function(f){ return st[f].join('|'); }).join(';'), page_path: location.pathname });
  }
  function clearAll(){
    boxes.forEach(function(b){ b.checked = false; });
    if (qInput) qInput.value = '';
    update();
  }

  // Estado inicial desde la URL
  var params = new URLSearchParams(location.search);
  if (qInput && params.get('q')) qInput.value = params.get('q');
  ['sub', 'marca', 'color'].forEach(function(f){
    var vals = (params.get(f) || '').split(',').filter(Boolean);
    boxes.forEach(function(b){ if (b.name === f && vals.indexOf(b.value) > -1) b.checked = true; });
  });
  if (sort && params.get('orden')) sort.value = params.get('orden');
  sortItems();
  render(true);

  boxes.forEach(function(b){ b.addEventListener('change', function(){ update(); track(state()); }); });
  if (sort) sort.addEventListener('change', function(){ sortItems(); update(); });
  if (search){
    search.addEventListener('submit', function(e){
      e.preventDefault(); update(); track(state()); trackSearch();
      var top = root.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) || 80) - 12;
      if (window.scrollY < top - 200) window.scrollTo({ top: top, behavior: 'smooth' });
      if (qInput) qInput.blur();
    });
    if (qInput) qInput.addEventListener('input', function(){
      clearTimeout(tSearch); tSearch = setTimeout(update, 180);
      clearTimeout(tQ); tQ = setTimeout(trackSearch, 1500);
    });
  }
  root.querySelectorAll('[data-js="cat-clear"]').forEach(function(b){ b.addEventListener('click', clearAll); });
  more.addEventListener('click', function(){
    var first = items.filter(function(el){ return el.hidden; })[0];
    shown += PAGE; render(false);
    var a = first && !first.hidden ? first.querySelector('a') : null;
    if (a) a.focus({ preventScroll: true });
  });
  root.querySelectorAll('[data-js="facet-more"]').forEach(function(b){
    b.addEventListener('click', function(){ b.closest('.catalog-facet').classList.remove('is-collapsed'); });
  });

  // Panel de filtros (mobile/tablet)
  function setPanel(open){
    panel.classList.toggle('is-open', open);
    if (scrim) scrim.hidden = !open;
    document.documentElement.classList.toggle('has-filters', open);
    if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open){ var f = panel.querySelector('input, button'); if (f) f.focus({ preventScroll: true }); }
    else if (openBtn && window.matchMedia('(max-width: 1023px)').matches) openBtn.focus({ preventScroll: true });
  }
  if (openBtn) openBtn.addEventListener('click', function(){ setPanel(true); });
  root.querySelectorAll('[data-js="cat-filters-close"]').forEach(function(b){ b.addEventListener('click', function(){ setPanel(false); }); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && panel.classList.contains('is-open')) setPanel(false); });
})();
