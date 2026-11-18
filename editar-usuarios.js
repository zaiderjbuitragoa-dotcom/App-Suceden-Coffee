/**
 * editar-usuarios.js — Al hacer clic en un usuario de "Todos los usuarios",
 * el administrador puede editar nombre, cédula, contraseña, rol y estado.
 * No modifica app.js: usa WEB_APP_URL y currentUser que ya define app.js.
 * Se carga con UNA línea en index.html, después de app.js.
 */
(function () {
  var list = document.getElementById('allUsersList');
  if (!list || list.getAttribute('data-edit-users')) return;
  list.setAttribute('data-edit-users', '1');

  var st = document.createElement('style');
  st.textContent = [
    '#allUsersList .user-row{cursor:pointer;transition:background .15s ease,border-color .15s ease;position:relative;padding-right:78px;}',
    '#allUsersList .user-row:hover{background:#F0F4FA;border-color:var(--navy);}',
    '#allUsersList .user-row::after{content:"Editar ›";position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:12.5px;font-weight:700;color:var(--navy);}',
    '.eu-select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font-size:15px;font-family:inherit;background:#fff;}',
    '.eu-hint{font-size:11.5px;color:var(--ink-soft);margin-top:4px;}',
    '.eu-actions{display:flex;gap:10px;margin-top:6px;}',
    '.eu-actions button{margin-top:0;}'
  ].join('\n');
  document.head.appendChild(st);

  function parseRow(row) {
    var nameEl = row.querySelector('.name');
    var metaEl = row.querySelector('.meta');
    var nombre = '';
    if (nameEl) {
      for (var i = 0; i < nameEl.childNodes.length; i++) {
        if (nameEl.childNodes[i].nodeType === 3) nombre += nameEl.childNodes[i].textContent;
      }
      nombre = nombre.trim();
    }
    var meta = metaEl ? metaEl.textContent : '';
    var m = meta.match(/C[ée]dula\s+(\S+)\s*·\s*(\S+)/i);
    var badge = row.querySelector('.badge-estado');
    var estado = badge ? badge.textContent.trim().toLowerCase() : 'autorizado';
    return {
      nombre: nombre,
      cedula: m ? m[1] : '',
      rol: m ? m[2].toLowerCase() : 'usuario',
      estado: estado,
      nameEl: nameEl, metaEl: metaEl, badge: badge
    };
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function openEditor(row) {
    var u = parseRow(row);
    if (!u.cedula) return;
    var me = (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser.cedula) : '';
    var soyYo = me === u.cedula;

    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.style.zIndex = '3000';
    ov.innerHTML =
      '<div class="modal-box">' +
        '<h3>Editar usuario</h3>' +
        '<div class="field"><label>Nombre completo</label><input type="text" id="euNombre" value="' + esc(u.nombre) + '"></div>' +
        '<div class="field"><label>Cédula</label><input type="text" id="euCedula" value="' + esc(u.cedula) + '"></div>' +
        '<div class="field"><label>Nueva contraseña</label><input type="password" id="euClave" autocomplete="new-password" placeholder="Déjala vacía para no cambiarla"></div>' +
        '<div class="field"><label>Rol</label><select class="eu-select" id="euRol"' + (soyYo ? ' disabled' : '') + '>' +
          '<option value="usuario">Usuario</option><option value="admin">Administrador</option></select></div>' +
        '<div class="field"><label>Estado</label><select class="eu-select" id="euEstado"' + (soyYo ? ' disabled' : '') + '>' +
          '<option value="autorizado">Autorizado</option><option value="pendiente">Pendiente</option><option value="rechazado">Rechazado</option></select>' +
          (soyYo ? '<div class="eu-hint">Es tu propia cuenta: el rol y el estado no se pueden cambiar. Si cambias tu cédula, tendrás que iniciar sesión de nuevo.</div>' : '') +
        '</div>' +
        '<div style="margin:12px 0 8px; padding:12px; border-radius:12px; background:#F8FAFC; border:1px solid #E2E8F0;">' +
          '<div style="font-size:12px; font-weight:800; color:#131E52; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' +
            '<span>🛡️ Seguridad y Recuperación</span>' +
          '</div>' +
          '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button type="button" class="secondary" id="euGenCode" style="margin:0; font-size:12px; padding:7px 10px; flex:1;">🔑 Emitir código 12h</button>' +
            '<button type="button" class="secondary" id="euUnlock" style="margin:0; font-size:12px; padding:7px 10px; flex:1;">🔓 Desbloquear</button>' +
          '</div>' +
          '<div id="euCodeResult" style="display:none; margin-top:8px; padding:10px; background:#EEF4FF; border:1px solid #C7D9FF; border-radius:8px; font-size:12px; color:#1B2A6B;"></div>' +
        '</div>' +
        '<div class="status" id="euStatus"></div>' +
        '<div class="eu-actions">' +
          '<button type="button" class="primary" id="euSave"><span class="btn-label">Guardar cambios</span></button>' +
          '<button type="button" class="secondary" id="euCancel">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var $ = function (id) { return ov.querySelector('#' + id); };
    $('euRol').value = u.rol === 'admin' ? 'admin' : 'usuario';
    $('euEstado').value = ['autorizado', 'pendiente', 'rechazado'].indexOf(u.estado) !== -1 ? u.estado : 'autorizado';

    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function msg(text, ok) {
      var s = $('euStatus');
      s.className = 'status ' + (ok ? 'ok' : 'err');
      s.textContent = text;
    }

    $('euCancel').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    $('euGenCode').addEventListener('click', function () {
      var resEl = $('euCodeResult');
      resEl.style.display = 'block';
      resEl.innerHTML = '<span class="spinner dark"></span> Generando código de 12 horas…';
      fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminGenerateRecoveryCode',
          adminCedula: me,
          cedula: u.cedula
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'No se pudo generar el código.');
        var res = data.result;
        resEl.innerHTML =
          '<strong>Código de recuperación válido por 12 horas:</strong><br>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px;">' +
            '<span style="font-size:20px; font-weight:900; letter-spacing:4px; font-family:monospace; color:#131E52;">' + esc(res.code) + '</span>' +
            '<button type="button" id="copyGenCodeBtn" style="background:#131E52; color:#fff; border:none; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer;">📋 Copiar</button>' +
          '</div>';
        resEl.querySelector('#copyGenCodeBtn').onclick = function () {
          navigator.clipboard.writeText(res.code);
          this.textContent = '✅ ¡Copiado!';
        };
      })
      .catch(function (err) {
        resEl.innerHTML = '<span style="color:#DC2626;">' + esc(err.message) + '</span>';
      });
    });

    $('euUnlock').addEventListener('click', function () {
      var resEl = $('euCodeResult');
      resEl.style.display = 'block';
      resEl.innerHTML = '<span class="spinner dark"></span> Desbloqueando…';
      fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminUnlockUser',
          adminCedula: me,
          cedula: u.cedula
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'No se pudo desbloquear.');
        resEl.innerHTML = '<span style="color:#059669; font-weight:700;">✅ Cuenta desbloqueada. El usuario ya puede ingresar inmediatamente.</span>';
      })
      .catch(function (err) {
        resEl.innerHTML = '<span style="color:#DC2626;">' + esc(err.message) + '</span>';
      });
    });

    $('euSave').addEventListener('click', function () {
      var nombre = $('euNombre').value.trim();
      var nuevaCedula = $('euCedula').value.trim();
      var clave = $('euClave').value;
      if (!nombre) return msg('Escribe el nombre.', false);
      if (!nuevaCedula) return msg('Escribe la cédula.', false);
      if (clave && clave.length < 4) return msg('La contraseña debe tener al menos 4 caracteres.', false);

      var btn = $('euSave');
      btn.disabled = true;
      btn.querySelector('.btn-label').innerHTML = '<span class="spinner"></span> Guardando…';

      fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateUser',
          adminCedula: me,
          cedula: u.cedula,
          nombre: nombre,
          nuevaCedula: nuevaCedula,
          clave: clave,
          rol: $('euRol').value,
          estado: $('euEstado').value
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || 'No se pudo guardar.');
          var res = data.result;
          if (typeof adminCacheClear === 'function') adminCacheClear();
          // Actualiza la fila en pantalla sin recargar
          if (u.nameEl) {
            for (var i = 0; i < u.nameEl.childNodes.length; i++) {
              if (u.nameEl.childNodes[i].nodeType === 3) { u.nameEl.childNodes[i].textContent = res.nombre + ' '; break; }
            }
          }
          if (u.metaEl) u.metaEl.textContent = 'Cédula ' + res.cedula + ' · ' + res.rol;
          if (u.badge) {
            u.badge.textContent = res.estado;
            u.badge.className = 'badge-estado badge-' + res.estado;
          }
          if (soyYo && res.cedula !== u.cedula) {
            msg('Cambios guardados. Cierra sesión e ingresa con tu nueva cédula.', true);
            setTimeout(function () { close(); var lo = document.getElementById('logoutBtn'); if (lo) lo.click(); }, 1800);
            return;
          }
          msg(res.claveCambiada ? 'Cambios guardados. La contraseña también se actualizó.' : 'Cambios guardados.', true);
          setTimeout(close, 1100);
        })
        .catch(function (err) {
          msg(err.message || 'No se pudo guardar. Intenta de nuevo.', false);
          btn.disabled = false;
          btn.querySelector('.btn-label').textContent = 'Guardar cambios';
        });
    });
  }

  list.addEventListener('click', function (e) {
    if (e.target.closest('button, a')) return;
    var row = e.target.closest('.user-row');
    if (row && list.contains(row)) openEditor(row);
  });
})();
