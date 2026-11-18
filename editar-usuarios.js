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

    $('euSave').addEventListener('click', function () {
      var nombre = $('euNombre').value.trim();
      var nuevaCedula = $('euCedula').value.trim();
      var clave = $('euClave').value;
      if (!nombre) return msg('Escribe el nombre.', false);
      if (!nuevaCedula) return msg('Escribe la cédula.', false);
      if (clave && clave.length < 6) return msg('La contraseña debe tener al menos 6 caracteres.', false);

      var btn = $('euSave');
      btn.disabled = true;
      btn.querySelector('.btn-label').innerHTML = '<span class="spinner"></span> Guardando…';

      fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateUser',
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
          // Si el administrador se editó a sí mismo, el servidor le da una sesión nueva.
          if (soyYo && res.token && res.cedula === u.cedula) {
            try { currentUser.token = res.token; currentUser.nombre = res.nombre; localStorage.setItem('sucden_user', JSON.stringify(currentUser)); } catch (e) {}
          }
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
