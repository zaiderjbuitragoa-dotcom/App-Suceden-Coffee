/**
 * chat.js — Chat Interno Empresarial para S&D Sucden
 * ------------------------------------------------------------
 * Diseñado con máxima privacidad, rendimiento y calidad profesional.
 * 
 * CARACTERÍSTICAS:
 *  - Cifrado en base de datos: Todos los mensajes y nombres de adjuntos
 *    se almacenan con cifrado simétrico en Google Sheets.
 *  - Canal de Equipo ("☕ Equipo Sucden") para anuncios y comunicación grupal.
 *  - Mensajes Directos (1 a 1) entre colaboradores autorizados.
 *  - Soporte de adjuntos: Fotos con vista previa / Lightbox y Documentos (PDF, Excel, Word).
 *  - Fotos de perfil con recorte automático en Canvas y subida a Drive.
 *  - Notificaciones acústicas sintetizadas con Web Audio API (con botón de silenciar).
 *  - Sincronización inteligente por marcas de tiempo (desde el último mensaje recibido).
 *  - Totalmente adaptativo: vista dual en PC y flujo pantalla completa en móviles.
 */

(function () {
  'use strict';

  // Evitar inicialización doble
  if (window.cscChatInited) return;
  window.cscChatInited = true;

  // Estado del chat
  var activeConv = 'grupo'; // 'grupo' o cedula del destinatario
  var usersList = [];
  var myProfile = null;
  var messages = [];
  var unreadCounts = {};
  var lastTimestamp = 0;
  var isChatOpen = false;
  var soundEnabled = true;
  var pollTimer = null;
  var isSending = false;
  var pendingAttachment = null; // { base64, mimeType, filename, size }

  /* ------------------------- ESTILOS CSS ------------------------- */
  var css = [
    '/* Contenedor principal del Chat */',
    '#sucdenChatModal {',
    '  display: none; position: fixed; inset: 0; z-index: 1200; background: rgba(15, 23, 42, 0.65);',
    '  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); align-items: center; justify-content: center;',
    '  padding: 16px; opacity: 0; transition: opacity .25s ease;',
    '}',
    '#sucdenChatModal.show { display: flex; opacity: 1; }',
    '.chat-window {',
    '  width: 100%; max-width: 1080px; height: 90vh; height: 90dvh; max-height: 840px;',
    '  background: #ffffff; border-radius: 20px; box-shadow: 0 25px 70px rgba(19, 30, 82, 0.35);',
    '  display: flex; overflow: hidden; position: relative;',
    '}',
    '@media (max-width: 768px) {',
    '  #sucdenChatModal { padding: 0; }',
    '  .chat-window { height: 100vh; height: 100dvh; max-height: none; border-radius: 0; }',
    '}',
    '',
    '/* Columna izquierda: Lista de conversaciones */',
    '.chat-sidebar {',
    '  width: 320px; flex-shrink: 0; border-right: 1px solid #E2E8F0; background: #F8FAFC;',
    '  display: flex; flex-direction: column; overflow: hidden; transition: transform .25s ease;',
    '}',
    '.chat-sidebar-header {',
    '  padding: 16px 18px 12px; background: #ffffff; border-bottom: 1px solid #E2E8F0;',
    '}',
    '.chat-brand-row {',
    '  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;',
    '}',
    '.chat-brand-title {',
    '  font-size: 17px; font-weight: 800; color: #131E52; display: flex; align-items: center; gap: 8px;',
    '}',
    '.chat-enc-badge {',
    '  font-size: 11px; font-weight: 700; color: #059669; background: #ECFDF5; border: 1px solid #A7F3D0;',
    '  padding: 3px 7px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;',
    '}',
    '.chat-search-wrap { position: relative; }',
    '.chat-search-input {',
    '  width: 100%; padding: 8px 12px 8px 34px; border-radius: 10px; border: 1px solid #CBD5E1;',
    '  background: #F1F5F9; font-size: 13.5px; font-family: inherit; outline: none; transition: all .15s ease;',
    '}',
    '.chat-search-input:focus { border-color: #241E63; background: #ffffff; box-shadow: 0 0 0 3px rgba(36,30,99,0.1); }',
    '.chat-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #64748B; pointer-events: none; }',
    '',
    '.chat-conv-list { flex: 1; overflow-y: auto; padding: 10px 8px; }',
    '.chat-section-label {',
    '  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;',
    '  color: #64748B; padding: 10px 10px 6px; margin-top: 4px;',
    '}',
    '.chat-conv-item {',
    '  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px;',
    '  cursor: pointer; transition: all .15s ease; position: relative; margin-bottom: 2px;',
    '}',
    '.chat-conv-item:hover { background: #EEF2F6; }',
    '.chat-conv-item.active { background: #E0E7FF; }',
    '.chat-conv-item.active .chat-conv-name { color: #131E52; font-weight: 800; }',
    '',
    '.chat-avatar-box { position: relative; flex-shrink: 0; width: 44px; height: 44px; }',
    '.chat-avatar-img, .chat-avatar-initials {',
    '  width: 44px; height: 44px; border-radius: 50%; object-fit: cover;',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-weight: 800; font-size: 16px; color: #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.12);',
    '}',
    '.chat-avatar-team {',
    '  background: linear-gradient(135deg, #131E52 0%, #3B3388 100%); font-size: 20px;',
    '}',
    '.chat-online-dot {',
    '  position: absolute; bottom: 1px; right: 1px; width: 11px; height: 11px;',
    '  border-radius: 50%; background: #10B981; border: 2px solid #ffffff;',
    '}',
    '.chat-conv-info { flex: 1; min-width: 0; }',
    '.chat-conv-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }',
    '.chat-conv-name { font-size: 14px; font-weight: 700; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.chat-conv-time { font-size: 11.5px; color: #64748B; flex-shrink: 0; }',
    '.chat-conv-preview { font-size: 12.5px; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.chat-badge-unread {',
    '  min-width: 20px; height: 20px; border-radius: 10px; background: #DC2626; color: #ffffff;',
    '  font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;',
    '  padding: 0 6px; box-sizing: border-box; flex-shrink: 0;',
    '}',
    '',
    '/* Pie de perfil en la barra lateral */',
    '.chat-my-profile {',
    '  padding: 12px 14px; background: #ffffff; border-top: 1px solid #E2E8F0;',
    '  display: flex; align-items: center; justify-content: space-between;',
    '}',
    '.chat-my-info { display: flex; align-items: center; gap: 10px; min-width: 0; }',
    '.chat-my-name { font-size: 13.5px; font-weight: 700; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.chat-my-sub { font-size: 11px; color: #10B981; font-weight: 600; display: flex; align-items: center; gap: 4px; }',
    '.chat-photo-btn {',
    '  background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 8px; padding: 6px 9px;',
    '  font-size: 12px; font-weight: 700; color: #131E52; cursor: pointer; display: flex; align-items: center; gap: 4px;',
    '}',
    '.chat-photo-btn:hover { background: #E2E8F0; }',
    '',
    '/* Columna derecha: Conversación activa */',
    '.chat-main {',
    '  flex: 1; min-width: 0; display: flex; flex-direction: column; background: #F4F7FC;',
    '}',
    '.chat-header {',
    '  padding: 14px 20px; background: #ffffff; border-bottom: 1px solid #E2E8F0;',
    '  display: flex; align-items: center; justify-content: space-between; z-index: 10;',
    '}',
    '.chat-header-user { display: flex; align-items: center; gap: 12px; min-width: 0; }',
    '.chat-header-name { font-size: 16px; font-weight: 800; color: #131E52; margin: 0; line-height: 1.2; }',
    '.chat-header-status { font-size: 12px; color: #64748B; }',
    '.chat-header-actions { display: flex; align-items: center; gap: 8px; }',
    '.chat-tool-btn {',
    '  background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 8px; width: 36px; height: 36px;',
    '  display: inline-flex; align-items: center; justify-content: center; color: #334155; cursor: pointer;',
    '}',
    '.chat-tool-btn:hover { background: #E2E8F0; color: #131E52; }',
    '.chat-tool-btn.active { background: #E0E7FF; color: #241E63; border-color: #A5B4FC; }',
    '.chat-back-mobile { display: none; background: transparent; border: none; padding: 6px; cursor: pointer; margin-right: 4px; }',
    '',
    '/* Mensajes */',
    '.chat-messages {',
    '  flex: 1; overflow-y: auto; padding: 18px 22px; display: flex; flex-direction: column; gap: 8px;',
    '}',
    '.chat-date-divider {',
    '  align-self: center; margin: 12px 0; background: #E2E8F0; color: #475569;',
    '  font-size: 11.5px; font-weight: 700; padding: 4px 14px; border-radius: 12px;',
    '}',
    '.chat-msg-row {',
    '  display: flex; gap: 8px; max-width: 78%; align-items: flex-end; position: relative;',
    '}',
    '.chat-msg-row.out { align-self: flex-end; flex-direction: row-reverse; }',
    '.chat-msg-row.in { align-self: flex-start; }',
    '.chat-bubble {',
    '  padding: 10px 14px; border-radius: 16px; position: relative; font-size: 14px; line-height: 1.45;',
    '  word-break: break-word;',
    '}',
    '.chat-msg-row.out .chat-bubble {',
    '  background: linear-gradient(135deg, #131E52 0%, #241E63 100%); color: #ffffff;',
    '  border-bottom-right-radius: 4px; box-shadow: 0 4px 14px rgba(19, 30, 82, 0.2);',
    '}',
    '.chat-msg-row.in .chat-bubble {',
    '  background: #ffffff; color: #0F172A; border-bottom-left-radius: 4px;',
    '  border: 1px solid #E2E8F0; box-shadow: 0 2px 8px rgba(0,0,0,0.04);',
    '}',
    '.chat-msg-sender { font-size: 11.5px; font-weight: 800; color: #C89D66; margin-bottom: 3px; }',
    '.chat-msg-row.out .chat-msg-sender { display: none; }',
    '.chat-msg-meta {',
    '  font-size: 10.5px; display: flex; align-items: center; justify-content: flex-end; gap: 4px;',
    '  margin-top: 4px; opacity: 0.85;',
    '}',
    '.chat-msg-row.out .chat-msg-meta { color: #E0E7FF; }',
    '.chat-msg-row.in .chat-msg-meta { color: #64748B; }',
    '',
    '/* Adjuntos en mensajes */',
    '.chat-img-thumb {',
    '  max-width: 280px; max-height: 240px; border-radius: 10px; cursor: pointer; display: block; margin-top: 4px;',
    '  transition: transform .15s ease;',
    '}',
    '.chat-img-thumb:hover { transform: scale(1.02); }',
    '.chat-doc-card {',
    '  display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px;',
    '  margin-top: 4px; text-decoration: none; transition: background .15s ease;',
    '}',
    '.chat-msg-row.out .chat-doc-card { background: rgba(255,255,255,0.15); color: #ffffff; }',
    '.chat-msg-row.out .chat-doc-card:hover { background: rgba(255,255,255,0.25); }',
    '.chat-msg-row.in .chat-doc-card { background: #F1F5F9; color: #1E293B; border: 1px solid #CBD5E1; }',
    '.chat-msg-row.in .chat-doc-card:hover { background: #E2E8F0; }',
    '.chat-doc-name { font-size: 13px; font-weight: 700; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '',
    '/* Opciones de mensaje */',
    '.chat-msg-actions {',
    '  display: none; position: absolute; top: -14px; right: 10px; background: #ffffff;',
    '  border: 1px solid #CBD5E1; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
    '  padding: 2px 4px; gap: 4px; z-index: 5;',
    '}',
    '.chat-msg-row:hover .chat-msg-actions { display: flex; }',
    '.chat-action-btn {',
    '  background: transparent; border: none; font-size: 12px; cursor: pointer; padding: 3px 6px; border-radius: 4px;',
    '}',
    '.chat-action-btn:hover { background: #F1F5F9; }',
    '',
    '/* Barra de entrada de texto */',
    '.chat-input-bar {',
    '  padding: 12px 18px; background: #ffffff; border-top: 1px solid #E2E8F0;',
    '  display: flex; flex-direction: column; gap: 8px;',
    '}',
    '.chat-emoji-tray {',
    '  display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 2px;',
    '}',
    '.chat-emoji-btn {',
    '  background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 2px 5px;',
    '  border-radius: 6px; transition: transform .1s ease;',
    '}',
    '.chat-emoji-btn:hover { transform: scale(1.25); background: #F1F5F9; }',
    '.chat-attach-preview {',
    '  display: none; align-items: center; justify-content: space-between; padding: 6px 12px;',
    '  background: #F1F5F9; border-radius: 8px; border: 1px dashed #94A3B8; font-size: 12.5px; color: #1E293B;',
    '}',
    '.chat-input-row { display: flex; align-items: flex-end; gap: 10px; }',
    '.chat-textarea {',
    '  flex: 1; border: 1px solid #CBD5E1; border-radius: 12px; padding: 10px 14px; font-size: 14px;',
    '  font-family: inherit; line-height: 1.4; resize: none; max-height: 110px; outline: none; background: #F8FAFC;',
    '}',
    '.chat-textarea:focus { border-color: #241E63; background: #ffffff; box-shadow: 0 0 0 3px rgba(36,30,99,0.1); }',
    '.chat-send-btn {',
    '  width: 44px; height: 44px; border-radius: 12px; border: none;',
    '  background: linear-gradient(135deg, #131E52 0%, #241E63 100%); color: #ffffff;',
    '  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;',
    '  box-shadow: 0 4px 12px rgba(19, 30, 82, 0.25); transition: transform .15s ease;',
    '}',
    '.chat-send-btn:hover { transform: scale(1.05); }',
    '.chat-send-btn:disabled { opacity: 0.5; pointer-events: none; }',
    '',
    '/* Modal Lightbox de fotos */',
    '#chatLightbox {',
    '  display: none; position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.85);',
    '  align-items: center; justify-content: center; padding: 20px; flex-direction: column;',
    '}',
    '#chatLightbox.show { display: flex; }',
    '#chatLightboxImg { max-width: 90vw; max-height: 80vh; border-radius: 12px; object-fit: contain; }',
    '.chat-lb-bar { display: flex; gap: 14px; margin-top: 14px; }',
    '.chat-lb-btn {',
    '  background: #ffffff; color: #131E52; border: none; border-radius: 8px; padding: 8px 16px;',
    '  font-size: 13.5px; font-weight: 700; cursor: pointer; text-decoration: none;',
    '}',
    '',
    '/* Adaptaciones móviles */',
    '@media (max-width: 768px) {',
    '  .chat-sidebar { width: 100%; height: 100%; position: absolute; inset: 0; z-index: 20; }',
    '  .chat-sidebar.hidden-mobile { transform: translateX(-100%); }',
    '  .chat-back-mobile { display: block; }',
    '  .chat-msg-row { max-width: 88%; }',
    '}'
  ].join('\n');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ------------------------- AUDIO SINTETIZADO (Web Audio API) ------------------------- */
  var audioCtx = null;
  function playDing() {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var now = audioCtx.currentTime;
      var osc1 = audioCtx.createOscillator();
      var gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);
    } catch (e) {}
  }

  /* ------------------------- CONSTRUCCIÓN DEL DOM ------------------------- */
  var modal = document.createElement('div');
  modal.id = 'sucdenChatModal';
  modal.innerHTML = [
    '<div class="chat-window">',
    '  <!-- Columna izquierda: Lista -->',
    '  <div class="chat-sidebar" id="chatSidebar">',
    '    <div class="chat-sidebar-header">',
    '      <div class="chat-brand-row">',
    '        <div class="chat-brand-title">',
    '          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131E52" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    '          Mensajes Sucden',
    '        </div>',
    '        <span class="chat-enc-badge" title="Mensajes cifrados en la base de datos">',
    '          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    '          Cifrado',
    '        </span>',
    '      </div>',
    '      <div class="chat-search-wrap">',
    '        <svg class="chat-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    '        <input type="text" class="chat-search-input" id="chatSearchInput" placeholder="Buscar colaborador o mensaje…">',
    '      </div>',
    '    </div>',
    '    <div class="chat-conv-list" id="chatConvList">',
    '      <!-- Canal de equipo -->',
    '      <div class="chat-conv-item active" data-conv="grupo" id="convItemTeam">',
    '        <div class="chat-avatar-box">',
    '          <div class="chat-avatar-team chat-avatar-initials">☕</div>',
    '        </div>',
    '        <div class="chat-conv-info">',
    '          <div class="chat-conv-top">',
    '            <span class="chat-conv-name">Equipo Sucden</span>',
    '            <span class="chat-conv-time" id="chatTimeTeam"></span>',
    '          </div>',
    '          <div class="chat-conv-preview" id="chatPrevTeam">Canal general del equipo</div>',
    '        </div>',
    '        <span class="chat-badge-unread" id="chatBadgeTeam" style="display:none;">0</span>',
    '      </div>',
    '      <div class="chat-section-label">Mensajes directos</div>',
    '      <div id="chatDirectList"></div>',
    '    </div>',
    '    <div class="chat-my-profile">',
    '      <div class="chat-my-info">',
    '        <div class="chat-avatar-box" style="width:36px;height:36px;">',
    '          <div class="chat-avatar-initials" id="chatMyAvatar" style="width:36px;height:36px;font-size:14px;background:#131E52;">A</div>',
    '        </div>',
    '        <div style="min-width:0;">',
    '          <div class="chat-my-name" id="chatMyName">Usuario</div>',
    '          <div class="chat-my-sub">● En línea</div>',
    '        </div>',
    '      </div>',
    '      <button type="button" class="chat-photo-btn" id="chatChangePhotoBtn" title="Cambiar foto de perfil">',
    '        📷 Foto',
    '      </button>',
    '      <input type="file" id="chatPhotoFileInput" accept="image/*" style="display:none;">',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Columna derecha: Mensajes -->',
    '  <div class="chat-main">',
    '    <div class="chat-header">',
    '      <div class="chat-header-user">',
    '        <button type="button" class="chat-back-mobile" id="chatBackMobile" title="Volver a la lista">',
    '          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#131E52" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>',
    '        </button>',
    '        <div class="chat-avatar-box" style="width:40px;height:40px;" id="chatHeaderAvatarBox">',
    '          <div class="chat-avatar-team chat-avatar-initials" id="chatHeaderAvatar" style="width:40px;height:40px;font-size:18px;">☕</div>',
    '        </div>',
    '        <div>',
    '          <h3 class="chat-header-name" id="chatHeaderTitle">Equipo Sucden</h3>',
    '          <div class="chat-header-status" id="chatHeaderSub">Canal de comunicación general</div>',
    '        </div>',
    '      </div>',
    '      <div class="chat-header-actions">',
    '        <button type="button" class="chat-tool-btn" id="chatSoundBtn" title="Silenciar / Activar sonido">🔔</button>',
    '        <button type="button" class="chat-tool-btn" id="chatCloseBtn" title="Cerrar chat">✕</button>',
    '      </div>',
    '    </div>',
    '',
    '    <div class="chat-messages" id="chatMessagesBox"></div>',
    '',
    '    <div class="chat-input-bar">',
    '      <div class="chat-emoji-tray">',
    '        <button type="button" class="chat-emoji-btn" data-emo="☕">☕</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="👍">👍</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="😊">😊</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="📦">📦</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="🚚">🚚</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="✅">✅</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="📋">📋</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="🔥">🔥</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="👏">👏</button>',
    '        <button type="button" class="chat-emoji-btn" data-emo="🤝">🤝</button>',
    '      </div>',
    '      <div class="chat-attach-preview" id="chatAttachPreview">',
    '        <span id="chatAttachName">archivo.pdf</span>',
    '        <button type="button" id="chatAttachClear" style="background:none;border:none;cursor:pointer;font-weight:700;color:#DC2626;">✕</button>',
    '      </div>',
    '      <div class="chat-input-row">',
    '        <button type="button" class="chat-tool-btn" id="chatAttachBtn" title="Adjuntar imagen o documento">📎</button>',
    '        <input type="file" id="chatFileInput" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" style="display:none;">',
    '        <textarea class="chat-textarea" id="chatTextarea" rows="1" placeholder="Escribe un mensaje privado… (Enter para enviar)"></textarea>',
    '        <button type="button" class="chat-send-btn" id="chatSendBtn" title="Enviar mensaje">',
    '          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
    '        </button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(modal);

  /* Modal Lightbox */
  var lb = document.createElement('div');
  lb.id = 'chatLightbox';
  lb.innerHTML = [
    '<img id="chatLightboxImg" src="" alt="Foto adjunta">',
    '<div class="chat-lb-bar">',
    '  <a class="chat-lb-btn" id="chatLbDownload" href="#" target="_blank" download>Descargar original</a>',
    '  <button type="button" class="chat-lb-btn" id="chatLbClose">Cerrar</button>',
    '</div>'
  ].join('\n');
  document.body.appendChild(lb);
  document.getElementById('chatLbClose').onclick = function () { lb.classList.remove('show'); };
  lb.onclick = function (e) { if (e.target === lb) lb.classList.remove('show'); };

  /* ------------------------- HELPERS Y AVATARES ------------------------- */
  var COLORS = ['#1E3A8A', '#0D9488', '#B45309', '#6D28D9', '#BE185D', '#047857', '#C2410C', '#4338CA'];
  function getColor(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  function getInitials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (!parts.length || !parts[0]) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function renderAvatarHtml(u) {
    if (u.foto) {
      return '<img class="chat-avatar-img" src="https://drive.google.com/thumbnail?id=' + encodeURIComponent(u.foto) + '&sz=w200" alt="' + esc(u.nombre) + '">';
    }
    var bg = getColor(u.cedula || u.nombre);
    return '<div class="chat-avatar-initials" style="background:' + bg + ';">' + getInitials(u.nombre) + '</div>';
  }

  function esc(t) {
    return String(t || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatTime(isoOrTs) {
    if (!isoOrTs) return '';
    var d = new Date(isoOrTs);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (!h) h = 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function formatDateHeader(isoOrTs) {
    var d = new Date(isoOrTs);
    var today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    var yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ------------------------- APERTURA Y NAVEGACIÓN ------------------------- */
  function openChat(conv) {
    modal.classList.add('show');
    isChatOpen = true;
    if (conv) selectConv(conv);
    else selectConv(activeConv);
    syncChat(true);
    markAsRead(activeConv);
    updateBadgesUI();
  }

  function closeChat() {
    modal.classList.remove('show');
    isChatOpen = false;
    updateBadgesUI();
  }

  function selectConv(convId) {
    activeConv = convId;
    markAsRead(convId);

    // Ajustar UI móvil
    var sidebar = document.getElementById('chatSidebar');
    if (window.innerWidth <= 768) {
      sidebar.classList.add('hidden-mobile');
    }

    // Actualizar clase activa en lista
    var items = document.querySelectorAll('.chat-conv-item');
    items.forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-conv') === convId);
    });

    // Actualizar cabecera derecha
    var headTitle = document.getElementById('chatHeaderTitle');
    var headSub = document.getElementById('chatHeaderSub');
    var headAvBox = document.getElementById('chatHeaderAvatarBox');

    if (convId === 'grupo') {
      headTitle.textContent = 'Equipo Sucden';
      headSub.textContent = 'Canal general de anuncios y despachos';
      headAvBox.innerHTML = '<div class="chat-avatar-team chat-avatar-initials" style="width:40px;height:40px;font-size:18px;">☕</div>';
    } else {
      var target = usersList.find(function (u) { return u.cedula === convId; });
      if (target) {
        headTitle.textContent = target.nombre;
        headSub.textContent = (target.rol === 'admin' ? 'Administrador' : 'Colaborador') + ' · Cédula ' + target.cedula;
        headAvBox.innerHTML = renderAvatarHtml(target);
      }
    }

    renderMessages();
    updateBadgesUI();
  }

  document.getElementById('chatCloseBtn').onclick = closeChat;
  document.getElementById('chatBackMobile').onclick = function () {
    document.getElementById('chatSidebar').classList.remove('hidden-mobile');
  };

  /* ------------------------- USUARIOS Y CONTACTOS ------------------------- */
  async function fetchUsers() {
    if (!window.currentUser) return;
    try {
      var res = await fetch(window.WEB_APP_URL + '?action=chatUsers&cedula=' + encodeURIComponent(window.currentUser.cedula));
      var data = await res.json();
      if (data.ok) {
        usersList = data.users || [];
        myProfile = data.me || window.currentUser;
        renderUsersList();
        renderMyProfile();
      }
    } catch (e) {}
  }

  function renderMyProfile() {
    if (!myProfile) return;
    var nameEl = document.getElementById('chatMyName');
    var avEl = document.getElementById('chatMyAvatar');
    if (nameEl) nameEl.textContent = myProfile.nombre || 'Usuario';
    if (avEl && myProfile.foto) {
      avEl.outerHTML = '<img class="chat-avatar-img" id="chatMyAvatar" src="https://drive.google.com/thumbnail?id=' + encodeURIComponent(myProfile.foto) + '&sz=w200" style="width:36px;height:36px;" alt="Mi foto">';
    }
  }

  function renderUsersList() {
    var cont = document.getElementById('chatDirectList');
    if (!cont) return;
    cont.innerHTML = '';
    var filter = (document.getElementById('chatSearchInput').value || '').toLowerCase();

    usersList.forEach(function (u) {
      if (filter && u.nombre.toLowerCase().indexOf(filter) === -1 && u.cedula.indexOf(filter) === -1) return;
      var item = document.createElement('div');
      item.className = 'chat-conv-item' + (activeConv === u.cedula ? ' active' : '');
      item.setAttribute('data-conv', u.cedula);

      var unread = unreadCounts[u.cedula] || 0;
      var lastMsg = getLastMessageFor(u.cedula);

      item.innerHTML = [
        '<div class="chat-avatar-box">',
        '  ' + renderAvatarHtml(u),
        '  <span class="chat-online-dot"></span>',
        '</div>',
        '<div class="chat-conv-info">',
        '  <div class="chat-conv-top">',
        '    <span class="chat-conv-name">' + esc(u.nombre) + '</span>',
        '    <span class="chat-conv-time">' + (lastMsg ? formatTime(lastMsg.ts) : '') + '</span>',
        '  </div>',
        '  <div class="chat-conv-preview">' + (lastMsg ? esc(lastMsg.texto || (lastMsg.adjId ? '📎 Archivo adjunto' : '')) : (u.rol === 'admin' ? 'Administrador' : 'Colaborador')) + '</div>',
        '</div>',
        '<span class="chat-badge-unread" style="' + (unread > 0 ? '' : 'display:none;') + '">' + (unread > 99 ? '99+' : unread) + '</span>'
      ].join('\n');

      item.onclick = function () { selectConv(u.cedula); };
      cont.appendChild(item);
    });

    // Actualizar también último mensaje del canal general
    var teamLast = getLastMessageFor('grupo');
    if (teamLast) {
      var pt = document.getElementById('chatPrevTeam');
      var tt = document.getElementById('chatTimeTeam');
      if (pt) pt.textContent = teamLast.nombre + ': ' + (teamLast.texto || '📎 Archivo');
      if (tt) tt.textContent = formatTime(teamLast.ts);
    }
  }

  document.getElementById('convItemTeam').onclick = function () { selectConv('grupo'); };
  document.getElementById('chatSearchInput').oninput = renderUsersList;

  /* ------------------------- MENSAJES Y RENDER ------------------------- */
  function getLastMessageFor(convId) {
    for (var i = messages.length - 1; i >= 0; i--) {
      var m = messages[i];
      if (convId === 'grupo' && m.tipo === 'grupo') return m;
      if (convId !== 'grupo' && m.tipo === 'directo' && (m.de === convId || m.para === convId)) return m;
    }
    return null;
  }

  function markAsRead(convId) {
    unreadCounts[convId] = 0;
    try {
      localStorage.setItem('sucden_chat_seen_' + (window.currentUser ? window.currentUser.cedula : '') + '_' + convId, String(Date.now()));
    } catch (e) {}
  }

  function renderMessages() {
    var box = document.getElementById('chatMessagesBox');
    if (!box) return;
    box.innerHTML = '';

    var myCed = window.currentUser ? String(window.currentUser.cedula) : '';
    var filtered = messages.filter(function (m) {
      if (activeConv === 'grupo') return m.tipo === 'grupo';
      return m.tipo === 'directo' && (m.de === activeConv || m.para === activeConv);
    });

    if (!filtered.length) {
      box.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#94A3B8;font-size:13.5px;">' +
        '🔒 Esta conversación está cifrada en la base de datos.<br>Escribe un mensaje para comenzar la comunicación.' +
        '</div>';
      return;
    }

    var lastDateStr = '';
    filtered.forEach(function (m) {
      var dateStr = formatDateHeader(m.ts);
      if (dateStr !== lastDateStr) {
        var div = document.createElement('div');
        div.className = 'chat-date-divider';
        div.textContent = dateStr;
        box.appendChild(div);
        lastDateStr = dateStr;
      }

      var isMe = String(m.de) === myCed;
      var row = document.createElement('div');
      row.className = 'chat-msg-row ' + (isMe ? 'out' : 'in');
      row.setAttribute('data-id', m.id);

      var bubbleHtml = '';
      if (!isMe && activeConv === 'grupo') {
        bubbleHtml += '<div class="chat-msg-sender">' + esc(m.nombre) + '</div>';
      }

      // Adjunto (foto o archivo)
      if (m.adjId) {
        if (/^image\//.test(m.adjTipo || '')) {
          var viewUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(m.adjId) + '&sz=w1000';
          var dlUrl = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(m.adjId);
          bubbleHtml += '<img class="chat-img-thumb" src="' + viewUrl + '" data-full="' + viewUrl + '" data-dl="' + dlUrl + '" alt="' + esc(m.adjNombre) + '">';
        } else {
          var dlDocUrl = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(m.adjId);
          bubbleHtml += '<a class="chat-doc-card" href="' + dlDocUrl + '" target="_blank">' +
            '<span>📄</span><span class="chat-doc-name">' + esc(m.adjNombre || 'Archivo') + '</span>' +
            '<span style="font-size:11px;opacity:0.8;">⬇️</span>' +
          '</a>';
        }
      }

      if (m.texto) {
        bubbleHtml += '<div class="chat-msg-text">' + esc(m.texto) + '</div>';
      }

      bubbleHtml += '<div class="chat-msg-meta">' +
        '<span>' + formatTime(m.ts) + '</span>' +
        (isMe ? '<span style="color:#A7F3D0;font-weight:700;">✓✓</span>' : '') +
      '</div>';

      // Acciones rápidas (copiar, eliminar)
      var actionsHtml = '<div class="chat-msg-actions">' +
        '<button type="button" class="chat-action-btn btn-copy" title="Copiar texto">📋</button>' +
        (isMe || (window.currentUser && window.currentUser.rol === 'admin')
          ? '<button type="button" class="chat-action-btn btn-del" title="Eliminar mensaje">🗑️</button>'
          : '') +
      '</div>';

      row.innerHTML = actionsHtml + '<div class="chat-bubble">' + bubbleHtml + '</div>';

      // Eventos de foto
      var imgThumb = row.querySelector('.chat-img-thumb');
      if (imgThumb) {
        imgThumb.onclick = function () {
          document.getElementById('chatLightboxImg').src = this.getAttribute('data-full');
          document.getElementById('chatLbDownload').href = this.getAttribute('data-dl');
          lb.classList.add('show');
        };
      }

      // Evento copiar
      var copyBtn = row.querySelector('.btn-copy');
      if (copyBtn) {
        copyBtn.onclick = function () {
          navigator.clipboard.writeText(m.texto || '');
          copyBtn.textContent = '✅';
          setTimeout(function () { copyBtn.textContent = '📋'; }, 1000);
        };
      }

      // Evento eliminar
      var delBtn = row.querySelector('.btn-del');
      if (delBtn) {
        delBtn.onclick = function () {
          if (confirm('¿Eliminar este mensaje?')) {
            deleteMessage(m.id);
          }
        };
      }

      box.appendChild(row);
    });

    box.scrollTop = box.scrollHeight;
  }

  /* ------------------------- SINCRONIZACIÓN Y POLLING ------------------------- */
  async function syncChat(force) {
    if (!window.currentUser || !window.WEB_APP_URL) return;
    try {
      var url = window.WEB_APP_URL + '?action=chatList&cedula=' + encodeURIComponent(window.currentUser.cedula) +
        '&since=' + lastTimestamp + (force ? '&fresh=1' : '');
      var res = await fetch(url);
      var data = await res.json();
      if (!data.ok) return;

      var newMsgs = data.messages || [];
      if (newMsgs.length) {
        var playSound = false;
        var myCed = String(window.currentUser.cedula);

        newMsgs.forEach(function (nm) {
          if (!messages.some(function (x) { return x.id === nm.id; })) {
            messages.push(nm);
            if (Number(nm.ts) > lastTimestamp) lastTimestamp = Number(nm.ts);

            // Contador de no leídos
            if (String(nm.de) !== myCed) {
              var targetConv = nm.tipo === 'grupo' ? 'grupo' : nm.de;
              if (!isChatOpen || activeConv !== targetConv) {
                unreadCounts[targetConv] = (unreadCounts[targetConv] || 0) + 1;
                playSound = true;
              }
            }
          }
        });

        if (playSound) playDing();
        renderMessages();
        renderUsersList();
        updateBadgesUI();
      }
    } catch (e) {}
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      syncChat(false);
    }, isChatOpen ? 3500 : 12000);
  }

  /* ------------------------- ENVÍO DE MENSAJES ------------------------- */
  async function sendMessage() {
    if (isSending || !window.currentUser) return;
    var textarea = document.getElementById('chatTextarea');
    var texto = textarea.value.trim();
    if (!texto && !pendingAttachment) return;

    isSending = true;
    var sendBtn = document.getElementById('chatSendBtn');
    sendBtn.disabled = true;

    var payload = {
      action: 'chatSend',
      cedula: window.currentUser.cedula,
      tipo: activeConv === 'grupo' ? 'grupo' : 'directo',
      para: activeConv === 'grupo' ? '' : activeConv,
      texto: texto,
      cid: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
    };

    if (pendingAttachment) {
      payload.file = {
        filename: pendingAttachment.filename,
        mimeType: pendingAttachment.mimeType,
        base64: pendingAttachment.base64
      };
    }

    try {
      var res = await fetch(window.WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo enviar el mensaje.');

      textarea.value = '';
      textarea.style.height = 'auto';
      clearAttachment();
      if (data.message) {
        messages.push(data.message);
        if (Number(data.message.ts) > lastTimestamp) lastTimestamp = Number(data.message.ts);
        renderMessages();
        renderUsersList();
      }
    } catch (err) {
      alert('Error al enviar: ' + err.message);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      textarea.focus();
    }
  }

  async function deleteMessage(msgId) {
    if (!window.currentUser) return;
    try {
      var res = await fetch(window.WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'chatDelete', id: msgId, cedula: window.currentUser.cedula })
      });
      var data = await res.json();
      if (data.ok) {
        var found = messages.find(function (m) { return m.id === String(msgId); });
        if (found) {
          found.texto = '🚫 Este mensaje fue eliminado';
          found.adjId = '';
          renderMessages();
        }
      }
    } catch (e) {
      alert('No se pudo eliminar el mensaje.');
    }
  }

  /* ------------------------- MANEJO DE ADJUNTOS ------------------------- */
  var fileInput = document.getElementById('chatFileInput');
  document.getElementById('chatAttachBtn').onclick = function () { fileInput.click(); };

  fileInput.onchange = function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('El archivo no debe superar los 8 MB.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      var b64 = ev.target.result.split(',')[1];
      pendingAttachment = {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        base64: b64
      };
      var prev = document.getElementById('chatAttachPreview');
      var nameEl = document.getElementById('chatAttachName');
      nameEl.textContent = '📎 ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
      prev.style.display = 'flex';
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  };

  function clearAttachment() {
    pendingAttachment = null;
    document.getElementById('chatAttachPreview').style.display = 'none';
  }
  document.getElementById('chatAttachClear').onclick = clearAttachment;

  /* Emojis */
  var emoBtns = document.querySelectorAll('.chat-emoji-btn');
  emoBtns.forEach(function (btn) {
    btn.onclick = function () {
      var emo = btn.getAttribute('data-emo');
      var ta = document.getElementById('chatTextarea');
      ta.value += emo;
      ta.focus();
    };
  });

  /* Auto-grow y Enter para enviar */
  var textarea = document.getElementById('chatTextarea');
  textarea.oninput = function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 110) + 'px';
  };
  textarea.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  document.getElementById('chatSendBtn').onclick = sendMessage;

  /* ------------------------- CAMBIO DE FOTO DE PERFIL ------------------------- */
  var photoInput = document.getElementById('chatPhotoFileInput');
  document.getElementById('chatChangePhotoBtn').onclick = function () { photoInput.click(); };

  photoInput.onchange = function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        // Reducir y recortar a cuadrado 256x256 en Canvas
        var canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        var ctx = canvas.getContext('2d');
        var minSide = Math.min(img.width, img.height);
        var sx = (img.width - minSide) / 2;
        var sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 256, 256);
        var b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        uploadProfilePhoto(b64);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    photoInput.value = '';
  };

  async function uploadProfilePhoto(b64) {
    if (!window.currentUser) return;
    try {
      var res = await fetch(window.WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'chatSetPhoto',
          cedula: window.currentUser.cedula,
          file: { mimeType: 'image/jpeg', base64: b64 }
        })
      });
      var data = await res.json();
      if (data.ok && data.result && data.result.foto) {
        if (myProfile) myProfile.foto = data.result.foto;
        renderMyProfile();
        fetchUsers();
        // Actualizar avatar en barra lateral de la app si existe
        var sideAv = document.getElementById('cscAvatar');
        if (sideAv) {
          sideAv.innerHTML = '<img src="https://drive.google.com/thumbnail?id=' + encodeURIComponent(data.result.foto) + '&sz=w200" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
        }
      }
    } catch (e) {
      alert('No se pudo subir la foto de perfil.');
    }
  }

  /* Sonido toggle */
  var sBtn = document.getElementById('chatSoundBtn');
  sBtn.onclick = function () {
    soundEnabled = !soundEnabled;
    sBtn.textContent = soundEnabled ? '🔔' : '🔕';
    sBtn.classList.toggle('active', !soundEnabled);
  };

  /* ------------------------- INTEGRACIÓN CON SIDEBAR Y APP ------------------------- */
  function updateBadgesUI() {
    var totalUnread = 0;
    for (var k in unreadCounts) totalUnread += (unreadCounts[k] || 0);

    // Badge en botón del menú sidebar
    var navBadge = document.getElementById('cscCountChat');
    if (navBadge) {
      if (totalUnread > 0) {
        navBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        navBadge.style.display = 'inline-flex';
      } else {
        navBadge.style.display = 'none';
      }
    }

    // Badge en canal de equipo
    var tb = document.getElementById('chatBadgeTeam');
    if (tb) {
      var count = unreadCounts['grupo'] || 0;
      tb.textContent = count > 99 ? '99+' : count;
      tb.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    // Notificación en la campana de app.js
    if (typeof window.renderNotifBadge === 'function') {
      window.renderNotifBadge();
    }
  }

  function injectSidebarButton() {
    var side = document.querySelector('.csc-side');
    if (!side || document.getElementById('navChat')) return;

    var navHome = document.querySelector('.csc-item');
    var navChat = document.createElement('button');
    navChat.type = 'button';
    navChat.className = 'csc-item';
    navChat.id = 'navChat';
    navChat.innerHTML = [
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
      '</svg>',
      '<span>Chat</span>',
      '<i class="csc-count" id="cscCountChat" style="display:none;">0</i>'
    ].join('');

    navChat.onclick = function () {
      openChat('grupo');
    };

    if (navHome && navHome.parentNode === side) {
      side.insertBefore(navChat, navHome.nextSibling);
    } else {
      side.appendChild(navChat);
    }
  }

  /* ------------------------- API GLOBAL (window.cscChat) ------------------------- */
  window.cscChat = {
    open: function (conv) {
      openChat(conv);
    },
    close: function () {
      closeChat();
    },
    unreadItems: function () {
      var items = [];
      if (unreadCounts['grupo']) {
        items.push({
          conv: 'grupo',
          name: 'Equipo Sucden',
          preview: 'Canal general',
          count: unreadCounts['grupo']
        });
      }
      usersList.forEach(function (u) {
        if (unreadCounts[u.cedula]) {
          items.push({
            conv: u.cedula,
            name: u.nombre,
            preview: 'Mensaje directo',
            count: unreadCounts[u.cedula]
          });
        }
      });
      return items;
    },
    notify: function (title, message, onClick) {
      playDing();
    },
    sync: function () {
      syncChat(true);
    }
  };

  // Inicialización al arrancar sesión
  function checkInit() {
    if (window.currentUser) {
      injectSidebarButton();
      fetchUsers();
      syncChat(true);
      startPolling();
    }
  }

  // Comprobar periódicamente hasta que la sesión esté lista
  var initCheckInterval = setInterval(function () {
    if (window.currentUser) {
      clearInterval(initCheckInterval);
      checkInit();
    }
  }, 500);

  // Hook directo si showApp ya corrió
  if (window.currentUser) checkInit();

})();
