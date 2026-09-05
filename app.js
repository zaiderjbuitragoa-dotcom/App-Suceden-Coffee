// ============================================================
// CONFIGURACIÓN
// ============================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzNdxZmQ_ZQVTYVFBnuVF4_Gf1RmZuk2HUFxdOdYv6jKtRFFRSaRsdHX0UtNvSVvy1hkA/exec';

const GROUP_LABELS = { andes: 'Datos Andes', orquidea: 'Datos Orquídea' };

// ------------------------------------------------------------

let currentGroup = null;
let extraFilesData = [];
let recordsCache = { andes: null, orquidea: null };
let currentUser = null;
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!WEB_APP_URL || WEB_APP_URL.indexOf('PON_AQUI') !== -1) {
    document.getElementById('configWarning').style.display = 'block';
  }

  startClock();
  setupPolicyModal();
  setupLogin();
  setupApp();

  const saved = localStorage.getItem('sucden_user');
  if (saved) {
    try { currentUser = JSON.parse(saved); showApp(); }
    catch (e) { localStorage.removeItem('sucden_user'); }
  }
});

/* ------------------------- RELOJ ------------------------- */

function startClock() {
  const dateOpts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const tick = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-CO', dateOpts);
    const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dEl = document.getElementById('clockDate');
    const tEl = document.getElementById('clockTime');
    if (dEl) dEl.textContent = capitalize(dateStr);
    if (tEl) tEl.textContent = timeStr;
    const lineEl = document.getElementById('appClockLine');
    if (lineEl) lineEl.textContent = capitalize(dateStr) + ' · ' + timeStr;
  };
  tick();
  setInterval(tick, 1000);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ------------------------- PANTALLA DE CARGA (splash) -------------------------
 * showBootSplash()/hideBootSplash() viven en index.html. Se llaman de forma
 * defensiva (solo si existen) para que app.js nunca truene si alguien usa
 * un index.html distinto que no las defina. */
function splashShow(msg) { if (window.showBootSplash) window.showBootSplash(msg); }
function splashHide() { if (window.hideBootSplash) window.hideBootSplash(); }

/* ------------------------- POLÍTICA DE DATOS ------------------------- */

function setupPolicyModal() {
  document.getElementById('openPolicy').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('policyModal').style.display = 'flex';
  });
  document.getElementById('closePolicy').addEventListener('click', () => {
    document.getElementById('policyModal').style.display = 'none';
  });
}

/* ------------------------- LOGIN / REGISTRO ------------------------- */

function setButtonLoading(btn, labelEl, loadingText, isLoading, originalText) {
  btn.disabled = isLoading;
  labelEl.innerHTML = isLoading
    ? '<span class="spinner"></span>' + loadingText
    : originalText;
}

function setupLogin() {
  document.getElementById('showRegister').addEventListener('click', () => {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('showRegister').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('showLogin').style.display = 'block';
    document.getElementById('loginTitle').textContent = 'Solicitar acceso';
    document.getElementById('loginSub').textContent = 'Un administrador debe autorizar tu cuenta.';
  });

  document.getElementById('showLogin').addEventListener('click', () => {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('showLogin').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('showRegister').style.display = 'block';
    document.getElementById('loginTitle').textContent = 'Bienvenido';
    document.getElementById('loginSub').textContent = 'App de reporte de despachos — S&D Sucden';
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('loginStatus');
    const btn = document.getElementById('loginBtn');
    const label = document.getElementById('loginBtnLabel');
    statusEl.className = 'status'; statusEl.textContent = '';
    const cedula = document.getElementById('loginCedula').value.trim();
    const clave = document.getElementById('loginClave').value;

    setButtonLoading(btn, label, 'Ingresando…', true);
    splashShow('Verificando tus datos…');
    try {
      const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'login', cedula, clave }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
      currentUser = data.user;
      localStorage.setItem('sucden_user', JSON.stringify(currentUser));
      showApp();
    } catch (err) {
      statusEl.className = 'status err';
      statusEl.textContent = err.message;
    } finally {
      setButtonLoading(btn, label, '', false, 'Ingresar al sistema');
      splashHide();
    }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('registerStatus');
    const btn = document.getElementById('registerBtn');
    const label = document.getElementById('registerBtnLabel');
    statusEl.className = 'status'; statusEl.textContent = '';
    const nombre = document.getElementById('regNombre').value.trim();
    const cedula = document.getElementById('regCedula').value.trim();
    const clave = document.getElementById('regClave').value;
    const aceptaPolitica = document.getElementById('regPolitica').checked;

    if (!aceptaPolitica) {
      statusEl.className = 'status err';
      statusEl.textContent = 'Debes aceptar la política de tratamiento de datos personales.';
      return;
    }

    setButtonLoading(btn, label, 'Enviando…', true);
    try {
      const res = await fetch(WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'requestAccess', nombre, cedula, clave, aceptaPolitica })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo enviar la solicitud.');
      statusEl.className = 'status ok';
      statusEl.textContent = 'Solicitud enviada. Un administrador debe autorizarte antes de que puedas ingresar.';
      document.getElementById('registerForm').reset();
    } catch (err) {
      statusEl.className = 'status err';
      statusEl.textContent = err.message;
    } finally {
      setButtonLoading(btn, label, '', false, 'Solicitar acceso');
    }
  });
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('greetingText').textContent = 'Hola, ' + currentUser.nombre;
  document.getElementById('fecha').valueAsDate = new Date();
  prefillResponsable();

  if (currentUser.rol === 'admin') {
    document.getElementById('adminBtn').style.display = 'inline-flex';
  }

  goToHub();
  refreshHubCounts();
}

/* Autocompleta "Responsable del despacho" con el nombre de quien inició
 * sesión (es quien está reportando). Solo llena si el campo está vacío,
 * así no pisa el valor cuando se está EDITANDO un reporte de otra persona
 * (startEdit ya deja ahí el responsable original de ese reporte). */
function prefillResponsable() {
  const el = document.getElementById('responsable');
  if (el && currentUser && currentUser.nombre && !el.value) {
    el.value = currentUser.nombre;
  }
}

function logout() {
  localStorage.removeItem('sucden_user');
  currentUser = null;
  recordsCache = { andes: null, orquidea: null };
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginCedula').value = '';
  document.getElementById('loginClave').value = '';
}

/* ------------------------- NAVEGACIÓN APP ------------------------- */

function setupApp() {
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('adminBtn').addEventListener('click', () => {
    showSection('admin');
    loadAdmin();
  });
  document.getElementById('backFromAdmin').addEventListener('click', goToHub);
  document.getElementById('backToHub').addEventListener('click', goToHub);
  const floatBtn = document.getElementById('floatingBack');
  if (floatBtn) floatBtn.addEventListener('click', goToHub);
  setupLightbox();

  document.querySelectorAll('.hub-card').forEach(card => {
    card.addEventListener('click', () => openGroup(card.dataset.group));
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#panel-group .panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'gallery') loadGallery();
    });
  });

  const mainFileRow = document.getElementById('mainFileRow');
  const mainFile = document.getElementById('mainFile');
  mainFileRow.addEventListener('click', () => mainFile.click());
  mainFile.addEventListener('change', () => {
    if (mainFile.files.length) {
      document.getElementById('mainFileLabel').textContent = mainFile.files[0].name;
      mainFileRow.classList.add('has-file');
    }
  });

  const extraFileRow = document.getElementById('extraFileRow');
  const extraFiles = document.getElementById('extraFiles');
  extraFileRow.addEventListener('click', () => extraFiles.click());
  extraFiles.addEventListener('change', async () => {
    extraFilesData = [];
    const thumbs = document.getElementById('extraThumbs');
    thumbs.innerHTML = '';
    for (const file of extraFiles.files) {
      const base64 = await fileToBase64(file);
      extraFilesData.push({ base64, mimeType: file.type, filename: file.name });
      const img = document.createElement('img');
      img.src = 'data:' + file.type + ';base64,' + base64;
      thumbs.appendChild(img);
    }
    document.getElementById('extraFileLabel').textContent =
      extraFiles.files.length ? extraFiles.files.length + ' foto(s) seleccionadas' : 'Toca para agregar una o varias fotos';
    if (extraFiles.files.length) extraFileRow.classList.add('has-file');
  });

  document.getElementById('reportForm').addEventListener('submit', onSubmit);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
  document.getElementById('gallerySearch').addEventListener('input', renderGallery);
}

function showSection(name) {
  document.getElementById('panel-hub').style.display = name === 'hub' ? 'block' : 'none';
  document.getElementById('panel-group').style.display = name === 'group' ? 'block' : 'none';
  document.getElementById('panel-admin').style.display = name === 'admin' ? 'block' : 'none';
  const floatBtn = document.getElementById('floatingBack');
  if (floatBtn) floatBtn.classList.toggle('show', name !== 'hub');
}

function goToHub() {
  currentGroup = null;
  showSection('hub');
  refreshHubCounts();
}

function openGroup(group) {
  currentGroup = group;
  document.getElementById('groupLabel').textContent = GROUP_LABELS[group];
  showSection('group');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#panel-group .panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab[data-tab="form"]').classList.add('active');
  document.getElementById('panel-form').classList.add('active');
  cancelEdit();
  prefillResponsable();
}

async function refreshHubCounts() {
  ['andes', 'orquidea'].forEach(async (group) => {
    try {
      const res = await fetch(WEB_APP_URL + '?action=list&group=' + group);
      const data = await res.json();
      if (data.ok) {
        recordsCache[group] = data.records;
        const el = document.getElementById(group === 'andes' ? 'countAndes' : 'countOrquidea');
        if (el) el.textContent = data.records.length;
      }
    } catch (e) { /* silencioso */ }
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ------------------------- FORMULARIO (crear / editar) ------------------------- */

async function onSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitBtnLabel');
  statusEl.className = 'status'; statusEl.textContent = '';

  const fecha = document.getElementById('fecha').value;
  const placa = document.getElementById('placa').value.trim();
  const lotes = document.getElementById('lotes').value;
  const responsable = document.getElementById('responsable').value.trim();

  if (!fecha || !placa || !lotes || !responsable) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Completa todos los campos antes de guardar.';
    return;
  }

  setButtonLoading(submitBtn, submitLabel, 'Guardando…', true);

  try {
    let mainFileData = null;
    const mainFileInput = document.getElementById('mainFile');
    if (mainFileInput.files.length) {
      const f = mainFileInput.files[0];
      const base64 = await fileToBase64(f);
      mainFileData = { base64, mimeType: f.type, filename: f.name };
    }

    const fields = {
      'Fecha ': fecha,
      'Placa Del Vehiculo ': placa.toUpperCase(),
      'Numero De Lotes ': lotes,
      'Nom: Del Respnsable del Despacho ': responsable
    };

    const isEdit = !!editingId;
    const payload = isEdit
      ? { action: 'update', group: currentGroup, id: editingId, fields, images: extraFilesData }
      : { action: 'create', group: currentGroup, fields, file: mainFileData, images: extraFilesData };

    const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    statusEl.className = 'status ok';
    statusEl.textContent = isEdit ? 'Reporte actualizado correctamente.' : 'Reporte guardado correctamente.';
    resetForm();
    recordsCache[currentGroup] = null;
  } catch (err) {
    statusEl.className = 'status err';
    statusEl.textContent = 'No se pudo guardar: ' + err.message;
  } finally {
    setButtonLoading(submitBtn, submitLabel, '', false, editingId ? 'Guardar cambios' : 'Guardar reporte');
  }
}

function resetForm() {
  document.getElementById('reportForm').reset();
  document.getElementById('fecha').valueAsDate = new Date();
  document.getElementById('mainFileLabel').textContent = 'Toca para tomar foto o adjuntar archivo';
  document.getElementById('mainFileRow').classList.remove('has-file');
  document.getElementById('extraFileLabel').textContent = 'Toca para agregar una o varias fotos';
  document.getElementById('extraFileRow').classList.remove('has-file');
  document.getElementById('extraThumbs').innerHTML = '';
  extraFilesData = [];
  cancelEdit();
  prefillResponsable();
}

function startEdit(rec) {
  editingId = rec['Id_Reporte'];
  document.getElementById('editingId').value = editingId;
  document.getElementById('fecha').value = toDateInputValue(rec['Fecha ']);
  document.getElementById('placa').value = rec['Placa Del Vehiculo '] || '';
  document.getElementById('lotes').value = rec['Numero De Lotes '] || '';
  document.getElementById('responsable').value = rec['Nom: Del Respnsable del Despacho '] || '';
  document.getElementById('submitBtnLabel').textContent = 'Guardar cambios';
  document.getElementById('cancelEditBtn').style.display = 'block';

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#panel-group .panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab[data-tab="form"]').classList.add('active');
  document.getElementById('panel-form').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('editingId').value = '';
  document.getElementById('submitBtnLabel').textContent = 'Guardar reporte';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

function toDateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
}

/* ------------------------- LIGHTBOX (ampliar imagen) ------------------------- */

function setupLightbox() {
  const overlay = document.getElementById('imgLightbox');
  const closeBtn = document.getElementById('lightboxClose');
  if (!overlay || !closeBtn) return;
  closeBtn.addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
}

function openLightbox(viewUrl, downloadUrl, name) {
  const overlay = document.getElementById('imgLightbox');
  const img = document.getElementById('lightboxImg');
  const dl = document.getElementById('lightboxDl');
  if (!overlay || !img) return;
  img.src = viewUrl;
  img.alt = name || '';
  if (dl) { dl.href = downloadUrl || viewUrl; dl.download = name || ''; }
  overlay.classList.add('open');
}

function closeLightbox() {
  const overlay = document.getElementById('imgLightbox');
  if (overlay) overlay.classList.remove('open');
}

/* ------------------------- GALERÍA ------------------------- */

async function loadGallery() {
  const listEl = document.getElementById('galleryList');
  if (recordsCache[currentGroup]) { renderGallery(); return; }
  listEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando reportes…</div>';
  try {
    const res = await fetch(WEB_APP_URL + '?action=list&group=' + currentGroup);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    recordsCache[currentGroup] = data.records;
    renderGallery();
  } catch (err) {
    listEl.innerHTML = '<div class="empty">No se pudieron cargar los reportes: ' + err.message + '</div>';
  }
}

function renderGallery() {
  const records = recordsCache[currentGroup] || [];
  const query = document.getElementById('gallerySearch').value.trim().toLowerCase();
  const listEl = document.getElementById('galleryList');

  const filtered = records.filter(r => {
    if (!query) return true;
    const placa = String(r['Placa Del Vehiculo '] || '').toLowerCase();
    const resp = String(r['Nom: Del Respnsable del Despacho '] || '').toLowerCase();
    return placa.indexOf(query) !== -1 || resp.indexOf(query) !== -1;
  });

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty">No hay reportes para mostrar.</div>';
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach(rec => {
    const reportId = rec['Id_Reporte'];
    const div = document.createElement('div');
    div.className = 'report';
    div.innerHTML =
      '<div class="report-head">' +
        '<div>' +
          '<div class="plate">' + escapeHtml(rec['Placa Del Vehiculo '] || 'Sin placa') + '</div>' +
          '<div class="meta">' + escapeHtml(formatDate(rec['Fecha '])) + ' · ' + escapeHtml(rec['Nom: Del Respnsable del Despacho '] || '') + '</div>' +
        '</div>' +
        '<span class="chevron">&#9662;</span>' +
      '</div>' +
      '<div class="report-body"><div class="loading"><span class="spinner dark"></span>Cargando imágenes…</div></div>';

    const head = div.querySelector('.report-head');
    head.addEventListener('click', () => {
      const wasOpen = div.classList.contains('open');
      div.classList.toggle('open');
      if (!wasOpen) loadImages(reportId, div.querySelector('.report-body'), rec);
    });

    listEl.appendChild(div);
  });
}

async function loadImages(reportId, bodyEl, rec) {
  try {
    const res = await fetch(WEB_APP_URL + '?action=listImages&group=' + currentGroup + '&reportId=' + encodeURIComponent(reportId));
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    bodyEl.innerHTML = '';

    if (data.images.length) {
      const grid = document.createElement('div');
      grid.className = 'img-grid';
      data.images.forEach(img => {
        const cell = document.createElement('div');
        cell.className = 'img-cell';

        const imgEl = document.createElement('img');
        imgEl.src = img.viewUrl;
        imgEl.alt = img.name;
        imgEl.loading = 'lazy';
        imgEl.addEventListener('click', () => openLightbox(img.viewUrl, img.downloadUrl, img.name));
        imgEl.addEventListener('error', () => {
          cell.classList.add('img-error');
          if (!cell.querySelector('.img-fallback')) {
            const fallback = document.createElement('div');
            fallback.className = 'img-fallback';
            fallback.textContent = 'No se pudo mostrar la vista previa. Usa "Descargar" para verla.';
            cell.insertBefore(fallback, imgEl);
          }
        });
        cell.appendChild(imgEl);

        const dl = document.createElement('a');
        dl.className = 'dl';
        dl.href = img.downloadUrl;
        dl.setAttribute('download', img.name);
        dl.textContent = 'Descargar';
        cell.appendChild(dl);

        grid.appendChild(cell);
      });
      bodyEl.appendChild(grid);
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.style.padding = '10px';
      empty.textContent = 'Este reporte no tiene imágenes adicionales.';
      bodyEl.appendChild(empty);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Editar este reporte';
    editBtn.addEventListener('click', () => startEdit(rec));
    bodyEl.appendChild(editBtn);
  } catch (err) {
    bodyEl.innerHTML = '<div class="empty">No se pudieron cargar las imágenes: ' + err.message + '</div>';
  }
}

/* ------------------------- ADMIN ------------------------- */

async function loadAdmin() {
  const pendingEl = document.getElementById('pendingList');
  const allEl = document.getElementById('allUsersList');
  pendingEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando…</div>';
  allEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando…</div>';

  try {
    const res = await fetch(WEB_APP_URL + '?action=listPendingUsers&adminCedula=' + encodeURIComponent(currentUser.cedula));
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    renderPending(data.users);
  } catch (err) {
    pendingEl.innerHTML = '<div class="empty">' + err.message + '</div>';
  }

  try {
    const res2 = await fetch(WEB_APP_URL + '?action=listUsers&adminCedula=' + encodeURIComponent(currentUser.cedula));
    const data2 = await res2.json();
    if (!data2.ok) throw new Error(data2.error || 'Error desconocido');
    renderAllUsers(data2.users);
  } catch (err) {
    allEl.innerHTML = '<div class="empty">' + err.message + '</div>';
  }
}

function renderPending(users) {
  const el = document.getElementById('pendingList');
  if (!users.length) { el.innerHTML = '<div class="empty">No hay solicitudes pendientes.</div>'; return; }
  el.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML =
      '<div><div class="name">' + escapeHtml(u.nombre) + '</div><div class="meta">Cédula ' + escapeHtml(u.cedula) + '</div></div>' +
      '<div class="actions"><button class="btn-approve">Autorizar</button><button class="btn-reject">Rechazar</button></div>';
    row.querySelector('.btn-approve').addEventListener('click', () => resolveUser(u.cedula, 'approveUser', row));
    row.querySelector('.btn-reject').addEventListener('click', () => resolveUser(u.cedula, 'rejectUser', row));
    el.appendChild(row);
  });
}

async function resolveUser(cedula, action, row) {
  row.style.opacity = '0.5';
  try {
    const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action, cedula, adminCedula: currentUser.cedula }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    loadAdmin();
  } catch (err) {
    alert('No se pudo actualizar: ' + err.message);
    row.style.opacity = '1';
  }
}

function renderAllUsers(users) {
  const el = document.getElementById('allUsersList');
  if (!users.length) { el.innerHTML = '<div class="empty">Sin usuarios registrados.</div>'; return; }
  el.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML =
      '<div><div class="name">' + escapeHtml(u.nombre) + ' <span class="badge-estado badge-' + u.estado + '">' + escapeHtml(u.estado) + '</span></div>' +
      '<div class="meta">Cédula ' + escapeHtml(u.cedula) + ' · ' + escapeHtml(u.rol) + '</div></div>';
    el.appendChild(row);
  });
}

/* ------------------------- UTILIDADES ------------------------- */

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
