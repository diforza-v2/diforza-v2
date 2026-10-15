/* ==========================================================================
   Landing · JS de las páginas de categoría (L2, L3, …). Se carga después de main.js.
   Textos por página: window.SITE.waText (front matter).
   ========================================================================== */
(function(){
  // Marcas [VALIDAR]/[PENDIENTE]: mostrar/ocultar (preferencia por visitante)
  var btn = document.getElementById('phToggle');
  if (!btn) return;
  var root = document.documentElement;
  function apply(off){
    root.classList.toggle('is-placeholders-hidden', off);
    btn.textContent = off ? 'Mostrar marcas' : 'Ocultar marcas';
    btn.setAttribute('aria-pressed', off ? 'true' : 'false');
  }
  var saved = false;
  try { saved = localStorage.getItem('dif-ph-off') === '1'; } catch(e){}
  apply(saved);
  btn.addEventListener('click', function(){
    var off = !root.classList.contains('is-placeholders-hidden');
    apply(off);
    try { localStorage.setItem('dif-ph-off', off ? '1' : '0'); } catch(e){}
  });
})();

(function(){
  // Precarga de producto S5 -> formulario + WhatsApp (doc 17 §17)
  var WA_NUM = (window.SITE && window.SITE.whatsapp) || '5491163513333'; // número en src/_data/site.json
  var WA_BASE = (window.SITE && window.SITE.waText) || '';
  var hidden = document.getElementById('productoInteres');
  var box = document.getElementById('quoting');
  var nameEl = document.getElementById('quotingName');
  var clear = document.getElementById('quotingClear');
  var waLinks = document.querySelectorAll('[data-js="wa"]');
  var target = document.getElementById('form-cotizacion-wrap');

  function setWa(text){
    var href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(text);
    waLinks.forEach(function(a){ a.href = href; });
  }
  function setProduct(label){
    if (!hidden) return;
    hidden.value = label || '';
    if (label){
      nameEl.textContent = label;
      box.hidden = false;
      setWa('Hola, quiero cotizar ' + label + ' para mi empresa.');
    } else {
      box.hidden = true;
      setWa(WA_BASE);
    }
  }
  document.querySelectorAll('[data-js="consultar"]').forEach(function(b){
    b.addEventListener('click', function(){
      var n = b.getAttribute('data-prod-nombre') || '';
      var c = b.getAttribute('data-prod-codigo') || '';
      setProduct(c ? n + ' (Cód. ' + c + ')' : n);
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'product_inquiry', product_name: n, product_code: c || undefined });
      // Si el producto trae categoría, la tilda en el campo multi-selección (L3)
      var cat = b.getAttribute('data-prod-cat');
      if (cat){
        var chk = document.querySelector('#form-cotizacion [data-required-group] input[value="' + cat + '"]');
        if (chk){ chk.checked = true; chk.dispatchEvent(new Event('change', {bubbles:true})); }
      }
      if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
  if (clear) clear.addEventListener('click', function(){ setProduct(''); });
  setWa(WA_BASE);
})();

(function(){
  // Reseñas de la sección de contacto: rotan cada 7 s; pausa con el mouse o el
  // foco encima; sin rotación automática si el usuario prefiere menos movimiento.
  var root = document.querySelector('[data-js="review-rotator"]');
  if (!root) return;
  var items = root.querySelectorAll('.quote__mini');
  var dots = root.querySelectorAll('.quote__dot');
  if (items.length < 2) return;
  var i = 0, timer = null;
  function show(n){
    i = (n + items.length) % items.length;
    items.forEach(function(el, k){
      el.classList.toggle('is-active', k === i);
      if (k === i) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
    });
    dots.forEach(function(d, k){
      d.classList.toggle('is-active', k === i);
      if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function start(){ if (!reduce && !timer) timer = setInterval(function(){ show(i + 1); }, 7000); }
  function stop(){ clearInterval(timer); timer = null; }
  dots.forEach(function(d, k){ d.addEventListener('click', function(){ show(k); stop(); start(); }); });
  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  root.addEventListener('focusin', stop);
  root.addEventListener('focusout', start);
  start();
})();

(function(){
  // Validación al salir del campo (blur) + envío con estado loading.
  // Envío real con window.DifLead (main.js) → /api/lead → Kommo. Si falla, ofrece WhatsApp con los datos.
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function fieldOf(el){ return el.closest('.field'); }
  function valid(el){
    if (el.type === 'checkbox') return !el.required || el.checked;
    var v = (el.value || '').trim();
    if (el.required && !v) return false;
    if (el.type === 'email' && v && !EMAIL.test(v)) return false;
    if (el.type === 'tel' && v && v.replace(/\D/g,'').length < 8) return false;
    return true;
  }
  function check(el){
    var f = fieldOf(el); if (!f) return true;
    var ok = valid(el);
    f.classList.toggle('is-invalid', !ok);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }
  document.querySelectorAll('[data-js="lead-form"]').forEach(function(form){
    var inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    inputs.forEach(function(el){
      el.addEventListener('blur', function(){ check(el); });
      // Si el campo ya estaba marcado con error, se re-valida mientras se
      // escribe: asi el error desaparece antes del blur y el layout no se
      // mueve debajo del cursor cuando el usuario hace clic en otro campo.
      var recheck = function(){ if (fieldOf(el) && fieldOf(el).classList.contains('is-invalid')) check(el); };
      el.addEventListener('input', recheck);
      el.addEventListener('change', recheck);
    });
    // Grupos de checkboxes obligatorios (al menos uno tildado)
    var groups = form.querySelectorAll('[data-required-group]');
    function checkGroup(g){
      var ok = !!g.querySelector('input[type=checkbox]:checked');
      g.classList.toggle('is-invalid', !ok);
      return ok;
    }
    groups.forEach(function(g){
      g.addEventListener('change', function(){ if (g.classList.contains('is-invalid')) checkGroup(g); });
    });
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var first = null;
      inputs.forEach(function(el){ if (!check(el) && !first) first = el; });
      groups.forEach(function(g){ if (!checkGroup(g) && !first) first = g.querySelector('input'); });
      if (first){
        first.focus();
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'form_error', form_id: 'cotizacion', error_type: 'validation' });
        return;
      }
      var hp = form.querySelector('input[name="website"]');
      if (hp && hp.value) return; // bot
      var btn = form.querySelector('button[type="submit"]');
      var status = form.querySelector('[data-js="form-status"]');
      var label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Enviando…';
      if (status) status.textContent = '';
      if (!window.DifLead){ btn.disabled = false; btn.innerHTML = label; return; }
      var sent = window.DifLead.send(form);
      var landingId = (form.querySelector('[name="landing"]') || {}).value || '';
      var rubro = (form.querySelector('[name="rubro"]') || {}).value || '';
      sent.then(function(){
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'generate_lead', form_id: 'cotizacion', lead_type: 'cotizacion',
          landing_id: landingId, industry: rubro || undefined, event_id: sent.eventId, page_path: location.pathname });
        form.innerHTML =
          '<div class="lead-form__ok" role="status">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>' +
          '<h3>¡Gracias! Recibimos tu pedido.</h3><p>Un responsable de cuenta te va a contactar para armar la cotización.</p>' +
          '</div>';
      }).catch(function(err){
        btn.disabled = false; btn.innerHTML = label;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'form_error', form_id: 'cotizacion', landing_id: landingId, error_type: (err && err.message) || 'send' });
        if (!status) return;
        if (err && err.status === 422){
          status.textContent = 'Revisá los datos marcados e intentá de nuevo.';
        } else if (err && err.status === 403){
          status.textContent = 'No pudimos verificar el envío. Recargá la página e intentá de nuevo.';
        } else {
          status.innerHTML = 'Tuvimos un problema al enviar. <a href="' + window.DifLead.waFallback(err && err.data) +
            '" target="_blank" rel="noopener" data-js="wa">Mandanos tus datos por WhatsApp</a> y te respondemos igual.';
        }
      });
    });
  });
})();
