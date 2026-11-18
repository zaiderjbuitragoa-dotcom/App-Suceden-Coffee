/**
 * dashboard.js — Dashboard interactivo para el Sistema de Despacho S&D Sucden.
 * No modifica app.js: lee los reportes que app.js ya tiene en memoria
 * (recordsCache.orquidea) y se dibuja arriba de la pantalla de Inicio.
 * Sin librerías externas (gráficos en SVG propio), funciona sin conexión.
 * Se carga con UNA línea en index.html, después de sidebar.js.
 */
(function () {
  var hub = document.getElementById('panel-hub');
  if (!hub || document.getElementById('cscDash')) return;

  /* ============================== Estilos ============================== */
  var css = [
    '#cscDash{margin:0 0 26px;color:var(--ink);}',
    '#cscDash *{box-sizing:border-box;}',
    '.d-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:16px;}',
    '.d-head h2{margin:0;font-size:22px;color:var(--navy-deep);letter-spacing:-.01em;}',
    '.d-head p{margin:3px 0 0;font-size:13px;color:var(--ink-soft);}',
    '.d-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
    '.d-chips{display:flex;background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px;gap:2px;}',
    '.d-chip{border:none;background:transparent;font:inherit;font-size:12.5px;font-weight:700;color:var(--ink-soft);padding:7px 13px;border-radius:999px;cursor:pointer;white-space:nowrap;}',
    '.d-chip:hover{color:var(--navy-deep);}',
    '.d-chip.on{background:var(--navy);color:#fff;}',
    '.d-select,.d-date{font:inherit;font-size:13px;font-weight:600;color:var(--navy-deep);background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 10px;max-width:210px;}',
    '.d-select:focus,.d-date:focus,.d-search:focus{outline:2px solid rgba(27,42,107,.25);border-color:var(--navy);}',
    '.d-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:700;color:var(--navy);background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;cursor:pointer;}',
    '.d-btn:hover{background:#F0F4FA;border-color:var(--navy);}',
    '.d-btn svg{width:15px;height:15px;}',
    '.d-btn.spin svg{animation:dspin .8s linear infinite;}',
    '@keyframes dspin{to{transform:rotate(360deg)}}',
    '.d-active{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 14px;}',
    '.d-tag{display:inline-flex;align-items:center;gap:6px;background:#F0F4FA;border:1px solid var(--line);color:var(--navy-deep);font-size:12px;font-weight:700;padding:5px 6px 5px 11px;border-radius:999px;}',
    '.d-tag button{border:none;background:rgba(27,42,107,.12);color:var(--navy);width:18px;height:18px;border-radius:50%;cursor:pointer;line-height:1;font-size:12px;padding:0;}',
    /* KPIs */
    '.d-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px;}',
    '.d-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;box-shadow:0 6px 18px rgba(27,42,107,.05);min-width:0;}',
    '.d-kpi{position:relative;overflow:hidden;}',
    '.d-kpi .lbl{font-size:11px;letter-spacing:.07em;text-transform:uppercase;font-weight:800;color:var(--ink-soft);display:flex;align-items:center;gap:7px;}',
    '.d-kpi .ic{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#E9F1FC;color:var(--navy);}',
    '.d-kpi .ic svg{width:15px;height:15px;}',
    '.d-kpi .val{font-size:32px;font-weight:800;color:var(--navy-deep);letter-spacing:-.02em;margin:10px 0 2px;line-height:1;font-variant-numeric:tabular-nums;}',
    '.d-kpi .sub{font-size:12px;color:var(--ink-soft);display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:18px;}',
    '.d-delta{font-weight:800;font-size:11.5px;padding:2px 7px;border-radius:999px;}',
    '.d-delta.up{background:var(--ok-bg);color:var(--ok);}',
    '.d-delta.down{background:var(--err-bg);color:var(--err);}',
    '.d-delta.flat{background:#E8ECF4;color:var(--ink-soft);}',
    '.d-kpi svg.spark{display:block;width:calc(100% + 36px);height:34px;margin:10px -18px -16px;opacity:.9;}',
    '.d-kpi.alert{cursor:pointer;transition:transform .12s ease,border-color .12s ease;}',
    '.d-kpi.alert:hover{transform:translateY(-2px);border-color:var(--navy);}',
    '.d-kpi.alert .ic{background:var(--warn-bg);color:#B5651D;}',
    /* Grid de gráficos */
    '.d-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin-bottom:14px;}',
    '.d-c8{grid-column:span 8;}.d-c4{grid-column:span 4;}.d-c6{grid-column:span 6;}.d-c12{grid-column:span 12;}',
    '.d-ct{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap;}',
    '.d-ct h3{margin:0;font-size:14.5px;color:var(--navy-deep);}',
    '.d-ct small{display:block;font-size:11.5px;color:var(--ink-soft);font-weight:500;margin-top:2px;}',
    '.d-seg{display:inline-flex;background:#E9F1FC;border-radius:9px;padding:2px;}',
    '.d-seg button{border:none;background:transparent;font:inherit;font-size:12px;font-weight:700;color:var(--ink-soft);padding:5px 10px;border-radius:7px;cursor:pointer;}',
    '.d-seg button.on{background:#fff;color:var(--navy-deep);box-shadow:0 1px 3px rgba(27,42,107,.15);}',
    '.d-chart{position:relative;width:100%;}',
    '.d-chart svg{display:block;width:100%;height:auto;overflow:visible;}',
    '.d-chart text{font-family:inherit;}',
    '.d-bar{transition:opacity .15s ease,fill .15s ease;cursor:pointer;}',
    '.d-empty{padding:44px 10px;text-align:center;color:var(--ink-soft);font-size:13.5px;}',
    /* Barras horizontales (ranking) */
    '.d-rank{display:flex;flex-direction:column;gap:9px;}',
    '.d-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;cursor:pointer;padding:5px 7px;margin:0 -7px;border-radius:9px;border:none;background:transparent;font:inherit;text-align:left;width:calc(100% + 14px);}',
    '.d-row:hover{background:#F0F4FA;}',
    '.d-row.sel{background:#E9F1FC;}',
    '.d-row .nm{font-size:13px;font-weight:700;color:var(--navy-deep);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.d-row .nv{font-size:13px;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums;}',
    '.d-row .tr{grid-column:1/-1;height:7px;background:#E3EAF6;border-radius:999px;overflow:hidden;}',
    '.d-row .fl{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--navy),var(--indigo-light));transition:width .45s cubic-bezier(.2,.8,.2,1);}',
    /* Tooltip */
    '#dTip{position:fixed;z-index:9999;pointer-events:none;background:var(--navy-deep);color:#fff;font-size:12px;line-height:1.45;padding:8px 11px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.28);opacity:0;transform:translateY(4px);transition:opacity .1s ease,transform .1s ease;max-width:240px;}',
    '#dTip.show{opacity:1;transform:none;}',
    '#dTip b{color:#A9C1F5;}',
    /* Heatmap */
    '.d-heat text{fill:var(--ink-soft);font-size:10px;font-weight:600;}',
    '.d-legend{display:flex;align-items:center;gap:5px;justify-content:flex-end;font-size:11px;color:var(--ink-soft);margin-top:8px;}',
    '.d-legend i{width:12px;height:12px;border-radius:3px;display:inline-block;}',
    /* Tabla */
    '.d-search{font:inherit;font-size:13px;padding:8px 11px;border:1px solid var(--line);border-radius:10px;min-width:200px;background:#fff;}',
    '.d-tablewrap{overflow-x:auto;margin:0 -4px;}',
    '.d-table{width:100%;border-collapse:collapse;font-size:13px;min-width:560px;}',
    '.d-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft);font-weight:800;padding:9px 10px;border-bottom:1px solid var(--line);cursor:pointer;user-select:none;white-space:nowrap;}',
    '.d-table th:hover{color:var(--navy-deep);}',
    '.d-table th .ar{opacity:.35;margin-left:3px;}',
    '.d-table th.s .ar{opacity:1;color:var(--navy);}',
    '.d-table td{padding:10px;border-bottom:1px solid #E3EAF6;color:var(--ink);}',
    '.d-table tbody tr{cursor:pointer;transition:background .1s ease;}',
    '.d-table tbody tr:hover{background:#F0F4FA;}',
    '.d-table td.pl{font-weight:800;color:var(--navy-deep);letter-spacing:.03em;}',
    '.d-table td.num{font-variant-numeric:tabular-nums;font-weight:700;}',
    '.d-pill{display:inline-block;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;}',
    '.d-pill.ok{background:var(--ok-bg);color:var(--ok);}',
    '.d-pill.warn{background:var(--warn-bg);color:#B5651D;}',
    '.d-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;font-size:12.5px;color:var(--ink-soft);flex-wrap:wrap;}',
    '.d-pager{display:flex;gap:6px;}',
    '.d-pager button{font:inherit;font-size:12.5px;font-weight:700;background:#fff;border:1px solid var(--line);color:var(--navy);border-radius:8px;padding:6px 11px;cursor:pointer;}',
    '.d-pager button:disabled{opacity:.4;cursor:default;}',
    '.d-skel{height:110px;border-radius:14px;background:linear-gradient(90deg,#E9F1FC 25%,#F0F4FA 50%,#E9F1FC 75%);background-size:200% 100%;animation:dsk 1.3s linear infinite;}',
    '@keyframes dsk{to{background-position:-200% 0}}',
    '.d-sep{display:flex;align-items:center;gap:12px;margin:26px 0 14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:var(--ink-soft);}',
    '.d-sep::after{content:"";flex:1;height:1px;background:var(--line);}',
    '@media (max-width:1000px){.d-kpis{grid-template-columns:repeat(2,1fr);}.d-c8,.d-c4,.d-c6{grid-column:span 12;}}',
    '@media (max-width:560px){.d-kpi .val{font-size:26px;}.d-head h2{font-size:19px;}.d-chips{overflow-x:auto;max-width:100%;}.d-select{max-width:100%;flex:1;}.d-card{padding:14px;}}'
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ============================== Utilidades ============================== */
  var KEY = { fecha: 'Fecha ', placa: 'Placa Del Vehiculo ', lotes: 'Numero De Lotes ', resp: 'Nom: Del Respnsable del Despacho ', id: 'Id_Reporte' };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var PAGE = 8;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nf(n) { return Math.round(n).toLocaleString('es-CO'); }
  function nf1(n) { return (Math.round(n * 10) / 10).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); }
  function day(y, m, d) { return Date.UTC(y, m, d); }          // todo en UTC, sin corrimientos de zona horaria
  function parseDay(v) {                                       // las fechas se guardan como "solo fecha" (UTC)
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d)) return null;
    return day(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  function todayUTC() { var n = new Date(); return day(n.getFullYear(), n.getMonth(), n.getDate()); }
  var DAY = 86400000;
  function ymd(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function fmtShort(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]; }
  function fmtLong(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MESES[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function dow(t) { return (new Date(t).getUTCDay() + 6) % 7; } // 0 = lunes
  function mondayOf(t) { return t - dow(t) * DAY; }
  function monthStart(t) { var d = new Date(t); return day(d.getUTCFullYear(), d.getUTCMonth(), 1); }

  /* "Número de lotes" es texto libre: 12 → 12;  "L1, L2, L3" → 3 */
  function lotesCount(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    if (/^\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
    var parts = s.split(/[,;\/\n+]|\s+y\s+/i).map(function (x) { return x.trim(); }).filter(Boolean);
    return parts.length || 1;
  }
  function normPlaca(p) { return String(p || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function normResp(r) {
    var s = String(r || '').replace(/\s+/g, ' ').trim();
    return s.toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
  }

  /* ============================== Estado ============================== */
  var S = { range: '30', from: '', to: '', resp: '', placa: '', gran: 'auto', metric: 'despachos', q: '', sort: 'fecha', dir: -1, page: 0 };
  var rows = [];          // registros normalizados
  var pendingIds = {};    // reportes sin fotos
  var sig = '';           // firma de los datos para detectar cambios
  var loading = true;
  var errMsg = '';
  var spinning = false;

  function globalRecords() {
    try { return (typeof recordsCache !== 'undefined' && recordsCache.orquidea) || null; } catch (e) { return null; }
  }
  function globalPending() {
    try { return (typeof pendingPhotosCache !== 'undefined' && pendingPhotosCache.orquidea) || []; } catch (e) { return []; }
  }
  function buildRows(recs) {
    rows = [];
    recs.forEach(function (r) {
      var t = parseDay(r[KEY.fecha]);
      if (t == null) return;
      rows.push({
        id: String(r[KEY.id] || ''), t: t, placa: normPlaca(r[KEY.placa]) || '—',
        lotesTxt: String(r[KEY.lotes] == null ? '' : r[KEY.lotes]), lotes: lotesCount(r[KEY.lotes]),
        resp: normResp(r[KEY.resp]) || 'Sin responsable', doc: !!r['Documentos Anexos']
      });
    });
    pendingIds = {};
    globalPending().forEach(function (p) { pendingIds[String(p.id)] = 1; });
  }

  /* ============================== Filtros ============================== */
  function periodBounds() {
    var end = todayUTC(), start;
    if (S.range === 'all') {
      start = rows.length ? Math.min.apply(null, rows.map(function (r) { return r.t; })) : end;
      end = Math.max(end, rows.length ? Math.max.apply(null, rows.map(function (r) { return r.t; })) : end);
    } else if (S.range === 'custom') {
      start = S.from ? parseDay(S.from) : end - 29 * DAY;
      end = S.to ? parseDay(S.to) : end;
      if (start > end) { var x = start; start = end; end = x; }
    } else if (S.range === 'year') {
      start = day(new Date(end).getUTCFullYear(), 0, 1);
    } else if (S.range === 'month') {
      start = monthStart(end);
    } else {
      start = end - (parseInt(S.range, 10) - 1) * DAY;
    }
    return { start: start, end: end };
  }
  function inRange(r, b) { return r.t >= b.start && r.t <= b.end; }
  function extraOk(r) { return (!S.resp || r.resp === S.resp) && (!S.placa || r.placa === S.placa); }

  /* ============================== Cálculos ============================== */
  function compute() {
    var b = periodBounds();
    var span = Math.round((b.end - b.start) / DAY) + 1;
    var prev = { start: b.start - span * DAY, end: b.start - DAY };
    var cur = rows.filter(function (r) { return inRange(r, b) && extraOk(r); });
    var prv = rows.filter(function (r) { return inRange(r, prev) && extraOk(r); });
    return { b: b, span: span, prev: prev, cur: cur, prv: prv, hasPrev: S.range !== 'all' };
  }
  function sum(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); }
  function uniq(a, f) { var m = {}; a.forEach(function (x) { m[f(x)] = 1; }); return Object.keys(m).length; }

  function granFor(span) { return S.gran !== 'auto' ? S.gran : (span <= 45 ? 'day' : span <= 200 ? 'week' : 'month'); }
  function series(list, b, gran) {
    var buckets = [], map = {}, t, key;
    function add(k, label, long) { if (!map[k]) { map[k] = { k: k, label: label, long: long, n: 0, lotes: 0 }; buckets.push(map[k]); } }
    function keyOf(tt) { return gran === 'day' ? tt : gran === 'week' ? mondayOf(tt) : monthStart(tt); }
    for (t = b.start; t <= b.end; t += DAY) {
      key = keyOf(t);
      var lab = gran === 'month' ? MESES[new Date(key).getUTCMonth()] + ' ' + String(new Date(key).getUTCFullYear()).slice(2) : fmtShort(key);
      var lng = gran === 'day' ? fmtLong(key) : gran === 'week' ? 'Semana del ' + fmtLong(key) : MESES[new Date(key).getUTCMonth()].toUpperCase() + ' ' + new Date(key).getUTCFullYear();
      add(key, lab, lng);
    }
    list.forEach(function (r) { var k = keyOf(r.t); if (map[k]) { map[k].n++; map[k].lotes += r.lotes; } });
    return buckets;
  }
  function rank(list, field, valFn) {
    var m = {};
    list.forEach(function (r) { var k = r[field]; m[k] = m[k] || { name: k, n: 0, lotes: 0 }; m[k].n++; m[k].lotes += r.lotes; });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return valFn(b) - valFn(a) || b.n - a.n; });
  }

  /* ============================== Gráficos SVG ============================== */
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function sparkline(vals, color) {
    if (vals.length < 2) return '';
    var w = 120, h = 46, mx = Math.max.apply(null, vals) || 1, pts = vals.map(function (v, i) {
      return [(i / (vals.length - 1)) * w, h - 6 - (v / mx) * (h - 14)];
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var id = 'sg' + Math.random().toString(36).slice(2, 7);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".28"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + line + ' L' + w + ' ' + h + ' L0 ' + h + ' Z" fill="url(#' + id + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function barChart(buckets, metric) {
    var vals = buckets.map(function (x) { return metric === 'lotes' ? x.lotes : x.n; });
    var total = sum(vals, function (v) { return v; });
    if (!buckets.length || !total) return '<div class="d-empty">No hay despachos en este período con los filtros elegidos.</div>';
    var W = 760, H = 270, L = 38, R = 8, T = 12, B = 30, iw = W - L - R, ih = H - T - B;
    var max = niceMax(Math.max.apply(null, vals)), n = buckets.length, step = iw / n, bw = Math.max(2, Math.min(34, step * 0.68));
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Despachos en el tiempo">';
    for (var i = 0; i <= 4; i++) {
      var y = T + ih - (i / 4) * ih;
      out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="' + (i ? '#E3E9F3' : '#C5CEE0') + '" stroke-dasharray="' + (i ? '3 4' : '0') + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#626C7E">' + nf1(max * i / 4) + '</text>';
    }
    var every = Math.ceil(n / 9);
    buckets.forEach(function (bk, i) {
      var v = vals[i], bh = (v / max) * ih, x = L + i * step + (step - bw) / 2, y = T + ih - bh;
      out += '<rect class="d-bar" data-i="' + i + '" x="' + x.toFixed(1) + '" y="' + (v ? y.toFixed(1) : T + ih - 1) + '" width="' + bw.toFixed(1) + '" height="' + (v ? bh.toFixed(1) : 1) + '" rx="' + Math.min(5, bw / 2) + '" fill="' + (v ? 'url(#dBarG)' : '#DDE3EF') + '"/>';
      out += '<rect data-i="' + i + '" class="d-hit" x="' + (L + i * step) + '" y="' + T + '" width="' + step + '" height="' + (ih + B) + '" fill="transparent"/>';
      if (i % every === 0) out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="11" fill="#626C7E">' + esc(bk.label) + '</text>';
    });
    out += '<defs><linearGradient id="dBarG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B2F8F"/><stop offset="1" stop-color="#241E63"/></linearGradient></defs></svg>';
    return out;
  }

  var HEAT = ['#E3EAF6', '#C3D0F0', '#8FA4DE', '#4F66BD', '#1B2A6B'];
  function heatmap(list) {
    var end = todayUTC(), weeks = 26, startMon = mondayOf(end) - (weeks - 1) * 7 * DAY;
    var cnt = {}, mx = 0;
    list.forEach(function (r) { if (r.t >= startMon && r.t <= end) { cnt[r.t] = (cnt[r.t] || 0) + 1; if (cnt[r.t] > mx) mx = cnt[r.t]; } });
    var cs = 17, gap = 3, L = 30, T = 18, W = L + weeks * (cs + gap), H = T + 7 * (cs + gap);
    var out = '<svg class="d-heat" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Calendario de despachos">';
    [0, 2, 4, 6].forEach(function (d) { out += '<text x="0" y="' + (T + d * (cs + gap) + cs - 4) + '">' + DIAS[d] + '</text>'; });
    var lastMonth = -1;
    for (var w = 0; w < weeks; w++) {
      var mon = startMon + w * 7 * DAY, mo = new Date(mon).getUTCMonth();
      if (mo !== lastMonth) { out += '<text x="' + (L + w * (cs + gap)) + '" y="10">' + MESES[mo] + '</text>'; lastMonth = mo; }
      for (var d = 0; d < 7; d++) {
        var t = mon + d * DAY;
        if (t > end) continue;
        var c = cnt[t] || 0, lv = c === 0 ? 0 : Math.min(4, 1 + Math.floor((c / mx) * 3.999));
        out += '<rect class="d-cell" data-t="' + t + '" data-c="' + c + '" x="' + (L + w * (cs + gap)) + '" y="' + (T + d * (cs + gap)) + '" width="' + cs + '" height="' + cs + '" rx="4" fill="' + HEAT[lv] + '" style="cursor:default"/>';
      }
    }
    return out + '</svg>';
  }
  function weekdayChart(list) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(function (r) { c[dow(r.t)]++; });
    var mx = Math.max.apply(null, c), tot = sum(c, function (x) { return x; });
    if (!tot) return '<div class="d-empty">Sin datos.</div>';
    var W = 360, H = 190, L = 6, B = 24, T = 20, ih = H - T - B, step = (W - L * 2) / 7, bw = step * 0.62, out = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    c.forEach(function (v, i) {
      var h = mx ? (v / mx) * ih : 0, x = L + i * step + (step - bw) / 2, y = T + ih - h;
      out += '<rect class="d-bar d-wd" data-i="' + i + '" x="' + x + '" y="' + (v ? y : T + ih - 1) + '" width="' + bw + '" height="' + (v ? h : 1) + '" rx="6" fill="' + (v === mx ? '#1B2A6B' : '#8FA4DE') + '"/>';
      if (v) out += '<text x="' + (x + bw / 2) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#131E52">' + v + '</text>';
      out += '<text x="' + (x + bw / 2) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="11" fill="#626C7E">' + DIAS[i] + '</text>';
    });
    return out + '</svg>';
  }
  function rankList(items, kind, metric, selected) {
    if (!items.length) return '<div class="d-empty">Sin datos en el período.</div>';
    var val = function (x) { return metric === 'lotes' ? x.lotes : x.n; };
    var mx = Math.max.apply(null, items.map(val)) || 1;
    return '<div class="d-rank">' + items.slice(0, 7).map(function (x) {
      return '<button type="button" class="d-row' + (selected === x.name ? ' sel' : '') + '" data-kind="' + kind + '" data-name="' + esc(x.name) + '" title="Filtrar por ' + esc(x.name) + '">' +
        '<span class="nm">' + esc(x.name) + '</span><span class="nv">' + nf(val(x)) + '</span>' +
        '<span class="tr"><span class="fl" style="display:block;width:' + Math.max(3, val(x) / mx * 100).toFixed(1) + '%"></span></span></button>';
    }).join('') + '</div>';
  }

  /* ============================== Íconos ============================== */
  var IC = {
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="14" height="10"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17a2 2 0 01-2-2v-3l2-5h14l2 5v3a2 2 0 01-2 2M5 17v2M19 17v2"/><circle cx="7.5" cy="13.5" r=".6"/><circle cx="16.5" cy="13.5" r=".6"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v6h-6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M4 21h16"/></svg>'
  };

  /* ============================== Render ============================== */
  var root = document.createElement('div');
  root.id = 'cscDash';
  hub.insertBefore(root, hub.firstChild);
  var tip = document.createElement('div');
  tip.id = 'dTip';
  document.body.appendChild(tip);

  var cache = null;   // último cálculo, para tooltips

  function delta(cur, prv, hasPrev) {
    if (!hasPrev) return '';
    if (!prv) return cur ? '<span class="d-delta up">nuevo</span>' : '<span class="d-delta flat">—</span>';
    var p = ((cur - prv) / prv) * 100;
    if (Math.abs(p) < 0.5) return '<span class="d-delta flat">= igual</span>';
    return '<span class="d-delta ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(p)) + '%</span>';
  }

  function periodLabel(b) { return fmtLong(b.start) + ' – ' + fmtLong(b.end); }

  // Solo el administrador ve el Panel de control.
  function isAdmin() { try { return !!(currentUser && currentUser.rol === 'admin'); } catch (e) { return false; } }

  function render() {
    if (!isAdmin()) { root.style.display = 'none'; root.innerHTML = ''; return; }
    root.style.display = '';
    if (loading && !rows.length) {
      root.innerHTML = '<div class="d-head"><div><h2>Panel de control</h2><p>Cargando datos de despachos…</p></div></div>' +
        '<div class="d-kpis"><div class="d-skel"></div><div class="d-skel"></div><div class="d-skel"></div><div class="d-skel"></div></div>' +
        '<div class="d-grid"><div class="d-skel d-c8" style="height:300px"></div><div class="d-skel d-c4" style="height:300px"></div></div>';
      return;
    }
    if (errMsg && !rows.length) {
      root.innerHTML = '<div class="d-head"><div><h2>Panel de control</h2></div></div><div class="d-card d-empty">No se pudieron cargar los datos del panel. ' + esc(errMsg) + '<br><br><button class="d-btn" data-act="refresh" style="margin:auto">Reintentar</button></div>';
      return;
    }
    var C = compute(); cache = C;
    var gran = granFor(C.span);
    var buckets = series(C.cur, C.b, gran);
    var pbuckets = C.hasPrev ? series(C.prv, C.prev, gran) : [];

    var nDes = C.cur.length, pDes = C.prv.length;
    var nLot = sum(C.cur, function (r) { return r.lotes; }), pLot = sum(C.prv, function (r) { return r.lotes; });
    var nVeh = uniq(C.cur, function (r) { return r.placa; }), pVeh = uniq(C.prv, function (r) { return r.placa; });
    var avg = nDes ? nLot / nDes : 0, pAvg = pDes ? pLot / pDes : 0;
    var noFoto = C.cur.filter(function (r) { return pendingIds[r.id]; }).length;

    // Opciones de filtros (siempre sobre todo el histórico)
    var resps = rank(rows, 'resp', function (x) { return x.n; }).map(function (x) { return x.name; }).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var respOpts = '<option value="">Todos los responsables</option>' + resps.map(function (r) { return '<option value="' + esc(r) + '"' + (r === S.resp ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('');

    var chips = [['7', '7 días'], ['30', '30 días'], ['90', '90 días'], ['year', 'Este año'], ['all', 'Todo'], ['custom', 'Rango']].map(function (c) {
      return '<button type="button" class="d-chip' + (S.range === c[0] ? ' on' : '') + '" data-range="' + c[0] + '">' + c[1] + '</button>';
    }).join('');

    var tags = '';
    if (S.resp) tags += '<span class="d-tag">Responsable: ' + esc(S.resp) + '<button data-clear="resp" aria-label="Quitar">×</button></span>';
    if (S.placa) tags += '<span class="d-tag">Placa: ' + esc(S.placa) + '<button data-clear="placa" aria-label="Quitar">×</button></span>';

    var sparkVals = buckets.map(function (x) { return x.n; }), sparkLot = buckets.map(function (x) { return x.lotes; });
    var withDoc = C.cur.filter(function (r) { return r.doc; }).length;

    var h = '';
    h += '<div class="d-head"><div><h2>Panel de control</h2><p>Despachos · ' + esc(periodLabel(C.b)) + '</p></div>' +
      '<div class="d-tools"><div class="d-chips">' + chips + '</div>' +
      '<select class="d-select" id="dResp" aria-label="Responsable">' + respOpts + '</select>' +
      '<button class="d-btn' + (spinning ? ' spin' : '') + '" data-act="refresh" title="Actualizar datos">' + IC.refresh + '<span>Actualizar</span></button>' +
      '<button class="d-btn" data-act="csv" title="Descargar los datos filtrados">' + IC.down + '<span>CSV</span></button></div></div>';
    if (S.range === 'custom') {
      h += '<div class="d-tools" style="margin:-4px 0 14px"><label style="font-size:12.5px;color:var(--ink-soft);font-weight:700">Desde <input type="date" class="d-date" id="dFrom" value="' + esc(S.from || ymd(C.b.start)) + '"></label>' +
        '<label style="font-size:12.5px;color:var(--ink-soft);font-weight:700">Hasta <input type="date" class="d-date" id="dTo" value="' + esc(S.to || ymd(C.b.end)) + '"></label></div>';
    }
    if (tags) h += '<div class="d-active">' + tags + '</div>';

    h += '<div class="d-kpis">' +
      kpi('Despachos', IC.truck, nf(nDes), delta(nDes, pDes, C.hasPrev) + '<span>vs. período anterior</span>', sparkline(sparkVals, '#3B2F8F')) +
      kpi('Lotes despachados', IC.box, nf(nLot), delta(nLot, pLot, C.hasPrev) + '<span>' + nf1(avg) + ' por despacho</span>', sparkline(sparkLot, '#2F7D4F')) +
      kpi('Vehículos distintos', IC.car, nf(nVeh), delta(nVeh, pVeh, C.hasPrev) + '<span>' + (nVeh ? nf1(nDes / nVeh) : 0) + ' viajes c/u</span>', '') +
      '<div class="d-card d-kpi alert" data-act="pending" title="Ver reportes sin fotos"><div class="lbl"><span class="ic">' + IC.cam + '</span>Sin fotos</div><div class="val">' + nf(noFoto) + '</div>' +
      '<div class="sub">' + (noFoto ? '<span class="d-delta down">pendientes</span><span>toca para revisarlos</span>' : '<span class="d-delta up">al día</span><span>todo con fotos</span>') + '</div></div>' +
      '</div>';

    h += '<div class="d-grid">' +
      '<div class="d-card d-c8"><div class="d-ct"><div><h3>Evolución de despachos</h3><small>' + (gran === 'day' ? 'Por día' : gran === 'week' ? 'Por semana' : 'Por mes') + ' · pasa el cursor para ver el detalle</small></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><div class="d-seg" data-seg="metric"><button data-v="despachos" class="' + (S.metric === 'despachos' ? 'on' : '') + '">Despachos</button><button data-v="lotes" class="' + (S.metric === 'lotes' ? 'on' : '') + '">Lotes</button></div>' +
      '<div class="d-seg" data-seg="gran"><button data-v="auto" class="' + (S.gran === 'auto' ? 'on' : '') + '">Auto</button><button data-v="day" class="' + (S.gran === 'day' ? 'on' : '') + '">Día</button><button data-v="week" class="' + (S.gran === 'week' ? 'on' : '') + '">Sem.</button><button data-v="month" class="' + (S.gran === 'month' ? 'on' : '') + '">Mes</button></div></div></div>' +
      '<div class="d-chart" id="dMain">' + barChart(buckets, S.metric) + '</div></div>' +
      '<div class="d-card d-c4"><div class="d-ct"><div><h3>Por responsable</h3><small>Toca uno para filtrar</small></div></div>' + rankList(rank(C.cur, 'resp', function (x) { return S.metric === 'lotes' ? x.lotes : x.n; }), 'resp', S.metric, S.resp) + '</div></div>';

    h += '<div class="d-grid">' +
      '<div class="d-card d-c6"><div class="d-ct"><div><h3>Vehículos con más viajes</h3><small>Toca una placa para filtrar</small></div></div>' + rankList(rank(C.cur, 'placa', function (x) { return S.metric === 'lotes' ? x.lotes : x.n; }), 'placa', S.metric, S.placa) + '</div>' +
      '<div class="d-card d-c6"><div class="d-ct"><div><h3>Días de mayor actividad</h3><small>Despachos por día de la semana</small></div></div><div class="d-chart" id="dWd">' + weekdayChart(C.cur) + '</div></div></div>';

    h += '<div class="d-card d-c12" style="margin-bottom:14px"><div class="d-ct"><div><h3>Calendario de actividad</h3><small>Últimas 26 semanas · cada cuadro es un día</small></div></div>' +
      '<div class="d-chart" id="dHeat" style="max-width:760px">' + heatmap(rows.filter(extraOk)) + '</div>' +
      '<div class="d-legend">Menos ' + HEAT.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + ' Más</div></div>';

    h += '<div class="d-card" id="dTable">' + tableHtml(C) + '</div>';
    root.innerHTML = h;
    wire();
    updateTable();
    root._buckets = buckets; root._pbuckets = pbuckets; root._gran = gran;
  }

  function kpi(label, icon, val, sub, spark) {
    return '<div class="d-card d-kpi"><div class="lbl"><span class="ic">' + icon + '</span>' + label + '</div><div class="val">' + val + '</div><div class="sub">' + sub + '</div>' + spark + '</div>';
  }

  /* ---- Tabla ---- */
  function tableData(C) {
    var q = S.q.trim().toLowerCase();
    var list = C.cur.filter(function (r) { return !q || (r.id + ' ' + r.placa + ' ' + r.resp + ' ' + r.lotesTxt).toLowerCase().indexOf(q) !== -1; });
    var f = S.sort, d = S.dir;
    list.sort(function (a, b) {
      var x = f === 'lotes' ? a.lotes : a[f], y = f === 'lotes' ? b.lotes : b[f];
      if (typeof x === 'string') return x.localeCompare(y, 'es') * d;
      return (x - y) * d || a.id.localeCompare(b.id);
    });
    return list;
  }
  function tableHtml() {
    var cols = [['fecha', 'Fecha'], ['placa', 'Placa'], ['lotes', 'Lotes'], ['resp', 'Responsable'], ['id', 'Código']];
    return '<div class="d-ct"><div><h3>Detalle de despachos</h3><small>Toca una fila para abrir el registro completo</small></div>' +
      '<input class="d-search" id="dSearch" type="search" placeholder="Buscar placa, responsable, lote…" value="' + esc(S.q) + '"></div>' +
      '<div class="d-tablewrap"><table class="d-table"><thead><tr>' + cols.map(function (c) {
        return '<th data-sort="' + c[0] + '" class="' + (S.sort === c[0] ? 's' : '') + '">' + c[1] + '<span class="ar">' + (S.sort === c[0] ? (S.dir > 0 ? '▲' : '▼') : '↕') + '</span></th>';
      }).join('') + '<th style="cursor:default">Fotos</th></tr></thead><tbody id="dTbody"></tbody></table></div><div class="d-foot" id="dFoot"></div>';
  }
  function updateTable() {
    var tb = document.getElementById('dTbody'), ft = document.getElementById('dFoot');
    if (!tb || !cache) return;
    var list = tableData(cache), pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (S.page >= pages) S.page = pages - 1;
    var slice = list.slice(S.page * PAGE, S.page * PAGE + PAGE);
    tb.innerHTML = slice.length ? slice.map(function (r) {
      return '<tr data-id="' + esc(r.id) + '"><td>' + fmtLong(r.t) + '</td><td class="pl">' + esc(r.placa) + '</td><td class="num">' + esc(r.lotesTxt || '—') + '</td><td>' + esc(r.resp) + '</td><td style="color:var(--ink-soft)">' + esc(r.id) + '</td>' +
        '<td>' + (pendingIds[r.id] ? '<span class="d-pill warn">Pendiente</span>' : '<span class="d-pill ok">Completo</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="d-empty">No hay registros que coincidan.</td></tr>';
    ft.innerHTML = '<span>' + nf(list.length) + ' registro' + (list.length === 1 ? '' : 's') + (list.length ? ' · página ' + (S.page + 1) + ' de ' + pages : '') + '</span>' +
      '<div class="d-pager"><button data-pg="-1"' + (S.page === 0 ? ' disabled' : '') + '>← Anterior</button><button data-pg="1"' + (S.page >= pages - 1 ? ' disabled' : '') + '>Siguiente →</button></div>';
  }

  /* ============================== Interacción ============================== */
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.classList.add('show');
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var nx = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14)), ny = y - h - 12;
    if (ny < 8) ny = y + 18;
    tip.style.left = nx + 'px'; tip.style.top = ny + 'px';
  }
  function hideTip() { tip.classList.remove('show'); }

  function wire() {
    var main = document.getElementById('dMain');
    if (main) {
      main.addEventListener('mousemove', function (e) {
        var el = e.target.closest('.d-hit'); var all = main.querySelectorAll('.d-bar');
        all.forEach(function (b) { b.style.opacity = el ? (b.getAttribute('data-i') === el.getAttribute('data-i') ? 1 : .45) : 1; });
        if (!el) return hideTip();
        var i = +el.getAttribute('data-i'), bk = root._buckets[i], pb = root._pbuckets[i];
        var v = S.metric === 'lotes' ? bk.lotes : bk.n, pv = pb ? (S.metric === 'lotes' ? pb.lotes : pb.n) : null;
        showTip('<b>' + esc(bk.long) + '</b><br>' + nf(v) + ' ' + (S.metric === 'lotes' ? 'lotes' : (v === 1 ? 'despacho' : 'despachos')) + (S.metric === 'despachos' && bk.lotes ? '<br>' + nf(bk.lotes) + ' lotes' : '') + (pv != null ? '<br><span style="opacity:.7">Período anterior: ' + nf(pv) + '</span>' : ''), e.clientX, e.clientY);
      });
      main.addEventListener('mouseleave', function () { hideTip(); main.querySelectorAll('.d-bar').forEach(function (b) { b.style.opacity = 1; }); });
      main.addEventListener('click', function (e) {   // clic en una barra → ir a ese día en la tabla
        var el = e.target.closest('.d-hit'); if (!el) return;
        var bk = root._buckets[+el.getAttribute('data-i')];
        S.q = ''; S.sort = 'fecha'; S.dir = -1; S.page = 0;
        var C = cache, from = bk.k, to = root._gran === 'day' ? bk.k : root._gran === 'week' ? bk.k + 6 * DAY : day(new Date(bk.k).getUTCFullYear(), new Date(bk.k).getUTCMonth() + 1, 0);
        S.range = 'custom'; S.from = ymd(Math.max(from, C.b.start)); S.to = ymd(Math.min(to, C.b.end));
        render();
        var t = document.getElementById('dTable'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    var wd = document.getElementById('dWd');
    if (wd) {
      var counts = [0, 0, 0, 0, 0, 0, 0]; cache.cur.forEach(function (r) { counts[dow(r.t)]++; });
      wd.addEventListener('mousemove', function (e) {
        var el = e.target.closest('.d-wd'); if (!el) return hideTip();
        var i = +el.getAttribute('data-i'), v = counts[i];
        showTip('<b>' + ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][i] + '</b><br>' + nf(v) + ' despacho' + (v === 1 ? '' : 's'), e.clientX, e.clientY);
      });
      wd.addEventListener('mouseleave', hideTip);
    }
    var heat = document.getElementById('dHeat');
    if (heat) {
      heat.addEventListener('mousemove', function (e) {
        var el = e.target.closest('.d-cell'); if (!el) return hideTip();
        var c = +el.getAttribute('data-c');
        showTip('<b>' + fmtLong(+el.getAttribute('data-t')) + '</b><br>' + (c ? nf(c) + ' despacho' + (c === 1 ? '' : 's') : 'Sin despachos'), e.clientX, e.clientY);
      });
      heat.addEventListener('mouseleave', hideTip);
    }
  }

  root.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest('[data-range]');
    if (chip) { S.range = chip.getAttribute('data-range'); if (S.range !== 'custom') { S.from = S.to = ''; } S.page = 0; return render(); }
    var seg = t.closest('[data-seg] button');
    if (seg) { S[seg.parentNode.getAttribute('data-seg')] = seg.getAttribute('data-v'); return render(); }
    var row = t.closest('.d-row');
    if (row) {
      var k = row.getAttribute('data-kind'), n = row.getAttribute('data-name');
      S[k] = S[k] === n ? '' : n; S.page = 0; return render();
    }
    var clr = t.closest('[data-clear]');
    if (clr) { S[clr.getAttribute('data-clear')] = ''; S.page = 0; return render(); }
    var th = t.closest('th[data-sort]');
    if (th) { var f = th.getAttribute('data-sort'); if (S.sort === f) S.dir *= -1; else { S.sort = f; S.dir = f === 'fecha' || f === 'lotes' ? -1 : 1; } S.page = 0; return render(); }
    var pg = t.closest('[data-pg]');
    if (pg) { S.page += +pg.getAttribute('data-pg'); return updateTable(); }
    var tr = t.closest('#dTbody tr[data-id]');
    if (tr) return openRecord(tr.getAttribute('data-id'));
    var act = t.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'refresh') return doRefresh();
      if (a === 'csv') return exportCsv();
      if (a === 'pending') {
        var first = cache && cache.cur.filter(function (r) { return pendingIds[r.id]; })[0];
        var bell = document.getElementById('notifBtn') || document.querySelector('.notif-btn');
        if (first) return openRecord(first.id);
        if (bell) bell.click();
      }
    }
  });
  root.addEventListener('change', function (e) {
    if (e.target.id === 'dResp') { S.resp = e.target.value; S.page = 0; render(); }
    if (e.target.id === 'dFrom') { S.from = e.target.value; render(); }
    if (e.target.id === 'dTo') { S.to = e.target.value; render(); }
  });
  root.addEventListener('input', function (e) {
    if (e.target.id === 'dSearch') { S.q = e.target.value; S.page = 0; updateTable(); }
  });

  function openRecord(id) {
    try { if (typeof goToPendingReport === 'function') goToPendingReport({ group: 'orquidea', id: id }); } catch (e) {}
  }
  function doRefresh() {
    if (spinning) return;
    spinning = true; render();
    var p = (typeof syncData === 'function') ? syncData(true) : Promise.resolve();
    Promise.resolve(p).catch(function (e) { errMsg = e && e.message ? e.message : ''; }).then(function () {
      spinning = false; check(true);
      try { if (typeof updateHubCount === 'function') updateHubCount(); if (typeof renderPendingUI === 'function') renderPendingUI(); } catch (e) {}
    });
  }
  function exportCsv() {
    if (!cache || !isAdmin()) return;
    var list = tableData(cache), q = function (v) { v = String(v == null ? '' : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var out = ['Código;Fecha;Placa;Lotes;Responsable;Fotos'].concat(list.map(function (r) {
      return [r.id, ymd(r.t), r.placa, r.lotesTxt, r.resp, pendingIds[r.id] ? 'Pendiente' : 'Completo'].map(q).join(';');
    })).join('\r\n');
    var blob = new Blob(['﻿' + out], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'dashboard-despachos-' + ymd(todayUTC()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ============================== Sincronía con app.js ============================== */
  function isVisible() { return hub.offsetParent !== null; }
  function check(force) {
    if (!isAdmin()) { if (root.style.display !== 'none') render(); sig = ''; return; }
    if (root.style.display === 'none') force = true; // acaba de entrar un admin
    var recs = globalRecords();
    if (!recs) { if (force) render(); return; }
    var pend = globalPending();
    var s = recs.length + '|' + pend.length + '|' + (recs[0] ? recs[0][KEY.id] : '') + '|' + (recs[recs.length - 1] ? recs[recs.length - 1][KEY.id] : '') + '|' + pend.map(function (p) { return p.id; }).join(',') + '|' + new Date().toDateString();
    if (!force && s === sig) return;
    sig = s; loading = false; errMsg = '';
    buildRows(recs);
    render();
  }
  // Mientras Inicio está visible se revisa si app.js trajo datos nuevos (sin pedir nada a la red).
  setInterval(function () { if (isVisible()) check(false); }, 1500);
  render();
  check(false);
  // Si pasados unos segundos no hay datos, se avisa en vez de quedarse cargando.
  setTimeout(function () { if (loading && isVisible() && !globalRecords()) { loading = false; errMsg = 'Revisa tu conexión e intenta de nuevo.'; render(); } }, 20000);
})();

