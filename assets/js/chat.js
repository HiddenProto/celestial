/* ============================================================
   CELESTIAL CHAT v1
   Peer-to-peer chat via PeerJS hub election.
   Only available to verified users (cst-approved) and admins.
   Settings stored under cst-appearance.chat in localStorage.
   ============================================================ */
(function () {
  'use strict';

  const HUB_ID     = 'celestial-chat-hub-v1';
  const APPEAR_KEY = 'cst-appearance';
  const MAX_CHARS  = 400;
  const COOLDOWN   = 1000;

  // ── helpers ───────────────────────────────────────────────────
  function getAppear()  { try { return JSON.parse(localStorage.getItem(APPEAR_KEY) || '{}'); } catch { return {}; } }
  function setAppear(o) { localStorage.setItem(APPEAR_KEY, JSON.stringify(o)); }
  function isChatOn()   { return getAppear().chat === true; }
  function setChatOn(v) { const a = getAppear(); a.chat = v; setAppear(a); }

  function amAdmin()   { return localStorage.getItem('cst-admin') === '1'; }
  function getMyName() {
    if (amAdmin()) {
      try { return JSON.parse(localStorage.getItem('cst-approved'))?.name || 'Admin'; } catch { return 'Admin'; }
    }
    try { return JSON.parse(localStorage.getItem('cst-approved'))?.name || null; } catch { return null; }
  }
  function canChat() { return !!(amAdmin() || getMyName()); }

  // ── PeerJS loader ─────────────────────────────────────────────
  function loadPeerJS(cb) {
    if (window.Peer) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    s.onload = cb; s.onerror = () => {}; document.head.appendChild(s);
  }

  // ── state ─────────────────────────────────────────────────────
  let chatPeer   = null;
  let hubConn    = null;   // client → hub connection
  let hubPeer    = null;   // when this peer IS the hub
  let isHubMode  = false;
  let hubClients = {};     // hub only: cid → { conn, name, isAdmin }
  let onlineList = [];     // all peers (name + isAdmin)
  let lastSent   = 0;
  let unread     = 0;
  let chatOpen   = false;

  // ── notification ──────────────────────────────────────────────
  function maybeShowNotif() {
    if (!canChat() || isChatOn()) return;
    setTimeout(() => {
      if (isChatOn()) return;
      window.notifyOption?.('✦ Test Chat App?',
        'Chat with other verified users in real time. Beta feature.',
        [
          { label: 'Enable',       info: 'Turn on real-time chat with other verified users.', onClick: enableChat },
          { label: 'Maybe later',  info: 'Dismiss — the option stays in Appearance settings.', className: 'opt-skip', onClick: () => {} },
        ]
      );
    }, 3500);
  }

  function enableChat() {
    setChatOn(true);
    const tog = document.getElementById('chatTog');
    if (tog) tog.checked = true;
    initChat();
    window.notify?.('To disable: ⋮ → Appearance → toggle ✦ Chat off', 'info', 7000);
  }

  // ── hub election ──────────────────────────────────────────────
  function initChat() {
    if (chatPeer) return;
    loadPeerJS(() => {
      chatPeer = new Peer(undefined, { debug: 0 });
      chatPeer.on('open', () => connectToHub());
      chatPeer.on('error', () => {});
    });
  }

  function connectToHub() {
    if (!chatPeer) return;
    const conn = chatPeer.connect(HUB_ID, { reliable: true });
    let opened = false;
    const timeout = setTimeout(() => { if (!opened) becomeHub(); }, 4000);
    conn.on('open', () => {
      clearTimeout(timeout);
      opened   = true;
      hubConn  = conn;
      isHubMode = false;
      conn.send({ type: 'join', name: getMyName(), isAdmin: amAdmin() });
    });
    conn.on('data', onHubMsg);
    conn.on('close', () => {
      hubConn = null;
      setTimeout(connectToHub, 2000);
    });
    conn.on('error', () => {
      clearTimeout(timeout);
      if (!opened) becomeHub();
    });
  }

  function becomeHub() {
    isHubMode = true;
    hubPeer = new Peer(HUB_ID, { debug: 0 });
    hubPeer.on('open', () => {
      updateOnline([{ name: getMyName(), isAdmin: amAdmin() }]);
      renderWidget();
    });
    hubPeer.on('connection', conn => {
      const cid = conn.peer;
      hubClients[cid] = { conn, name: null, isAdmin: false };
      conn.on('open', () => {});
      conn.on('data', d => onClientMsg(cid, d));
      conn.on('close', () => { delete hubClients[cid]; broadcastOnline(); });
      conn.on('error', () => { delete hubClients[cid]; broadcastOnline(); });
    });
    hubPeer.on('error', err => {
      if (err.type === 'unavailable-id') { isHubMode = false; connectToHub(); }
    });
  }

  // ── hub-side: relay messages + manage online list ─────────────
  function onClientMsg(cid, d) {
    if (!d || typeof d !== 'object') return;
    const c = hubClients[cid];
    if (!c) return;
    if (d.type === 'join') {
      c.name    = d.name;
      c.isAdmin = !!d.isAdmin;
      broadcastOnline();
    }
    if (d.type === 'msg') {
      const msg = { type: 'msg', name: d.name, text: (d.text || '').slice(0, MAX_CHARS), isAdmin: !!d.isAdmin, ts: Date.now() };
      relayMsg(cid, msg);
      appendMsg(msg);
    }
  }

  function relayMsg(fromCid, msg) {
    Object.keys(hubClients).forEach(id => {
      if (id !== fromCid) try { hubClients[id].conn.send(msg); } catch {}
    });
  }

  function broadcastOnline() {
    const users = [
      { name: getMyName(), isAdmin: amAdmin() },
      ...Object.values(hubClients).filter(c => c.name).map(c => ({ name: c.name, isAdmin: c.isAdmin })),
    ];
    const msg = { type: 'online', users };
    Object.keys(hubClients).forEach(id => { try { hubClients[id].conn.send(msg); } catch {} });
    updateOnline(users);
  }

  // ── client-side: receive from hub ─────────────────────────────
  function onHubMsg(d) {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'online') updateOnline(d.users || []);
    if (d.type === 'msg')    { appendMsg(d); if (!chatOpen) { unread++; updateBubble(); } }
  }

  // ── send ──────────────────────────────────────────────────────
  function sendMsg(text) {
    text = text.trim().slice(0, MAX_CHARS);
    if (!text) return;
    const now = Date.now();
    if (now - lastSent < COOLDOWN) {
      const left = Math.ceil((COOLDOWN - (now - lastSent)) / 1000);
      flashCooldown(`slow down — ${left}s`);
      return;
    }
    lastSent = now;
    const msg = { type: 'msg', name: getMyName(), text, isAdmin: amAdmin(), ts: now };
    if (isHubMode) { relayMsg(null, msg); appendMsg(msg); }
    else if (hubConn && hubConn.open) { hubConn.send(msg); appendMsg(msg); }
  }

  // ── online list ───────────────────────────────────────────────
  function updateOnline(users) {
    onlineList = users.filter(u => u.name);
    const cnt = document.getElementById('cst-chat-online-cnt');
    if (cnt) cnt.textContent = onlineList.length;
    const tip = document.getElementById('cst-chat-online-tip');
    if (tip) {
      tip.innerHTML = onlineList.map(u =>
        `<div style="padding:3px 0;font-size:.75rem;${u.isAdmin ? adminNameStyle(true) : 'color:#aaa;'}">${esc(u.name)}</div>`
      ).join('') || '<div style="color:#444;font-size:.74rem;">just you</div>';
    }
  }

  // ── chat UI ───────────────────────────────────────────────────
  const ADMIN_GRADIENT = 'background:linear-gradient(90deg,#c9a84c,#ffe082,#c9a84c);' +
    '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;' +
    'font-weight:700;background-size:200%;animation:cst-admname 2.5s linear infinite;';

  function adminNameStyle(inline) {
    return inline
      ? 'background:linear-gradient(90deg,#c9a84c,#ffe082,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;'
      : ADMIN_GRADIENT;
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  let widgetEl = null;

  function renderWidget() {
    if (widgetEl) return;
    widgetEl = document.createElement('div');
    widgetEl.id = 'cst-chat-widget';
    widgetEl.innerHTML = `
<style>
@keyframes cst-admname{0%{background-position:0%}100%{background-position:200%}}
#cst-chat-widget *{box-sizing:border-box;}
#cst-chat-bubble{position:fixed;bottom:16px;left:16px;z-index:2147483642;
  background:#0d0d0d;border:1px solid #222;border-radius:50px;padding:7px 14px;
  color:#888;font-family:system-ui,sans-serif;font-size:.75rem;cursor:pointer;
  display:flex;align-items:center;gap:6px;transition:background .15s;user-select:none;}
#cst-chat-bubble:hover{background:#181818;}
#cst-chat-unread{background:#cc2222;color:#fff;border-radius:50%;font-size:.65rem;
  width:16px;height:16px;display:none;align-items:center;justify-content:center;}
#cst-chat-panel{position:fixed;bottom:54px;left:16px;z-index:2147483642;
  width:300px;background:#080808;border:1px solid #1e1e1e;border-radius:12px;
  display:none;flex-direction:column;font-family:system-ui,sans-serif;
  box-shadow:0 8px 32px rgba(0,0,0,.7);overflow:hidden;max-height:420px;}
#cst-chat-head{padding:10px 14px;background:#060606;border-bottom:1px solid #141414;
  display:flex;align-items:center;gap:8px;flex-shrink:0;}
#cst-chat-head-title{font-size:.83rem;color:#888;flex:1;}
#cst-online-wrap{position:relative;display:inline-flex;align-items:center;gap:4px;
  font-size:.72rem;color:#444;cursor:default;}
#cst-chat-online-tip{position:absolute;bottom:calc(100%+6px);right:0;
  background:#111;border:1px solid #1e1e1e;border-radius:7px;padding:8px 12px;
  min-width:120px;z-index:2;opacity:0;pointer-events:none;transition:opacity .15s;white-space:nowrap;}
#cst-online-wrap:hover #cst-chat-online-tip{opacity:1;}
#cst-chat-msgs{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px;
  scrollbar-width:thin;scrollbar-color:#222 transparent;}
#cst-chat-msgs::-webkit-scrollbar{width:4px;}
#cst-chat-msgs::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
.cst-msg{display:flex;flex-direction:column;align-items:flex-start;font-size:.78rem;line-height:1.45;}
.cst-msg-me{align-items:flex-end;}
.cst-msg-name{font-size:.7rem;margin-bottom:2px;color:#555;}
.cst-msg-body{background:#0d0d0d;border:1px solid #191919;border-radius:6px;
  padding:5px 9px;color:#ccc;max-width:85%;word-break:break-word;}
.cst-msg-me .cst-msg-body{background:#111;border-color:#252525;}
.cst-msg-sys{color:#333;font-size:.7rem;text-align:center;align-self:center;}
#cst-chat-inp-row{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #141414;flex-shrink:0;}
#cst-chat-inp{flex:1;background:#0d0d0d;border:1px solid #1e1e1e;border-radius:6px;
  color:#ccc;padding:7px 10px;font-size:.78rem;outline:none;font-family:system-ui,sans-serif;resize:none;height:34px;}
#cst-chat-inp:focus{border-color:#333;}
#cst-chat-send{padding:7px 12px;background:#111;border:1px solid #222;border-radius:6px;
  color:#888;font-size:.75rem;cursor:pointer;flex-shrink:0;}
#cst-chat-send:hover{background:#181818;}
#cst-chat-chars{font-size:.65rem;color:#333;padding:0 10px 6px;text-align:right;flex-shrink:0;}
#cst-chat-cool{font-size:.7rem;color:#cc4444;padding:2px 12px 6px;display:none;flex-shrink:0;}
</style>
<div id="cst-chat-bubble">
  <span>✦</span>
  <span id="cst-chat-online-cnt">0</span>
  <span style="color:#333;font-size:.7rem;">online</span>
  <span id="cst-chat-unread"></span>
</div>
<div id="cst-chat-panel">
  <div id="cst-chat-head">
    <span id="cst-chat-head-title">celestial chat</span>
    <div id="cst-online-wrap">
      <span id="cst-chat-online-cnt2">0</span>
      <span>online</span>
      <span style="font-size:.68rem;cursor:help;">ⓘ</span>
      <div id="cst-chat-online-tip"></div>
    </div>
    <button onclick="document.getElementById('cst-chat-panel').style.display='none';window._cstChatOpen=false;"
      style="background:none;border:none;color:#333;cursor:pointer;font-size:1rem;padding:0;margin-left:6px;">✕</button>
  </div>
  <div id="cst-chat-msgs"></div>
  <div id="cst-chat-chars">0 / ${MAX_CHARS}</div>
  <div id="cst-chat-cool"></div>
  <div id="cst-chat-inp-row">
    <textarea id="cst-chat-inp" placeholder="say something…" maxlength="${MAX_CHARS}" rows="1"></textarea>
    <button id="cst-chat-send">send</button>
  </div>
</div>`;
    document.body.appendChild(widgetEl);

    // sync both online count displays
    const cnt2 = widgetEl.querySelector('#cst-chat-online-cnt2');
    const orig  = widgetEl.querySelector('#cst-chat-online-cnt');
    const origUpdate = () => { if (cnt2) cnt2.textContent = orig.textContent; };
    new MutationObserver(origUpdate).observe(orig, { childList: true, characterData: true, subtree: true });

    widgetEl.querySelector('#cst-chat-bubble').onclick = togglePanel;
    const inp  = widgetEl.querySelector('#cst-chat-inp');
    const send = widgetEl.querySelector('#cst-chat-send');
    const chars = widgetEl.querySelector('#cst-chat-chars');

    inp.addEventListener('input', () => {
      chars.textContent = `${inp.value.length} / ${MAX_CHARS}`;
      inp.style.height = '34px';
      inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    send.onclick = doSend;

    function doSend() {
      sendMsg(inp.value);
      inp.value = '';
      chars.textContent = `0 / ${MAX_CHARS}`;
      inp.style.height = '34px';
    }
  }

  function togglePanel() {
    const p = document.getElementById('cst-chat-panel');
    if (!p) return;
    chatOpen = p.style.display !== 'flex';
    p.style.display = chatOpen ? 'flex' : 'none';
    if (chatOpen) { unread = 0; updateBubble(); scrollMsgs(); }
  }

  function updateBubble() {
    const ur = document.getElementById('cst-chat-unread');
    if (!ur) return;
    if (unread > 0) { ur.style.display = 'flex'; ur.textContent = unread > 9 ? '9+' : unread; }
    else ur.style.display = 'none';
  }

  function appendMsg(msg) {
    const box = document.getElementById('cst-chat-msgs');
    if (!box) return;
    const mine = msg.name === getMyName();
    const d = document.createElement('div');
    d.className = 'cst-msg' + (mine ? ' cst-msg-me' : '');
    const nameStyle = msg.isAdmin ? adminNameStyle(false) : 'color:#555;';
    const nameHtml  = msg.name
      ? `<div class="cst-msg-name" style="${nameStyle}">${esc(msg.name)}</div>`
      : '';
    d.innerHTML = `${nameHtml}<div class="cst-msg-body">${esc(msg.text)}</div>`;
    box.appendChild(d);
    scrollMsgs();
  }

  function scrollMsgs() {
    const box = document.getElementById('cst-chat-msgs');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function flashCooldown(msg) {
    const el = document.getElementById('cst-chat-cool');
    if (!el) return;
    el.textContent = msg; el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2200);
  }

  // ── appearance toggle wiring ───────────────────────────────────
  function wireChatToggle() {
    const tog = document.getElementById('chatTog');
    if (!tog) return;
    tog.checked = isChatOn();
    tog.addEventListener('change', () => {
      setChatOn(tog.checked);
      if (tog.checked) { initChat(); }
      else {
        // tear down (user disabled chat)
        if (hubConn) { try { hubConn.close(); } catch {} hubConn = null; }
        if (hubPeer) { try { hubPeer.destroy(); } catch {} hubPeer = null; }
        if (chatPeer) { try { chatPeer.destroy(); } catch {} chatPeer = null; }
        widgetEl?.remove(); widgetEl = null;
        isHubMode = false;
      }
    });
  }

  // ── init ──────────────────────────────────────────────────────
  function init() {
    wireChatToggle();
    maybeShowNotif();
    if (isChatOn() && canChat()) {
      initChat();
      // widget rendered after peer opens; render stub immediately
      if (document.readyState !== 'loading') renderWidget();
      else document.addEventListener('DOMContentLoaded', renderWidget);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
