(function(){
  // Envío de formularios a /api/lead (Function de Cloudflare Pages → Kommo).
  // 1) Atribución: guarda UTM / gclid / fbclid de la última visita con
  //    parámetros (90 días) y la primera página + referrer de la sesión.
  // 2) window.DifLead.send(form): arma el JSON del formulario + atribución,
  //    envía con timeout de 8 s y 1 reintento. Devuelve Promise<{ok,id}>.
  // 3) window.DifLead.waFallback(data): link de WhatsApp con los datos en
  //    texto, para cuando el envío falla (doc 17 §19).
  var ATTR_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','fbclid'];
  var LS_KEY = 'dif-attr', SS_KEY = 'dif-visit', TTL = 90 * 864e5;
  function get(store, k){ try { return JSON.parse(window[store].getItem(k) || 'null'); } catch(e){ return null; } }
  function set(store, k, v){ try { window[store].setItem(k, JSON.stringify(v)); } catch(e){} }
  try {
    var q = new URLSearchParams(location.search), found = {}, any = false;
    ATTR_KEYS.forEach(function(k){ var v = q.get(k); if (v){ found[k] = v.slice(0, 300); any = true; } });
    if (any){ found.ts = Date.now(); set('localStorage', LS_KEY, found); }
    if (!get('sessionStorage', SS_KEY)){
      var ref = document.referrer && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : '';
      set('sessionStorage', SS_KEY, { landing_page: location.pathname + location.search, referrer: ref });
    }
  } catch(e){}

  function cookie(n){ var m = document.cookie.match('(?:^|; )' + n + '=([^;]*)'); return m ? decodeURIComponent(m[1]) : ''; }
  function attribution(){
    var a = {}, saved = get('localStorage', LS_KEY), visit = get('sessionStorage', SS_KEY) || {};
    if (saved && Date.now() - (saved.ts || 0) < TTL) ATTR_KEYS.forEach(function(k){ if (saved[k]) a[k] = saved[k]; });
    if (visit.landing_page) a.landing_page = visit.landing_page;
    if (visit.referrer) a.referrer = visit.referrer;
    var ga = cookie('_ga').split('.'); if (ga.length >= 4) a.ga_client_id = ga.slice(-2).join('.');
    if (cookie('_fbp')) a.fbp = cookie('_fbp');
    if (cookie('_fbc')) a.fbc = cookie('_fbc');
    return a;
  }
  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function collect(form){
    var fd = new FormData(form), data = { categorias: [] };
    fd.forEach(function(v, k){
      if (typeof v !== 'string') return;
      if (k === 'consentimiento') data[k] = true;
      else if (form.querySelectorAll('[name="' + k + '"][type=checkbox]').length) data.categorias.push(v);
      else data[k] = v;
    });
    if (!data.pagina) data.pagina = location.pathname;
    data.attr = attribution();
    data.event_id = uuid();
    return data;
  }
  function post(data, keepalive){
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl && setTimeout(function(){ ctrl.abort(); }, 8000);
    return fetch('/api/lead', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data), keepalive: !!keepalive, signal: ctrl ? ctrl.signal : undefined
    }).then(function(r){
      if (t) clearTimeout(t);
      return r.json().catch(function(){ return {}; }).then(function(j){
        if (r.ok && j.ok) return j;
        var err = new Error(j.error || ('http_' + r.status)); err.status = r.status; err.fields = j.fields; throw err;
      });
    });
  }
  function send(form, opts){
    opts = opts || {};
    var data = collect(form);
    var p = post(data, opts.keepalive).catch(function(err){
      if (err.status && err.status < 500) throw err;            // validación/captcha: no se reintenta
      return new Promise(function(res){ setTimeout(res, 1200); }).then(function(){ return post(data, opts.keepalive); });
    }).then(function(j){ j.data = data; return j; }, function(err){ err.data = data; throw err; });
    p.eventId = data.event_id;   // mismo id para GTM (deduplicación pixel/CAPI)
    return p;
  }
  function waFallback(data){
    var num = (window.SITE && window.SITE.whatsapp) || '5491163513333';
    var lines = ['Hola, quise enviar el formulario de la web y no se pudo. Mis datos:'];
    [['Nombre','nombre'],['Empresa','empresa'],['Email','email'],['Teléfono','telefono'],['Rubro','rubro'],['Producto','producto_interes'],['Mensaje','mensaje']]
      .forEach(function(p){ if (data && data[p[1]]) lines.push(p[0] + ': ' + data[p[1]]); });
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(lines.join('\n'));
  }
  window.DifLead = { send: send, attribution: attribution, waFallback: waFallback };
})();

(function(){
  // Header: transparente sobre el hero, navy solido al scrollear.
  var header = document.getElementById('siteHeader');
  if (header){
    var hero = document.querySelector('[data-js="hero"]');
    var onScroll = function(){
      if (window.scrollY > 40) header.classList.add('is-stuck');
      else header.classList.remove('is-stuck');
      // La copia del operario que va sobre el navbar se desvanece apenas
      // arranca el scroll, sincronizada con el navbar tomando fondo solido.
      if (hero) hero.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive:true});

    // Mide cuanto del operario queda por encima del borde inferior del
    // header y se lo pasa al clip-path. Se recalcula en resize porque
    // header y operario cambian de alto por breakpoint.
    // --nav-h: alto real del header publicado como variable CSS. De ahi
    // sale el padding superior del hero, asi el contenido nunca queda
    // detras del navbar en ninguna altura de pantalla.
    var setNavH = function(){
      document.documentElement.style.setProperty('--nav-h', Math.round(header.offsetHeight) + 'px');
    };
    setNavH();
    window.addEventListener('resize', setNavH, {passive:true});
    window.addEventListener('load', setNavH);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(setNavH);

    var over = hero && hero.querySelector('[data-js="hero-worker-over"]');
    var measure = function(){
      setNavH();
      if (!over) return;
      // offsetTop/offsetHeight en vez de getBoundingClientRect: no los afecta
      // el transform de la animacion de entrada, asi la medida es correcta
      // aunque se tome antes de que el operario termine de entrar.
      var cut = header.offsetHeight - over.offsetTop;
      if (!(cut > 4)){ over.setAttribute('data-over','0'); return; }
      over.removeAttribute('data-over');
      over.style.setProperty('--over-h', Math.round(cut) + 'px');
    };
    measure();
    window.addEventListener('resize', measure, {passive:true});
    window.addEventListener('load', measure);
  }
})();
(function(){
  // Dispara la secuencia de entrada del hero recien cuando la imagen del
  // operario esta decodificada, para que ninguna capa aparezca a destiempo.
  // Si algo falla, un timeout de seguridad muestra todo igual.
  var hero = document.querySelector('[data-js="hero"]');
  if (!hero) return;
  var img = hero.querySelector('[data-js="hero-worker"] img');
  var done = false;
  function start(){
    if (done) return;
    done = true;
    requestAnimationFrame(function(){ hero.classList.add('is-ready'); });
  }
  if (img && img.decode){ img.decode().then(start).catch(start); }
  else if (img && !img.complete){ img.addEventListener('load', start); img.addEventListener('error', start); }
  else { start(); }
  setTimeout(function(){ if (!done){ hero.classList.add('no-js'); start(); } }, 2500);
})();
(function(){
  // Scroll-reveal: activa .is-visible la primera vez que el elemento entra en viewport
  if ('IntersectionObserver' in window){
    var revealEls = document.querySelectorAll('.reveal');
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, {threshold: 0.15, rootMargin: '0px 0px -40px 0px'});
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function(el){ el.classList.add('is-visible'); });
  }
})();
(function(){
  // Hace "draggeable" con mouse (y touch nativo) cualquier carrusel con
  // el atributo data-js="drag-carousel" — hoy: los carruseles de productos (home y landings).
  // El scroll no sigue 1 a 1 al cursor: persigue un target con easing (lerp),
  // y al soltar sigue un poco por inercia (momentum) antes de frenar.
  document.querySelectorAll('[data-js="drag-carousel"]').forEach(function(carousel){
    carousel.style.scrollBehavior = 'auto'; // el easing lo maneja el rAF, no el CSS

    var isDown = false, startX = 0, startScrollLeft = 0, moved = false;
    var current = carousel.scrollLeft, target = carousel.scrollLeft;
    var lastX = 0, lastT = 0, velocity = 0, rafId = null;
    var EASE = 0.18;

    function maxScroll(){ return carousel.scrollWidth - carousel.clientWidth; }
    function clamp(v){ return Math.max(0, Math.min(maxScroll(), v)); }

    function loop(){
      current += (target - current) * EASE;
      if (Math.abs(target - current) < 0.5){ current = target; }
      carousel.scrollLeft = current;
      if (current !== target || isDown){
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = null;
      }
    }
    function startLoop(){ if (!rafId) rafId = requestAnimationFrame(loop); }

    function down(x){
      isDown = true; moved = false;
      carousel.classList.add('is-dragging');
      if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
      current = carousel.scrollLeft;
      target = current;
      startX = x;
      startScrollLeft = current;
      lastX = x; lastT = Date.now(); velocity = 0;
    }
    function move(x){
      if(!isDown) return;
      var walk = x - startX;
      if (Math.abs(walk) > 4) moved = true;
      target = clamp(startScrollLeft - walk);
      var now = Date.now();
      var dt = now - lastT;
      if (dt > 0){ velocity = (x - lastX) / dt; } // px por ms
      lastX = x; lastT = now;
      startLoop();
    }
    function up(){
      if(!isDown) return;
      isDown = false;
      carousel.classList.remove('is-dragging');
      // pequeño impulso de inercia proyectado a partir de la velocidad del gesto
      var momentum = -velocity * 180;
      target = clamp(target + momentum);
      startLoop();
    }

    carousel.addEventListener('mousedown', function(e){ down(e.pageX); });
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', function(e){ if(isDown){ e.preventDefault(); move(e.pageX); } });
    carousel.addEventListener('touchstart', function(e){ down(e.touches[0].pageX); }, {passive:true});
    carousel.addEventListener('touchmove', function(e){ move(e.touches[0].pageX); }, {passive:true});
    carousel.addEventListener('touchend', up);
    // evita que un drag termine disparando el click de un link/tarjeta
    carousel.addEventListener('click', function(e){ if(moved){ e.preventDefault(); e.stopPropagation(); } }, true);
  });
})();
(function(){
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if(!toggle || !nav) return;
  toggle.addEventListener('click', function(){
    var isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.textContent = isOpen ? '✕' : '☰';
  });
})();
(function(){
  // Parallax: el fondo del destacado (spotlight) se mueve, el texto queda fijo/normal
  var section = document.querySelector('[data-js="spotlight"]');
  var bg = section ? section.querySelector('[data-js="spotlight-bg"]') : null;
  if (!section || !bg) return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var ticking = false;
  function update(){
    ticking = false;
    var rect = section.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    // progreso: -1 (sector debajo del viewport) .. 1 (sector arriba del viewport)
    var progress = (rect.top + rect.height / 2 - vh / 2) / ((vh + rect.height) / 2);
    progress = Math.max(-1, Math.min(1, progress));
    var shift = progress * 75; // px de recorrido del fondo, texto no se mueve
    bg.style.transform = 'translateY(' + shift.toFixed(1) + 'px)';
  }
  function onScroll(){
    if (!ticking){
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', onScroll);
  update();
})();

(function(){
  // Ventana "Descargar catálogo": la abren todos los links data-js="catalogo".
  // Formulario corto (empresa, email, teléfono opcional) → descarga inmediata del PDF.
  // Si ya lo completó en esta visita, los siguientes clics descargan directo.
  // Los datos van a /api/lead (window.DifLead) → Kommo.
  var modal = document.getElementById('catModal');
  if (!modal || typeof modal.showModal !== 'function') return;
  var form = modal.querySelector('[data-js="catalog-form"]');
  var stepForm = modal.querySelector('[data-js="cat-step-form"]');
  var stepDone = modal.querySelector('[data-js="cat-step-done"]');
  var PDF = (window.SITE && window.SITE.catalogPdf) || '';
  var KEY = 'dif-cat-ok';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var lastTrigger = null;

  function done(){ try { return sessionStorage.getItem(KEY) === '1'; } catch(e){ return false; } }
  function download(){
    if (!PDF) return;
    var a = document.createElement('a');
    a.href = PDF; a.download = PDF.split('/').pop();
    document.body.appendChild(a); a.click(); a.remove();
  }
  function track(ev, extra){
    window.dataLayer = window.dataLayer || [];
    var o = { event: ev, lead_type: 'catalogo', page_path: location.pathname };
    for (var k in extra) o[k] = extra[k];
    window.dataLayer.push(o);
  }
  function open(trigger){
    lastTrigger = trigger || null;
    var already = done();
    stepForm.hidden = already;
    stepDone.hidden = !already;
    modal.showModal();
    document.documentElement.classList.add('has-modal');
    if (already) download();
    else { var f = form.querySelector('input:not([type=hidden]):not([tabindex="-1"])'); if (f) f.focus(); }
    track(already ? 'catalog_redownload' : 'catalog_open', {});
  }
  function close(){ modal.close(); }
  modal.addEventListener('close', function(){
    document.documentElement.classList.remove('has-modal');
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus({preventScroll:true});
  });
  // Clic fuera de la caja (sobre el fondo) cierra
  modal.addEventListener('click', function(e){ if (e.target === modal) close(); });
  modal.querySelector('[data-js="cat-close"]').addEventListener('click', close);

  document.addEventListener('click', function(e){
    var a = e.target.closest('[data-js="catalogo"]');
    if (!a) return;
    e.preventDefault();
    // Si el menú mobile está abierto, se cierra
    var nav = document.getElementById('mainNav');
    var tgl = document.getElementById('navToggle');
    if (nav && nav.classList.contains('is-open') && tgl) tgl.click();
    open(a);
  });

  function valid(el){
    if (el.type === 'checkbox') return !el.required || el.checked;
    var v = (el.value || '').trim();
    if (el.required && !v) return false;
    if (el.type === 'email' && v && !EMAIL.test(v)) return false;
    if (el.type === 'tel' && v && v.replace(/\D/g, '').length < 8) return false;
    return true;
  }
  function check(el){
    var f = el.closest('.field'); var ok = valid(el);
    if (f) f.classList.toggle('is-invalid', !ok);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }
  var inputs = form.querySelectorAll('input:not([type=hidden]):not([name=website])');
  inputs.forEach(function(el){
    el.addEventListener('blur', function(){ check(el); });
    el.addEventListener('input', function(){ var f = el.closest('.field'); if (f && f.classList.contains('is-invalid')) check(el); });
    el.addEventListener('change', function(){ var f = el.closest('.field'); if (f && f.classList.contains('is-invalid')) check(el); });
  });
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var first = null;
    inputs.forEach(function(el){ if (!check(el) && !first) first = el; });
    if (first){ first.focus(); return; }
    var hp = form.querySelector('input[name="website"]');
    if (hp && hp.value) return; // bot
    // El lead se envía en segundo plano (keepalive) y la descarga no espera:
    // si falla, la Function igual lo guarda en el respaldo KV o queda en consola.
    var sent = window.DifLead && window.DifLead.send(form, { keepalive: true });
    if (sent) sent.catch(function(err){ console.warn('[lead] catálogo no enviado', err && err.message); });
    try { sessionStorage.setItem(KEY, '1'); } catch(err){}
    track('generate_lead', { form_id: 'catalogo', event_id: sent ? sent.eventId : undefined });
    stepForm.hidden = true;
    stepDone.hidden = false;
    download();
  });
})();

(function(){
  // Pestañas accesibles (role="tablist" + data-js="tabs"): clic y flechas del teclado.
  document.querySelectorAll('[data-js="tabs"]').forEach(function(list){
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab, focus){
      tabs.forEach(function(t){
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function(t, i){
      t.addEventListener('click', function(){ select(t); });
      t.addEventListener('keydown', function(e){
        var n = null;
        if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') n = tabs[0];
        if (e.key === 'End') n = tabs[tabs.length - 1];
        if (n){ e.preventDefault(); select(n, true); }
      });
    });
  });
})();

(function(){
  // Grilla de productos (partials/product-grid.njk): en tablet/desktop muestra 8
  // tarjetas; "Ver más productos" despliega el resto y lleva el foco a la primera nueva.
  document.querySelectorAll('[data-js="product-grid"]').forEach(function(grid){
    var btn = grid.querySelector('[data-js="show-more"]');
    if (!btn) return;
    btn.addEventListener('click', function(){
      grid.classList.add('is-expanded');
      btn.setAttribute('aria-expanded', 'true');
      var first = grid.querySelector('.product-grid__item--extra a');
      if (first) first.focus({preventScroll: true});
    });
  });
})();
