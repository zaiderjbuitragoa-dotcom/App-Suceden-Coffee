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

document.addEventListener('DOMContentLoaded', () => {
  if (!WEB_APP_URL || WEB_APP_URL.indexOf('PON_AQUI') !== -1) {
    document.getElementById('configWarning').style.display = 'block';
  }

  startClock();
  setupPolicyModal();
  setupLogin();
  setupApp();
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
  });

  document.getElementById('showLogin').addEventListener('click', () => {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('showLogin').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('showRegister').style.display = 'block';
    document.getElementById('loginTitle').textContent = 'Bienvenido';
    document.getElementById('loginSub').textContent = 'Sistema de Gestión de Despacho — S&D Sucden';
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
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('adminBtn').style.display = 'none'; // por si el usuario anterior era admin
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
    for (const file of extraFiles.files) {
      const base64 = await fileToBase64(file);
      addExtraFile({ base64, mimeType: file.type, filename: file.name });
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
      const res = await fetch(WEB_APP_URL + '?action=list&group=' + group);
      const data = await res.json();
      if (data.ok) {
        recordsCache[group] = data.records;
        const el = document.getElementById('countOrquidea');
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
    const lotes = String(r['Numero De Lotes '] || '').toLowerCase();
    return placa.indexOf(query) !== -1 || resp.indexOf(query) !== -1 || lotes.indexOf(query) !== -1;
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
    const res = await fetch(WEB_APP_URL + '?action=mainFile&group=' + currentGroup + '&path=' + encodeURIComponent(path));
    const data = await res.json();
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

    const res = await fetch(WEB_APP_URL + '?action=listImages&group=' + currentGroup + '&reportId=' + encodeURIComponent(reportId));
    const data = await res.json();
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
    const res = await fetch(WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', group: currentGroup, id: reportId })
    });
    const data = await res.json();
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
