// ============================================================
// CONFIGURACIÓN
// ============================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzNdxZmQ_ZQVTYVFBnuVF4_Gf1RmZuk2HUFxdOdYv6jKtRFFRSaRsdHX0UtNvSVvy1hkA/exec';

const GROUP_LABELS = { orquidea: 'Datos Orquídea' };

// ------------------------------------------------------------

let currentGroup = null;
let extraFilesData = [];
let recordsCache = { orquidea: null };
let currentUser = null;
let editingId = null;
let formDirty = false; // true cuando hay datos sin guardar en el formulario de reporte

/* Hace un fetch y lo interpreta como JSON, reintentando automáticamente si
 * falla (Apps Script a veces responde con un 404/500 intermitente en su
 * proxy de salida — script.googleusercontent.com/macros/echo — cuando hay
 * mucha carga; en la gran mayoría de los casos un segundo intento sí
 * funciona). Lanza un Error con mensaje legible si tras los reintentos
 * sigue sin funcionar. */
async function fetchJson(url, options, attempts) {
  attempts = attempts || 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error('El servidor respondió con estado ' + res.status);
      const data = await res.json();
      return data;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(
    (lastErr && lastErr.message ? lastErr.message : 'Error de red') +
    ' — no se pudo conectar con el servidor después de varios intentos.'
  );
}

document.addEventListener('DOMContentLoaded', () => {
  if (!WEB_APP_URL || WEB_APP_URL.indexOf('PON_AQUI') !== -1) {
    document.getElementById('configWarning').style.display = 'block';
  }

  startClock();
  setupPolicyModal();
  setupLogin();
  setupApp();
  setupNotifBell();
  setupUnsavedChangesWarning();

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

/* ------------------------- AVISO DE CAMBIOS SIN GUARDAR -------------------------
 * Si el usuario escribió algo en el formulario de "Nuevo reporte" (o adjuntó
 * una foto) y trata de cerrar la pestaña, recargar o navegar fuera de la
 * página SIN haber tocado "Guardar reporte", el navegador muestra su aviso
 * nativo de confirmación. No se puede personalizar el texto de ese aviso
 * (los navegadores modernos lo bloquean por seguridad), pero sí se activa
 * o no según haya cambios pendientes. */
function setupUnsavedChangesWarning() {
  window.addEventListener('beforeunload', (e) => {
    if (!formDirty) return;
    e.preventDefault();
    e.returnValue = ''; // requerido por algunos navegadores para mostrar el aviso
  });
}

/* Marca el formulario como "con cambios sin guardar". Se llama desde los
 * campos del formulario de reporte y desde los selectores de archivo. */
function markFormDirty() {
  formDirty = true;
}

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
    if (window.BeanMascot) BeanMascot.setState('idle');
  });

  document.getElementById('showLogin').addEventListener('click', () => {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('showLogin').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('showRegister').style.display = 'block';
    document.getElementById('loginTitle').textContent = 'Bienvenido';
    document.getElementById('loginSub').textContent = 'Sistema de Gestión de Despacho — S&D Sucden';
    if (window.BeanMascot) BeanMascot.setState('idle');
  });

  // ---- Mascota: se tapa los ojos mientras se escribe cualquiera de las
  // dos contraseñas (login o registro), y "mira" brevemente al escribir la
  // cédula/nombre. updateCoverState queda expuesta en este cierre (closure)
  // de setupLogin() para que el propio submit del login la pueda volver a
  // llamar después de mostrar el estado de error (ver más abajo). ----
  const claveInput = document.getElementById('loginClave');
  const cedulaInput = document.getElementById('loginCedula');
  const updateCoverState = () => {
    if (!window.BeanMascot) return;
    const focused = document.activeElement === claveInput;
    if (claveInput.value.length > 0 || focused) BeanMascot.setState('covering');
    else BeanMascot.setState('idle');
  };
  if (claveInput) {
    claveInput.addEventListener('focus', updateCoverState);
    claveInput.addEventListener('input', updateCoverState);
    claveInput.addEventListener('blur', updateCoverState);
  }
  if (cedulaInput) {
    cedulaInput.addEventListener('input', () => { if (window.BeanMascot) BeanMascot.turnHead(cedulaInput.value.length); });
    cedulaInput.addEventListener('blur', () => { if (window.BeanMascot) BeanMascot.resetHead(); });
  }

  const regClaveInput = document.getElementById('regClave');
  const regNombreInput = document.getElementById('regNombre');
  const updateCoverStateReg = () => {
    if (!window.BeanMascot) return;
    const focused = document.activeElement === regClaveInput;
    if (regClaveInput.value.length > 0 || focused) BeanMascot.setState('covering');
    else BeanMascot.setState('idle');
  };
  if (regClaveInput) {
    regClaveInput.addEventListener('focus', updateCoverStateReg);
    regClaveInput.addEventListener('input', updateCoverStateReg);
    regClaveInput.addEventListener('blur', updateCoverStateReg);
  }
  if (regNombreInput) {
    regNombreInput.addEventListener('input', () => { if (window.BeanMascot) BeanMascot.turnHead(regNombreInput.value.length); });
    regNombreInput.addEventListener('blur', () => { if (window.BeanMascot) BeanMascot.resetHead(); });
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('loginStatus');
    const btn = document.getElementById('loginBtn');
    const label = document.getElementById('loginBtnLabel');
    statusEl.className = 'status'; statusEl.textContent = '';
    const cedula = document.getElementById('loginCedula').value.trim();
    const clave = document.getElementById('loginClave').value;

    setButtonLoading(btn, label, 'Ingresando…', true);
    // Nota: aquí ya NO se usa el boot splash de pantalla completa (splashShow),
    // porque taparía a la mascota justo cuando más se luce (tapándose los
    // ojos / pensando / celebrando). El spinner del botón sigue avisando
    // que hay una petición en curso.
    if (window.BeanMascot) BeanMascot.setState('thinking');
    try {
      const data = await fetchJson(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'login', cedula, clave }) });
      if (!data.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
      currentUser = data.user;
      localStorage.setItem('sucden_user', JSON.stringify(currentUser));
      if (window.BeanMascot) BeanMascot.setState('success');
      // Pequeña pausa para que se alcance a ver el pulgar arriba antes de
      // pasar a la pantalla principal de la app.
      await new Promise(r => setTimeout(r, 750));
      showApp();
    } catch (err) {
      if (window.BeanMascot) BeanMascot.setState('error');
      statusEl.className = 'status err';
      statusEl.textContent = err.message;
      // Tras mostrar la carita de "esa no era", vuelve a taparse los ojos
      // si la clave sigue escrita en el campo (o queda en reposo si no).
      setTimeout(updateCoverState, 1600);
    } finally {
      setButtonLoading(btn, label, '', false, 'Ingresar al sistema');
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
    if (window.BeanMascot) BeanMascot.setState('thinking');
    try {
      const data = await fetchJson(WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'requestAccess', nombre, cedula, clave, aceptaPolitica })
      });
      if (!data.ok) throw new Error(data.error || 'No se pudo enviar la solicitud.');
      statusEl.className = 'status ok';
      statusEl.textContent = 'Solicitud enviada. Un administrador debe autorizarte antes de que puedas ingresar.';
      document.getElementById('registerForm').reset();
      if (window.BeanMascot) BeanMascot.setState('success');
      setTimeout(() => { if (window.BeanMascot) BeanMascot.setState('idle'); }, 1800);
    } catch (err) {
      statusEl.className = 'status err';
      statusEl.textContent = err.message;
      if (window.BeanMascot) BeanMascot.setState('error');
      setTimeout(updateCoverStateReg, 1600);
    } finally {
      setButtonLoading(btn, label, '', false, 'Solicitar acceso');
    }
  });
}

/* Devuelve la fecha de HOY en formato "YYYY-MM-DD" usando la hora LOCAL
 * del navegador. IMPORTANTE: no usar input.valueAsDate = new Date() para
 * esto, porque esa propiedad trabaja en UTC — en Colombia (UTC-5),
 * después de las 7:00 p.m. ya es "mañana" en UTC, y el campo terminaba
 * mostrando un día adelantado. Asignando el string directamente a
 * `.value` se evita ese salto de zona horaria. */
function localDateString(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('greetingText').textContent = 'Hola, ' + currentUser.nombre;
  document.getElementById('fecha').value = localDateString();
  prefillResponsable();

  if (currentUser.rol === 'admin') {
    document.getElementById('adminBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('adminBtn').style.display = 'none';
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
  recordsCache = { orquidea: null };
  pendingPhotosCache = { orquidea: [] };
  renderNotifBadge();
  const notifPanel = document.getElementById('notifPanel');
  if (notifPanel) notifPanel.classList.remove('open');
  // El botón flotante "‹ volver" vive fuera de #appScreen (para quedar fijo
  // en pantalla sin importar el scroll), así que ocultar #appScreen NO lo
  // oculta a él: sin esto, quedaba "pegado" y seguía viéndose encima de la
  // pantalla de inicio de sesión después de salir.
  const floatBtn = document.getElementById('floatingBack');
  if (floatBtn) floatBtn.classList.remove('show');
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('adminBtn').style.display = 'none'; // por si el usuario anterior era admin
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginCedula').value = '';
  document.getElementById('loginClave').value = '';
  if (window.BeanMascot) BeanMascot.setState('idle');
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
      const exportBtnEl = document.getElementById('exportCsvBtn');
      if (tab.dataset.tab === 'gallery') {
        loadGallery();
        if (exportBtnEl) exportBtnEl.classList.remove('is-hidden');
      } else if (exportBtnEl) {
        exportBtnEl.classList.add('is-hidden');
      }
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
    // IMPORTANTE: se ACUMULAN las fotos en vez de reemplazarlas. Antes,
    // cada vez que se tocaba el campo se perdían las fotos ya elegidas y
    // solo quedaba la última selección (por eso parecía que "solo dejaba
    // una foto"). Ahora se puede tocar varias veces (o elegir varias de
    // una sola vez desde la galería) y todas se van sumando, sin límite.
    const label = document.getElementById('extraFileLabel');
    const totalNuevas = extraFiles.files.length;
    let i = 0;
    for (const file of extraFiles.files) {
      i++;
      if (totalNuevas > 1) label.textContent = 'Optimizando foto ' + i + ' de ' + totalNuevas + '…';
      const fileData = await compressImageFile(file);
      addExtraFile(fileData);
    }
    extraFiles.value = ''; // limpia el input para poder volver a elegir/tomar más fotos
    updateExtraFilesUI();
  });

  document.getElementById('reportForm').addEventListener('submit', onSubmit);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
  document.getElementById('gallerySearch').addEventListener('input', renderGallery);

  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportGalleryCSV);

  // Cualquier cambio en los campos del reporte (o en los archivos) marca
  // el formulario como "con cambios sin guardar", para el aviso al salir.
  ['fecha', 'placa', 'lotes', 'responsable'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', markFormDirty);
  });
  mainFile.addEventListener('change', markFormDirty);
  extraFiles.addEventListener('change', markFormDirty);
}

/* Agrega una foto a la lista acumulada de "Imágenes adicionales". */
function addExtraFile(fileData) {
  extraFilesData.push(fileData);
}

/* Quita una foto ya elegida (antes de guardar) por su posición en la lista. */
function removeExtraFile(index) {
  extraFilesData.splice(index, 1);
  updateExtraFilesUI();
}

/* Redibuja las miniaturas, el contador y la etiqueta del campo de fotos
 * adicionales a partir de extraFilesData. */
function updateExtraFilesUI() {
  const thumbs = document.getElementById('extraThumbs');
  const extraFileRow = document.getElementById('extraFileRow');
  thumbs.innerHTML = '';
  extraFilesData.forEach((fileData, index) => {
    const item = document.createElement('div');
    item.className = 'thumb-item';
    const img = document.createElement('img');
    img.src = 'data:' + fileData.mimeType + ';base64,' + fileData.base64;
    const removeBtn = document.createElement('div');
    removeBtn.className = 'thumb-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Quitar esta foto';
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeExtraFile(index); });
    item.appendChild(img);
    item.appendChild(removeBtn);
    thumbs.appendChild(item);
  });

  const label = document.getElementById('extraFileLabel');
  if (extraFilesData.length) {
    label.textContent = extraFilesData.length + ' foto(s) seleccionadas — toca para agregar más';
    extraFileRow.classList.add('has-file');
  } else {
    label.textContent = 'Toca para agregar fotos (puedes elegir varias a la vez, o tocar de nuevo para sumar más)';
    extraFileRow.classList.remove('has-file');
  }
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
  const exportBtnEl = document.getElementById('exportCsvBtn');
  if (exportBtnEl) exportBtnEl.classList.add('is-hidden');
  cancelEdit();
  prefillResponsable();
}

async function refreshHubCounts() {
  ['orquidea'].forEach(async (group) => {
    try {
      const data = await fetchJson(WEB_APP_URL + '?action=list&group=' + group);
      if (data.ok) {
        recordsCache[group] = data.records;
        const el = document.getElementById('countOrquidea');
        if (el) el.textContent = data.records.length;
      }
    } catch (e) { /* silencioso: el contador simplemente no se actualiza esta vez */ }
  });
  refreshPendingBadge();
}

/* ------------------------- CAMPANA: REPORTES SIN FOTOS ------------------------- */

let pendingPhotosCache = { orquidea: [] };

/* Pide al backend, por cada grupo, la lista de reportes que todavía no
 * tienen ninguna foto adicional cargada, y actualiza la campana. Se llama
 * al entrar a la app y después de cualquier acción que pueda cambiar el
 * estado de fotos de un reporte (guardar, borrar reporte, borrar foto). */
async function refreshPendingBadge() {
  const groups = Object.keys(GROUP_LABELS);
  for (const group of groups) {
    try {
      const data = await fetchJson(WEB_APP_URL + '?action=pendingPhotos&group=' + group);
      if (data.ok) {
        pendingPhotosCache[group] = data.pending.map(p => Object.assign({ group }, p));
      }
    } catch (e) { /* silencioso: la campana simplemente no se actualiza esta vez */ }
  }
  renderNotifBadge();
  // Si el panel está abierto mientras se refresca (p.ej. tras subir una
  // foto), se vuelve a pintar para que no quede desactualizado en pantalla.
  const panel = document.getElementById('notifPanel');
  if (panel && panel.classList.contains('open')) renderNotifPanel();
  // Si la galería de "Registros guardados" está visible, se refresca también
  // para que la insignia "Sin fotos" de cada tarjeta quede al día.
  const galleryPanel = document.getElementById('panel-gallery');
  if (currentGroup && galleryPanel && galleryPanel.classList.contains('active') && recordsCache[currentGroup]) {
    renderGallery();
  }
}

function allPendingPhotos() {
  return Object.keys(pendingPhotosCache).reduce((acc, g) => acc.concat(pendingPhotosCache[g] || []), []);
}

function renderNotifBadge() {
  const badge = document.getElementById('notifBadge');
  const btn = document.getElementById('notifBtn');
  if (!badge || !btn) return;
  const total = allPendingPhotos().length;
  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = 'flex';
    btn.classList.add('has-notifs');
  } else {
    badge.style.display = 'none';
    btn.classList.remove('has-notifs');
  }
}

function setupNotifBell() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !panel.classList.contains('open');
    panel.classList.toggle('open', willOpen);
    if (willOpen) {
      renderNotifPanel();
      positionNotifPanel();
    }
  });

  // Si la ventana cambia de tamaño u orientación con el panel abierto, se
  // recalcula la posición para que siga completamente visible.
  window.addEventListener('resize', () => {
    if (panel.classList.contains('open')) positionNotifPanel();
  });

  document.addEventListener('click', (e) => {
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.classList.remove('open');
    }
  });
}

/* Calcula dónde debe quedar el panel de notificaciones a partir de la
 * posición real de la campana en pantalla (position:fixed + JS, en vez de
 * position:absolute + right:0), y lo "pega" al viewport para que nunca se
 * corte por el borde izquierdo o derecho — el bug que hacía que, en
 * móviles, no se alcanzara a leer la placa de cada reporte pendiente. */
function positionNotifPanel() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  if (!btn || !panel) return;
  const margin = 12;
  const btnRect = btn.getBoundingClientRect();
  const panelWidth = Math.min(300, window.innerWidth - margin * 2);

  let left = btnRect.right - panelWidth; // alineado por defecto al borde derecho del botón
  left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));

  let top = btnRect.bottom + 10;
  const maxTop = window.innerHeight - margin - 100; // deja al menos algo de panel visible
  if (top > maxTop) top = maxTop;

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.width = panelWidth + 'px';
}

function renderNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const all = allPendingPhotos();

  if (!all.length) {
    panel.innerHTML = '<div class="notif-empty">🎉 Todos los reportes tienen fotos.</div>';
    return;
  }

  panel.innerHTML =
    '<div class="notif-title">Pendientes de fotos (' + all.length + ')</div>' +
    '<div class="notif-list"></div>';
  const listEl = panel.querySelector('.notif-list');
  all.forEach(item => {
    const row = document.createElement('div');
    row.className = 'notif-item';
    row.innerHTML =
      '<div style="min-width:0;">' +
        '<div class="notif-item-plate">' + escapeHtml(item.placa || 'Sin placa') + '</div>' +
        '<div class="notif-item-meta">' + escapeHtml(formatDate(item.fecha)) + ' · ' + escapeHtml(item.responsable || 'Sin responsable') + '</div>' +
      '</div>' +
      '<span class="notif-item-icon" title="Sin fotos adicionales">⚠</span>';
    row.addEventListener('click', () => goToPendingReport(item));
    listEl.appendChild(row);
  });
}

/* Lleva de un tirón desde la campana hasta el reporte concreto: abre su
 * grupo, cambia a la pestaña de "Registros guardados", limpia el buscador
 * (para asegurar que el reporte esté entre los que se muestran) y despliega
 * su detalle con scroll automático. */
function goToPendingReport(item) {
  document.getElementById('notifPanel').classList.remove('open');
  openGroup(item.group);

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#panel-group .panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab[data-tab="gallery"]').classList.add('active');
  document.getElementById('panel-gallery').classList.add('active');
  const exportBtnEl = document.getElementById('exportCsvBtn');
  if (exportBtnEl) exportBtnEl.classList.remove('is-hidden');

  const searchEl = document.getElementById('gallerySearch');
  if (searchEl) searchEl.value = '';

  loadGallery().then(() => {
    setTimeout(() => {
      const target = document.querySelector('.report[data-report-id="' + CSS.escape(String(item.id)) + '"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!target.classList.contains('open')) target.querySelector('.report-head').click();
      }
    }, 150);
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

/* Comprime y redimensiona una foto en el navegador ANTES de subirla. Una
 * foto de cámara de celular suele pesar 3–8 MB; convertida a base64 eso
 * se vuelve un texto todavía más pesado, y subir varias de una vez es lo
 * que hace que "guardar" se sienta lento. Redimensionando al ancho máximo
 * indicado y guardando como JPEG con esta calidad, el archivo final queda
 * normalmente entre 150–400 KB, sin pérdida de calidad visible para un
 * reporte de despacho. PDFs y GIFs se suben tal cual, sin tocar. */
function compressImageFile(file, maxDim, quality) {
  maxDim = maxDim || 1600;
  quality = quality || 0.72;
  return new Promise((resolve, reject) => {
    const uploadAsIs = () => fileToBase64(file)
      .then(base64 => resolve({ base64, mimeType: file.type, filename: file.name }))
      .catch(reject);

    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
      uploadAsIs();
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else { width = Math.round(width * (maxDim / height)); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { uploadAsIs(); return; }
        // Si la compresión no logró achicar el archivo (raro, pero puede
        // pasar con imágenes ya muy comprimidas), se usa el original.
        if (blob.size >= file.size) { uploadAsIs(); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          const baseName = file.name.replace(/\.[^.]+$/, '');
          resolve({ base64, mimeType: 'image/jpeg', filename: baseName + '.jpg' });
        };
        reader.onerror = () => uploadAsIs();
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = uploadAsIs; // formato raro (p.ej. HEIC no soportado por el navegador): se sube tal cual
    img.src = url;
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

  // Recordatorio de trazabilidad: si no se adjuntó ni el documento anexo ni
  // ninguna foto adicional, se confirma con el usuario antes de guardar,
  // ya que las imágenes son clave para poder rastrear el despacho después.
  const mainFileInputCheck = document.getElementById('mainFile');
  const hasMainFile = mainFileInputCheck.files.length > 0;
  const hasExtraImages = extraFilesData.length > 0;
  if (!hasMainFile && !hasExtraImages) {
    const seguirSinImagenes = window.confirm(
      'No has adjuntado ninguna imagen para este despacho.\n\n' +
      'Las imágenes son importantes para la trazabilidad del despacho.\n\n' +
      '¿Deseas guardar el reporte de todas formas, sin imágenes?'
    );
    if (!seguirSinImagenes) return;
  }

  setButtonLoading(submitBtn, submitLabel, 'Guardando…', true);

  try {
    let mainFileData = null;
    const mainFileInput = document.getElementById('mainFile');
    if (mainFileInput.files.length) {
      const f = mainFileInput.files[0];
      mainFileData = await compressImageFile(f);
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

    // IMPORTANTE: a propósito este envío NO usa fetchJson() (que reintenta
    // automáticamente). Guardar un reporte no es una operación segura de
    // repetir: si el primer intento sí llegó a crear el reporte en el
    // servidor pero la respuesta se perdió en el camino, un reintento
    // automático podría crear un reporte DUPLICADO. Por eso aquí se hace
    // un solo intento, con un mensaje de error claro para que la persona
    // decida si repetir manualmente.
    const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error('El servidor respondió con estado ' + res.status + '. Verifica tu conexión e inténtalo de nuevo.');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    statusEl.className = 'status ok';
    statusEl.textContent = isEdit ? 'Reporte actualizado correctamente.' : 'Reporte guardado correctamente.';
    resetForm();
    recordsCache[currentGroup] = null;
    refreshPendingBadge(); // el reporte pudo dejar de estar "pendiente de fotos"
  } catch (err) {
    statusEl.className = 'status err';
    statusEl.textContent = 'No se pudo guardar: ' + err.message;
  } finally {
    setButtonLoading(submitBtn, submitLabel, '', false, editingId ? 'Guardar cambios' : 'Guardar reporte');
  }
}

function resetForm() {
  document.getElementById('reportForm').reset();

  // IMPORTANTE: no basta con confiar solo en form.reset(). En algunos
  // navegadores (Chrome sobre todo) el autocompletado del formulario
  // vuelve a rellenar los campos de texto con el último valor escrito.
  // Por eso aquí se vacían explícitamente uno por uno: así el único
  // campo que queda con datos después de guardar es "Responsable del
  // despacho" (con el nombre de quien inició sesión), tal como se pidió.
  document.getElementById('fecha').value = '';
  document.getElementById('fecha').value = localDateString();
  document.getElementById('placa').value = '';
  document.getElementById('lotes').value = '';
  document.getElementById('responsable').value = '';

  document.getElementById('mainFile').value = '';
  document.getElementById('mainFileLabel').textContent = 'Toca para tomar foto o adjuntar archivo';
  document.getElementById('mainFileRow').classList.remove('has-file');

  extraFilesData = [];
  updateExtraFilesUI();

  cancelEdit();
  prefillResponsable(); // vuelve a poner el nombre de quien inició sesión, ya que el campo quedó vacío arriba
  formDirty = false; // ya se guardó (o se limpió intencionalmente), no hay nada pendiente
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
  const exportBtnEl = document.getElementById('exportCsvBtn');
  if (exportBtnEl) exportBtnEl.classList.add('is-hidden');
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
    const data = await fetchJson(WEB_APP_URL + '?action=list&group=' + currentGroup);
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    recordsCache[currentGroup] = data.records;
    renderGallery();
  } catch (err) {
    listEl.innerHTML =
      '<div class="empty">No se pudieron cargar los reportes: ' + escapeHtml(err.message) +
      '<br><button class="secondary" style="margin-top:10px;width:auto;padding:8px 16px;" onclick="loadGallery()">Reintentar</button></div>';
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
    const lotes = String(r['Numero De Lotes '] || '').toLowerCase();
    return placa.indexOf(query) !== -1 || resp.indexOf(query) !== -1 || lotes.indexOf(query) !== -1;
  });

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty">No hay reportes para mostrar.</div>';
    return;
  }

  // Ids de reportes de este grupo que la campana ya marcó como "sin fotos
  // adicionales", para pintarles la insignia de aviso aquí mismo en la
  // lista, sin que el usuario tenga que abrir cada registro uno por uno.
  const pendingIds = new Set(
    (pendingPhotosCache[currentGroup] || [])
      .filter(p => String(p.group) === String(currentGroup))
      .map(p => String(p.id))
  );

  listEl.innerHTML = '';
  filtered.forEach(rec => {
    const reportId = rec['Id_Reporte'];
    const div = document.createElement('div');
    div.className = 'report';
    div.dataset.reportId = reportId;
    const noPhotoBadge = pendingIds.has(String(reportId))
      ? '<span class="no-photo-badge" title="Este reporte todavía no tiene fotos adicionales">⚠ Sin fotos</span>'
      : '';
    div.innerHTML =
      '<div class="report-head">' +
        '<div>' +
          '<div class="plate">' + escapeHtml(rec['Placa Del Vehiculo '] || 'Sin placa') + noPhotoBadge + '</div>' +
          '<div class="meta">' + escapeHtml(formatDate(rec['Fecha '])) + ' · ' + escapeHtml(rec['Nom: Del Respnsable del Despacho '] || '') + '</div>' +
        '</div>' +
        '<span class="chevron">&#9662;</span>' +
      '</div>' +
      '<div class="report-body"><div class="loading"><span class="spinner dark"></span>Cargando imágenes…</div></div>';

    const head = div.querySelector('.report-head');
    head.addEventListener('click', () => {
      const wasOpen = div.classList.contains('open');
      div.classList.toggle('open');
      // Solo se piden las imágenes la PRIMERA vez que se abre este reporte
      // en la sesión actual. Si ya se cargaron antes, se reabre al instante
      // con lo que ya está en pantalla, en lugar de volver a pedirlas al
      // servidor cada vez que se pliega/despliega el mismo reporte.
      if (!wasOpen && !div.dataset.loaded) {
        div.dataset.loaded = '1';
        loadImages(reportId, div.querySelector('.report-body'), rec);
      }
    });

    listEl.appendChild(div);
  });
}

/* Etiquetas legibles para encabezados conocidos de la hoja. Cualquier
 * columna que no esté en este mapa igual se muestra, con una etiqueta
 * "limpiada" automáticamente (sin espacios de más, con mayúscula inicial),
 * para que el detalle del reporte SIEMPRE muestre toda la información que
 * exista en la hoja, aunque se agreguen columnas nuevas más adelante. */
const FIELD_LABELS = {
  'Fecha ': 'Fecha',
  'Placa Del Vehiculo ': 'Placa del vehículo',
  'Numero De Lotes ': 'Número de lotes',
  'Nom: Del Respnsable del Despacho ': 'Responsable del despacho'
};

/* Campos que NO deben repetirse en la grilla de detalle porque ya se
 * muestran en otro lugar (cabecera del reporte, documento anexo) o son
 * alias/técnicos internos. */
const DETAIL_SKIP_KEYS = new Set([
  'Id_Reporte', 'Documentos Anexos', 'Placa', 'Fecha', 'Lotes', 'Responsable'
]);

function friendlyLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const clean = String(key).trim().replace(/\s+/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/* ------------------------- EXPORTAR A EXCEL/CSV ------------------------- */

/* Descarga un .csv (se abre directo en Excel) con los reportes que están
 * actualmente visibles en "Registros guardados" — es decir, respeta el
 * texto que se haya escrito en el buscador. Incluye primero los 4 campos
 * principales y luego cualquier otra columna que exista en la hoja, para
 * que el reporte gerencial nunca se quede corto de información. */
function exportGalleryCSV() {
  const records = recordsCache[currentGroup] || [];
  const query = document.getElementById('gallerySearch').value.trim().toLowerCase();

  const filtered = records.filter(r => {
    if (!query) return true;
    const placa = String(r['Placa Del Vehiculo '] || '').toLowerCase();
    const resp = String(r['Nom: Del Respnsable del Despacho '] || '').toLowerCase();
    const lotes = String(r['Numero De Lotes '] || '').toLowerCase();
    return placa.indexOf(query) !== -1 || resp.indexOf(query) !== -1 || lotes.indexOf(query) !== -1;
  });

  if (!filtered.length) {
    window.alert('No hay reportes para exportar con el filtro actual.');
    return;
  }

  const fixedKeys = ['Fecha ', 'Placa Del Vehiculo ', 'Numero De Lotes ', 'Nom: Del Respnsable del Despacho '];
  const extraKeysSet = new Set();
  filtered.forEach(rec => {
    Object.keys(rec).forEach(key => {
      if (fixedKeys.indexOf(key) !== -1) return;
      if (DETAIL_SKIP_KEYS.has(key)) return;
      if (key === 'Id_Reporte') return;
      extraKeysSet.add(key);
    });
  });
  const allKeys = fixedKeys.concat(Array.from(extraKeysSet));

  const headerRow = allKeys.map(k => friendlyLabel(k));
  const rows = [headerRow];

  filtered.forEach(rec => {
    const row = allKeys.map(key => {
      const value = rec[key];
      if (value === undefined || value === null) return '';
      if (key === 'Fecha ') return formatDate(value);
      return String(value);
    });
    rows.push(row);
  });

  const csvContent = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  // El BOM al inicio hace que Excel muestre bien las tildes y la "ñ".
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const groupName = (GROUP_LABELS[currentGroup] || currentGroup).replace(/\s+/g, '_');
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Reportes_' + groupName + '_' + localDateString() + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* Envuelve en comillas y escapa un valor para que el CSV se abra bien en
 * Excel aunque el texto tenga comas, comillas o saltos de línea. */
function csvEscape(value) {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/* Arma la grilla con TODA la información del registro: primero los campos
 * principales en un orden fijo y legible, y luego cualquier otra columna
 * que exista en la hoja de Google (para que nunca falte información aunque
 * se agreguen campos nuevos en el futuro). */
function buildDetailsGrid(rec) {
  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  const addItem = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const item = document.createElement('div');
    item.className = 'detail-item';
    const isDate = label.toLowerCase().indexOf('fecha') !== -1;
    item.innerHTML =
      '<div class="detail-label">' + escapeHtml(label) + '</div>' +
      '<div class="detail-value">' + escapeHtml(isDate ? formatDate(value) : String(value)) + '</div>';
    grid.appendChild(item);
  };

  addItem('Fecha', rec['Fecha ']);
  addItem('Placa del vehículo', rec['Placa Del Vehiculo ']);
  addItem('Número de lotes', rec['Numero De Lotes ']);
  addItem('Responsable del despacho', rec['Nom: Del Respnsable del Despacho ']);

  Object.keys(rec).forEach(key => {
    if (key === 'Fecha ' || key === 'Placa Del Vehiculo ' || key === 'Numero De Lotes ' || key === 'Nom: Del Respnsable del Despacho ') return;
    if (DETAIL_SKIP_KEYS.has(key)) return;
    addItem(friendlyLabel(key), rec[key]);
  });

  return grid;
}

/* Resuelve (bajo demanda) el enlace del "Documento anexo" del reporte,
 * si existe, usando la acción "mainFile" del backend. */
async function buildDocumentLink(rec) {
  const path = rec['Documentos Anexos'];
  if (!path) return null;
  try {
    const data = await fetchJson(WEB_APP_URL + '?action=mainFile&group=' + currentGroup + '&path=' + encodeURIComponent(path));
    if (!data.ok || !data.viewUrl) return null;
    const a = document.createElement('a');
    a.className = 'doc-link';
    a.href = data.downloadUrl || data.viewUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"></path></svg> Ver documento anexo';
    return a;
  } catch (e) {
    return null;
  }
}

async function loadImages(reportId, bodyEl, rec) {
  try {
    // La información del reporte (fecha, placa, lotes, responsable y
    // cualquier otro campo de la hoja) se muestra de inmediato: no depende
    // de que las imágenes terminen de cargar.
    bodyEl.innerHTML = '';
    bodyEl.appendChild(buildDetailsGrid(rec));

    const docLink = await buildDocumentLink(rec);
    if (docLink) bodyEl.appendChild(docLink);

    const imgSectionTitle = document.createElement('div');
    imgSectionTitle.className = 'section-title';
    imgSectionTitle.textContent = 'Imágenes adicionales';
    bodyEl.appendChild(imgSectionTitle);

    const loadingImgs = document.createElement('div');
    loadingImgs.className = 'loading';
    loadingImgs.innerHTML = '<span class="spinner dark"></span>Cargando imágenes…';
    bodyEl.appendChild(loadingImgs);

    const data = await fetchJson(WEB_APP_URL + '?action=listImages&group=' + currentGroup + '&reportId=' + encodeURIComponent(reportId));
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    loadingImgs.remove();

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
        cell.appendChild(buildPhotoDeleteButton(img, cell));

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

    bodyEl.appendChild(buildDeleteButton(reportId));
  } catch (err) {
    // No se borra lo que ya se alcanzó a mostrar (datos del reporte, documento
    // anexo); solo se informa que las imágenes no pudieron cargarse.
    const errEl = document.createElement('div');
    errEl.className = 'empty';
    errEl.textContent = 'No se pudieron cargar las imágenes: ' + err.message;
    bodyEl.appendChild(errEl);

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Editar este reporte';
    editBtn.addEventListener('click', () => startEdit(rec));
    bodyEl.appendChild(editBtn);

    bodyEl.appendChild(buildDeleteButton(reportId));
  }
}

/* Crea el botoncito circular con ícono de basurero que va sobre cada foto
 * individual, para borrarla sin tener que eliminar todo el reporte. Usa la
 * acción "deleteImage" del backend, que ya existe pero antes no estaba
 * conectada a ningún botón en el front. */
function buildPhotoDeleteButton(img, cell) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'photo-del-btn';
  btn.title = 'Eliminar esta foto';
  btn.setAttribute('aria-label', 'Eliminar esta foto');
  btn.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>' +
    '<path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>' +
    '<span class="mini-spinner"></span>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // que no abra el lightbox al tocar el botón
    deletePhoto(img, cell, btn);
  });
  return btn;
}

async function deletePhoto(img, cell, btn) {
  const ok = window.confirm('¿Eliminar esta foto? No se puede deshacer.');
  if (!ok) return;

  btn.classList.add('is-loading');
  btn.disabled = true;

  try {
    const data = await fetchJson(WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'deleteImage', group: currentGroup, path: img.path })
    });
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    // Animación de salida y luego se quita del DOM.
    cell.classList.add('removing');
    setTimeout(() => cell.remove(), 180);
    refreshPendingBadge(); // si era su última foto, el reporte vuelve a quedar "pendiente"
  } catch (err) {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    window.alert('No se pudo eliminar la foto: ' + err.message);
  }
}

/* Crea el botón "Eliminar este reporte", con confirmación, que borra el
 * registro de la hoja de datos (no borra las fotos ya subidas a Drive). */
function buildDeleteButton(reportId) {
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = 'Eliminar este reporte';
  deleteBtn.addEventListener('click', () => deleteReport(reportId, deleteBtn));
  return deleteBtn;
}

async function deleteReport(reportId, triggerBtn) {
  const ok = window.confirm('¿Seguro que quieres eliminar este reporte? Esto borrará también TODAS sus fotos (no se puede deshacer).');
  if (!ok) return;

  const originalText = triggerBtn.textContent;
  triggerBtn.disabled = true;
  triggerBtn.textContent = 'Eliminando…';

  try {
    const data = await fetchJson(WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', group: currentGroup, id: reportId })
    });
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    // Se quita el reporte de la caché local y se vuelve a dibujar la lista,
    // sin necesidad de recargar todo desde el servidor.
    if (recordsCache[currentGroup]) {
      recordsCache[currentGroup] = recordsCache[currentGroup].filter(r => r['Id_Reporte'] !== reportId);
    }
    renderGallery();
    refreshHubCounts();
  } catch (err) {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalText;
    window.alert('No se pudo eliminar el reporte: ' + err.message);
  }
}

/* ------------------------- ADMIN ------------------------- */

async function loadAdmin() {
  const pendingEl = document.getElementById('pendingList');
  const allEl = document.getElementById('allUsersList');
  pendingEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando…</div>';
  allEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando…</div>';

  try {
    const data = await fetchJson(WEB_APP_URL + '?action=listPendingUsers&adminCedula=' + encodeURIComponent(currentUser.cedula));
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    renderPending(data.users);
  } catch (err) {
    pendingEl.innerHTML = '<div class="empty">' + err.message + '</div>';
  }

  try {
    const data2 = await fetchJson(WEB_APP_URL + '?action=listUsers&adminCedula=' + encodeURIComponent(currentUser.cedula));
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
    const data = await fetchJson(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action, cedula, adminCedula: currentUser.cedula }) });
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
  // IMPORTANTE: las fechas se guardan como "solo fecha" (medianoche UTC),
  // no como un instante real. Si se formatean con toLocaleDateString()
  // directamente, JavaScript aplica la zona horaria LOCAL del navegador
  // (en Colombia, UTC-5) y la fecha se corre un día hacia atrás — por
  // ejemplo, un registro del 5 de septiembre se mostraba como "04 de
  // sept". Por eso aquí se arma una fecha nueva a partir de los
  // componentes UTC (año/mes/día), ignorando la hora, para que se
  // muestre el mismo día calendario que quedó guardado.
  const soloFecha = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return soloFecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
