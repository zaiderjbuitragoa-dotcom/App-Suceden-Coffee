/**
 * chat.js — Chat interno PRIVADO de S&D Sucden.
 * Grupo "Equipo Sucden" + mensajes individuales, respuestas, adjuntos, eliminar propios,
 * foto de perfil, avisos (sonido, mensaje flotante, notificación del sistema).
 * Los mensajes viajan por la sesión del usuario y se guardan cifrados en el servidor.
 * Usa de app.js: WEB_APP_URL, fetchJson, currentUser, showSection, compressImageFile.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var app = $('appScreen');
  var main = app && app.querySelector('main.container');
  var side = document.querySelector('.csc-side');
  if (!app || !main || !side || app.getAttribute('data-sd-chat')) return;
  app.setAttribute('data-sd-chat', '1');

  var LS = 'sd_chat_read:', MSG_LS = 'sd_chat_msgs:', USR_LS = 'sd_chat_users:', ASKED_LS = 'sd_notif_asked';
  var GROUP_NAME = 'Equipo Sucden';
  var MAX_BYTES = 5 * 1024 * 1024, MAX_TEXT = 1500;
  var DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
  var IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  var me = null, users = [], usersVer = '', msgs = [], seen = {}, lastId = 0;
  var active = 'group', isOpen = false, busy = false, offline = false, filter = '', onlyUnread = false;
  var readTs = {}, pendingFile = null, preparing = false, replyTo = null;
  var notified = {}, baseline = false, titleBase = document.title, swReg = null, actx = null, toastTimer = null;
  var lastPollAt = 0, usersAt = 0, myFoto = '', blobUrls = {}, blobLoading = {};

  /* ---------------- Estilos ---------------- */
  var st = document.createElement('style');
  st.textContent = [
    '#panel-chat{display:none;}',
    '.sdc{--c-navy:#1B2A6B;--c-deep:#131E52;--c-ind:#3B2F8F;--c-soft:#EEF2FA;--c-line:#DCE2EC;--c-acc:#A9C1F5;}',
    '.sdc{display:flex;height:calc(100vh - 128px);height:calc(100dvh - 128px);min-height:460px;background:#fff;border:1px solid var(--c-line);border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(27,42,107,.09);position:relative;}',
    /* lista */
    '.sdc-list{width:330px;flex-shrink:0;border-right:1px solid var(--c-line);display:flex;flex-direction:column;background:#fff;}',
    '.sdc-lhead{padding:18px 16px 10px;}',
    '.sdc-lhead h3{margin:0 0 12px;font-size:20px;color:var(--c-deep);letter-spacing:-.01em;display:flex;align-items:center;gap:8px;}',
    '.sdc-search{position:relative;}',
    '.sdc-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#8A94AA;pointer-events:none;}',
    '.sdc-search input{width:100%;box-sizing:border-box;padding:10px 12px 10px 36px;border:1px solid var(--c-line);border-radius:12px;font-size:14px;font-family:inherit;background:var(--c-soft);outline:none;}',
    '.sdc-search input:focus{background:#fff;border-color:var(--c-navy);box-shadow:0 0 0 3px rgba(27,42,107,.12);}',
    '.sdc-chips{display:flex;gap:6px;margin-top:10px;}',
    '.sdc-chips button{border:1px solid var(--c-line);background:#fff;color:#4A5570;font-size:12.5px;font-weight:700;padding:5px 12px;border-radius:999px;cursor:pointer;font-family:inherit;}',
    '.sdc-chips button.on{background:var(--c-navy);border-color:var(--c-navy);color:#fff;}',
    '.sdc-notif{display:none;margin:10px 0 0;width:100%;padding:9px 12px;border:1px dashed #8FA4DE;border-radius:12px;background:#F3F6FF;color:var(--c-navy);font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;}',
    '.sdc-notif.show{display:block;}',
    '.sdc-notenote{display:none;margin:10px 0 0;font-size:11.5px;color:#6B768F;}',
    '.sdc-notenote.show{display:block;}',
    '.sdc-convs{flex:1;overflow-y:auto;padding:4px 8px 12px;}',
    '.sdc-conv{display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;cursor:pointer;border:none;background:transparent;width:100%;text-align:left;font-family:inherit;transition:background .12s;}',
    '.sdc-conv:hover{background:var(--c-soft);}',
    '.sdc-conv.active{background:#E3EAFB;}',
    '.sdc-av{width:42px;height:42px;border-radius:50%;color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background-size:cover;background-position:center;letter-spacing:.02em;user-select:none;}',
    '.sdc-av.grp{background:linear-gradient(135deg,#1B2A6B,#3B2F8F);}',
    '.sdc-av.adm{box-shadow:0 0 0 2px #fff,0 0 0 4px #A9C1F5;}',
    '.sdc-av.sm{width:24px;height:24px;font-size:10px;}',
    '.sdc-av.sm.adm{box-shadow:0 0 0 1.5px #fff,0 0 0 3px #A9C1F5;}',
    '.sdc-av.lg{width:44px;height:44px;}',
    '.sdc-cbody{flex:1;min-width:0;}',
    '.sdc-cname{font-size:14.5px;font-weight:700;color:#1B2233;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.sdc-clast{font-size:12.8px;color:#6B768F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}',
    '.sdc-conv.unread .sdc-cname,.sdc-conv.unread .sdc-clast{color:#131E52;font-weight:800;}',
    '.sdc-cmeta{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;}',
    '.sdc-ctime{font-size:11px;color:#8A94AA;}',
    '.sdc-badge{min-width:20px;height:20px;border-radius:10px;background:var(--err,#C0392B);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 6px;box-sizing:border-box;}',
    '.sdc-sk{display:flex;gap:12px;padding:12px 10px;align-items:center;}',
    '.sdc-sk i{display:block;border-radius:50%;width:42px;height:42px;background:linear-gradient(90deg,#EEF2FA 25%,#F7F9FD 50%,#EEF2FA 75%);background-size:200% 100%;animation:sdsk 1.2s linear infinite;}',
    '.sdc-sk div{flex:1;}.sdc-sk b{display:block;height:11px;border-radius:6px;background:linear-gradient(90deg,#EEF2FA 25%,#F7F9FD 50%,#EEF2FA 75%);background-size:200% 100%;animation:sdsk 1.2s linear infinite;margin:5px 0;width:60%;}.sdc-sk b+b{width:85%;}',
    '@keyframes sdsk{to{background-position:-200% 0;}}',
    /* hilo */
    '.sdc-main{flex:1;min-width:0;display:flex;flex-direction:column;position:relative;background:#EEF2FA;}',
    '.sdc-head{display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--c-line);background:#fff;}',
    '.sdc-back{display:none;border:none;background:var(--c-soft);border-radius:10px;width:38px;height:38px;cursor:pointer;color:var(--c-deep);align-items:center;justify-content:center;flex-shrink:0;}',
    '.sdc-hname{font-weight:800;color:var(--c-deep);font-size:15.5px;line-height:1.2;}',
    '.sdc-hsub{font-size:12px;color:#6B768F;display:flex;align-items:center;gap:6px;}',
    '.sdc-lock{display:inline-flex;align-items:center;gap:4px;color:#2F7D4F;font-weight:700;}',
    '.sdc-status{margin-left:auto;font-size:12px;color:var(--err,#C0392B);font-weight:700;display:flex;align-items:center;gap:6px;}',
    '.sdc-msgs{flex:1;overflow-y:auto;padding:16px 18px 10px;display:flex;flex-direction:column;gap:2px;scroll-behavior:auto;overscroll-behavior:contain;}',
    '.sdc-day{align-self:center;font-size:11.5px;font-weight:700;color:#5B6683;background:#fff;border:1px solid var(--c-line);padding:3px 13px;border-radius:999px;margin:12px 0 8px;}',
    '.sdc-row{display:flex;gap:8px;align-items:flex-end;max-width:100%;position:relative;}',
    '.sdc-row.me{justify-content:flex-end;}',
    '.sdc-row.first{margin-top:8px;}',
    '.sdc-slot{width:24px;flex-shrink:0;}',
    '.sdc-bub{max-width:min(76%,540px);padding:7px 11px 5px;border-radius:16px;font-size:14.5px;line-height:1.42;word-break:break-word;position:relative;box-shadow:0 1px 2px rgba(27,42,107,.08);}',
    '.sdc-row.me .sdc-bub{background:linear-gradient(135deg,#1B2A6B,#3B2F8F);color:#fff;border-bottom-right-radius:5px;}',
    '.sdc-row.other .sdc-bub{background:#fff;color:#1B2233;border:1px solid #E3E8F2;border-bottom-left-radius:5px;}',
    '.sdc-row.me:not(.last) .sdc-bub{border-bottom-right-radius:16px;}.sdc-row.other:not(.last) .sdc-bub{border-bottom-left-radius:16px;}',
    '.sdc-bub.fail{background:var(--err-bg,#FBE9E6)!important;color:var(--err,#C0392B)!important;border:1px solid #F1B7AF!important;}',
    '.sdc-bub.del{background:transparent!important;border:1px dashed #BCC5DA!important;color:#7A859D!important;box-shadow:none;font-style:italic;}',
    '.sdc-who{font-size:12px;font-weight:800;color:#3B2F8F;margin-bottom:2px;}',
    '.sdc-txt{white-space:pre-wrap;}',
    '.sdc-txt a{color:inherit;text-decoration:underline;text-underline-offset:2px;}',
    '.sdc-row.other .sdc-txt a{color:#1B2A6B;}',
    '.sdc-meta{display:flex;justify-content:flex-end;align-items:center;gap:4px;font-size:10.5px;opacity:.72;margin-top:1px;white-space:nowrap;float:right;margin-left:12px;position:relative;top:5px;}',
    '.sdc-bub::after{content:"";display:block;clear:both;}',
    '.sdc-quote{border-left:3px solid #8FA4DE;background:rgba(27,42,107,.07);border-radius:8px;padding:5px 9px;margin:2px 0 5px;cursor:pointer;font-size:12.5px;}',
    '.sdc-row.me .sdc-quote{background:rgba(255,255,255,.16);border-left-color:#A9C1F5;}',
    '.sdc-quote b{display:block;font-size:12px;color:#3B2F8F;}.sdc-row.me .sdc-quote b{color:#C7D1F0;}',
    '.sdc-quote span{display:block;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;}',
    '.sdc-hl .sdc-bub{animation:sdhl 1.4s ease;}@keyframes sdhl{0%,60%{box-shadow:0 0 0 3px #A9C1F5;}100%{box-shadow:0 1px 2px rgba(27,42,107,.08);}}',
    '.sdc-img{display:block;width:260px;max-width:100%;min-height:90px;max-height:300px;object-fit:cover;border-radius:11px;margin:2px 0 4px;background:#DCE2EC;cursor:zoom-in;}',
    '.sdc-imgph{width:260px;max-width:100%;height:150px;border-radius:11px;margin:2px 0 4px;background:linear-gradient(90deg,#DCE2EC 25%,#EEF2FA 50%,#DCE2EC 75%);background-size:200% 100%;animation:sdsk 1.2s linear infinite;}',
    '.sdc-file{display:flex;align-items:center;gap:10px;padding:8px 10px;margin:2px 0 4px;border-radius:11px;background:rgba(27,42,107,.08);min-width:210px;cursor:pointer;border:none;color:inherit;font-family:inherit;text-align:left;width:100%;box-sizing:border-box;}',
    '.sdc-row.me .sdc-file{background:rgba(255,255,255,.16);}',
    '.sdc-fic{width:38px;height:38px;border-radius:9px;background:#1B2A6B;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;}',
    '.sdc-row.me .sdc-fic{background:#A9C1F5;color:#131E52;}',
    '.sdc-fn{font-size:13.5px;font-weight:700;word-break:break-all;line-height:1.25;}.sdc-fs{font-size:11px;opacity:.75;}',
    /* acciones */
    '.sdc-acts{position:absolute;top:-14px;display:none;gap:2px;background:#fff;border:1px solid var(--c-line);border-radius:10px;padding:2px;box-shadow:0 4px 14px rgba(27,42,107,.16);z-index:5;}',
    '.sdc-row.me .sdc-acts{right:8px;}.sdc-row.other .sdc-acts{left:40px;}',
    '.sdc-row:hover .sdc-acts,.sdc-row.tap .sdc-acts{display:flex;}',
    '.sdc-acts button{border:none;background:transparent;width:30px;height:28px;border-radius:8px;cursor:pointer;color:#3B4663;display:flex;align-items:center;justify-content:center;padding:0;}',
    '.sdc-acts button:hover{background:var(--c-soft);color:#1B2A6B;}.sdc-acts button.dn:hover{background:#FBE9E6;color:#C0392B;}',
    '.sdc-empty{margin:auto;text-align:center;color:#6B768F;font-size:14px;padding:24px;max-width:300px;}',
    '.sdc-empty .ic{width:64px;height:64px;border-radius:20px;background:#E3EAFB;color:#1B2A6B;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;}',
    '.sdc-empty b{display:block;color:#131E52;font-size:15.5px;margin-bottom:4px;}',
    '.sdc-down{position:absolute;right:18px;bottom:96px;width:40px;height:40px;border-radius:50%;border:1px solid var(--c-line);background:#fff;color:#1B2A6B;cursor:pointer;box-shadow:0 4px 14px rgba(27,42,107,.2);display:none;align-items:center;justify-content:center;z-index:6;}',
    '.sdc-down.show{display:flex;}.sdc-down i{position:absolute;top:-7px;right:-4px;min-width:19px;height:19px;border-radius:10px;background:var(--err,#C0392B);color:#fff;font-size:11px;font-weight:800;font-style:normal;display:none;align-items:center;justify-content:center;padding:0 5px;box-sizing:border-box;}.sdc-down i.show{display:flex;}',
    /* compositor */
    '.sdc-form{position:relative;background:#fff;border-top:1px solid var(--c-line);padding:10px 14px 12px;display:flex;flex-direction:column;gap:8px;}',
    '.sdc-bar{display:none;align-items:center;gap:10px;padding:7px 10px;border-radius:12px;background:var(--c-soft);border-left:4px solid #3B2F8F;font-size:13px;}',
    '.sdc-bar.show{display:flex;}',
    '.sdc-bar .t{flex:1;min-width:0;}.sdc-bar b{display:block;color:#3B2F8F;font-size:12px;}.sdc-bar span{display:block;color:#4A5570;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.sdc-bar img{width:44px;height:44px;border-radius:8px;object-fit:cover;}',
    '.sdc-bar .fic{width:44px;height:44px;border-radius:8px;background:#1B2A6B;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;text-transform:uppercase;}',
    '.sdc-bar .x{border:none;background:transparent;font-size:22px;line-height:1;color:#6B768F;cursor:pointer;padding:2px 8px;}',
    '.sdc-row2{display:flex;gap:8px;align-items:flex-end;}',
    '.sdc-tool{width:42px;height:42px;border:none;border-radius:12px;background:transparent;color:#4A5570;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;font-size:21px;}',
    '.sdc-tool:hover,.sdc-tool.on{background:var(--c-soft);color:#1B2A6B;}.sdc-tool:disabled{opacity:.45;cursor:default;}',
    '.sdc-input{flex:1;resize:none;max-height:130px;padding:10px 14px;border:1px solid var(--c-line);border-radius:14px;font-size:15px;font-family:inherit;line-height:1.35;box-sizing:border-box;background:var(--c-soft);outline:none;}',
    '.sdc-input:focus{background:#fff;border-color:var(--c-navy);box-shadow:0 0 0 3px rgba(27,42,107,.12);}',
    '.sdc-send{width:44px;height:44px;border:none;border-radius:14px;background:linear-gradient(135deg,#1B2A6B,#3B2F8F);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(27,42,107,.3);}',
    '.sdc-send:disabled{opacity:.4;cursor:default;box-shadow:none;}',
    '.sdc-count{font-size:11px;color:#8A94AA;text-align:right;margin:-4px 4px 0;display:none;}.sdc-count.show{display:block;}.sdc-count.warn{color:#C0392B;}',
    '.sdc-emoji{display:none;position:absolute;left:14px;bottom:calc(100% - 4px);width:min(340px,calc(100% - 28px));background:#fff;border:1px solid var(--c-line);border-radius:14px;box-shadow:0 12px 32px rgba(27,42,107,.2);z-index:20;overflow:hidden;}',
    '.sdc-emoji.show{display:block;}.sdc-etabs{display:flex;border-bottom:1px solid var(--c-line);background:#F7F9FD;}',
    '.sdc-etabs button{flex:1;border:none;background:transparent;padding:8px 0;font-size:18px;cursor:pointer;border-bottom:3px solid transparent;}.sdc-etabs button.on{border-bottom-color:#1B2A6B;background:#E9F1FC;}',
    '.sdc-egrid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:8px;max-height:210px;overflow-y:auto;}',
    '.sdc-egrid button{border:none;background:transparent;font-size:22px;padding:5px 0;border-radius:8px;cursor:pointer;line-height:1;}.sdc-egrid button:hover{background:#E9F1FC;}',
    '.sdc-drop{position:absolute;inset:0;background:rgba(27,42,107,.86);color:#fff;display:none;align-items:center;justify-content:center;font-size:18px;font-weight:800;z-index:30;text-align:center;border-radius:18px;}.sdc-drop.show{display:flex;}',
    /* varios */
    '.csc-item.csc-chat{position:relative;}',
    '.chat-badge{display:none;margin-left:auto;min-width:19px;height:19px;border-radius:10px;background:var(--err,#C0392B);color:#fff;font-size:11px;font-weight:800;font-style:normal;align-items:center;justify-content:center;padding:0 5px;box-sizing:border-box;}.chat-badge.show{display:flex;}',
    '.csc-side.collapsed .chat-badge{position:absolute;top:4px;right:10px;margin:0;min-width:16px;height:16px;font-size:10px;}',
    '#cscAvatar{cursor:pointer;background-size:cover;background-position:center;}',
    '.csc-photo-actions{display:flex;gap:12px;margin-top:3px;}.csc-photo-actions button{background:none;border:none;padding:0;color:#A9C1F5;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px;}.csc-photo-actions button:disabled{opacity:.6;cursor:default;}',
    '.sdc-toast{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:50%;transform:translate(-50%,-150%);transition:transform .25s ease;z-index:2000;width:min(92vw,380px);background:#131E52;color:#fff;border-radius:14px;padding:11px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:pointer;display:flex;gap:10px;align-items:center;}',
    '.sdc-toast.show{transform:translate(-50%,0);}.sdc-toast b{display:block;font-size:13.5px;}.sdc-toast span{display:block;font-size:12.5px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;}',
    '.sdc-lb{position:fixed;inset:0;background:rgba(10,16,48,.92);z-index:3500;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;}',
    '.sdc-lb img{max-width:100%;max-height:calc(100% - 60px);border-radius:10px;object-fit:contain;}',
    '.sdc-lb .bar{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:14px;display:flex;gap:8px;}',
    '.sdc-lb .bar a,.sdc-lb .bar button{background:rgba(255,255,255,.16);color:#fff;border:none;border-radius:10px;padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer;text-decoration:none;font-family:inherit;}',
    '@media (prefers-reduced-motion:reduce){.sdc-sk i,.sdc-sk b,.sdc-imgph{animation:none;}.sdc-toast{transition:none;}}',
    '@media (max-width:760px){',
    '  .sdc{height:calc(100vh - 112px);height:calc(100dvh - 112px);border-radius:14px;}',
    '  .sdc-list{width:100%;border-right:none;}.sdc-main{display:none;}',
    '  .sdc.in-thread .sdc-list{display:none;}.sdc.in-thread .sdc-main{display:flex;}',
    '  .sdc-back{display:flex;}.sdc-bub{max-width:84%;}.sdc-msgs{padding:12px 10px 8px;}',
    '  .sdc-acts{top:-16px;}.sdc-down{right:12px;}',
    '}'
  ].join('\n');
  document.head.appendChild(st);

  /* ---------------- Íconos ---------------- */
  function ico(p, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 20) + '" height="' + (s || 20) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
  var I = {
    chat: ico('<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>', 19),
    send: ico('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
    clip: ico('<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9"/>'),
    smile: ico('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>'),
    search: ico('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', 16),
    back: ico('<path d="M15 18l-6-6 6-6"/>'),
    reply: ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 015 5v3"/>', 16),
    copy: ico('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>', 16),
    trash: ico('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', 16),
    down: ico('<path d="M6 9l6 6 6-6"/>'),
    lock: ico('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', 12),
    users: ico('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/>', 22),
    bubble: ico('<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>', 30),
    clock: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 11),
    check: ico('<path d="M5 13l4 4L19 7"/>', 12)
  };

  /* ---------------- Panel ---------------- */
  var panel = document.createElement('section');
  panel.id = 'panel-chat';
  panel.innerHTML =
    '<div class="sdc" id="sdc">' +
      '<div class="sdc-list">' +
        '<div class="sdc-lhead"><h3>Mensajes</h3>' +
          '<div class="sdc-search">' + I.search + '<input id="sdcSearch" type="search" placeholder="Buscar compañero…" autocomplete="off" aria-label="Buscar compañero"></div>' +
          '<div class="sdc-chips"><button type="button" class="on" id="sdcAll">Todos</button><button type="button" id="sdcUnread">No leídos</button></div>' +
          '<button type="button" class="sdc-notif" id="sdcNotifBtn">🔔 Activar avisos de mensajes nuevos</button>' +
          '<div class="sdc-notenote" id="sdcNotifNote">Los avisos están bloqueados en este navegador. Actívalos en los permisos del sitio.</div>' +
        '</div>' +
        '<div class="sdc-convs" id="sdcConvs"></div>' +
      '</div>' +
      '<div class="sdc-main" id="sdcMain">' +
        '<div class="sdc-head">' +
          '<button type="button" class="sdc-back" id="sdcBack" aria-label="Volver a la lista">' + I.back + '</button>' +
          '<div class="sdc-av lg grp" id="sdcHeadAv"></div>' +
          '<div><div class="sdc-hname" id="sdcHeadName">' + GROUP_NAME + '</div><div class="sdc-hsub" id="sdcHeadSub"></div></div>' +
          '<div class="sdc-status" id="sdcStatus"></div>' +
        '</div>' +
        '<div class="sdc-msgs" id="sdcMsgs" role="log" aria-live="polite"></div>' +
        '<button type="button" class="sdc-down" id="sdcDown" aria-label="Ir al último mensaje">' + I.down + '<i id="sdcDownN"></i></button>' +
        '<div class="sdc-form" id="sdcForm">' +
          '<div class="sdc-emoji" id="sdcEmoji"><div class="sdc-etabs" id="sdcETabs"></div><div class="sdc-egrid" id="sdcEGrid"></div></div>' +
          '<div class="sdc-bar" id="sdcReply"></div>' +
          '<div class="sdc-bar" id="sdcAttach"></div>' +
          '<div class="sdc-row2">' +
            '<input type="file" id="sdcFile" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv">' +
            '<button type="button" class="sdc-tool" id="sdcClip" aria-label="Adjuntar imagen o documento" title="Adjuntar">' + I.clip + '</button>' +
            '<button type="button" class="sdc-tool" id="sdcEmojiBtn" aria-label="Emojis" title="Emojis">' + I.smile + '</button>' +
            '<textarea class="sdc-input" id="sdcInput" rows="1" maxlength="' + MAX_TEXT + '" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea>' +
            '<button type="button" class="sdc-send" id="sdcSend" aria-label="Enviar">' + I.send + '</button>' +
          '</div>' +
          '<div class="sdc-count" id="sdcCount"></div>' +
        '</div>' +
        '<div class="sdc-drop" id="sdcDrop">Suelta aquí la imagen o el documento</div>' +
      '</div>' +
    '</div>';
  main.appendChild(panel);

  var navChat = document.createElement('button');
  navChat.type = 'button'; navChat.className = 'csc-item csc-chat';
  navChat.innerHTML = I.chat + '<span>Chat</span><i class="chat-badge" id="chatBadge"></i>';
  var adminBtn = $('adminBtn');
  var anchor = side.querySelector('.csc-label-modulos') ||
    (adminBtn && adminBtn.previousElementSibling && adminBtn.previousElementSibling.classList.contains('csc-label') ? adminBtn.previousElementSibling : side.querySelector('.csc-bottom'));
  side.insertBefore(navChat, anchor);

  /* ---------------- Utilidades ---------------- */
  function enc(s) { return encodeURIComponent(s); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayLabel(ts) {
    var d = new Date(ts);
    if (dayKey(ts) === dayKey(Date.now())) return 'Hoy';
    if (dayKey(ts) === dayKey(Date.now() - 864e5)) return 'Ayer';
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function listTime(ts) {
    if (dayKey(ts) === dayKey(Date.now())) return fmtTime(ts);
    if (dayKey(ts) === dayKey(Date.now() - 864e5)) return 'Ayer';
    return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }
  function convOf(m) { return m.tipo === 'grupo' ? 'group' : (m.de === me ? m.para : m.de); }
  function userByCed(c) { for (var i = 0; i < users.length; i++) if (users[i].cedula === c) return users[i]; return null; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function extOf(n) { var m = /\.([a-zA-Z0-9]{1,5})$/.exec(String(n || '')); return m ? m[1].toLowerCase() : ''; }
  function isImgName(n) { return IMG_EXT.indexOf(extOf(n)) !== -1; }
  function fmtKB(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function snippet(m) { return m.deleted ? 'Mensaje eliminado' : (m.texto || (m.adj ? (isImgName(m.adj.n) ? '📷 Foto' : '📎 ' + m.adj.n) : '')); }
  function lastOf(conv) { for (var i = msgs.length - 1; i >= 0; i--) if (convOf(msgs[i]) === conv) return msgs[i]; return null; }
  function unreadOf(conv) {
    var n = 0, r = readTs[conv] || 0;
    for (var i = msgs.length - 1; i >= 0; i--) {
      var m = msgs[i]; if (m.ts <= r) break;
      if (convOf(m) === conv && m.de !== me && !m.temp && !m.deleted) n++;
    }
    return n;
  }
  function saveRead() { try { localStorage.setItem(LS + me, JSON.stringify(readTs)); } catch (e) {} }
  function markRead(conv) { var l = lastOf(conv); if (l && !l.temp && (readTs[conv] || 0) < l.ts) { readTs[conv] = l.ts; saveRead(); } }
  function totalUnread() { var t = unreadOf('group'); users.forEach(function (u) { t += unreadOf(u.cedula); }); return t; }
  function inThread(v) { $('sdc').classList.toggle('in-thread', v); }
  function convName(c) { if (c === 'group') return GROUP_NAME; var u = userByCed(c); return u ? u.nombre : 'Usuario'; }

  /* ---------------- Avatares ---------------- */
  var AV = ['#1B2A6B', '#2F6B4F', '#8A3B3B', '#3A5A8C', '#7A4F9A', '#A05A12', '#2E7D7A', '#9A4A6B', '#5B6B2E', '#4A4F7A'];
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function initials(n) { var w = String(n || '').trim().split(/\s+/).filter(Boolean); return !w.length ? '?' : (w[0].charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase(); }
  function photoOf(ced) { if (ced === me) return myFoto; var u = userByCed(ced); return u ? u.foto : ''; }
  function paintAv(node, ced, name, isGroup, size) {
    var u = ced ? userByCed(ced) : null, admin = !!(u && u.rol === 'admin');
    node.className = 'sdc-av' + (isGroup ? ' grp' : '') + (size ? ' ' + size : '') + (admin && !isGroup ? ' adm' : '');
    node.style.backgroundImage = ''; node.style.background = ''; node.style.color = '';
    if (isGroup) { node.innerHTML = I.users; return node; }
    node.textContent = initials(name || (u && u.nombre));
    var f = photoOf(ced);
    if (f) { node.style.backgroundImage = 'url(data:image/jpeg;base64,' + f + ')'; node.style.color = 'transparent'; }
    else node.style.background = AV[hash(ced || name) % AV.length];
    return node;
  }

  /* ---------------- Red ---------------- */
  function timedJson(url, opts, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    opts = opts || {}; if (ctl) opts.signal = ctl.signal;
    return fetchJson(url, opts, 1).then(function (d) { clearTimeout(timer); return d; }, function (e) { clearTimeout(timer); throw e; });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hasPending() { return msgs.some(function (m) { return m.temp; }); }
  function api(params, ms) {
    var q = Object.keys(params).map(function (k) { return k + '=' + enc(params[k]); }).join('&');
    return timedJson(WEB_APP_URL + '?' + q, undefined, ms || 20000);
  }
  function postJson(body, ms) { return timedJson(WEB_APP_URL, { method: 'POST', body: JSON.stringify(body) }, ms || 25000); }

  /* ---------------- Mensajes en memoria ---------------- */
  function addMsg(m) {
    if (seen[m.id]) return false;
    seen[m.id] = 1; m.ts = Number(m.ts) || Number(m.id);
    msgs.push(m); if (m.ts > lastId) lastId = m.ts;
    return true;
  }
  function byId(id) { for (var i = 0; i < msgs.length; i++) if (msgs[i].id === id) return msgs[i]; return null; }
  function applyDelete(id) {
    var m = byId(String(id)); if (!m) return false;
    m.deleted = true; m.texto = ''; m.adj = null; m.reply = null; return true;
  }
  function reconcileOwn(m) {
    for (var i = 0; i < msgs.length; i++) {
      var t = msgs[i];
      if ((t.temp || t.failed) && !t.done && t.de === me && String(t.texto || '') === String(m.texto || '') &&
          t.tipo === m.tipo && String(t.para || '') === String(m.para || '') && (!!t.adj === !!m.adj)) {
        t.done = true; msgs.splice(i, 1); return true;
      }
    }
    return false;
  }
  function saveLocal() {
    try {
      localStorage.setItem(MSG_LS + me, JSON.stringify(msgs.filter(function (m) { return !m.temp && !m.failed; }).slice(-150)));
      if (users.length) localStorage.setItem(USR_LS + me, JSON.stringify({ u: users, f: myFoto, v: usersVer }));
    } catch (e) {}
  }
  function loadLocal() {
    try {
      (JSON.parse(localStorage.getItem(MSG_LS + me) || '[]') || []).forEach(addMsg);
      msgs.sort(function (a, b) { return a.ts - b.ts; });
      var u = JSON.parse(localStorage.getItem(USR_LS + me) || 'null');
      if (u && u.u && u.u.length) { users = u.u; myFoto = u.f || ''; usersVer = u.v || ''; applyMyPhoto(); }
    } catch (e) {}
  }

  async function loadUsers(force) {
    var d = await api({ action: 'chatUsers', ver: force ? '' : usersVer }, 20000);
    if (!d.ok) throw new Error(d.error || 'Error');
    usersAt = Date.now();
    if (d.same) return false;
    users = d.users || []; usersVer = d.ver || ''; myFoto = (d.me && d.me.foto) || '';
    applyMyPhoto();
    return true;
  }

  async function poll() {
    if (busy && Date.now() - lastPollAt > 30000) busy = false;
    if (busy || !me) return;
    busy = true; lastPollAt = Date.now();
    var who = me;
    try {
      var first = lastId === 0 && !msgs.length, usersChanged = false;
      var pu = null;
      if (!users.length) { pu = loadUsers(true).then(function () { usersChanged = true; }); pu.catch(function () {}); }
      else if (Date.now() - usersAt > 180000) {
        usersAt = Date.now();
        loadUsers().then(function (ch) { if (ch && me === who) { repaintAll(); saveLocal(); } }).catch(function () {});
      }
      var pl = api({ action: 'chatList', since: lastId }); pl.catch(function () {});
      if (pu) await pu;
      var d = await pl;
      if (me !== who) { busy = false; return; }
      if (!d.ok) throw new Error(d.error || 'Error');
      offline = false;
      var changed = false, incoming = [];
      (d.messages || []).forEach(function (m) {
        if (m.de === me && reconcileOwn(m)) changed = true;
        if (addMsg(m)) { changed = true; if (m.de !== me && !m.deleted) incoming.push(m); }
      });
      (d.events || []).forEach(function (e) { if (e.ev === 'del' && applyDelete(e.target)) changed = true; if (Number(e.id) > lastId) lastId = Number(e.id); });
      if (d.last && Number(d.last) > lastId) lastId = Number(d.last);
      msgs.sort(function (a, b) { return a.ts - b.ts; });
      if (first && !localStorage.getItem(LS + me)) {   // primera vez en este equipo: el historial no cuenta como "sin leer"
        ['group'].concat(users.map(function (u) { return u.cedula; })).forEach(function (c) { var l = lastOf(c); if (l) readTs[c] = l.ts; });
        saveRead(); incoming = [];
      }
      if (isOpen && !document.hidden) markRead(active);
      if (changed || first || usersChanged) { renderList(); if (isOpen) renderThread(); saveLocal(); } else renderBadge();
      if (isOpen) renderHead();
      if (baseline && incoming.length) notifyIncoming(incoming);
      baseline = true;
    } catch (e) { offline = true; if (isOpen) renderHead(); }
    busy = false;
  }

  /* ---------------- Lista ---------------- */
  function renderBadge() {
    var n = totalUnread(), b = $('chatBadge');
    b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('show', n > 0);
    document.title = (n > 0 ? '(' + n + ') ' : '') + titleBase;
    bellRefresh();
  }
  function bellRefresh() {
    try {
      if (typeof renderNotifBadge === 'function') renderNotifBadge();
      var np = $('notifPanel');
      if (np && np.classList.contains('open') && typeof renderNotifPanel === 'function') renderNotifPanel();
    } catch (e) {}
  }
  function unreadItems() {
    if (!me) return [];
    var out = [];
    ['group'].concat(users.map(function (u) { return u.cedula; })).forEach(function (c) {
      var n = unreadOf(c); if (!n) return;
      var l = lastOf(c);
      out.push({ conv: c, count: n, ts: l ? l.ts : 0, name: convName(c), preview: l ? ((c === 'group' ? String(l.nombre).split(' ')[0] + ': ' : '') + snippet(l)) : '' });
    });
    out.sort(function (a, b) { return b.ts - a.ts; });
    return out;
  }

  function convRow(conv, name, sub, grp) {
    var last = lastOf(conv), un = unreadOf(conv);
    var row = el('button', 'sdc-conv' + (conv === active && isOpen ? ' active' : '') + (un ? ' unread' : ''));
    row.type = 'button';
    row.appendChild(paintAv(el('div'), grp ? null : conv, name, grp));
    var body = el('div', 'sdc-cbody');
    body.appendChild(el('div', 'sdc-cname', name));
    body.appendChild(el('div', 'sdc-clast', last ? ((last.de === me ? 'Tú: ' : (grp ? String(last.nombre).split(' ')[0] + ': ' : '')) + snippet(last)) : sub));
    row.appendChild(body);
    var meta = el('div', 'sdc-cmeta');
    if (last) meta.appendChild(el('div', 'sdc-ctime', listTime(last.ts)));
    if (un) meta.appendChild(el('div', 'sdc-badge', un > 99 ? '99+' : String(un)));
    row.appendChild(meta);
    row.addEventListener('click', function () { selectConv(conv); });
    return row;
  }

  function renderList() {
    var box = $('sdcConvs'); box.textContent = '';
    if (!users.length && !msgs.length && !offline) {
      for (var i = 0; i < 5; i++) { var sk = el('div', 'sdc-sk'); sk.innerHTML = '<i></i><div><b></b><b></b></div>'; box.appendChild(sk); }
      renderBadge(); return;
    }
    var q = norm(filter);
    if (!q && (!onlyUnread || unreadOf('group'))) box.appendChild(convRow('group', GROUP_NAME, 'Todos los compañeros autorizados', true));
    var list = users.filter(function (u) { return (!q || norm(u.nombre).indexOf(q) !== -1) && (!onlyUnread || unreadOf(u.cedula)); });
    list.sort(function (a, b) {
      var la = lastOf(a.cedula), lb = lastOf(b.cedula);
      return (lb ? lb.ts : 0) - (la ? la.ts : 0) || a.nombre.localeCompare(b.nombre);
    });
    list.forEach(function (u) { box.appendChild(convRow(u.cedula, u.nombre, u.rol === 'admin' ? 'Administrador' : 'Compañero', false)); });
    if (!box.children.length) box.appendChild(el('div', 'sdc-empty', q ? 'Sin resultados para esa búsqueda.' : 'No tienes mensajes sin leer.'));
    renderBadge();
  }

  function renderHead() {
    var av = $('sdcHeadAv'), sub = $('sdcHeadSub');
    if (active === 'group') {
      paintAv(av, null, '', true, 'lg'); $('sdcHeadName').textContent = GROUP_NAME;
      sub.textContent = ''; sub.appendChild(el('span', '', (users.length + 1) + ' integrantes'));
    } else {
      var u = userByCed(active);
      paintAv(av, active, u ? u.nombre : '', false, 'lg'); $('sdcHeadName').textContent = u ? u.nombre : 'Usuario';
      sub.textContent = ''; sub.appendChild(el('span', '', u && u.rol === 'admin' ? 'Administrador' : 'Compañero'));
    }
    var lk = el('span', 'sdc-lock'); lk.innerHTML = I.lock + ' Privado y cifrado'; sub.appendChild(lk);
    $('sdcStatus').textContent = offline ? 'Sin conexión…' : '';
  }

  /* ---------------- Hilo ---------------- */
  var URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
  function linkify(node, text) {
    var parts = String(text).split(URL_RE);
    parts.forEach(function (p, i) {
      if (i % 2 === 1) { var a = document.createElement('a'); a.href = p; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = p; node.appendChild(a); }
      else if (p) node.appendChild(document.createTextNode(p));
    });
  }

  function getBlob(m) {   // descarga el adjunto desde el servidor (solo si participas en la conversación)
    if (blobUrls[m.id]) return Promise.resolve(blobUrls[m.id]);
    if (blobLoading[m.id]) return blobLoading[m.id];
    var p = api({ action: 'chatFile', id: m.id }, 60000).then(function (d) {
      if (!d.ok) throw new Error(d.error || 'No se pudo abrir el archivo');
      return fetch('data:' + d.mime + ';base64,' + d.base64).then(function (r) { return r.blob(); });
    }).then(function (b) { blobUrls[m.id] = URL.createObjectURL(b); delete blobLoading[m.id]; return blobUrls[m.id]; },
      function (e) { delete blobLoading[m.id]; throw e; });
    blobLoading[m.id] = p; return p;
  }

  var imgObs = null;
  function observeImg(node, m) {
    if (m.preview) { node.src = m.preview; return; }
    if (blobUrls[m.id]) { node.src = blobUrls[m.id]; return; }
    node.classList.add('sdc-imgph');
    var load = function () {
      getBlob(m).then(function (u) { var im = document.createElement('img'); im.className = 'sdc-img'; im.alt = m.adj.n; im.src = u; im.addEventListener('click', function () { openLightbox(u, m.adj.n); }); if (node.parentNode) node.parentNode.replaceChild(im, node); })
        .catch(function () { node.textContent = 'No se pudo cargar la imagen'; node.style.animation = 'none'; node.style.display = 'flex'; node.style.alignItems = 'center'; node.style.justifyContent = 'center'; node.style.fontSize = '12px'; });
    };
    if ('IntersectionObserver' in window) {
      if (!imgObs) imgObs = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { imgObs.unobserve(e.target); e.target._go && e.target._go(); } }); }, { root: $('sdcMsgs'), rootMargin: '200px' });
      node._go = load; imgObs.observe(node);
    } else load();
  }

  function openLightbox(url, name) {
    var lb = el('div', 'sdc-lb'), bar = el('div', 'bar');
    var dl = document.createElement('a'); dl.href = url; dl.download = name || 'imagen'; dl.textContent = 'Descargar';
    var cl = el('button', '', 'Cerrar'); cl.type = 'button';
    bar.appendChild(dl); bar.appendChild(cl); lb.appendChild(bar);
    var im = document.createElement('img'); im.src = url; im.alt = name || ''; lb.appendChild(im);
    var close = function () { document.removeEventListener('keydown', esc); if (lb.parentNode) lb.parentNode.removeChild(lb); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    cl.addEventListener('click', close); lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', esc); document.body.appendChild(lb);
  }

  function openFile(m, card) {
    var sub = card.querySelector('.sdc-fs'), old = sub.textContent;
    sub.textContent = 'Descargando…';
    getBlob(m).then(function (u) {
      var a = document.createElement('a'); a.href = u; a.download = m.adj.n; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      sub.textContent = old;
    }).catch(function (e) { sub.textContent = 'Error: ' + (e.message || 'no se pudo descargar'); setTimeout(function () { sub.textContent = old; }, 3000); });
  }

  function tickIcon(m) { return m.failed ? '' : (m.temp ? I.clock : I.check); }

  function buildRow(m, grouped, lastInGroup, isGroupChat) {
    var mine = m.de === me;
    var row = el('div', 'sdc-row ' + (mine ? 'me' : 'other') + (grouped ? '' : ' first') + (lastInGroup ? ' last' : ''));
    row.setAttribute('data-id', m.id);
    if (!mine && isGroupChat) {
      var slot = el('div', 'sdc-slot');
      if (lastInGroup) slot.appendChild(paintAv(el('div'), m.de, m.nombre, false, 'sm'));
      row.appendChild(slot);
    }
    var b = el('div', 'sdc-bub' + (m.failed ? ' fail' : '') + (m.deleted ? ' del' : ''));
    if (m.deleted) {
      b.appendChild(el('div', 'sdc-txt', '🚫 Mensaje eliminado'));
      b.appendChild(el('div', 'sdc-meta', fmtTime(m.ts)));
      row.appendChild(b); return row;
    }
    if (!mine && isGroupChat && !grouped) b.appendChild(el('div', 'sdc-who', m.nombre));
    if (m.reply) {
      var q = el('div', 'sdc-quote'); q.appendChild(el('b', '', m.reply.n || 'Mensaje')); q.appendChild(el('span', '', m.reply.t || ''));
      q.addEventListener('click', function (ev) { ev.stopPropagation(); jumpTo(m.reply.id); });
      b.appendChild(q);
    }
    if (m.adj) {
      if (isImgName(m.adj.n)) {
        var ph = document.createElement('div'); ph.className = 'sdc-imgph'; b.appendChild(ph);
        if (m.temp || m.preview) { ph.className = 'sdc-img'; var im = document.createElement('img'); im.className = 'sdc-img'; im.alt = m.adj.n; im.src = m.preview || ''; b.replaceChild(im, ph); if (m.preview) im.addEventListener('click', function () { openLightbox(m.preview, m.adj.n); }); }
        else observeImg(ph, m);
      } else {
        var f = el('button', 'sdc-file'); f.type = 'button';
        f.appendChild(el('div', 'sdc-fic', extOf(m.adj.n) || 'doc'));
        var fb = el('div'); fb.appendChild(el('div', 'sdc-fn', m.adj.n)); fb.appendChild(el('div', 'sdc-fs', (m.adj.s ? fmtKB(m.adj.s) + ' · ' : '') + (m.temp ? 'Subiendo…' : 'Toca para descargar')));
        f.appendChild(fb);
        if (!m.temp) f.addEventListener('click', function (ev) { ev.stopPropagation(); openFile(m, f); });
        b.appendChild(f);
      }
    }
    if (m.texto) { var t = el('span', 'sdc-txt'); linkify(t, m.texto); b.appendChild(t); }
    var meta = el('span', 'sdc-meta');
    meta.appendChild(document.createTextNode(m.failed ? (m.errMsg ? m.errMsg + ' · toca para reintentar' : 'No enviado · toca para reintentar') : fmtTime(m.ts)));
    if (mine && !m.failed) { var tk = el('span'); tk.innerHTML = tickIcon(m); tk.style.display = 'inline-flex'; meta.appendChild(tk); }
    b.appendChild(meta);
    if (m.failed) b.addEventListener('click', function () { retry(m); });
    row.appendChild(b);

    if (!m.temp && !m.failed) {
      var acts = el('div', 'sdc-acts');
      var mk = function (svg, title, fn, cls) { var x = el('button', cls || ''); x.type = 'button'; x.title = title; x.setAttribute('aria-label', title); x.innerHTML = svg; x.addEventListener('click', function (ev) { ev.stopPropagation(); row.classList.remove('tap'); fn(); }); return x; };
      acts.appendChild(mk(I.reply, 'Responder', function () { setReply(m); }));
      if (m.texto) acts.appendChild(mk(I.copy, 'Copiar', function () { copyText(m.texto); }));
      if (mine) acts.appendChild(mk(I.trash, 'Eliminar para todos', function () { delMsg(m); }, 'dn'));
      row.appendChild(acts);
      b.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('a,button')) return;
        var was = row.classList.contains('tap');
        var all = $('sdcMsgs').querySelectorAll('.sdc-row.tap'); for (var i = 0; i < all.length; i++) all[i].classList.remove('tap');
        if (!was) row.classList.add('tap');
      });
    }
    return row;
  }

  function renderThread(forceBottom) {
    var box = $('sdcMsgs');
    var nearBottom = forceBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 110;
    var prevTop = box.scrollTop;
    box.textContent = '';
    var list = msgs.filter(function (m) { return convOf(m) === active; });
    if (!list.length) {
      var em = el('div', 'sdc-empty'); var ic = el('div', 'ic'); ic.innerHTML = I.bubble; em.appendChild(ic);
      em.appendChild(el('b', '', active === 'group' ? 'Aún no hay mensajes' : 'Inicia la conversación'));
      em.appendChild(document.createTextNode(active === 'group' ? 'Escribe el primer mensaje al equipo.' : 'Escribe un mensaje a ' + convName(active) + '. Solo ustedes dos lo verán.'));
      box.appendChild(em);
    }
    var prevDay = '', isG = active === 'group';
    list.forEach(function (m, i) {
      var dk = dayKey(m.ts);
      if (dk !== prevDay) { box.appendChild(el('div', 'sdc-day', dayLabel(m.ts))); prevDay = dk; }
      var p = list[i - 1], n = list[i + 1];
      var grouped = !!(p && dayKey(p.ts) === dk && p.de === m.de && m.ts - p.ts < 300000 && !p.deleted && !m.deleted);
      var lastIn = !(n && dayKey(n.ts) === dk && n.de === m.de && n.ts - m.ts < 300000 && !n.deleted && !m.deleted);
      box.appendChild(buildRow(m, grouped, lastIn, isG));
    });
    if (nearBottom) { box.scrollTop = box.scrollHeight; newBelow = 0; } else box.scrollTop = prevTop;
    updateDown();
  }

  var newBelow = 0;
  function updateDown() {
    var box = $('sdcMsgs'), far = box.scrollHeight - box.scrollTop - box.clientHeight > 220;
    $('sdcDown').classList.toggle('show', far);
    var n = $('sdcDownN'); n.textContent = newBelow > 99 ? '99+' : String(newBelow); n.classList.toggle('show', far && newBelow > 0);
  }
  $('sdcMsgs').addEventListener('scroll', function () { var b = this; if (b.scrollHeight - b.scrollTop - b.clientHeight < 60) newBelow = 0; updateDown(); }, { passive: true });
  $('sdcDown').addEventListener('click', function () { var b = $('sdcMsgs'); newBelow = 0; b.scrollTop = b.scrollHeight; updateDown(); });

  function jumpTo(id) {
    var r = $('sdcMsgs').querySelector('.sdc-row[data-id="' + String(id).replace(/"/g, '') + '"]');
    if (!r) return;
    r.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.classList.add('sdc-hl'); setTimeout(function () { r.classList.remove('sdc-hl'); }, 1500);
  }

  function repaintAll() { renderList(); renderHead(); if (isOpen) renderThread(); }

  function selectConv(conv) {
    active = conv; markRead(conv); filter = ''; $('sdcSearch').value = ''; closeEmoji(); clearReply();
    renderList(); renderHead(); renderThread(true); inThread(true);
    if (window.matchMedia('(min-width:761px)').matches) $('sdcInput').focus();
  }

  /* ---------------- Responder / copiar / eliminar ---------------- */
  function setReply(m) {
    replyTo = { id: m.id, n: m.de === me ? 'Tú' : m.nombre, t: snippet(m).slice(0, 140) };
    var bar = $('sdcReply'); bar.textContent = '';
    var t = el('div', 't'); t.appendChild(el('b', '', 'Respondiendo a ' + replyTo.n)); t.appendChild(el('span', '', replyTo.t));
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Cancelar respuesta'); x.addEventListener('click', clearReply);
    bar.appendChild(t); bar.appendChild(x); bar.classList.add('show'); $('sdcInput').focus();
  }
  function clearReply() { replyTo = null; var b = $('sdcReply'); b.classList.remove('show'); b.textContent = ''; }
  function copyText(txt) {
    var fb = function () { try { var t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); } catch (e) {} };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(fb); else fb();
    $('sdcStatus').style.color = '#2F7D4F'; $('sdcStatus').textContent = 'Copiado'; setTimeout(function () { $('sdcStatus').style.color = ''; renderHead(); }, 1200);
  }
  async function delMsg(m) {
    if (!window.confirm('¿Eliminar este mensaje para todos? No se puede deshacer.')) return;
    try {
      var d = await postJson({ action: 'chatDelete', id: m.id });
      if (!d.ok) throw new Error(d.error || 'Error');
      applyDelete(m.id); if (d.event && Number(d.event.id) > lastId) lastId = Number(d.event.id);
      saveLocal(); renderList(); renderThread();
    } catch (e) { window.alert('No se pudo eliminar: ' + (e.message || e)); }
  }

  /* ---------------- Avisos ---------------- */
  function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
  function beep() {
    try {
      unlockAudio();
      if (actx) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
        o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1175, t + 0.12);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.45);
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (e) {}
  }
  function convTitle(m) { return m.tipo === 'grupo' ? GROUP_NAME : m.nombre; }
  function msgBody(m) { return (m.tipo === 'grupo' ? String(m.nombre).split(' ')[0] + ': ' : '') + (snippet(m) || 'Mensaje nuevo'); }

  function showToastRaw(title, body, fn) {
    var t = $('sdcToast');
    if (!t) { t = el('div', 'sdc-toast'); t.id = 'sdcToast'; document.body.appendChild(t); t.addEventListener('click', function () { t.classList.remove('show'); if (t._fn) t._fn(); }); }
    t.textContent = ''; t.appendChild(el('div', '', '💬'));
    var box = el('div'); box.appendChild(el('b', '', title)); box.appendChild(el('span', '', body)); t.appendChild(box);
    t._fn = fn; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 6000);
  }
  function sysNotify(title, body, tag, conv, fn) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var opts = { body: body, icon: 'icon-192.png', badge: 'icon-192.png', tag: tag, renotify: true, vibrate: [200, 100, 200], data: { conv: conv || '' } };
    var fallback = function () { try { var n = new Notification(title, opts); n.onclick = function () { window.focus(); if (fn) fn(); n.close(); }; } catch (e) {} };
    if (swReg && swReg.showNotification) swReg.showNotification(title, opts).catch(fallback); else fallback();
  }
  /* Aviso genérico: lo usa app.js ("Nuevo despacho") y acceso.js ("Clave por recuperar"). */
  function notifyGeneric(title, body, fn) {
    beep();
    if (document.hidden) sysNotify(title, body, 'sd-aviso', '', fn); else showToastRaw(title, body, fn);
  }
  function notifyIncoming(list) {
    var viewing = isOpen && !document.hidden;
    var fresh = list.filter(function (m) {
      if (notified[m.id]) return false; notified[m.id] = 1;
      if (viewing && convOf(m) === active) { var b = $('sdcMsgs'); if (b.scrollHeight - b.scrollTop - b.clientHeight > 110) { newBelow++; updateDown(); } return false; }
      return true;
    });
    if (!fresh.length) return;
    var m = fresh[fresh.length - 1], conv = convOf(m);
    beep();
    if (document.hidden) sysNotify(convTitle(m), msgBody(m), 'sd-chat-' + conv, conv, function () { openConv(conv); });
    else showToastRaw(convTitle(m), msgBody(m), function () { openConv(conv); });
  }

  function notifSupported() { return 'Notification' in window; }
  function updateNotifUI() {
    var b = $('sdcNotifBtn'), n = $('sdcNotifNote'); if (!b || !n) return;
    var perm = notifSupported() ? Notification.permission : 'unsupported';
    b.classList.toggle('show', perm === 'default'); n.classList.toggle('show', perm === 'denied');
  }
  function askNotif() {
    if (!notifSupported() || Notification.permission !== 'default') { updateNotifUI(); return; }
    try { var r = Notification.requestPermission(function () { updateNotifUI(); }); if (r && r.then) r.then(updateNotifUI); } catch (e) {}
  }
  $('sdcNotifBtn').addEventListener('click', function () { unlockAudio(); askNotif(); });
  document.addEventListener('pointerup', function () {
    if (!me) return; unlockAudio();
    var asked = false; try { asked = !!localStorage.getItem(ASKED_LS); } catch (e) {}
    if (!asked && notifSupported() && Notification.permission === 'default') { try { localStorage.setItem(ASKED_LS, '1'); } catch (e) {} askNotif(); }
  }, { passive: true });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; return navigator.serviceWorker.ready; }).then(function (r) { swReg = r; }).catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.sdOpenChat) openConv(e.data.conv); });
  }

  /* ---------------- Envío ---------------- */
  async function send(texto, tempMsg, fileData, reply) {
    var tipo = active === 'group' ? 'grupo' : 'directo', temp = tempMsg;
    if (!temp) {
      temp = { id: 'tmp' + Date.now(), cid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), ts: Date.now(), de: me, nombre: currentUser.nombre, tipo: tipo, para: tipo === 'directo' ? active : '', texto: texto, temp: true, reply: reply || null };
      if (fileData) { temp.file = fileData; temp.adj = { n: fileData.filename, m: fileData.mimeType, s: Math.round(fileData.base64.length * 0.75) }; temp.preview = fileData.preview || ''; }
      msgs.push(temp);
    } else { temp.failed = false; temp.temp = true; temp.errMsg = ''; }
    renderList(); renderThread(true);
    setTimeout(function () { if (me) poll(); }, 2500);
    try {
      var body = { action: 'chatSend', cid: temp.cid, tipo: temp.tipo, para: temp.para, texto: temp.texto, reply: temp.reply || undefined,
        file: temp.file ? { base64: temp.file.base64, mimeType: temp.file.mimeType, filename: temp.file.filename } : undefined };
      var d = null, lastErr = null, wait = temp.file ? 70000 : 25000;
      for (var i = 0; i < 3 && !temp.done && !d; i++) {
        try { d = await postJson(body, wait); if (d && !d.ok) { lastErr = new Error(d.error || 'Error'); lastErr.final = true; d = null; break; } }
        catch (err) { lastErr = err; if (!temp.done) await sleep(800); }
      }
      if (!temp.done) {
        if (!d) throw lastErr || new Error('Error');
        msgs = msgs.filter(function (m) { return m !== temp; });
        var sm = d.message; if (temp.preview) sm.preview = temp.preview;   // la foto recién enviada se ve al instante
        if (sm.adj && temp.preview) blobUrls[sm.id] = temp.preview;
        addMsg(sm); msgs.sort(function (a, b) { return a.ts - b.ts; }); markRead(convOf(sm));
      }
      saveLocal();
    } catch (e) {
      if (temp.done) { renderList(); renderThread(true); return; }
      temp.temp = false; temp.failed = true;
      if (e && (e.final || /archivo|tipo|MB|rápido|Destinatario/i.test(String(e.message)))) temp.errMsg = String(e.message).slice(0, 60);
    }
    renderList(); renderThread(true);
  }
  function retry(m) { send(m.texto, m, m.file, m.reply); }

  function doSend() {
    var ta = $('sdcInput'), t = ta.value.trim();
    if ((!t && !pendingFile) || preparing) return;
    var f = pendingFile, r = replyTo;
    ta.value = ''; ta.style.height = 'auto'; updateCount(); clearAttach(); clearReply(); closeEmoji();
    send(t, null, f, r);
  }

  /* ---------------- Adjuntos ---------------- */
  function clearAttach() { pendingFile = null; $('sdcFile').value = ''; var b = $('sdcAttach'); b.classList.remove('show'); b.textContent = ''; }
  function showAttach(f, sizeTxt) {
    var box = $('sdcAttach'); box.textContent = '';
    if (f.preview) { var im = document.createElement('img'); im.src = f.preview; im.alt = ''; box.appendChild(im); } else box.appendChild(el('div', 'fic', extOf(f.filename) || 'doc'));
    var t = el('div', 't'); t.appendChild(el('b', '', f.filename)); t.appendChild(el('span', '', sizeTxt)); box.appendChild(t);
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar adjunto'); x.addEventListener('click', clearAttach);
    box.appendChild(x); box.classList.add('show');
  }
  async function attachFile(file) {
    if (!file) return;
    var ext = extOf(file.name) || (file.type.indexOf('image/') === 0 ? file.type.slice(6).replace('jpeg', 'jpg') : '');
    var isImg = file.type.indexOf('image/') === 0 || IMG_EXT.indexOf(ext) !== -1;
    if (!isImg && DOC_EXT.indexOf(ext) === -1) { window.alert('Tipo de archivo no permitido. Usa imágenes, PDF, Word, Excel, PowerPoint, TXT o CSV.'); clearAttach(); return; }
    if (!isImg && file.size > MAX_BYTES) { window.alert('El archivo supera el máximo de 5 MB.'); clearAttach(); return; }
    preparing = true; $('sdcSend').disabled = true;
    try {
      var fd;
      if (isImg && typeof compressImageFile === 'function') {
        var named = file.name && extOf(file.name) ? file : new File([file], 'foto_' + Date.now() + '.' + (ext || 'png'), { type: file.type });
        fd = await compressImageFile(named, 1400, 0.78);
        if (!isImgName(fd.filename)) fd.filename = 'foto_' + Date.now() + '.jpg';
        fd.preview = 'data:' + fd.mimeType + ';base64,' + fd.base64;
      } else {
        fd = await new Promise(function (res, rej) {
          var r = new FileReader();
          r.onload = function () { res({ base64: String(r.result).split(',')[1], mimeType: file.type, filename: file.name, preview: '' }); };
          r.onerror = function () { rej(new Error('lectura')); }; r.readAsDataURL(file);
        });
      }
      if (fd.base64.length * 0.75 > MAX_BYTES) { window.alert('El archivo supera el máximo de 5 MB.'); clearAttach(); }
      else { pendingFile = fd; showAttach(fd, fmtKB(Math.round(fd.base64.length * 0.75))); }
    } catch (e) { window.alert('No se pudo preparar el archivo.'); clearAttach(); }
    preparing = false; $('sdcSend').disabled = false;
  }
  $('sdcClip').addEventListener('click', function () { closeEmoji(); $('sdcFile').click(); });
  $('sdcFile').addEventListener('change', function () { attachFile(this.files && this.files[0]); });
  $('sdcInput').addEventListener('paste', function (e) { var it = (e.clipboardData && e.clipboardData.files) || []; if (it.length) { e.preventDefault(); attachFile(it[0]); } });
  (function drag() {
    var m = $('sdcMain'), d = $('sdcDrop'), depth = 0;
    m.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) { depth++; d.classList.add('show'); } });
    m.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) d.classList.remove('show'); });
    m.addEventListener('dragover', function (e) { e.preventDefault(); });
    m.addEventListener('drop', function (e) { e.preventDefault(); depth = 0; d.classList.remove('show'); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) attachFile(f); });
  })();

  /* ---------------- Emojis ---------------- */
  var EMO = [
    ['\uD83D\uDE0A', 'Caras', '\uD83D\uDE00 \uD83D\uDE03 \uD83D\uDE04 \uD83D\uDE01 \uD83D\uDE06 \uD83D\uDE05 \uD83D\uDE02 \uD83E\uDD23 \uD83D\uDE0A \uD83D\uDE07 \uD83D\uDE42 \uD83D\uDE09 \uD83D\uDE0D \uD83E\uDD29 \uD83D\uDE18 \uD83D\uDE0B \uD83D\uDE1C \uD83E\uDD14 \uD83E\uDD28 \uD83D\uDE10 \uD83D\uDE11 \uD83D\uDE36 \uD83D\uDE44 \uD83D\uDE0F \uD83D\uDE0C \uD83D\uDE34 \uD83D\uDE37 \uD83E\uDD75 \uD83E\uDD76 \uD83E\uDD73 \uD83D\uDE0E \uD83E\uDD13 \uD83D\uDE15 \uD83D\uDE1F \uD83D\uDE2E \uD83D\uDE33 \uD83D\uDE22 \uD83D\uDE2D \uD83D\uDE24 \uD83D\uDE20 \uD83D\uDE21 \uD83E\uDD2F \uD83D\uDE31 \uD83D\uDE2C \uD83E\uDD7A'],
    ['\uD83D\uDC4D', 'Gestos', '\uD83D\uDC4D \uD83D\uDC4E \uD83D\uDC4C \u270C\uFE0F \uD83E\uDD1E \uD83E\uDD1D \uD83D\uDC4F \uD83D\uDE4C \uD83D\uDE4F \uD83D\uDCAA \uD83D\uDC4B \uD83E\uDD19 \uD83D\uDC4A \u270A \u261D\uFE0F \uD83D\uDC49 \uD83D\uDC48 \uD83D\uDC46 \uD83D\uDC47 \u2764\uFE0F \uD83D\uDC99 \uD83D\uDC9A \uD83D\uDC9B \uD83D\uDC9C \uD83D\uDD25 \u2B50 \u2728 \uD83C\uDF89 \uD83D\uDCAF \uD83D\uDCA5 \uD83D\uDCA1 \uD83C\uDFC6'],
    ['\uD83D\uDE9A', 'Trabajo', '\uD83D\uDE9A \uD83D\uDE9B \uD83D\uDE9C \uD83D\uDE97 \u26FD \uD83D\uDCE6 \uD83D\uDCCB \uD83D\uDCDD \uD83D\uDCC4 \uD83D\uDCC1 \uD83D\uDCCE \uD83D\uDCF7 \uD83D\uDCCA \uD83D\uDCC8 \uD83D\uDCC5 \u23F0 \u231B \uD83D\uDCDE \uD83D\uDCF1 \uD83D\uDCBB \uD83D\uDCE7 \uD83D\uDCE2 \uD83D\uDD0D \uD83D\uDD12 \uD83D\uDD11 \uD83D\uDCB0 \uD83E\uDDFE \uD83C\uDFED \uD83C\uDFE2 \uD83D\uDCCD \u2615 \uD83C\uDF3E \uD83C\uDF31 \u2699\uFE0F'],
    ['\u2705', 'Símbolos', '\u2705 \u274C \u2714\uFE0F \u2716\uFE0F \u26A0\uFE0F \u2757 \u2753 \uD83D\uDEAB \uD83D\uDD34 \uD83D\uDFE0 \uD83D\uDFE1 \uD83D\uDFE2 \uD83D\uDD35 \u26AA \u26AB \u2B06\uFE0F \u2B07\uFE0F \u27A1\uFE0F \u2B05\uFE0F \uD83D\uDD04 \uD83C\uDD97 \uD83C\uDD95 \uD83D\uDD1D \uD83D\uDCAC \uD83D\uDCAD \uD83D\uDC40 \uD83D\uDE4B \uD83D\uDE45 \uD83E\uDD37 \u2600\uFE0F \uD83C\uDF27\uFE0F \u26C8\uFE0F \uD83C\uDF19']
  ];
  var emoTab = 0;
  function renderEmoji() {
    var tabs = $('sdcETabs'), grid = $('sdcEGrid'); tabs.textContent = ''; grid.textContent = '';
    EMO.forEach(function (c, i) { var t = el('button', i === emoTab ? 'on' : '', c[0]); t.type = 'button'; t.title = c[1]; t.addEventListener('click', function () { emoTab = i; renderEmoji(); }); tabs.appendChild(t); });
    EMO[emoTab][2].split(' ').forEach(function (e) { var b = el('button', '', e); b.type = 'button'; b.addEventListener('click', function () { insertEmoji(e); }); grid.appendChild(b); });
  }
  function insertEmoji(e) {
    var ta = $('sdcInput'), a = ta.selectionStart || 0, z = ta.selectionEnd || 0;
    if (ta.value.length + e.length > MAX_TEXT) return;
    ta.value = ta.value.slice(0, a) + e + ta.value.slice(z); ta.focus(); ta.selectionStart = ta.selectionEnd = a + e.length; grow(); updateCount();
  }
  function closeEmoji() { $('sdcEmoji').classList.remove('show'); $('sdcEmojiBtn').classList.remove('on'); }
  $('sdcEmojiBtn').addEventListener('click', function (ev) {
    ev.stopPropagation();
    var box = $('sdcEmoji'), on = !box.classList.contains('show'); if (on) renderEmoji();
    box.classList.toggle('show', on); this.classList.toggle('on', on);
  });
  $('sdcEmoji').addEventListener('click', function (ev) { ev.stopPropagation(); });
  document.addEventListener('click', function (ev) { if (!ev.target.closest || !ev.target.closest('#sdcEmoji')) closeEmoji(); });

  function grow() { var ta = $('sdcInput'); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; }
  function updateCount() {
    var n = $('sdcInput').value.length, c = $('sdcCount');
    c.textContent = n + ' / ' + MAX_TEXT; c.classList.toggle('show', n > MAX_TEXT * 0.8); c.classList.toggle('warn', n >= MAX_TEXT);
  }
  $('sdcSend').addEventListener('click', doSend);
  $('sdcInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
    else if (e.key === 'Escape') { if (replyTo) clearReply(); closeEmoji(); }
  });
  $('sdcInput').addEventListener('input', function () { grow(); updateCount(); });
  $('sdcSearch').addEventListener('input', function () { filter = this.value; renderList(); });
  $('sdcAll').addEventListener('click', function () { onlyUnread = false; $('sdcAll').classList.add('on'); $('sdcUnread').classList.remove('on'); renderList(); });
  $('sdcUnread').addEventListener('click', function () { onlyUnread = true; $('sdcUnread').classList.add('on'); $('sdcAll').classList.remove('on'); renderList(); });
  $('sdcBack').addEventListener('click', function () { inThread(false); renderList(); });

  /* ---------------- Abrir / cerrar ---------------- */
  function closeChat() {
    if (!isOpen) return;
    isOpen = false; panel.style.display = 'none'; navChat.classList.remove('active');
    if (typeof showSection === 'function') showSection('hub');
  }
  function openChat() {
    if (!me) return;
    ['panel-hub', 'panel-group', 'panel-admin'].forEach(function (id) { var p = $(id); if (p) p.style.display = 'none'; });
    panel.style.display = 'block'; isOpen = true; navChat.classList.add('active');
    side.classList.remove('open');
    var ov = document.querySelector('.csc-overlay'); if (ov) ov.classList.remove('show');
    var fb = $('floatingBack'); if (fb) fb.classList.add('show');
    inThread(false); renderList(); renderHead(); renderThread(true); poll();
  }
  navChat.addEventListener('click', openChat);
  function openConv(conv) { if (!me) return; if (!isOpen) openChat(); selectConv(conv || 'group'); }
  window.cscChat = { unreadItems: unreadItems, open: openConv, notify: notifyGeneric };

  side.addEventListener('click', function (e) { var b = e.target.closest('.csc-item, .icon-btn'); if (b && b !== navChat && b.id !== 'logoutBtn') closeChat(); }, true);
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#floatingBack')) closeChat(); }, true);

  /* ---------------- Mi foto de perfil ---------------- */
  var photoBtn = null, photoDel = null, photoInput = null;
  (function buildPhotoUI() {
    var sub = side.querySelector('.csc-user-sub'); if (!sub) return;
    var box = el('div', 'csc-photo-actions');
    photoBtn = el('button', '', 'Subir foto'); photoBtn.type = 'button';
    photoDel = el('button', '', 'Quitar'); photoDel.type = 'button'; photoDel.style.display = 'none';
    box.appendChild(photoBtn); box.appendChild(photoDel); sub.parentNode.appendChild(box);
    photoInput = document.createElement('input'); photoInput.type = 'file'; photoInput.accept = 'image/*'; photoInput.style.display = 'none'; document.body.appendChild(photoInput);
    var pick = function () { if (me) photoInput.click(); };
    photoBtn.addEventListener('click', pick);
    var av = $('cscAvatar'); if (av) { av.title = 'Cambiar foto de perfil'; av.addEventListener('click', pick); }
    photoInput.addEventListener('change', function () { var f = photoInput.files && photoInput.files[0]; photoInput.value = ''; if (f) changePhoto(f); });
    photoDel.addEventListener('click', removePhoto);
  })();

  function squarePhoto(file) {   // recorte cuadrado de 128 px (~6 KB): sube al instante
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var sz = Math.min(img.width, img.height), sx = (img.width - sz) / 2, sy = (img.height - sz) / 2;
        var c = document.createElement('canvas'); c.width = c.height = 128;
        c.getContext('2d').drawImage(img, sx, sy, sz, sz, 0, 0, 128, 128);
        resolve({ base64: c.toDataURL('image/jpeg', 0.8).split(',')[1], mimeType: 'image/jpeg', filename: 'perfil.jpg' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer esa imagen.')); };
      img.src = url;
    });
  }
  function applyMyPhoto() {
    var av = $('cscAvatar');
    if (av) {
      if (myFoto) { av.style.backgroundImage = 'url(data:image/jpeg;base64,' + myFoto + ')'; av.style.color = 'transparent'; }
      else { av.style.backgroundImage = ''; av.style.color = ''; }
    }
    if (photoBtn) photoBtn.textContent = myFoto ? 'Cambiar foto' : 'Subir foto';
    if (photoDel) photoDel.style.display = myFoto ? '' : 'none';
  }
  async function changePhoto(file) {
    var label = photoBtn ? photoBtn.textContent : '';
    if (photoBtn) { photoBtn.disabled = true; photoBtn.textContent = 'Subiendo…'; }
    try {
      var f = await squarePhoto(file);
      var d = await postJson({ action: 'chatSetPhoto', file: f });
      if (!d.ok) throw new Error(d.error || 'Error');
      myFoto = (d.result && d.result.foto) || ''; usersVer = ''; applyMyPhoto(); repaintAll(); saveLocal();
    } catch (e) { window.alert('No se pudo guardar la foto: ' + (e.message || e)); if (photoBtn) photoBtn.textContent = label; }
    if (photoBtn) photoBtn.disabled = false; applyMyPhoto();
  }
  async function removePhoto() {
    if (!window.confirm('¿Quitar tu foto de perfil? Volverá tu avatar con iniciales.')) return;
    if (photoDel) photoDel.disabled = true;
    try {
      var d = await postJson({ action: 'chatRemovePhoto' });
      if (!d.ok) throw new Error(d.error || 'Error');
      myFoto = ''; usersVer = ''; applyMyPhoto(); repaintAll(); saveLocal();
    } catch (e) { window.alert('No se pudo quitar la foto: ' + (e.message || e)); }
    if (photoDel) photoDel.disabled = false;
  }

  /* ---------------- Sesión y ciclo de consulta ---------------- */
  function resetSession() {
    if (isOpen) { isOpen = false; panel.style.display = 'none'; navChat.classList.remove('active'); }
    me = null; users = []; usersVer = ''; msgs = []; seen = {}; lastId = 0; readTs = {}; active = 'group'; offline = false; filter = ''; onlyUnread = false;
    myFoto = ''; usersAt = 0; replyTo = null; newBelow = 0; busy = false;
    Object.keys(blobUrls).forEach(function (k) { try { if (/^blob:/.test(blobUrls[k])) URL.revokeObjectURL(blobUrls[k]); } catch (e) {} }); blobUrls = {}; blobLoading = {};
    applyMyPhoto(); notified = {}; baseline = false; document.title = titleBase; bellRefresh();
    clearAttach(); clearReply(); closeEmoji(); $('sdcInput').value = ''; $('chatBadge').classList.remove('show');
    // Se borran los mensajes y las personas guardadas en el navegador; las marcas de "leído" (solo fechas) se conservan para saber qué llegó mientras estabas fuera.
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(MSG_LS) === 0 || k.indexOf(USR_LS) === 0) localStorage.removeItem(k); }); } catch (e) {}
  }

  /* Detecta al instante si cambió la persona con sesión (salir y entrar otra): nunca se mezclan chats. */
  function syncUser() {
    var cu = (typeof currentUser !== 'undefined') ? currentUser : null;
    var ced = cu && cu.cedula ? String(cu.cedula).trim() : null;
    if (!ced) { if (me) resetSession(); return false; }
    if (ced === me) return false;
    if (me) resetSession();
    me = ced;
    try { readTs = JSON.parse(localStorage.getItem(LS + me) || '{}') || {}; } catch (e) { readTs = {}; }
    loadLocal(); renderList(); updateNotifUI();
    return true;
  }

  var ticking = false;
  function tick() {
    syncUser();
    if (!me) { setTimeout(tick, 800); return; }
    var hidden = document.hidden;
    poll().then(function () { setTimeout(tick, hasPending() ? 1500 : (hidden ? 30000 : (isOpen ? 4000 : 15000))); });
  }
  setInterval(function () { if (syncUser() && me) poll(); }, 500);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !me) return;
    if (isOpen) { markRead(active); renderList(); }
    if (Date.now() - lastPollAt > 2000) poll();
    updateNotifUI();
  });
  if (!ticking) { ticking = true; tick(); }
})();
