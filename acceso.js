/**
 * acceso.js — Seguridad de acceso de S&D Sucden (se carga ANTES que app.js).
 *  1) Adjunta la sesión (token) a TODAS las peticiones al servidor.
 *  2) Bloqueo de 2 minutos tras varias claves incorrectas (cuenta regresiva en el login).
 *  3) "¿Olvidaste tu clave?": avisa al administrador y permite cambiarla con un código de 12 horas.
 *  4) Para el administrador: aviso en la campana + tarjeta "Recuperación de claves" con el código.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var WEB_RE = /script\.google\.com\/macros/;
  var origFetch = window.fetch.bind(window);

  function token() {
    try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.token) || ''; } catch (e) { return ''; }
  }
  function me() { try { return (typeof currentUser !== 'undefined') ? currentUser : null; } catch (e) { return null; } }
  function isAdmin() { var u = me(); return !!(u && u.rol === 'admin'); }
  function api(url, opts, tries) { return fetchJson(url, opts, tries || 1); }
  function post(body) { return api(WEB_APP_URL, { method: 'POST', body: JSON.stringify(body) }, 1); }

  /* ---------------- 1) Sesión en cada petición ---------------- */
  window.fetch = function (input, init) {
    var url = '', method = 'GET', t = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      if (WEB_RE.test(url)) {
        t = token();
        method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (t) {
          if (method === 'GET' && typeof input === 'string' && url.indexOf('token=') === -1) {
            input = url + (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(t);
          } else if (method !== 'GET' && init && typeof init.body === 'string' && init.body.charAt(0) === '{' && init.body.indexOf('"token"') === -1) {
            // Se antepone el token al texto JSON (sin volver a procesar cuerpos grandes, como las fotos).
            var rest = init.body.slice(1);
            init = Object.assign({}, init, { body: '{"token":' + JSON.stringify(t) + (rest.charAt(0) === '}' ? '' : ',') + rest });
          }
        }
      }
    } catch (e) { /* si algo falla, la petición sale tal cual */ }
    var p = origFetch(input, init);
    if (t && method !== 'GET') {
      // Los envíos que no pasan por fetchJson también cierran la sesión si el servidor ya no la reconoce.
      p.then(function (res) {
        try { res.clone().json().then(function (d) { if (d && d.code === 'AUTH' && typeof sessionExpired === 'function') sessionExpired(); }).catch(function () {}); } catch (e) {}
      }).catch(function () {});
    }
    return p;
  };

  /* ---------------- 2) Bloqueo con cuenta regresiva ---------------- */
  var LS_LOCK = 'sd_lock', lockTimer = null, lockCed = '';
  function norm(c) { return String(c == null ? '' : c).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40); }
  function readLock() {
    try { var o = JSON.parse(localStorage.getItem(LS_LOCK) || 'null'); if (o && o.until > Date.now()) return o; } catch (e) {}
    try { localStorage.removeItem(LS_LOCK); } catch (e) {}
    return null;
  }
  function isLockedFor(ced) { var l = readLock(); return !!l && l.ced === norm(ced); }
  function fmtLeft(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function unlockUI() {
    clearInterval(lockTimer); lockTimer = null; lockCed = '';
    var btn = $('loginBtn'), lab = $('loginBtnLabel'), note = $('lockNote'), st = $('loginStatus');
    if (btn) { btn.disabled = false; btn.classList.remove('is-locked'); }
    if (lab) lab.textContent = 'Ingresar al sistema';
    if (note) note.classList.remove('show');
    if (st && /bloquead/i.test(st.textContent)) { st.className = 'status'; st.textContent = ''; }
  }

  function showLock(ced) {
    var l = readLock();
    if (!l || l.ced !== norm(ced)) { unlockUI(); return; }
    lockCed = l.ced;
    var btn = $('loginBtn'), lab = $('loginBtnLabel'), note = $('lockNote'), st = $('loginStatus');
    if (btn) { btn.disabled = true; btn.classList.add('is-locked'); }
    if (st) {
      st.className = 'status err';
      st.textContent = l.msg || 'Demasiados intentos fallidos. La cuenta quedó bloqueada unos minutos.';
    }
    if (note) {
      note.textContent = '';
      note.appendChild(document.createTextNode(l.notified
        ? 'El administrador ya recibió tu aviso. Cuando te dé el código, úsalo aquí: '
        : 'Si no recuerdas tu clave, pide un código de recuperación: '));
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Ya tengo mi código';
      b.addEventListener('click', function () { openRecover('code'); });
      note.appendChild(b);
      note.classList.add('show');
    }
    var tick = function () {
      var cur = readLock();
      if (!cur || cur.ced !== lockCed) { unlockUI(); return; }
      if (lab) lab.textContent = 'Bloqueado · ' + fmtLeft(cur.until - Date.now());
    };
    clearInterval(lockTimer); tick();
    lockTimer = setInterval(tick, 500);
  }

  function startLock(ced, seconds, notified, msg) {
    try { localStorage.setItem(LS_LOCK, JSON.stringify({ ced: norm(ced), raw: String(ced), until: Date.now() + seconds * 1000, notified: !!notified, msg: msg || '' })); } catch (e) {}
    showLock(ced);
  }
  function clearLock() { try { localStorage.removeItem(LS_LOCK); } catch (e) {} unlockUI(); }

  /* ---------------- 3) Recuperar clave (pantalla de login) ---------------- */
  var LOGIN_SUB = 'Sistema de Gestión de Despacho — S&D Sucden';
  var recoverOpen = false;

  function setStatus(id, cls, text) { var s = $(id); if (!s) return; s.className = 'status' + (cls ? ' ' + cls : ''); s.textContent = text || ''; }
  function show(id, on, disp) { var e = $(id); if (e) e.style.display = on ? (disp || 'block') : 'none'; }

  function tab(which) {
    var ask = which !== 'code';
    show('recAskForm', ask); show('recCodeForm', !ask);
    if ($('recTabAsk')) $('recTabAsk').classList.toggle('on', ask);
    if ($('recTabCode')) $('recTabCode').classList.toggle('on', !ask);
    var typed = ($('loginCedula') && $('loginCedula').value.trim()) || '';
    if (!typed) { var l = readLock(); if (l && l.raw) typed = l.raw; }
    var f = $(ask ? 'recAskCedula' : 'recCedula');
    if (f && !f.value) f.value = typed;
    if (window.BeanMascot) BeanMascot.setState('idle');
  }

  function openRecover(which) {
    recoverOpen = true;
    ['loginForm', 'showForgot', 'showRegister', 'registerForm', 'showLogin', 'lockNote'].forEach(function (id) { show(id, false); });
    show('recoverBox', true);
    if ($('loginTitle')) $('loginTitle').textContent = 'Recuperar mi clave';
    if ($('loginSub')) $('loginSub').textContent = 'El administrador te entrega un código de un solo uso.';
    setStatus('recAskStatus', '', ''); setStatus('recCodeStatus', '', '');
    tab(which);
  }
  function closeRecover() {
    recoverOpen = false;
    show('recoverBox', false);
    show('loginForm', true); show('showForgot', true); show('showRegister', true);
    if ($('loginTitle')) $('loginTitle').textContent = 'Bienvenido';
    if ($('loginSub')) $('loginSub').textContent = LOGIN_SUB;
    var ced = $('loginCedula'); if (ced && isLockedFor(ced.value)) showLock(ced.value);
  }

  function busy(btnId, labId, on, text, idle) {
    var b = $(btnId), l = $(labId); if (!b || !l) return;
    b.disabled = on;
    if (on) { l.textContent = ''; var sp = document.createElement('span'); sp.className = 'spinner'; l.appendChild(sp); l.appendChild(document.createTextNode(text)); }
    else l.textContent = idle;
  }

  function setupRecoverUI() {
    if (!$('recoverBox')) return;
    var forgot = $('showForgot');
    if (forgot) { forgot.style.display = 'block'; forgot.style.margin = '0 auto'; forgot.addEventListener('click', function () { openRecover('ask'); }); }
    $('recBack').addEventListener('click', closeRecover);
    $('recTabAsk').addEventListener('click', function () { tab('ask'); });
    $('recTabCode').addEventListener('click', function () { tab('code'); });

    // Código: mayúsculas y guion automático (XXXX-XXXX)
    $('recCode').addEventListener('input', function () {
      var v = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      this.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
    });
    // La mascota se tapa los ojos mientras se escribe una clave
    ['recNew', 'recNew2'].forEach(function (id) {
      var el = $(id);
      el.addEventListener('focus', function () { if (window.BeanMascot) BeanMascot.setState('covering'); });
      el.addEventListener('blur', function () { if (window.BeanMascot) BeanMascot.setState('idle'); });
    });
    var checkPw = function () {
      var a = $('recNew').value, b = $('recNew2').value, h = $('recNewHint');
      if (a && a.length < 6) { h.textContent = 'Mínimo 6 caracteres.'; h.className = 'pw-hint bad'; }
      else if (b && a !== b) { h.textContent = 'Las claves no coinciden.'; h.className = 'pw-hint bad'; }
      else { h.textContent = 'Mínimo 6 caracteres.'; h.className = 'pw-hint'; }
    };
    $('recNew').addEventListener('input', checkPw); $('recNew2').addEventListener('input', checkPw);

    // Paso 1: avisar al administrador
    $('recAskForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var ced = $('recAskCedula').value.trim();
      if (!ced) return;
      setStatus('recAskStatus', '', '');
      busy('recAskBtn', 'recAskLabel', true, 'Enviando…');
      try {
        var d = await post({ action: 'recoveryRequest', cedula: ced });
        if (!d.ok) throw new Error(d.error || 'No se pudo enviar el aviso.');
        setStatus('recAskStatus', 'ok', (d.result && d.result.message) || 'Aviso enviado al administrador.');
        if (window.BeanMascot) { BeanMascot.setState('success'); setTimeout(function () { BeanMascot.setState('idle'); }, 1600); }
        var go = document.createElement('button'); go.type = 'button'; go.className = 'link'; go.textContent = 'Ya tengo mi código →';
        go.addEventListener('click', function () { tab('code'); });
        var box = $('recAskStatus'); box.appendChild(document.createElement('br')); box.appendChild(go);
      } catch (err) {
        setStatus('recAskStatus', 'err', /Failed to fetch|NetworkError|Load failed|estado \d+/i.test(err.message) ? 'No hay conexión con el servidor. Inténtalo de nuevo.' : err.message);
        if (window.BeanMascot) BeanMascot.setState('error');
      }
      busy('recAskBtn', 'recAskLabel', false, '', 'Avisar al administrador');
    });

    // Paso 2: cambiar la clave con el código
    $('recCodeForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var ced = $('recCedula').value.trim(), code = $('recCode').value.trim(), a = $('recNew').value, b = $('recNew2').value;
      setStatus('recCodeStatus', '', '');
      if (a.length < 6) return setStatus('recCodeStatus', 'err', 'La nueva clave debe tener al menos 6 caracteres.');
      if (a !== b) return setStatus('recCodeStatus', 'err', 'Las dos claves no coinciden.');
      busy('recCodeBtn', 'recCodeLabel', true, 'Cambiando…');
      if (window.BeanMascot) BeanMascot.setState('thinking');
      try {
        var d = await post({ action: 'recoveryRedeem', cedula: ced, codigo: code, clave: a });
        if (!d.ok) throw new Error(d.error || 'No se pudo cambiar la clave.');
        setStatus('recCodeStatus', 'ok', '¡Listo! Tu clave fue cambiada. Entrando…');
        if (window.BeanMascot) BeanMascot.setState('success');
        var l = await post({ action: 'login', cedula: ced, clave: a });
        if (l.ok) {
          clearLock();
          currentUser = l.user;
          localStorage.setItem('sucden_user', JSON.stringify(currentUser));
          await new Promise(function (r) { setTimeout(r, 700); });
          $('recoverBox').style.display = 'none'; closeRecover();
          ['recCode', 'recNew', 'recNew2'].forEach(function (id) { $(id).value = ''; });
          showApp();
        } else {
          setStatus('recCodeStatus', 'ok', 'Clave cambiada. Ya puedes iniciar sesión con la nueva.');
          clearLock(); setTimeout(closeRecover, 1400);
        }
      } catch (err) {
        setStatus('recCodeStatus', 'err', /Failed to fetch|NetworkError|Load failed|estado \d+/i.test(err.message) ? 'No hay conexión con el servidor. Inténtalo de nuevo.' : err.message);
        if (window.BeanMascot) { BeanMascot.setState('error'); setTimeout(function () { BeanMascot.setState('idle'); }, 1600); }
      }
      busy('recCodeBtn', 'recCodeLabel', false, '', 'Cambiar mi clave');
    });

    // Si el bloqueo sigue vigente (por ejemplo, tras recargar la página), se muestra de nuevo.
    var ced = $('loginCedula');
    if (ced) {
      var l = readLock();
      if (l && !ced.value) ced.value = l.raw || '';
      if (l) showLock(ced.value);
      ced.addEventListener('input', function () { if (isLockedFor(ced.value)) showLock(ced.value); else if (lockCed) unlockUI(); });
    }
  }

  /* ---------------- 4) Administrador: solicitudes de recuperación ---------------- */
  var recItems = [], recTimer = null, recFirst = true, recKnown = {}, recBusy = false;

  function pendientes() { return recItems.filter(function (r) { return r.estado === 'pendiente'; }); }
  function recoveryItems() { return isAdmin() ? pendientes() : []; }

  function repaintBadges() {
    try {
      var n = pendientes().length, ab = $('adminBtn');
      if (ab) {
        var b = ab.querySelector('.rec-badge');
        if (n && !b) { b = document.createElement('i'); b.className = 'csc-count rec-badge'; ab.appendChild(b); }
        if (b) { if (n) { b.textContent = String(n); b.style.display = ''; } else b.style.display = 'none'; }
      }
      var cb = $('recoveryCountBadge');
      if (cb) { cb.textContent = String(n); cb.style.display = n ? 'inline-flex' : 'none'; }
      if (typeof renderNotifBadge === 'function') renderNotifBadge();
      var np = $('notifPanel');
      if (np && np.classList.contains('open') && typeof renderNotifPanel === 'function') renderNotifPanel();
    } catch (e) {}
  }

  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'justo ahora';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' d';
  }
  function clock(ms) { return new Date(ms).toLocaleString('es-CO', { weekday: 'short', hour: 'numeric', minute: '2-digit' }); }

  async function pollRecovery() {
    if (!isAdmin() || recBusy) return;
    recBusy = true;
    try {
      var d = await api(WEB_APP_URL + '?action=recoveryCount', undefined, 1);
      if (!d.ok || !isAdmin()) return;
      recItems = d.items || [];
      var fresh = pendientes().filter(function (r) { return !recKnown[r.id]; });
      pendientes().forEach(function (r) { recKnown[r.id] = 1; });
      repaintBadges();
      var panel = $('panel-admin');
      if (panel && panel.style.display !== 'none') loadRecovery();
      if (fresh.length && window.cscChat && window.cscChat.notify) {
        var f = fresh[0];
        window.cscChat.notify(
          fresh.length > 1 ? fresh.length + ' claves por recuperar' : 'Clave por recuperar',
          f.nombre + ' · ' + f.motivo,
          function () { var ab = $('adminBtn'); if (ab) ab.click(); }
        );
      }
      recFirst = false;
    } catch (e) { /* sin conexión: se reintenta */ }
    finally { recBusy = false; }
  }

  function scheduleRecovery() {
    clearTimeout(recTimer);
    if (!isAdmin()) return;
    recTimer = setTimeout(function () { pollRecovery().then(scheduleRecovery); }, document.hidden ? 60000 : 20000);
  }

  function copyText(txt, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(function () { btn.textContent = o; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    else { fallbackCopy(txt); done(); }
  }
  function fallbackCopy(txt) {
    try { var t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); } catch (e) {}
  }
  function mkBtn(label, cls, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); return b; }

  function renderRecovery(items) {
    var box = $('recoveryList'); if (!box) return;
    box.textContent = '';
    if (!items.length) { var e = document.createElement('div'); e.className = 'empty'; e.textContent = 'No hay solicitudes de recuperación.'; box.appendChild(e); return; }
    items.forEach(function (r) {
      var card = document.createElement('div'); card.className = 'rec-item' + (r.estado === 'pendiente' ? ' nuevo' : '');
      var top = document.createElement('div'); top.className = 'rec-top';
      var l = document.createElement('div');
      var nm = document.createElement('div'); nm.className = 'rec-name'; nm.textContent = r.nombre;
      var mt = document.createElement('div'); mt.className = 'rec-meta'; mt.textContent = 'Cédula ' + r.cedula + ' · ' + r.motivo + ' · ' + ago(r.fecha);
      l.appendChild(nm); l.appendChild(mt); top.appendChild(l);
      var pill = document.createElement('span');
      pill.className = 'rec-pill' + (r.estado === 'codigo' ? ' ok' : (r.estado === 'vencido' ? ' old' : ''));
      pill.textContent = r.estado === 'codigo' ? 'Código vigente' : (r.estado === 'vencido' ? 'Código vencido' : 'Espera tu código');
      top.appendChild(pill); card.appendChild(top);

      var act = document.createElement('div'); act.className = 'rec-actions';
      if (r.estado === 'codigo' && r.codigo) {
        var cb = document.createElement('div'); cb.className = 'rec-code';
        var big = document.createElement('b'); big.textContent = r.codigo;
        var sm = document.createElement('span'); sm.textContent = 'Vale hasta ' + clock(r.expira) + ' (12 horas desde que se generó)';
        cb.appendChild(big); cb.appendChild(sm); card.appendChild(cb);
        act.appendChild(mkBtn('Copiar código', 'main', function (ev) { copyText(r.codigo, ev.currentTarget); }));
        var wa = document.createElement('a'); wa.target = '_blank'; wa.rel = 'noopener'; wa.textContent = 'Enviar por WhatsApp';
        wa.href = 'https://wa.me/?text=' + encodeURIComponent('Tu código de recuperación para S&D Sucden es: ' + r.codigo + '\nVale hasta ' + clock(r.expira) + '.\nEn la app toca "¿Olvidaste tu clave?" > "Ya tengo mi código".');
        act.appendChild(wa);
        act.appendChild(mkBtn('Generar otro', '', function (ev) { issue(r, ev.currentTarget); }));
      } else {
        act.appendChild(mkBtn('Generar código (12 h)', 'main', function (ev) { issue(r, ev.currentTarget); }));
      }
      act.appendChild(mkBtn('Descartar', 'danger', function (ev) { discard(r, ev.currentTarget); }));
      card.appendChild(act);
      box.appendChild(card);
    });
  }

  async function loadRecovery() {
    if (!isAdmin()) return;
    var card = $('recoveryCard'); if (card) card.style.display = 'block';
    try {
      var d = await api(WEB_APP_URL + '?action=recoveryList', undefined, 1);
      if (!d.ok) throw new Error(d.error || 'Error');
      renderRecovery(d.items || []);
    } catch (e) {
      var box = $('recoveryList');
      if (box && !box.children.length) { box.textContent = 'No se pudo cargar: ' + (e.message || e); }
    }
  }

  async function issue(r, btn) {
    if (r.estado === 'codigo' && !window.confirm('Ya hay un código vigente. Si generas otro, el anterior deja de servir. ¿Continuar?')) return;
    btn.disabled = true; var o = btn.textContent; btn.textContent = 'Generando…';
    try {
      var d = await post({ action: 'recoveryIssue', id: r.id });
      if (!d.ok) throw new Error(d.error || 'Error');
      await loadRecovery(); pollRecovery();
    } catch (e) { window.alert('No se pudo generar el código: ' + (e.message || e)); btn.disabled = false; btn.textContent = o; }
  }
  async function discard(r, btn) {
    if (!window.confirm('¿Descartar la solicitud de ' + r.nombre + '? El código (si existe) dejará de servir.')) return;
    btn.disabled = true;
    try {
      var d = await post({ action: 'recoveryCancel', id: r.id });
      if (!d.ok) throw new Error(d.error || 'Error');
      await loadRecovery(); pollRecovery();
    } catch (e) { window.alert('No se pudo descartar: ' + (e.message || e)); btn.disabled = false; }
  }

  function onLogin() {
    recItems = []; recKnown = {}; recFirst = true;
    if (isAdmin()) {
      var c = $('recoveryCard'); if (c) c.style.display = 'block';
      pollRecovery().then(scheduleRecovery);
    } else { var c2 = $('recoveryCard'); if (c2) c2.style.display = 'none'; }
  }
  function onLogout() {
    clearTimeout(recTimer); recItems = []; recKnown = {};
    var c = $('recoveryCard'); if (c) c.style.display = 'none';
    var l = $('recoveryList'); if (l) l.textContent = '';
    closeRecoverIfOpen();
  }
  function closeRecoverIfOpen() { if (recoverOpen) closeRecover(); }

  document.addEventListener('visibilitychange', function () { if (!document.hidden && isAdmin()) pollRecovery().then(scheduleRecovery); });

  // Al abrir el panel Usuarios se recarga la tarjeta de recuperación.
  function hookAdminButton() {
    var ab = $('adminBtn');
    if (ab) ab.addEventListener('click', function () { loadRecovery(); });
  }

  window.sdAcceso = {
    isLockedFor: isLockedFor, startLock: startLock, showLock: showLock, clearLock: clearLock,
    onLogin: onLogin, onLogout: onLogout, recoveryItems: recoveryItems, refreshRecovery: function () { pollRecovery(); loadRecovery(); }
  };

  function init() { setupRecoverUI(); hookAdminButton(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
