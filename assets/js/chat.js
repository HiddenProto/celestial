/* ============================================================
   CELESTIAL CHAT v2 — Full mesh P2P
   Every peer connects directly to every other peer.
   The "registry" is directory-only (no relay) — if it leaves,
   existing connections are unaffected; a new one is elected.
   Admin reuses the admin hub's PeerJS instance via admin.js.
   ============================================================ */
(function () {
  'use strict';

  const REGISTRY_ID = 'celestial-chat-hub-v1';
  const APPEAR_KEY  = 'cst-appearance';
  const MAX_CHARS   = 400;
  const COOLDOWN    = 1000;
  const SEEN_TTL    = 30000; // dedup window (ms)

  // Server config is managed by peer-mgr.js (PeerMgr.SERVERS).
  // No local peerOpts needed — PeerMgr handles server selection and fallback.

  function getAdminId()        { try { return JSON.parse(localStorage.getItem('cst-admin-id')||'{}'); } catch { return {}; } }
  function getAdminChatName()  { const id = getAdminId(); return id.name  || 'Admin'; }
  function getAdminChatColor() { const id = getAdminId(); return id.color || '#c9a84c'; }

  // ── helpers ───────────────────────────────────────────────────
  function getAppear()    { try { return JSON.parse(localStorage.getItem(APPEAR_KEY) || '{}'); } catch { return {}; } }
  function setAppear(o)   { localStorage.setItem(APPEAR_KEY, JSON.stringify(o)); }
  function isChatOn()     { return getAppear().chat === true; }
  function setChatOn(v)   { const a = getAppear(); a.chat = v; setAppear(a); }
  function isNotifsOn()   { return getAppear().chatNotifs !== false; }
  function setNotifsOn(v) { const a = getAppear(); a.chatNotifs = v; setAppear(a); }

  function amAdmin()   { return localStorage.getItem('cst-admin') === '1'; }
  function getMyName() {
    if (amAdmin()) return getAdminChatName();
    try { return JSON.parse(localStorage.getItem('cst-approved'))?.name || null; } catch { return null; }
  }
  function canChat() { return !!(amAdmin() || getMyName()); }

  function getMyInfo() {
    return { name: getMyName(), isAdmin: amAdmin(), adminColor: amAdmin() ? getAdminChatColor() : undefined };
  }

  // ── PeerJS loader ─────────────────────────────────────────────
  function loadPeerJS(cb) {
    if (window.Peer) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    s.onload = cb; s.onerror = () => {}; document.head.appendChild(s);
  }

  // ── mesh state ────────────────────────────────────────────────
  let myPeer        = null;        // this peer's PeerJS instance
  let myId          = null;        // this peer's PeerJS ID
  let meshPeers     = new Map();   // peerId → { conn, name, isAdmin, adminColor }
  let registryPeer  = null;        // Peer(REGISTRY_ID) when WE are the registry
  let registryMgr   = null;        // PeerMgr handle for registry peer
  let registryConn  = null;        // our connection TO the registry
  let isRegistry    = false;
  const seenMsgs    = new Map();   // msgId → timestamp (dedup)

  let onlineList = [];
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
          { label: 'Enable',      info: 'Turn on real-time chat with other verified users.', onClick: enableChat },
          { label: 'Maybe later', info: 'Dismiss — the option stays in Appearance settings.', className: 'opt-skip', onClick: () => {} },
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

  // ── init ──────────────────────────────────────────────────────
  function initChat() {
    if (myPeer) return;
    loadPeerJS(() => {
      if (amAdmin()) {
        // Admin: reuse the hub peer from admin.js so there's only ONE PeerJS
        // instance for both control and chat.
        if (window.__cstHubPeer && !window.__cstHubPeer.destroyed) {
          _bootMesh(window.__cstHubPeer, window.__cstHubPeerId);
        } else {
          // Hub not ready yet — wait for the event admin.js fires
          window.addEventListener('cst-hub-ready', () => {
            if (!myPeer) _bootMesh(window.__cstHubPeer, window.__cstHubPeerId);
          }, { once: true });
        }
      } else {
        // Regular user: own ephemeral peer via PeerMgr (handles reconnect/fallback)
        PeerMgr.connect(undefined, {
          onOpen: function (peer, id) {
            // If the peer was recreated (e.g. server fallback), re-boot the mesh.
            // _bootMesh sets myPeer, so compare against the new peer.
            if (myPeer && myPeer !== peer) {
              // Tear down old mesh connections (don't destroy myPeer — PeerMgr owns it)
              if (registryConn)  { try { registryConn.close();   } catch {} registryConn = null; }
              if (registryMgr)   { registryMgr.destroy(); registryMgr = null; }
              registryPeer = null; isRegistry = false;
              meshPeers.forEach(function (p) { try { p.conn.close(); } catch {} });
              meshPeers.clear();
            }
            _bootMesh(peer, id);
          },
        });
      }
    });
  }

  // Called once we have a ready peer ID
  function _bootMesh(peer, id) {
    myPeer = peer;
    myId   = id;
    if (amAdmin()) {
      // Admin.js routes incoming mesh-hello connections here
      window.__cstChatIncoming = handleIncoming;
    } else {
      myPeer.on('connection', handleIncoming);
    }
    renderWidget();
    joinMesh();
  }

  // ── join the mesh ─────────────────────────────────────────────
  function joinMesh() {
    if (!myPeer || !myId) return;

    const conn    = myPeer.connect(REGISTRY_ID, { reliable: true });
    let   opened  = false;
    const timeout = setTimeout(() => { if (!opened) becomeRegistry(); }, 4000);

    conn.on('open', () => {
      clearTimeout(timeout);
      opened       = true;
      registryConn = conn;
      isRegistry   = false;
      conn.send({ type: 'mesh-join', id: myId, ...getMyInfo() });
    });

    conn.on('data', d => {
      if (!d || d.type !== 'mesh-peers') return;
      // Registry sent us the current peer list — connect to each directly
      (d.peers || []).forEach(p => {
        if (p.id !== myId && !meshPeers.has(p.id)) connectToPeer(p.id, p);
      });
      updateOnline();
    });

    conn.on('close', () => {
      registryConn = null;
      // Registry left — existing P2P connections are fine; re-elect registry
      setTimeout(joinMesh, 1500);
    });
    conn.on('error', () => {
      clearTimeout(timeout);
      if (!opened) becomeRegistry();
    });
  }

  // ── become the registry (directory only, no relay) ────────────
  function becomeRegistry() {
    isRegistry = true;
    registryMgr = PeerMgr.connect(REGISTRY_ID, {

      onOpen: function (rp) {
        registryPeer = rp;
        updateOnline();
      },

      onConnection: function (conn) {
        conn.on('data', function (d) {
          if (!d || d.type !== 'mesh-join') return;
          // Build peer list for the new joiner (everyone except themselves)
          var list = [
            Object.assign({ id: myId }, getMyInfo()),
          ].concat(
            Array.from(meshPeers.entries())
              .filter(function (e) { return e[1].name; })
              .map(function (e) { return { id: e[0], name: e[1].name, isAdmin: e[1].isAdmin, adminColor: e[1].adminColor }; })
          ).filter(function (p) { return p.id !== d.id; });
          try { conn.send({ type: 'mesh-peers', peers: list }); } catch (e) {}
        });
      },

      onUnavailable: function () {
        // Someone else became registry first — join as regular member
        isRegistry   = false;
        registryMgr  = null;
        registryPeer = null;
        setTimeout(joinMesh, 500);
      },

    });
  }

  // ── connect directly to a peer ────────────────────────────────
  function connectToPeer(peerId, info) {
    if (!myPeer || meshPeers.has(peerId) || peerId === myId) return;
    const conn = myPeer.connect(peerId, { reliable: true });
    meshPeers.set(peerId, { conn, name: info?.name || null, isAdmin: !!info?.isAdmin, adminColor: info?.adminColor });
    conn.on('open', () => {
      try { conn.send({ type: 'mesh-hello', id: myId, ...getMyInfo() }); } catch {}
      updateOnline();
    });
    conn.on('data',  d  => handlePeerMsg(peerId, d));
    conn.on('close', () => { meshPeers.delete(peerId); updateOnline(); });
    conn.on('error', () => { meshPeers.delete(peerId); updateOnline(); });
  }

  // ── accept an incoming direct connection ──────────────────────
  // Also called by admin.js when it routes a mesh-hello to us.
  function handleIncoming(conn, firstMsg) {
    const peerId = conn.peer;
    if (!meshPeers.has(peerId)) meshPeers.set(peerId, { conn, name: null, isAdmin: false });

    function onData(d) {
      if (d && d.type === 'mesh-hello') {
        const prev = meshPeers.get(peerId) || {};
        meshPeers.set(peerId, { ...prev, conn, name: d.name, isAdmin: !!d.isAdmin, adminColor: d.adminColor });
        updateOnline();
      } else {
        handlePeerMsg(peerId, d);
      }
    }

    conn.on('data',  onData);
    conn.on('close', () => { meshPeers.delete(peerId); updateOnline(); });
    conn.on('error', () => { meshPeers.delete(peerId); updateOnline(); });

    if (firstMsg) onData(firstMsg); // admin.js already consumed the first message for routing
  }

  // ── receive a message from a direct peer connection ───────────
  function handlePeerMsg(peerId, d) {
    if (!d || typeof d !== 'object') return;

    // Dedup by msgId (prevents double-display if somehow seen twice)
    if (d.msgId) {
      if (seenMsgs.has(d.msgId)) return;
      seenMsgs.set(d.msgId, Date.now());
      const now = Date.now();
      for (const [id, ts] of seenMsgs) if (now - ts > SEEN_TTL) seenMsgs.delete(id);
    }

    if (d.type === 'msg') {
      appendMsg(d);
      const myName = getMyName();
      const mentioned = myName && d.mentions && d.mentions.some(n => n.toLowerCase() === myName.toLowerCase());
      const seeing    = !document.hidden && chatOpen;
      if (!seeing) {
        unread++; updateBubble();
        if (isNotifsOn()) {
          if (mentioned) window.notify?.(`📣 ${d.name || 'someone'} mentioned you: ${d.text.slice(0,80)}`, 'info', 9000);
          else           window.notify?.(`${d.name || '?'}: ${d.text.slice(0,60)}`, 'info', 5000);
        } else if (mentioned) { _sendNotifOff(d.name, peerId); }
      } else if (mentioned) {
        if (isNotifsOn()) window.notify?.(`📣 ${d.name || 'someone'} mentioned you`, 'info', 5000);
        else _sendNotifOff(d.name, peerId);
      }
    }

    if (d.type === 'notif-feedback' && d.feedback === 'notifs-off') {
      window.notify?.(`${d.from} has notifications turned off`, 'info', 6000);
    }
  }

  // ── send ──────────────────────────────────────────────────────
  function sendMsg(text) {
    text = text.trim().slice(0, MAX_CHARS);
    if (!text) return;
    const now = Date.now();
    if (now - lastSent < COOLDOWN) {
      flashCooldown(`slow down — ${Math.ceil((COOLDOWN - (now - lastSent)) / 1000)}s`);
      return;
    }
    lastSent = now;
    const mentions = parseMentions(text);
    const info     = getMyInfo();
    const msg = {
      type: 'msg', msgId: Math.random().toString(36).slice(2),
      name: info.name, text, isAdmin: info.isAdmin,
      adminColor: info.adminColor, mentions: mentions.length ? mentions : undefined, ts: now,
    };
    seenMsgs.set(msg.msgId, now); // prevent echo
    meshPeers.forEach(({ conn }) => { try { if (conn.open) conn.send(msg); } catch {} });
    appendMsg(msg);
  }

  function _sendNotifOff(pingerName, fromPeerId) {
    const myName = getMyName();
    if (!myName) return;
    const send = p => { try { p.conn.send({ type: 'notif-feedback', from: myName, feedback: 'notifs-off' }); } catch {} };
    if (fromPeerId && meshPeers.has(fromPeerId)) { send(meshPeers.get(fromPeerId)); return; }
    for (const p of meshPeers.values()) { if (p.name === pingerName) { send(p); return; } }
  }

  // ── online list ───────────────────────────────────────────────
  function updateOnline() {
    const seen = new Set();
    onlineList = [
      { name: getMyName(), isAdmin: amAdmin() },
      ...Array.from(meshPeers.values()).filter(p => p.name).map(p => ({ name: p.name, isAdmin: p.isAdmin })),
    ].filter(u => {
      if (!u.name) return false;
      const k = u.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
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

  function adminNameStyle(inline, color) {
    if (color && color !== '#c9a84c') return `color:${color};font-weight:700;`;
    return inline
      ? 'background:linear-gradient(90deg,#c9a84c,#ffe082,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;'
      : ADMIN_GRADIENT;
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function parseMentions(text) {
    const out = [], re = /\@\[([^\]]{1,40})\]|@([\w\-\.]{1,40})/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = (m[1] || m[2]).trim();
      if (name && !out.includes(name)) out.push(name);
    }
    return out;
  }

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
    <button id="cst-chat-close"
      style="background:none;border:none;color:#333;cursor:pointer;font-size:1rem;padding:0;margin-left:6px;">✕</button>
  </div>
  <div id="cst-chat-msgs"></div>
  <div id="cst-chat-chars">0 / ${MAX_CHARS}</div>
  <div id="cst-chat-cool"></div>
  <div id="cst-chat-inp-row">
    <textarea id="cst-chat-inp" placeholder="say something… (@[name] to ping)" maxlength="${MAX_CHARS}" rows="1"></textarea>
    <button id="cst-chat-send">send</button>
  </div>
</div>`;
    document.body.appendChild(widgetEl);

    // keep both online-count displays in sync
    const cnt2 = widgetEl.querySelector('#cst-chat-online-cnt2');
    const orig  = widgetEl.querySelector('#cst-chat-online-cnt');
    new MutationObserver(() => { if (cnt2) cnt2.textContent = orig.textContent; })
      .observe(orig, { childList: true, characterData: true, subtree: true });

    widgetEl.querySelector('#cst-chat-bubble').onclick = togglePanel;
    widgetEl.querySelector('#cst-chat-close').onclick = () => {
      const p = document.getElementById('cst-chat-panel');
      if (p) p.style.display = 'none';
      chatOpen = false;
    };

    const inp  = widgetEl.querySelector('#cst-chat-inp');
    const send = widgetEl.querySelector('#cst-chat-send');
    const chars = widgetEl.querySelector('#cst-chat-chars');

    // ── @ autocomplete ──────────────────────────────────────────
    let _atStart = -1, _atList = [], _atSel = 0, _atEl = null;

    function _atBuild() {
      if (_atEl) return _atEl;
      _atEl = document.createElement('div');
      _atEl.style.cssText = 'position:absolute;bottom:calc(100% + 2px);left:0;right:0;' +
        'background:#0e0e0e;border:1px solid #282828;border-radius:8px;overflow:hidden;' +
        'z-index:9999;display:none;max-height:150px;overflow-y:auto;' +
        'box-shadow:0 -4px 16px rgba(0,0,0,.7);font-family:system-ui,sans-serif;';
      const row = widgetEl.querySelector('#cst-chat-inp-row');
      row.style.position = 'relative';
      row.appendChild(_atEl);
      return _atEl;
    }
    function _atHide() { if (_atEl) _atEl.style.display = 'none'; _atStart = -1; }
    function _atHighlight() {
      if (!_atEl) return;
      _atEl.querySelectorAll('[data-i]').forEach((item, i) => {
        item.style.background = i === _atSel ? '#1c1c1c' : '';
      });
    }
    function _atShow(filter) {
      const names = onlineList.map(u => u.name).filter(n => n && n !== getMyName());
      const filt  = filter ? names.filter(n => n.toLowerCase().includes(filter.toLowerCase())) : names;
      if (!filt.length) { _atHide(); return; }
      _atList = filt; _atSel = 0;
      const el = _atBuild();
      el.innerHTML = filt.map((n, i) =>
        `<div data-i="${i}" style="padding:6px 12px;cursor:pointer;font-size:.78rem;color:#ccc;` +
        (i === 0 ? 'background:#1c1c1c;' : '') +
        `display:flex;align-items:center;gap:6px;">` +
        `<span style="color:#7eb8ff;font-size:.7rem;font-weight:600;">@</span>${esc(n)}</div>`
      ).join('');
      el.querySelectorAll('[data-i]').forEach(item => {
        item.addEventListener('mousedown', ev => { ev.preventDefault(); _atAccept(+item.dataset.i); });
      });
      el.style.display = 'block';
    }
    function _atAccept(i) {
      const name = _atList[i]; if (!name) return;
      const before = inp.value.slice(0, _atStart);
      const after  = inp.value.slice(inp.selectionStart);
      inp.value = before + '@[' + name + '] ' + after;
      const pos = (before + '@[' + name + '] ').length;
      inp.setSelectionRange(pos, pos);
      _atHide();
      chars.textContent = `${inp.value.length} / ${MAX_CHARS}`;
      inp.style.height = '34px';
      inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
    }

    inp.addEventListener('input', () => {
      chars.textContent = `${inp.value.length} / ${MAX_CHARS}`;
      inp.style.height = '34px';
      inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
      const val = inp.value, cur = inp.selectionStart;
      const atPos = val.lastIndexOf('@', cur - 1);
      if (atPos !== -1) {
        const frag = val.slice(atPos + 1, cur);
        if (!frag.includes('[') && !frag.includes(']') && !frag.includes('@') && frag.length <= 32) {
          _atStart = atPos; _atShow(frag);
        } else { _atHide(); }
      } else { _atHide(); }
    });
    inp.addEventListener('keydown', e => {
      if (_atEl && _atEl.style.display !== 'none') {
        if (e.key === 'Tab')        { e.preventDefault(); _atAccept(_atSel); return; }
        if (e.key === 'ArrowDown')  { e.preventDefault(); _atSel = Math.min(_atSel + 1, _atList.length - 1); _atHighlight(); return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); _atSel = Math.max(_atSel - 1, 0); _atHighlight(); return; }
        if (e.key === 'Escape')     { e.preventDefault(); _atHide(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    inp.addEventListener('blur', () => setTimeout(_atHide, 150));
    send.onclick = doSend;

    function doSend() {
      sendMsg(inp.value);
      inp.value = ''; chars.textContent = `0 / ${MAX_CHARS}`;
      inp.style.height = '34px'; _atHide();
    }

    updateOnline(); // populate list immediately
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
    const d    = document.createElement('div');
    d.className = 'cst-msg' + (mine ? ' cst-msg-me' : '');
    const nameStyle = msg.isAdmin ? adminNameStyle(false, msg.adminColor) : 'color:#555;';
    const nameHtml  = msg.name
      ? `<div class="cst-msg-name" style="${nameStyle}">${esc(msg.name)}</div>`
      : '';
    const bodyHtml = esc(msg.text).replace(/\@\[([^\]]+)\]|@([\w\-\.]{1,40})/g, (full, bN, pN) => {
      const n = bN !== undefined ? bN : pN;
      return `<span style="color:#7eb8ff;font-weight:600;">@${esc(n)}</span>`;
    });
    d.innerHTML = `${nameHtml}<div class="cst-msg-body">${bodyHtml}</div>`;
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

  // ── teardown ──────────────────────────────────────────────────
  function teardownChat() {
    if (registryConn) { try { registryConn.close(); } catch {} registryConn = null; }
    if (registryMgr)  { registryMgr.destroy(); registryMgr = null; }
    registryPeer = null;
    meshPeers.forEach(function (p) { try { p.conn.close(); } catch {} });
    meshPeers.clear();
    // Admin: do NOT destroy myPeer — it's the admin hub, admin.js owns its lifetime
    if (!amAdmin() && myPeer) { try { myPeer.destroy(); } catch {} }
    myPeer = null; myId = null; isRegistry = false;
    if (amAdmin()) window.__cstChatIncoming = null;
    if (widgetEl) { widgetEl.remove(); widgetEl = null; }
    onlineList = []; unread = 0; chatOpen = false;
  }

  // ── appearance toggle wiring ───────────────────────────────────
  function wireChatToggle() {
    const tog = document.getElementById('chatTog');
    if (!tog) return;
    tog.checked = isChatOn();
    tog.addEventListener('change', () => {
      setChatOn(tog.checked);
      if (tog.checked) initChat();
      else teardownChat();
    });
  }

  // ── init ──────────────────────────────────────────────────────
  function init() {
    wireChatToggle();
    const notifTog = document.getElementById('chatNotifTog');
    if (notifTog) {
      notifTog.checked = isNotifsOn();
      notifTog.addEventListener('change', () => setNotifsOn(notifTog.checked));
    }
    maybeShowNotif();
    if (isChatOn() && canChat()) {
      initChat();
      if (document.readyState !== 'loading') renderWidget();
      else document.addEventListener('DOMContentLoaded', renderWidget);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
