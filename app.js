// ============================================================
// CONFIGURACIÓN
// ============================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzNdxZmQ_ZQVTYVFBnuVF4_Gf1RmZuk2HUFxdOdYv6jKtRFFRSaRsdHX0UtNvSVvy1hkA/exec';

const GROUP_LABELS = { orquidea: 'Datos Orquídea' };

// ------------------------------------------------------------

let currentGroup = null;
let extraFilesData = [];
let mainFilePending = null;   // promesa de la compresión del documento anexo
let submitting = false;       // true mientras se guarda: bloquea el doble toque
let currentSubmitId = null;   // identificador del reporte que se está guardando (anti-duplicados)
let currentSubmitSig = '';
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
      if (data && data.code === 'AUTH') sessionExpired();   // el servidor ya no reconoce la sesión
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

/* ------------------------- CACHÉ LOCAL (6 HORAS) -------------------------
 * Los reportes, la lista de "sin fotos", las fotos de cada reporte y los
 * enlaces de documentos se guardan en el navegador por 6 horas. Así la app
 * abre al instante, sin esperar al servidor. Lo que el propio usuario
 * guarda/edita/borra se refleja en la caché al momento. Para traer cambios
 * de otras personas antes de las 6 horas está el botón ↻ "Actualizar". */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_PREFIX = 'sucden_cache_v2:';
const GROUP = 'orquidea';

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.t !== 'number' || Date.now() - o.t > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return o;
  } catch (e) { return null; }
}

/** Devuelve la entrada aunque ya haya vencido (no la borra): sirve para mostrar
 *  datos al instante mientras se renuevan en segundo plano. */
function cacheGetStale(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return (o && typeof o.t === 'number') ? o : null;
  } catch (e) { return null; }
}

function cacheSet(key, data, t) {
  const payload = JSON.stringify({ t: t || Date.now(), d: data });
  try { localStorage.setItem(CACHE_PREFIX + key, payload); }
  catch (e) {
    // Cuota llena: se borran las cachés pequeñas (fotos/documentos) y se reintenta una vez.
    cacheClear('imgs:'); cacheClear('doc:');
    try { localStorage.setItem(CACHE_PREFIX + key, payload); } catch (e2) { /* sin caché esta vez */ }
  }
}

function cacheRemove(key) { try { localStorage.removeItem(CACHE_PREFIX + key); } catch (e) {} }

/** Borra todas las entradas que empiecen por `prefix` (o toda la caché si va vacío). */
function cacheClear(prefix) {
  try {
    const start = CACHE_PREFIX + (prefix || '');
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(start) === 0) toDelete.push(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

let dataSyncedAt = 0;
let syncInFlight = null;
let dataVersion = 0; // sube cada vez que cambian los datos en memoria (evita redibujos innecesarios)

function dataIsFresh() {
  return !!recordsCache[GROUP] && (Date.now() - dataSyncedAt) < CACHE_TTL_MS;
}

function applyData(records, pending, t) {
  recordsCache[GROUP] = records;
  pendingPhotosCache[GROUP] = (pending || []).map(p => Object.assign({ group: GROUP }, p));
  dataSyncedAt = t;
  dataVersion++;
}

/** Guarda en el navegador el estado actual (después de cambios locales). */
function persistData() {
  dataVersion++;
  if (!recordsCache[GROUP]) return;
  cacheSet('records', recordsCache[GROUP], dataSyncedAt);
  cacheSet('pending', pendingPhotosCache[GROUP], dataSyncedAt);
}

/** Deja en memoria los reportes y pendientes. Usa la caché si tiene menos de
 *  6 horas (sin tocar la red); con force=true va al servidor saltándose todas
 *  las cachés. Una sola llamada ("init") trae reportes + pendientes. */
async function syncData(force) {
  if (!force) {
    if (dataIsFresh()) return;
    const rec = cacheGet('records'), pen = cacheGet('pending');
    if (rec && pen) { applyData(rec.d, pen.d, Math.min(rec.t, pen.t)); return; }
    // Caché vencida (más de 6 h): se muestra lo último que se tenía AL INSTANTE
    // y se renueva por detrás, en vez de dejar la pantalla esperando al servidor.
    if (!recordsCache[GROUP]) {
      const sr = cacheGetStale('records'), sp = cacheGetStale('pending');
      if (sr && sp) {
        applyData(sr.d, sp.d, Math.min(sr.t, sp.t));
        syncData(true).then(() => {
          try { updateHubCount(); renderPendingUI(); if (currentGroup) renderGallery(); } catch (e) {}
        }).catch(() => {});
        return;
      }
    }
    if (syncInFlight) return syncInFlight;
  } else if (syncInFlight) {
    try { await syncInFlight; } catch (e) {}
  }

  syncInFlight = (async () => {
    try {
      const q = force ? '&fresh=1' : '';
      let records, pending;
      const init = await fetchJson(WEB_APP_URL + '?action=init&group=' + GROUP + q);
      if (init.ok) {
        records = init.records; pending = init.pending;
      } else if (String(init.error || '').indexOf('Acción no reconocida') !== -1) {
        // Backend antiguo (aún sin "init"): se piden las dos cosas por separado.
        const a = await fetchJson(WEB_APP_URL + '?action=list&group=' + GROUP + q);
        const b = await fetchJson(WEB_APP_URL + '?action=pendingPhotos&group=' + GROUP + q);
        if (!a.ok) throw new Error(a.error || 'Error desconocido');
        records = a.records; pending = b.ok ? b.pending : [];
      } else {
        throw new Error(init.error || 'Error desconocido');
      }
      if (force) { cacheClear('imgs:'); cacheClear('doc:'); }
      applyData(records, pending, Date.now());
      persistData();
    } finally { syncInFlight = null; }
  })();
  return syncInFlight;
}

/** Fotos de un reporte: caché de 6 h; si no hay, se piden al servidor. */
async function getReportImages(reportId, force) {
  const key = 'imgs:' + reportId;
  if (!force) { const c = cacheGet(key); if (c) return c.d; }
  const data = await fetchJson(WEB_APP_URL + '?action=listImages&group=' + GROUP + '&reportId=' + encodeURIComponent(reportId) + (force ? '&fresh=1' : ''));
  if (!data.ok) throw new Error(data.error || 'Error desconocido');
  cacheSet(key, data.images);
  return data.images;
}

/** Siguiente número de foto (NN del nombre del archivo), si se conocen las ya subidas. */
function nextSeqFor(reportId) {
  const c = cacheGet('imgs:' + reportId);
  if (!c) return null;
  let max = 0;
  c.d.forEach(im => {
    const m = /_(\d{1,3})\.[A-Za-z0-9]+$/.exec(im.name || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max + 1;
}

/* --- Cambios locales: la caché se mantiene al día sin volver al servidor --- */

function pendingItemFor(rec) {
  return {
    group: GROUP,
    id: rec['Id_Reporte'],
    placa: rec['Placa Del Vehiculo '] || '',
    fecha: rec['Fecha '] || '',
    responsable: rec['Nom: Del Respnsable del Despacho '] || ''
  };
}

function setReportPending(reportId, isPending) {
  const list = pendingPhotosCache[GROUP] || [];
  const idx = list.findIndex(p => String(p.id) === String(reportId));
  if (isPending && idx === -1) {
    const rec = (recordsCache[GROUP] || []).find(r => String(r['Id_Reporte']) === String(reportId));
    if (rec) list.unshift(pendingItemFor(rec));
  } else if (!isPending && idx !== -1) {
    list.splice(idx, 1);
  }
  pendingPhotosCache[GROUP] = list;
}

function addLocalRecord(rec, willHavePhotos) {
  if (!recordsCache[GROUP]) return; // aún no se ha cargado nada: la próxima carga lo traerá
  recordsCache[GROUP].unshift(rec);
  markReportSeen(rec['Id_Reporte']);   // un reporte que creo yo no me avisa a mí
  if (!willHavePhotos) setReportPending(rec['Id_Reporte'], true);
  persistData();
  renderPendingUI();
}

function updateLocalRecord(id, fields, willHavePhotos) {
  const rec = (recordsCache[GROUP] || []).find(r => String(r['Id_Reporte']) === String(id));
  if (rec) Object.assign(rec, fields);
  const pend = (pendingPhotosCache[GROUP] || []).find(p => String(p.id) === String(id));
  if (pend && rec) Object.assign(pend, pendingItemFor(rec));
  if (willHavePhotos) setReportPending(id, false);
  persistData();
  renderPendingUI();
}

function removeLocalRecord(id) {
  if (recordsCache[GROUP]) {
    recordsCache[GROUP] = recordsCache[GROUP].filter(r => String(r['Id_Reporte']) !== String(id));
  }
  setReportPending(id, false);
  cacheRemove('imgs:' + id);
  persistData();
}

function updateHubCount() {
  const el = document.getElementById('countOrquidea');
  if (el && recordsCache[GROUP]) el.textContent = recordsCache[GROUP].length;
}

function updateCacheInfo() {
  const el = document.getElementById('cacheInfo');
  if (!el) return;
  el.textContent = dataSyncedAt
    ? 'Datos al ' + new Date(dataSyncedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) + ' · se renuevan solos cada 6 h'
    : '';
}

/* ------------------------- SUBIDA DE FOTOS EN SEGUNDO PLANO -------------------------
 * Guardar un reporte ahora envía primero SOLO los datos (rápido) y deja libre
 * el formulario. Las fotos suben después, 3 a la vez, mostrando el avance
 * abajo. Si alguna falla se reintenta sola y, si aun así no sube, aparece
 * un aviso con botón "Reintentar". */
const PHOTO_CONCURRENCY = 5;
const photoQueue = [];
const uploadedByReport = {};
let photoActive = 0;
let photoRetrying = 0;
let uploadStats = { total: 0, done: 0, failed: [] };
let toastTimer = null;

function uploadsPending() {
  return photoActive > 0 || photoQueue.length > 0 || photoRetrying > 0 || uploadStats.failed.length > 0;
}

/** Identificador corto generado en el navegador (letra a–f + 7 hex, igual que el del servidor).
 *  Va con cada envío: si un envío se repite (reintento, doble toque, respuesta perdida),
 *  el servidor reconoce el mismo identificador y NO crea el registro otra vez. */
function newClientId() {
  const b = new Uint8Array(4);
  (window.crypto || window.msCrypto).getRandomValues(b);
  const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('').substr(0, 7);
  return 'abcdef'.charAt(b[0] % 6) + hex;
}

function enqueuePhotos(reportId, meta, files, startSeq) {
  files.forEach((file, i) => {
    photoQueue.push({ kind: 'photo', imgId: newClientId(), reportId, meta, file, seq: startSeq != null ? startSeq + i : null, attempts: 0, tried: false });
  });
  uploadStats.total += files.length;
  clearTimeout(toastTimer);
  renderUploadToast();
  pumpPhotos();
}

/** El documento anexo también sube en segundo plano: guardar el reporte ya no espera a Drive. */
function enqueueDocument(reportId, meta, file) {
  photoQueue.unshift({ kind: 'doc', reportId, meta, file, seq: null, attempts: 0, tried: false });
  uploadStats.total += 1;
  clearTimeout(toastTimer);
  renderUploadToast();
  pumpPhotos();
}

let persistTimer = null;
/** Guarda la caché en el navegador sin hacerlo una vez por cada foto (escribir todo el listado es lento). */
function persistDataSoon() {
  dataVersion++;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistData, 500);
}

function setLocalDocPath(reportId, path) {
  const rec = (recordsCache[GROUP] || []).find(r => String(r['Id_Reporte']) === String(reportId));
  if (rec && path) rec['Documentos Anexos'] = path;
}

function pumpPhotos() {
  while (photoActive < PHOTO_CONCURRENCY && photoQueue.length) {
    const task = photoQueue.shift();
    photoActive++;
    uploadPhotoTask(task).finally(() => { photoActive--; pumpPhotos(); });
  }
  if (!photoActive && !photoQueue.length && !photoRetrying) finishUploads();
}

async function uploadPhotoTask(task) {
  try {
    const isDoc = task.kind === 'doc';
    const body = isDoc
      ? { action: 'attachDocument', group: GROUP, id: task.reportId, file: task.file, meta: task.meta }
      : { action: 'addImage', group: GROUP, reportId: task.reportId, file: task.file, meta: task.meta, imgId: task.imgId };
    // El número NN solo se usa en el primer intento; en reintentos el servidor
    // pone un sufijo único, para no duplicar nombres si el 1.º sí había llegado.
    // (imgId viaja siempre igual: si el 1.º sí llegó, el servidor lo reconoce y no repite la foto.)
    if (!isDoc && task.seq != null && !task.tried) body.seq = task.seq;
    task.tried = true;
    const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) throw new Error('estado ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    uploadStats.done++;
    if (isDoc) {
      setLocalDocPath(task.reportId, data.result && data.result.path);
      cacheClear('doc:');
    } else {
      cacheRemove('imgs:' + task.reportId);
      uploadedByReport[task.reportId] = (uploadedByReport[task.reportId] || 0) + 1;
      setReportPending(task.reportId, false);
    }
    persistDataSoon();
  } catch (err) {
    task.attempts++;
    if (task.attempts < 3) {
      photoRetrying++;
      setTimeout(() => { photoRetrying--; photoQueue.push(task); pumpPhotos(); }, 900 * task.attempts);
    } else {
      uploadStats.failed.push(task);
    }
  }
  renderUploadToast();
}

function finishUploads() {
  // Reportes que quedaron sin NINGUNA foto subida vuelven a la campana.
  const ids = {};
  uploadStats.failed.forEach(t => { if (t.kind !== 'doc') ids[t.reportId] = true; });
  Object.keys(ids).forEach(id => { if (!uploadedByReport[id]) setReportPending(id, true); });
  persistData();
  renderPendingUI();
  renderUploadToast();
  if (!uploadStats.failed.length) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (!uploadsPending()) { uploadStats = { total: 0, done: 0, failed: [] }; renderUploadToast(); }
    }, 2500);
  }
}

function retryFailedPhotos() {
  const failed = uploadStats.failed;
  uploadStats.failed = [];
  failed.forEach(t => { t.attempts = 0; photoQueue.push(t); });
  renderUploadToast();
  pumpPhotos();
}

function discardFailedPhotos() {
  uploadStats = { total: 0, done: 0, failed: [] };
  renderUploadToast();
}

function renderUploadToast() {
  const el = document.getElementById('uploadToast');
  if (!el) return;
  const { total, done, failed } = uploadStats;
  if (!total) { el.className = 'upload-toast'; el.innerHTML = ''; return; }
  const settled = !photoActive && !photoQueue.length && !photoRetrying;
  if (failed.length && settled) {
    el.className = 'upload-toast show err';
    el.innerHTML =
      '<div class="ut-text">⚠ ' + failed.length + ' archivo(s) no se pudieron subir.</div>' +
      '<div class="ut-actions"><button type="button" id="utRetry">Reintentar</button><button type="button" id="utDiscard" class="ghost">Descartar</button></div>';
    document.getElementById('utRetry').addEventListener('click', retryFailedPhotos);
    document.getElementById('utDiscard').addEventListener('click', discardFailedPhotos);
  } else if (settled) {
    el.className = 'upload-toast show ok';
    el.innerHTML = '<div class="ut-text">✓ ' + done + ' archivo(s) subidos correctamente.</div>';
  } else {
    const pct = Math.round(((done + failed.length) / total) * 100);
    el.className = 'upload-toast show';
    el.innerHTML =
      '<div class="ut-text"><span class="spinner dark"></span>Subiendo archivos… ' + done + ' de ' + total + '</div>' +
      '<div class="ut-bar"><div class="ut-bar-fill" style="width:' + pct + '%"></div></div>';
  }
}

/** Ejecuta fn sobre cada elemento con máximo `limit` a la vez; conserva el orden. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
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
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', forceRefresh);

  const saved = localStorage.getItem('sucden_user');
  if (saved) {
    try {
      const u = JSON.parse(saved);
      if (u && u.token) { currentUser = u; showApp(); }
      else localStorage.removeItem('sucden_user');   // sesión antigua sin token: pide ingresar de nuevo
    } catch (e) { localStorage.removeItem('sucden_user'); }
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
    if (!formDirty && !uploadsPending()) return;
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
    document.getElementById('showForgot').style.display = 'none';
    const lockNote = document.getElementById('lockNote'); if (lockNote) lockNote.classList.remove('show');
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
    document.getElementById('showForgot').style.display = 'block';
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

    if (window.sdAcceso && window.sdAcceso.isLockedFor(cedula)) { window.sdAcceso.showLock(cedula); return; }
    setButtonLoading(btn, label, 'Ingresando…', true);
    // Nota: aquí ya NO se usa el boot splash de pantalla completa (splashShow),
    // porque taparía a la mascota justo cuando más se luce (tapándose los
    // ojos / pensando / celebrando). El spinner del botón sigue avisando
    // que hay una petición en curso.
    if (window.BeanMascot) BeanMascot.setState('thinking');
    let lockInfo = null;
    try {
      // Un solo intento (attempts = 1): repetir automáticamente contaría como otra clave fallida.
      const data = await fetchJson(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'login', cedula, clave }) }, 1);
      if (data.locked) {
        lockInfo = data;
        if (window.BeanMascot) BeanMascot.setState('error');
      } else {
        if (!data.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
        currentUser = data.user;
        localStorage.setItem('sucden_user', JSON.stringify(currentUser));
        if (window.sdAcceso) window.sdAcceso.clearLock();
        if (window.BeanMascot) BeanMascot.setState('success');
        // Pequeña pausa para que se alcance a ver el pulgar arriba antes de
        // pasar a la pantalla principal de la app.
        await new Promise(r => setTimeout(r, 750));
        showApp();
      }
    } catch (err) {
      if (window.BeanMascot) BeanMascot.setState('error');
      statusEl.className = 'status err';
      statusEl.textContent = /Failed to fetch|NetworkError|Load failed|estado \d+/i.test(err.message)
        ? 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
        : err.message;
      // Tras mostrar la carita de "esa no era", vuelve a taparse los ojos
      // si la clave sigue escrita en el campo (o queda en reposo si no).
      setTimeout(updateCoverState, 1600);
    } finally {
      setButtonLoading(btn, label, '', false, 'Ingresar al sistema');
    }
    if (lockInfo && window.sdAcceso) {
      document.getElementById('loginClave').value = '';
      window.sdAcceso.startLock(cedula, lockInfo.retryIn || 120, !!lockInfo.notified, lockInfo.error);
      setTimeout(updateCoverState, 1600);
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
    if (clave.length < 6) {
      statusEl.className = 'status err';
      statusEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
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
  // Solo el administrador ve el Panel de control y puede descargar/exportar.
  document.body.classList.toggle('is-admin', currentUser.rol === 'admin');

  goToHub();
  refreshHubCounts();
  startReportPolling();
  if (window.sdAcceso) window.sdAcceso.onLogin();
}

/* Un usuario que NO es administrador no tiene panel de control (dashboard):
 * su "Inicio" quedaba en blanco. Para ellos la app abre directo en Módulos > Datos
 * (Nuevo reporte), tanto en computador como en celular. */
function isNonAdmin() {
  try {
    return !!currentUser && currentUser.rol !== 'admin';
  } catch (e) { return false; }
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

/* El servidor ya no reconoce la sesión (venció, cambiaron la clave o quitaron el acceso). */
let sessionExpiredBusy = false;
function sessionExpired() {
  if (!currentUser || sessionExpiredBusy) return;
  sessionExpiredBusy = true;
  logout();
  const st = document.getElementById('loginStatus');
  if (st) { st.className = 'status err'; st.textContent = 'Tu sesión terminó (venció o cambiaron tus datos de acceso). Ingresa de nuevo.'; }
  setTimeout(() => { sessionExpiredBusy = false; }, 1500);
}

function logout() {
  if (window.sdAcceso) window.sdAcceso.onLogout();
  localStorage.removeItem('sucden_user');
  currentUser = null;
  recordsCache = { orquidea: null };
  pendingPhotosCache = { orquidea: [] };
  dataSyncedAt = 0;
  adminCache = null;
  galleryRenderedSig = '';
  seenReports = null; alertedReports = {};
  cacheClear(); // equipo compartido: al salir no queda información en el navegador
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
  document.body.classList.remove('is-admin');
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
        loadExcelJs().catch(() => {}); // se precarga en silencio para que "Exportar" sea inmediato
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
      // Se comprime desde ya, mientras la persona termina de llenar el formulario:
      // al pulsar "Guardar" ya está listo y no hay espera.
      mainFilePending = compressImageFile(mainFile.files[0]);
      mainFilePending.catch(() => {});
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
    const nuevasTodas = Array.from(extraFiles.files);
    extraFiles.value = ''; // limpia el input para poder volver a elegir/tomar más fotos
    // Una foto ya elegida (mismo nombre, tamaño y fecha) no se agrega dos veces.
    const keyOf = f => [f.name, f.size, f.lastModified].join('|');
    const vistas = {};
    extraFilesData.forEach(f => { if (f.key) vistas[f.key] = true; });
    const nuevas = nuevasTodas.filter(f => { const k = keyOf(f); if (vistas[k]) return false; vistas[k] = true; return true; });
    if (nuevas.length < nuevasTodas.length) {
      const st = document.getElementById('formStatus');
      if (st) { st.className = 'status err'; st.textContent = 'Se omitieron ' + (nuevasTodas.length - nuevas.length) + ' foto(s) repetida(s).'; }
    }
    let hechas = 0;
    // Se optimizan 3 fotos a la vez (antes era una por una): mucho más rápido.
    const listas = await mapLimit(nuevas, 3, async (file) => {
      const fileData = await compressImageFile(file);
      fileData.key = keyOf(file);
      hechas++;
      if (nuevas.length > 1) label.textContent = 'Optimizando fotos… ' + hechas + ' de ' + nuevas.length;
      return fileData;
    });
    listas.forEach(addExtraFile);
    updateExtraFilesUI();
  });

  document.getElementById('reportForm').addEventListener('submit', onSubmit);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
  document.getElementById('gallerySearch').addEventListener('input', renderGallery);

  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportGalleryExcel);

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
  if (name === 'hub' && isNonAdmin()) name = 'group';   // nunca dejar el inicio vacío
  document.getElementById('panel-hub').style.display = name === 'hub' ? 'block' : 'none';
  document.getElementById('panel-group').style.display = name === 'group' ? 'block' : 'none';
  document.getElementById('panel-admin').style.display = name === 'admin' ? 'block' : 'none';
  const floatBtn = document.getElementById('floatingBack');
  if (floatBtn) floatBtn.classList.toggle('show', name !== 'hub' && !isNonAdmin());
}

function goToHub() {
  if (isNonAdmin()) {            // usuario estándar: abre directo Datos > Nuevo reporte
    if (currentGroup !== GROUP || document.getElementById('panel-group').style.display === 'none') openGroup(GROUP);
    else showSection('group');
    refreshHubCounts();
    return;
  }
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
  try { await syncData(false); } catch (e) { /* silencioso: el contador simplemente no se actualiza esta vez */ }
  updateHubCount();
  renderPendingUI();
}

/* ------------------------- CAMPANA: REPORTES SIN FOTOS ------------------------- */

let pendingPhotosCache = { orquidea: [] };

/* Repinta la campana, el panel y la galería con lo que hay en memoria (sin
 * pedir nada al servidor). Con force=true primero trae todo de nuevo. */
async function refreshPendingBadge(force) {
  if (force) { try { await syncData(true); } catch (e) {} }
  renderPendingUI();
}

function renderPendingUI() {
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

/* Botón ↻: trae todo de nuevo desde el servidor (cambios de otras personas). */
async function forceRefresh() {
  const btn = document.getElementById('refreshBtn');
  if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
  try {
    await syncData(true);
    updateHubCount();
    renderPendingUI();
    if (currentGroup) renderGallery();
  } catch (err) {
    window.alert('No se pudo actualizar: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
  }
}

function allPendingPhotos() {
  return Object.keys(pendingPhotosCache).reduce((acc, g) => acc.concat(pendingPhotosCache[g] || []), []);
}

/* ------------------------- NUEVOS DESPACHOS (solo administrador) -------------------------
 * Cada reporte nuevo que crea otra persona aparece en la campana hasta que el
 * administrador lo abre o pulsa "Marcar vistos". Los ya existentes la primera
 * vez en este equipo no cuentan como nuevos. */
let seenReports = null;      // { idReporte: 1 } ya vistos (null = aún no se ha cargado)
let alertedReports = {};     // ids ya avisados con sonido en esta sesión
let reportPollTimer = null, reportPollBusy = false;

function seenKey() { return 'sucden_seen_reports:' + (currentUser && currentUser.cedula); }
function loadSeen() {
  try { const raw = localStorage.getItem(seenKey()); seenReports = raw ? JSON.parse(raw) : null; }
  catch (e) { seenReports = null; }
}
function saveSeen() { try { localStorage.setItem(seenKey(), JSON.stringify(seenReports || {})); } catch (e) {} }
function markReportSeen(id) {
  if (!seenReports) return;
  seenReports[String(id)] = 1; saveSeen();
}

function newDispatchItems() {
  if (!currentUser || currentUser.rol !== 'admin') return [];
  const recs = recordsCache[GROUP];
  if (!recs) return [];
  if (!seenReports) loadSeen();
  if (!seenReports) {                       // primera vez: lo que ya existe no es "nuevo"
    seenReports = {};
    recs.forEach(r => { seenReports[String(r['Id_Reporte'])] = 1; });
    saveSeen();
    return [];
  }
  const me = String(currentUser.nombre || '').trim().toLowerCase();
  return recs
    .filter(r => !seenReports[String(r['Id_Reporte'])] &&
      String(r['Nom: Del Respnsable del Despacho '] || '').trim().toLowerCase() !== me)
    .map(pendingItemFor);
}

function startReportPolling() {
  if (reportPollTimer) return;
  reportPollTimer = setInterval(pollReports, 25000);
}

/* Cada 25 s el administrador revisa si hay despachos nuevos (usa la caché del servidor: es barato). */
async function pollReports() {
  if (reportPollBusy || submitting || syncInFlight) return;
  if (!currentUser || currentUser.rol !== 'admin' || !recordsCache[GROUP]) return;
  reportPollBusy = true;
  try {
    const init = await fetchJson(WEB_APP_URL + '?action=init&group=' + GROUP, undefined, 1);
    if (!init.ok || !currentUser) return;
    const recs = init.records || [];
    const cur = recordsCache[GROUP] || [];
    const sig = a => a.length + '|' + (a[0] ? a[0]['Id_Reporte'] : '') + '|' + (a[a.length - 1] ? a[a.length - 1]['Id_Reporte'] : '');
    if (sig(recs) === sig(cur) && (init.pending || []).length === (pendingPhotosCache[GROUP] || []).length) return;
    const before = {};
    cur.forEach(r => { before[String(r['Id_Reporte'])] = 1; });
    applyData(recs, init.pending, Date.now());
    persistData();
    updateHubCount();
    const fresh = newDispatchItems().filter(i => !before[String(i.id)] && !alertedReports[String(i.id)]);
    fresh.forEach(i => { alertedReports[String(i.id)] = 1; });
    renderPendingUI();
    if (fresh.length && window.cscChat && window.cscChat.notify) {
      const f = fresh[0];
      window.cscChat.notify(
        fresh.length > 1 ? fresh.length + ' despachos nuevos' : 'Nuevo despacho',
        (f.placa || 'Sin placa') + ' · ' + (f.responsable || 'Sin responsable'),
        () => { markReportSeen(f.id); goToPendingReport(f); renderPendingUI(); }
      );
    }
  } catch (e) { /* sin conexión: se reintenta en la próxima vuelta */ }
  finally { reportPollBusy = false; }
}

/* Conversaciones del chat con mensajes sin leer (las aporta chat.js). */
function chatNotifItems() {
  try { return (window.cscChat && window.cscChat.unreadItems()) || []; } catch (e) { return []; }
}

/* Solicitudes de recuperación de clave que esperan al administrador (las aporta acceso.js). */
function recoveryNotifItems() {
  try { return (window.sdAcceso && window.sdAcceso.recoveryItems()) || []; } catch (e) { return []; }
}

function renderNotifBadge() {
  const badge = document.getElementById('notifBadge');
  const btn = document.getElementById('notifBtn');
  if (!badge || !btn) return;
  const total = allPendingPhotos().length + newDispatchItems().length + chatNotifItems().reduce((a, c) => a + c.count, 0) + recoveryNotifItems().length;
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
  const chats = chatNotifItems();
  const news = newDispatchItems();
  const recs = recoveryNotifItems();

  if (!all.length && !chats.length && !news.length && !recs.length) {
    panel.innerHTML = '<div class="notif-empty">🎉 Sin pendientes: no hay mensajes ni despachos nuevos y todos los reportes tienen fotos.</div>';
    return;
  }

  panel.innerHTML = '<div class="notif-list"></div>';
  const listEl = panel.querySelector('.notif-list');
  if (recs.length) {
    const t = document.createElement('div');
    t.className = 'notif-title';
    t.textContent = 'Claves por recuperar (' + recs.length + ')';
    listEl.appendChild(t);
    recs.forEach(r => {
      const row = document.createElement('div');
      row.className = 'notif-item';
      row.innerHTML =
        '<div style="min-width:0;">' +
          '<div class="notif-item-plate" style="letter-spacing:0;">🔑 ' + escapeHtml(r.nombre) + '</div>' +
          '<div class="notif-item-meta">' + escapeHtml(r.motivo) + ' · ' + (r.estado === 'codigo' ? 'código generado' : 'espera tu código') + '</div>' +
        '</div>' +
        '<span class="notif-count">' + (r.estado === 'codigo' ? '✓' : 'NUEVO') + '</span>';
      row.addEventListener('click', () => {
        panel.classList.remove('open');
        const ab = document.getElementById('adminBtn'); if (ab) ab.click();
      });
      listEl.appendChild(row);
    });
  }
  if (chats.length) {
    const t = document.createElement('div');
    t.className = 'notif-title';
    t.textContent = 'Mensajes nuevos (' + chats.reduce((a, c) => a + c.count, 0) + ')';
    listEl.appendChild(t);
    chats.forEach(c => {
      const row = document.createElement('div');
      row.className = 'notif-item';
      row.innerHTML =
        '<div style="min-width:0;">' +
          '<div class="notif-item-plate" style="letter-spacing:0;">💬 ' + escapeHtml(c.name) + '</div>' +
          '<div class="notif-item-meta">' + escapeHtml(c.preview) + '</div>' +
        '</div>' +
        '<span class="notif-count">' + (c.count > 99 ? '99+' : c.count) + '</span>';
      row.addEventListener('click', () => {
        panel.classList.remove('open');
        if (window.cscChat) window.cscChat.open(c.conv);
      });
      listEl.appendChild(row);
    });
  }
  if (news.length) {
    const t = document.createElement('div');
    t.className = 'notif-title';
    t.style.display = 'flex'; t.style.justifyContent = 'space-between'; t.style.alignItems = 'center';
    t.innerHTML = '<span>Despachos nuevos (' + news.length + ')</span>';
    const clr = document.createElement('button');
    clr.type = 'button'; clr.textContent = 'Marcar vistos';
    clr.style.cssText = 'border:none;background:none;color:#1B2A6B;font-weight:700;font-size:12px;cursor:pointer;text-decoration:underline;font-family:inherit;';
    clr.addEventListener('click', (e) => { e.stopPropagation(); news.forEach(n => markReportSeen(n.id)); renderPendingUI(); });
    t.appendChild(clr);
    listEl.appendChild(t);
    news.forEach(item => {
      const row = document.createElement('div');
      row.className = 'notif-item';
      row.innerHTML =
        '<div style="min-width:0;">' +
          '<div class="notif-item-plate">🚚 ' + escapeHtml(item.placa || 'Sin placa') + '</div>' +
          '<div class="notif-item-meta">' + escapeHtml(formatDate(item.fecha)) + ' · ' + escapeHtml(item.responsable || 'Sin responsable') + '</div>' +
        '</div>' +
        '<span class="notif-count">NUEVO</span>';
      row.addEventListener('click', () => { markReportSeen(item.id); goToPendingReport(item); renderPendingUI(); });
      listEl.appendChild(row);
    });
  }
  if (all.length) {
    const t = document.createElement('div');
    t.className = 'notif-title';
    t.textContent = 'Pendientes de fotos (' + all.length + ')';
    listEl.appendChild(t);
  }
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
  maxDim = maxDim || 1400;
  quality = quality || 0.7;
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

/** Envoltorio anti doble toque: el primer toque bloquea todo lo demás hasta terminar. */
async function onSubmit(e) {
  e.preventDefault();
  if (submitting) return;            // segundo toque (o Enter) mientras guarda: se ignora
  submitting = true;
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  try { await submitReport(); }
  finally { submitting = false; btn.disabled = false; }
}

/** ¿Ya existe un reporte con la misma fecha, placa y lotes? (devuelve ese reporte) */
function findDuplicateRecord(fecha, placa, lotes, excludeId) {
  const dayKey = v => {
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  };
  const norm = v => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
  const fk = dayKey(fecha), pk = norm(placa), lk = norm(lotes);
  return (recordsCache[GROUP] || []).find(r =>
    String(r['Id_Reporte']) !== String(excludeId || '') &&
    norm(r['Placa Del Vehiculo ']) === pk &&
    norm(r['Numero De Lotes ']) === lk &&
    dayKey(r['Fecha ']) === fk
  ) || null;
}

async function submitReport() {
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

  // Anti-duplicados: misma fecha + placa + lotes que un reporte ya guardado.
  const dup = findDuplicateRecord(fecha, placa, lotes, editingId);
  if (dup) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Ya existe un reporte con esa fecha, placa y lotes (código ' + dup['Id_Reporte'] + '). No se guardó para evitar duplicados.';
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
      mainFileData = await (mainFilePending || compressImageFile(f)); // normalmente ya está lista
    }

    const fields = {
      'Fecha ': fecha,
      'Placa Del Vehiculo ': placa.toUpperCase(),
      'Numero De Lotes ': lotes,
      'Nom: Del Respnsable del Despacho ': responsable
    };

    const isEdit = !!editingId;
    const photos = extraFilesData.slice(); // las fotos suben aparte, en segundo plano
    // Solo viajan los DATOS (+ documento anexo): la petición es pequeña y rápida.
    // Identificador propio de este guardado: si por cualquier motivo el envío se repite,
    // el servidor lo reconoce y no crea el reporte dos veces.
    const sig = [fecha, placa.toUpperCase(), lotes, responsable].join('|');
    if (!isEdit && (!currentSubmitId || currentSubmitSig !== sig)) { currentSubmitId = newClientId(); currentSubmitSig = sig; }
    const payload = isEdit
      ? { action: 'update', group: currentGroup, id: editingId, fields }
      : { action: 'create', group: currentGroup, id: currentSubmitId, fields }; // el documento sube después, en segundo plano

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

    const reportId = isEdit ? editingId : data.result.id;
    const meta = { lotes: lotes, placa: placa.toUpperCase() };
    const startSeq = isEdit ? nextSeqFor(reportId) : 1;

    // La caché local se actualiza al instante (sin volver a pedir la lista).
    if (isEdit) {
      updateLocalRecord(reportId, fields, photos.length > 0);
    } else {
      addLocalRecord({
        'Id_Reporte': reportId,
        'Fecha ': fecha,
        'Placa Del Vehiculo ': fields['Placa Del Vehiculo '],
        'Numero De Lotes ': lotes,
        'Nom: Del Respnsable del Despacho ': responsable,
        'Documentos Anexos': (data.result && data.result.mainFilePath) || ''
      }, photos.length > 0);
    }
    if (!isEdit && mainFileData) enqueueDocument(reportId, meta, mainFileData);
    if (photos.length) enqueuePhotos(reportId, meta, photos, startSeq);
    currentSubmitId = null; currentSubmitSig = '';

    statusEl.className = 'status ok';
    statusEl.textContent = (isEdit ? 'Reporte actualizado correctamente.' : 'Reporte guardado correctamente.') +
      ((photos.length || (!isEdit && mainFileData)) ? ' Los archivos se están subiendo…' : '');
    resetForm();
    updateHubCount();
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
  mainFilePending = null;
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

/** Solo el administrador puede descargar archivos o exportar datos. */
function isAdminUser() { return !!(currentUser && currentUser.rol === 'admin'); }

function openLightbox(viewUrl, downloadUrl, name) {
  const overlay = document.getElementById('imgLightbox');
  const img = document.getElementById('lightboxImg');
  const dl = document.getElementById('lightboxDl');
  if (!overlay || !img) return;
  img.src = viewUrl;
  img.alt = name || '';
  if (dl) {
    if (isAdminUser()) { dl.href = downloadUrl || viewUrl; dl.download = name || ''; dl.style.display = ''; }
    else { dl.removeAttribute('href'); dl.removeAttribute('download'); dl.style.display = 'none'; }
  }
  overlay.classList.add('open');
}

function closeLightbox() {
  const overlay = document.getElementById('imgLightbox');
  if (overlay) overlay.classList.remove('open');
}

/* ------------------------- GALERÍA ------------------------- */

let galleryRenderedSig = '';
function gallerySig() {
  const q = (document.getElementById('gallerySearch') || { value: '' }).value.trim().toLowerCase();
  return [currentGroup, dataVersion, q].join('|');
}

async function loadGallery() {
  const listEl = document.getElementById('galleryList');
  // Con caché (memoria o navegador, menos de 6 h) se muestra al instante.
  const hasLocal = dataIsFresh() || (cacheGet('records') && cacheGet('pending'));
  if (!hasLocal) listEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando reportes…</div>';
  try {
    await syncData(false);
    // Si la lista ya está dibujada y nada cambió, se deja tal cual (conserva
    // scroll, reportes abiertos y fotos ya cargadas): cero trabajo al cambiar de pestaña.
    if (galleryRenderedSig === gallerySig() && listEl.children.length) updateCacheInfo();
    else renderGallery();
  } catch (err) {
    listEl.innerHTML =
      '<div class="empty">No se pudieron cargar los reportes: ' + escapeHtml(err.message) +
      '<br><button class="secondary" style="margin-top:10px;width:auto;padding:8px 16px;" onclick="loadGallery()">Reintentar</button></div>';
  }
}

function renderGallery() {
  updateCacheInfo();
  const records = recordsCache[currentGroup] || [];
  const query = document.getElementById('gallerySearch').value.trim().toLowerCase();
  const listEl = document.getElementById('galleryList');

  const filtered = records.filter(r => {
    if (!query) return true;
    const placa = String(r['Placa Del Vehiculo '] || '').toLowerCase();
    const resp = String(r['Nom: Del Respnsable del Despacho '] || '').toLowerCase();
    const lotes = String(r['Numero De Lotes '] || '').toLowerCase();
    const codigo = String(r['Id_Reporte'] || '').toLowerCase();
    return placa.indexOf(query) !== -1 || resp.indexOf(query) !== -1 || lotes.indexOf(query) !== -1 || codigo.indexOf(query) !== -1;
  });

  galleryRenderedSig = gallerySig();
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

/* ------------------------- EXPORTAR A EXCEL ------------------------- */

const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
let excelJsPromise = null;

/* Carga ExcelJS solo cuando hace falta (al abrir "Registros guardados"), para
 * no alargar el arranque de la app. */
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (excelJsPromise) return excelJsPromise;
  excelJsPromise = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = EXCELJS_URL;
    sc.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS no disponible'));
    sc.onerror = () => reject(new Error('No se pudo cargar el generador de Excel'));
    document.head.appendChild(sc);
  }).catch(err => { excelJsPromise = null; throw err; });
  return excelJsPromise;
}

/* Reportes visibles según el buscador de "Registros guardados". */
function getFilteredRecords() {
  const records = recordsCache[currentGroup] || [];
  const query = document.getElementById('gallerySearch').value.trim().toLowerCase();
  return records.filter(r => {
    if (!query) return true;
    const placa = String(r['Placa Del Vehiculo '] || '').toLowerCase();
    const resp = String(r['Nom: Del Respnsable del Despacho '] || '').toLowerCase();
    const lotes = String(r['Numero De Lotes '] || '').toLowerCase();
    const id = String(r['Id_Reporte'] || '').toLowerCase();
    return placa.indexOf(query) !== -1 || resp.indexOf(query) !== -1 || lotes.indexOf(query) !== -1 || id.indexOf(query) !== -1;
  });
}

const EXCEL_BROWN = 'FF1B2A6B';      // café corporativo (--navy)
const EXCEL_BROWN_DEEP = 'FF131E52'; // café oscuro
const EXCEL_CREAM = 'FFE9F1FC';      // crema para filas alternas
const EXCEL_LINE = 'FFDCE2EC';       // líneas suaves

/* "YYYY-MM-DD" / ISO guardado como solo-fecha → Date UTC para que Excel
 * muestre el mismo día calendario (misma regla que formatDate). */
function excelDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/* Arma el libro de Excel con el logo y los colores corporativos.
 * opts: { records, pendingIds:Set, logo:dataURL, generatedAt:Date, query } */
function buildDispatchWorkbook(ExcelJS, opts) {
  const records = opts.records;
  const fixedKeys = ['Fecha ', 'Placa Del Vehiculo ', 'Numero De Lotes ', 'Nom: Del Respnsable del Despacho '];
  const extraKeysSet = new Set();
  records.forEach(rec => {
    Object.keys(rec).forEach(key => {
      if (fixedKeys.indexOf(key) !== -1 || DETAIL_SKIP_KEYS.has(key) || key === 'Id_Reporte') return;
      extraKeysSet.add(key);
    });
  });
  const extraKeys = Array.from(extraKeysSet);

  const columns = [
    { header: 'Código de despacho', width: 20, get: r => String(r['Id_Reporte'] || ''), align: 'center' },
    { header: 'Fecha', width: 14, get: r => excelDate(r['Fecha ']), align: 'center', fmt: 'dd/mm/yyyy' },
    { header: 'Placa del vehículo', width: 18, get: r => String(r['Placa Del Vehiculo '] || ''), align: 'center' },
    { header: 'Número de lotes', width: 18, align: 'center',
      get: r => { const v = String(r['Numero De Lotes '] == null ? '' : r['Numero De Lotes ']).trim(); return /^\d+$/.test(v) ? Number(v) : v; } },
    { header: 'Responsable del despacho', width: 34, get: r => String(r['Nom: Del Respnsable del Despacho '] || ''), align: 'left' },
    { header: 'Documento anexo', width: 48, align: 'left',
      get: r => { const p = String(r['Documentos Anexos'] || ''); return p ? p.split('/').pop() : '—'; } },
    { header: 'Fotos', width: 14, align: 'center', get: r => opts.pendingIds.has(String(r['Id_Reporte'])) ? 'Sin fotos' : 'Con fotos' }
  ].concat(extraKeys.map(k => ({
    header: friendlyLabel(k), width: 22, align: 'left',
    get: r => (r[k] === undefined || r[k] === null) ? '' : String(r[k])
  })));
  const nCols = columns.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'S&D Sucden Coffee';
  wb.created = opts.generatedAt;
  const ws = wb.addWorksheet('Despachos', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      printTitlesRow: '5:5' }
  });
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const white = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const brown = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BROWN } };
  const cream = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_CREAM } };

  // Franja superior blanca (logo + título) — filas 1 y 2
  ws.getRow(1).height = 30; ws.getRow(2).height = 30;
  for (let r = 1; r <= 2; r++) for (let c = 1; c <= nCols; c++) ws.getCell(r, c).fill = white;

  if (opts.logo) {
    const imageId = wb.addImage({ base64: opts.logo, extension: 'png' });
    // El logo original mide 846 × 162 px → se muestra a 330 × 63 px (misma proporción).
    ws.addImage(imageId, { tl: { col: 0.08, row: 0.1 }, ext: { width: 330, height: 63 } });
  }

  const titleStart = Math.max(4, nCols - 3); // el título ocupa las últimas columnas, a la derecha
  ws.mergeCells(1, titleStart, 1, nCols);
  const title = ws.getCell(1, titleStart);
  title.value = 'REPORTE DE DESPACHOS';
  title.font = { name: 'Calibri', size: 20, bold: true, color: { argb: EXCEL_BROWN } };
  title.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, titleStart, 2, nCols);
  const gen = opts.generatedAt;
  const pad = n => String(n).padStart(2, '0');
  const stamp = pad(gen.getDate()) + '/' + pad(gen.getMonth() + 1) + '/' + gen.getFullYear() + ' ' + pad(gen.getHours()) + ':' + pad(gen.getMinutes());
  const sub = ws.getCell(2, titleStart);
  sub.value = 'Generado: ' + stamp + '  ·  ' + records.length + ' registro(s)' + (opts.query ? '  ·  Filtro: «' + opts.query + '»' : '');
  sub.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF626C7E' } };
  sub.alignment = { horizontal: 'right', vertical: 'middle' };

  // Franja café (fila 3) y espacio (fila 4)
  ws.getRow(3).height = 8;
  for (let c = 1; c <= nCols; c++) ws.getCell(3, c).fill = brown;
  ws.getRow(4).height = 10;

  // Encabezados de la tabla (fila 5)
  const headRow = ws.getRow(5);
  headRow.height = 28;
  columns.forEach((col, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = col.header;
    cell.fill = brown;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin', color: { argb: EXCEL_BROWN_DEEP } }, bottom: { style: 'medium', color: { argb: EXCEL_BROWN_DEEP } },
      left: { style: 'thin', color: { argb: EXCEL_BROWN_DEEP } }, right: { style: 'thin', color: { argb: EXCEL_BROWN_DEEP } } };
  });

  // Filas de datos (zebra crema/blanco)
  const thin = { style: 'thin', color: { argb: EXCEL_LINE } };
  records.forEach((rec, idx) => {
    const row = ws.getRow(6 + idx);
    row.height = 20;
    columns.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      cell.value = col.get(rec);
      cell.fill = idx % 2 === 0 ? white : cream;
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1B2233' } };
      cell.alignment = { horizontal: col.align, vertical: 'middle', wrapText: false };
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      if (col.fmt) cell.numFmt = col.fmt;
    });
    const fotosCell = row.getCell(7);
    if (fotosCell.value === 'Sin fotos') fotosCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFC0392B' } };
  });

  // Pie con total
  const lastData = 5 + records.length;
  const foot = ws.getRow(lastData + 2);
  ws.mergeCells(lastData + 2, 1, lastData + 2, Math.min(4, nCols));
  const footCell = foot.getCell(1);
  footCell.value = 'Total de despachos: ' + records.length;
  footCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: EXCEL_BROWN } };
  footCell.alignment = { horizontal: 'left', vertical: 'middle' };
  const brand = ws.getRow(lastData + 3).getCell(1);
  ws.mergeCells(lastData + 3, 1, lastData + 3, Math.min(5, nCols));
  brand.value = 'S&D Sucden Coffee';
  brand.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF626C7E' } };

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: nCols } };
  return wb;
}

/* Descarga un .xlsx con logo y color corporativo con los reportes que están
 * visibles en "Registros guardados" (respeta el buscador). Si el generador de
 * Excel no se puede cargar (sin internet), cae a un CSV simple. */
async function exportGalleryExcel() {
  if (!isAdminUser()) { window.alert('Solo el administrador puede exportar o descargar.'); return; }
  const filtered = getFilteredRecords();
  if (!filtered.length) {
    window.alert('No hay reportes para exportar con el filtro actual.');
    return;
  }
  const btn = document.getElementById('exportCsvBtn');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner dark"></span> Generando…'; }
  try {
    const ExcelJS = await loadExcelJs();
    const pendingIds = new Set((pendingPhotosCache[currentGroup] || []).map(p => String(p.id)));
    const wb = buildDispatchWorkbook(ExcelJS, {
      records: filtered,
      pendingIds,
      logo: (window.SUCDEN_LOGOS && window.SUCDEN_LOGOS.wide) || '',
      generatedAt: new Date(),
      query: document.getElementById('gallerySearch').value.trim()
    });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, 'Despachos_Sucden_' + localDateString() + '.xlsx');
  } catch (err) {
    console.error(err);
    window.alert('No se pudo generar el Excel con formato (' + err.message + '). Se descargará un archivo CSV simple.');
    exportGalleryCSV();
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Respaldo: .csv (se abre directo en Excel) si no se puede generar el .xlsx. */
function exportGalleryCSV() {
  const filtered = getFilteredRecords();
  if (!filtered.length) return;

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
  const allKeys = ['Id_Reporte'].concat(fixedKeys, Array.from(extraKeysSet));

  const rows = [allKeys.map(k => k === 'Id_Reporte' ? 'Código de despacho' : friendlyLabel(k))];
  filtered.forEach(rec => {
    rows.push(allKeys.map(key => {
      const value = rec[key];
      if (value === undefined || value === null) return '';
      if (key === 'Fecha ') return formatDate(value);
      return String(value);
    }));
  });

  const csvContent = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  // El BOM al inicio hace que Excel muestre bien las tildes y la "ñ".
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'Despachos_Sucden_' + localDateString() + '.csv');
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

  addItem('Código de despacho', rec['Id_Reporte']);
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
    const ck = 'doc:' + path;
    const hit = cacheGet(ck);
    let data = hit ? hit.d : null;
    if (!data) {
      data = await fetchJson(WEB_APP_URL + '?action=mainFile&group=' + currentGroup + '&path=' + encodeURIComponent(path));
      if (data.ok && data.viewUrl) cacheSet(ck, data);
    }
    if (!data.ok || !data.viewUrl) return null;
    const a = document.createElement('a');
    a.className = 'doc-link';
    a.href = isAdminUser() ? (data.downloadUrl || data.viewUrl) : data.viewUrl; // colaboradores: solo ver
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

    const images = await getReportImages(reportId);

    loadingImgs.remove();

    if (images.length) {
      const grid = document.createElement('div');
      grid.className = 'img-grid';
      images.forEach(img => {
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

        if (isAdminUser()) {
          const dl = document.createElement('a');
          dl.className = 'dl';
          dl.href = img.downloadUrl;
          dl.setAttribute('download', img.name);
          dl.textContent = 'Descargar';
          cell.appendChild(dl);
        }

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

    // Se actualiza la caché local de este reporte (sin volver a pedirla).
    const key = 'imgs:' + img.reportId;
    const hit = cacheGet(key);
    if (hit) {
      const left = hit.d.filter(x => x.path !== img.path);
      cacheSet(key, left, hit.t);
      if (!left.length) setReportPending(img.reportId, true);
    } else {
      cacheRemove(key);
    }
    persistData();
    // Animación de salida y luego se quita del DOM.
    cell.classList.add('removing');
    setTimeout(() => cell.remove(), 180);
    renderNotifBadge(); // si era su última foto, el reporte vuelve a quedar "pendiente"
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
    removeLocalRecord(reportId);
    renderGallery();
    updateHubCount();
    renderNotifBadge();
  } catch (err) {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalText;
    window.alert('No se pudo eliminar el reporte: ' + err.message);
  }
}

/* ------------------------- ADMIN ------------------------- */

/* Caché del panel Usuarios (en memoria): al abrirlo se muestra al instante lo
 * último que se vio y solo se renueva por detrás si pasaron más de 2 minutos.
 * Cualquier cambio hecho aquí (autorizar, rechazar, editar) la invalida. */
let adminCache = null; // { t, pending, users }
const ADMIN_REVALIDATE_MS = 2 * 60 * 1000;
function adminCacheClear() { adminCache = null; }

function paintAdmin(c) {
  renderPending(c.pending);
  renderAllUsers(c.users);
}

async function fetchAdminData() {
  const d = await fetchJson(WEB_APP_URL + '?action=adminUsers');
  if (!d.ok) throw new Error(d.error || 'Error desconocido');
  return { t: Date.now(), pending: d.pending, users: d.users };
}

async function loadAdmin(force) {
  const pendingEl = document.getElementById('pendingList');
  const allEl = document.getElementById('allUsersList');

  if (adminCache && !force) {
    paintAdmin(adminCache); // instantáneo
    if (Date.now() - adminCache.t < ADMIN_REVALIDATE_MS) return;
  } else {
    pendingEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando…</div>';
    allEl.innerHTML = '<div class="loading"><span class="spinner dark"></span>Cargando…</div>';
  }

  try {
    adminCache = await fetchAdminData();
    paintAdmin(adminCache);
  } catch (err) {
    if (!adminCache) {
      pendingEl.innerHTML = '<div class="empty">' + escapeHtml(err.message) + '</div>';
      allEl.innerHTML = '';
    }
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
    const data = await fetchJson(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action, cedula }) });
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    adminCacheClear();
    loadAdmin(true);
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
