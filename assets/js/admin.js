/* ============================================================
   CELESTIAL ADMIN SYSTEM v2
   Konami: ← → ← → ↑ ↓ A B  →  passcode  →  admin panel
   Keys require admin online to activate. Single-use.
   ============================================================ */
(function () {
  'use strict';

  const SEQ  = ['ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','b'];
  const PASS = 'Hr332941369';
  // Hub ID — site-specific so different deployments never conflict on the
  // public PeerJS cloud.  Override via localStorage('cst-hub-id') without
  // needing a code push (useful if the ID ever gets stale-locked again).
  // Hub uses a RANDOM PeerJS ID — no stale-locks ever.
  // Clients discover the hub's current ID through the chat registry
  // (same discovery path as the P2P mesh, which already works reliably).
  // The registry ID formula is identical to chat.js so they share the same node.
  const REGISTRY_ID = localStorage.getItem('cst-registry-id') ||
    ('cst-registry-' + location.hostname.replace(/[^a-z0-9]/gi, '').slice(0, 12));
  const SEC  = 'Hr332941369';

  let isAdmin    = localStorage.getItem('cst-admin') === '1';
  let buf        = [];

  function getAdminId()   { try { return JSON.parse(localStorage.getItem('cst-admin-id')||'{}'); } catch { return {}; } }
  function saveAdminId(o) { localStorage.setItem('cst-admin-id', JSON.stringify(o)); }
  function getAdminName() { const id = getAdminId(); return id.name || 'Admin'; }
  function getAdminColor(){ const id = getAdminId(); return id.color || '#c9a84c'; }

  // ─── Exotic: Apex theme (admin-exclusive) ────────────────────
  function _applyApexTheme() {
    const cur = document.body.getAttribute('theme');
    if (cur && cur !== 'apex') {
      localStorage.setItem('cst-prev-theme', cur);
    }
    localStorage.setItem('theme', 'apex');
    document.body.setAttribute('theme', 'apex');
    if (!document.querySelector('script[src="/assets/js/apex.js"]')) {
      const s = document.createElement('script');
      s.src = '/assets/js/apex.js';
      document.body.appendChild(s);
    }
  }


  let hub         = null;
  let cPeer       = null;
  let clients     = {};
  let partnerConn = null;
  let viewTarget  = null;
  let _hubMgr         = null;   // PeerMgr handle for the admin hub
  let _heartbeatTimer = null;   // hub heartbeat interval
  let admCX = 50, admCY = 50;
  let viewStream = null;
  let panelEl    = null;
  var _hubOnlinePid = null;   // most-recent hub peer ID (set in onOpen, read in buildPanel)

  // cross-tab approval sync
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cst-auth') : null;
  if (bc) bc.onmessage = e => {
    if (e.data === 'approved') document.getElementById('cst-gate')?.remove();
    if (e.data === 'revoked')  { clearApproval(); if (!document.getElementById('cst-gate')) showGate(); }
  };

  // ─── key crypto + identity ───────────────────────────────────
  function H(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36).toUpperCase().padStart(7, '0');
  }
  function makeKey(name, days) {
    const e = Date.now() + days * 86400000;
    const p = btoa(JSON.stringify({ n: name, e }));
    return p + '.' + H(p + SEC);
  }
  function checkKey(raw) {
    if (!raw) return null;
    try {
      const dot = raw.lastIndexOf('.');
      const p   = raw.slice(0, dot);
      if (H(p + SEC) !== raw.slice(dot + 1)) return null;
      const { n, e } = JSON.parse(atob(p));
      return Date.now() > e ? null : { name: n, expires: e };
    } catch { return null; }
  }
  function makeUID() {
    const an  = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const sym = '!@#$%^&*-_+=';
    const pos = new Set(); while (pos.size < 2) pos.add(Math.floor(Math.random() * 12));
    return Array.from({ length: 12 }, (_, i) =>
      pos.has(i) ? sym[Math.floor(Math.random() * sym.length)]
                 : an[Math.floor(Math.random() * an.length)]
    ).join('');
  }
  function getDeviceId() {
    let id = localStorage.getItem('cst-devid');
    if (id) return id;
    const raw = [navigator.userAgent, screen.width, screen.height,
      navigator.language, navigator.hardwareConcurrency || 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
    id = (H(raw) + H(raw.split('').reverse().join('')) + H(Date.now().toString(36))).toLowerCase();
    localStorage.setItem('cst-devid', id);
    return id;
  }

  // ─── approval state ──────────────────────────────────────────
  function getApproval() {
    try { return JSON.parse(localStorage.getItem('cst-approved')) || null; } catch { return null; }
  }
  function isApproved() {
    if (isAdmin) return true;
    const a = getApproval();
    return !!(a && Date.now() < a.expires);
  }
  function setApproved(name, expires, extra = {}) {
    const prev = getApproval();
    const data = {
      name,
      expires,
      created: extra.created ?? prev?.created ?? Date.now(),
      uid:     extra.uid     ?? prev?.uid     ?? makeUID(),
      badges:  extra.badges  ?? prev?.badges  ?? [],
    };
    if (extra.isFirstUser && !data.badges.includes('first-user')) data.badges.push('first-user');
    localStorage.setItem('cst-approved', JSON.stringify(data));
    bc?.postMessage('approved');
    return { isLegacy: !!(prev && !prev.uid) };
  }
  function clearApproval() {
    localStorage.removeItem('cst-approved');
    localStorage.removeItem('cst-key');
  }

  // ─── toast ───────────────────────────────────────────────────
  function showToast(msg, dur = 4500) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#111;color:#eee;padding:10px 22px;border-radius:8px;border:1px solid #2a2a2a;' +
      'font-family:system-ui,sans-serif;font-size:.83rem;z-index:2147483645;' +
      'pointer-events:none;opacity:1;transition:opacity .4s;white-space:nowrap;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, dur);
  }

  // ─── badge system ────────────────────────────────────────────
  const BADGE_DEFS = {
    'first-user': { label: 'First User', icon: '★', desc: 'Among the very first users of Celestial.' },
  };

  function renderBadgeButton() {
    document.getElementById('cst-badge-btn')?.remove();
    const appr = getApproval();
    if (!appr || Date.now() >= appr.expires) return;
    const btn = document.createElement('button');
    btn.id = 'cst-badge-btn';
    const hasBadges = appr.badges?.length > 0;
    btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483644;' +
      'background:#0d0d0d;border:1px solid #222;border-radius:50px;padding:7px 14px;' +
      'color:#888;font-family:system-ui,sans-serif;font-size:.75rem;cursor:pointer;' +
      'display:flex;align-items:center;gap:6px;transition:background .15s;';
    function _daysLeft() { return Math.max(0, Math.ceil((appr.expires - Date.now()) / 86400000)); }
    function _updateBtn() {
      const d = _daysLeft();
      const dLabel = d === 0 ? 'today' : `${d}d`;
      btn.innerHTML = (hasBadges ? '<span style="font-size:.9rem">★</span>' : '') +
        `<span>${appr.name || 'user'}</span>` +
        `<span id="cst-badge-days" style="color:#444;font-size:.7rem;">${dLabel}</span>`;
    }
    _updateBtn();
    btn.onmouseenter = () => btn.style.background = '#181818';
    btn.onmouseleave = () => btn.style.background = '#0d0d0d';
    btn.onclick = showBadgePanel;
    document.body.appendChild(btn);
    // Live countdown — refresh every minute
    const _int = setInterval(() => {
      if (!document.body.contains(btn)) { clearInterval(_int); return; }
      if (Date.now() >= appr.expires) { btn.remove(); clearInterval(_int); return; }
      _updateBtn();
    }, 60000);
  }

  function showBadgePanel() {
    document.getElementById('cst-badge-panel')?.remove();
    const appr = getApproval();
    if (!appr) return;
    const p = document.createElement('div');
    p.id = 'cst-badge-panel';
    const dLeft = Math.max(0, Math.ceil((appr.expires - Date.now()) / 86400000));
    const badges = (appr.badges || []).map(id => {
      const b = BADGE_DEFS[id];
      return b ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;
        background:#0a0a0a;border:1px solid #1c1c1c;border-radius:6px;margin-bottom:6px;">
        <span style="font-size:1.1rem">${b.icon}</span>
        <div><div style="font-size:.8rem;color:#ccc;">${b.label}</div>
        <div style="font-size:.7rem;color:#444;">${b.desc}</div></div></div>` : '';
    }).join('');
    p.style.cssText = 'position:fixed;bottom:54px;right:16px;z-index:2147483644;' +
      'background:#080808;border:1px solid #1e1e1e;border-radius:10px;' +
      'padding:16px;min-width:220px;font-family:system-ui,sans-serif;color:#ccc;';
    p.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:.88rem;font-weight:600;">${appr.name || 'user'}</div>
        <button onclick="document.getElementById('cst-badge-panel').remove()"
          style="background:none;border:none;color:#444;cursor:pointer;font-size:1rem;padding:0;">✕</button>
      </div>
      <div style="font-size:.72rem;color:#444;margin-bottom:${badges ? '10px' : '0'};">
        ${dLeft > 0 ? `access expires in ${dLeft} day${dLeft !== 1 ? 's' : ''}` : 'access expired'}
      </div>
      ${badges || '<div style="font-size:.77rem;color:#333;margin-top:8px;">no badges yet.</div>'}
      <div style="font-size:.65rem;color:#1e1e1e;margin-top:10px;font-family:monospace;
        word-break:break-all;">${appr.uid || ''}</div>`;
    document.body.appendChild(p);
    setTimeout(() => {
      document.addEventListener('click', function away(e) {
        if (!p.contains(e.target) && e.target.id !== 'cst-badge-btn') {
          p.remove(); document.removeEventListener('click', away);
        }
      }, true);
    }, 0);
  }

  // ─── auth gate ───────────────────────────────────────────────
  function showGate() {
    if (document.getElementById('cst-gate')) return;
    const d = document.createElement('div');
    d.id = 'cst-gate';
    d.innerHTML = `
<style>
#cst-gate{position:fixed;inset:0;z-index:2147483647;background:#040404;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-family:system-ui,sans-serif;}
#cst-gate *{box-sizing:border-box;}
#cg-h{color:#fff;margin:0 0 6px;font-size:1.6rem;letter-spacing:-.03em;}
#cg-sub{color:#444;font-size:.83rem;margin:0 0 24px;}
#cg-inp{background:#0d0d0d;border:1px solid #1e1e1e;color:#fff;
  padding:11px 16px;border-radius:7px;font-size:.95rem;width:290px;outline:none;
  font-family:monospace;letter-spacing:.05em;margin-bottom:10px;}
#cg-inp:focus{border-color:#333;}
#cg-btn{width:290px;padding:11px;background:#111;color:#bbb;
  border:1px solid #222;border-radius:7px;cursor:pointer;font-size:.88rem;}
#cg-btn:hover{background:#181818;}
#cg-btn:disabled{opacity:.45;cursor:default;}
#cg-err{font-size:.75rem;color:#ff4444;margin-top:8px;min-height:18px;}
#cg-info{font-size:.75rem;color:#555;margin-top:8px;display:none;}
</style>
<h2 id="cg-h">celestial.</h2>
<p id="cg-sub">access key required</p>
<input id="cg-inp" placeholder="paste your access key" autocomplete="off"/>
<button id="cg-btn">continue</button>
<div id="cg-err"></div>
<div id="cg-info"></div>`;
    document.body.appendChild(d);

    const inp  = d.querySelector('#cg-inp');
    const btn  = d.querySelector('#cg-btn');
    const err  = d.querySelector('#cg-err');
    const info = d.querySelector('#cg-info');

    const setInfo  = t => { info.textContent = t; info.style.display = t ? 'block' : 'none'; };
    const setError = t => { err.textContent = t; setTimeout(() => err.textContent = '', 3000); };
    const lock     = () => { btn.disabled = true; inp.disabled = true; };
    const unlock   = () => { btn.disabled = false; inp.disabled = false; };

    const go = () => {
      const k  = inp.value.trim();
      const kv = checkKey(k);
      if (!kv) {
        inp.style.borderColor = '#ff3333';
        setTimeout(() => inp.style.borderColor = '', 2500);
        setError(k ? 'invalid or expired key.' : 'enter a key first.');
        return;
      }
      lock();
      err.textContent = '';
      setInfo('contacting admin…');
      localStorage.setItem('cst-key', k);
      window.__cstPendingKey = k;
      window.__cstBeaconRegister?.();
    };

    btn.onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    inp.focus();

    window.__cstGateApproved = (name, expires, extra = {}) => {
      setApproved(name, expires, extra);
      renderBadgeButton();
      d.remove();
      delete window.__cstGateApproved;
      delete window.__cstGateRejected;
      delete window.__cstGateOffline;
      delete window.__cstPendingKey;
    };
    window.__cstGateRejected = reason => {
      unlock(); setInfo('');
      localStorage.removeItem('cst-key');
      delete window.__cstPendingKey;
      setError(
        reason === 'used'    ? 'key already in use by someone else.' :
        reason === 'unknown' ? 'key not recognized by admin.' :
        reason === 'expired' ? 'key has expired.' :
        'key rejected by admin.'
      );
      inp.style.borderColor = '#ff3333';
      setTimeout(() => inp.style.borderColor = '', 3000);
    };
    window.__cstGateOffline = () => {
      unlock();
      localStorage.removeItem('cst-key');
      delete window.__cstPendingKey;
      setInfo('admin is offline — keys require admin to be connected. try again later.');
      setTimeout(() => setInfo(''), 5000);
    };
  }

  // ─── konami ──────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (document.activeElement.matches('input,textarea,select,[contenteditable]')) return;
    buf.push(e.key);
    if (buf.length > SEQ.length) buf.shift();
    if (JSON.stringify(buf) === JSON.stringify(SEQ)) { buf = []; doLogin(); }
  }, true);

  function doLogin() {
    if (isAdmin) { openPanel(); return; }
    const pw = prompt('admin passcode:');
    if (pw === PASS) {
      isAdmin = true;
      localStorage.setItem('cst-admin', '1');
      document.getElementById('cst-gate')?.remove();
      openPanel();
    } else if (pw !== null) { alert('incorrect passcode.'); }
  }

  // ─── admin panel ─────────────────────────────────────────────
  var _unloadHooked = false;
  function openPanel() {
    if (panelEl) { panelEl.style.display = 'flex'; return; }

    // Destroy hub peer cleanly when admin closes/navigates the tab.
    // Without this, the ID stays registered on peerjs-server for up to 60 s,
    // blocking the next session from claiming it.
    if (!_unloadHooked) {
      _unloadHooked = true;
      window.addEventListener('beforeunload', function () {
        if (_hubMgr) { _hubMgr.destroy(); _hubMgr = null; hub = null; }
      });
    }

    buildPanel(); startHub();
  }

  function buildPanel() {
    panelEl = document.createElement('div');
    panelEl.id = 'cst-panel';
    panelEl.innerHTML = `
<style>
#cst-panel{position:fixed;inset:0;z-index:2147483646;background:#080808;
  display:flex;flex-direction:column;font-family:system-ui,sans-serif;color:#ccc;}
#cst-panel *{box-sizing:border-box;}
#cp-bar{display:flex;align-items:center;gap:12px;padding:10px 18px;
  background:#040404;border-bottom:1px solid #161616;flex-shrink:0;}
#cp-bar h2{margin:0;font-size:.93rem;color:#fff;}
.cp-badge{font-size:.68rem;padding:2px 8px;border-radius:3px;
  border:1px solid #3a0000;background:#160000;color:#ff5555;}
#cp-hub{font-size:.7rem;padding:2px 8px;border-radius:3px;
  border:1px solid #1e1e1e;background:#0d0d0d;color:#444;}
#cp-hub.on{border-color:#003300;background:#001000;color:#44ff88;}
.cp-x{margin-left:auto;background:none;border:none;color:#444;
  font-size:1.2rem;cursor:pointer;padding:4px 8px;line-height:1;}
.cp-x:hover{color:#fff;}
#cp-body{display:flex;flex:1;min-height:0;}
#cp-nav{width:162px;padding:10px 0;border-right:1px solid #161616;
  display:flex;flex-direction:column;gap:2px;}
.cn{padding:9px 18px;background:none;border:none;color:#666;cursor:pointer;
  font-size:.83rem;text-align:left;border-left:2px solid transparent;width:100%;}
.cn:hover{color:#ccc;background:#0d0d0d;}
.cn.on{color:#fff;background:#0c0c0c;border-left-color:#cc2222;}
.cn.red{color:#cc3333;}
#cp-main{flex:1;overflow-y:auto;padding:20px;}
.cs{display:none;} .cs.on{display:block;}
.cb{background:#0c0c0c;border:1px solid #191919;border-radius:8px;padding:16px;margin-bottom:14px;}
.cb h3{margin:0 0 12px;font-size:.88rem;color:#fff;}
.ci{background:#0d0d0d;border:1px solid #222;color:#fff;
  padding:8px 12px;border-radius:5px;font-size:.82rem;outline:none;}
.ci:focus{border-color:#333;}
.cbtn{padding:7px 15px;background:#111;color:#bbb;
  border:1px solid #222;border-radius:5px;cursor:pointer;font-size:.8rem;}
.cbtn:hover{background:#181818;}
.cbtn.g{background:#001200;color:#44ff77;border-color:#003300;}
.cbtn.g:hover{background:#001800;}
.cbtn.r{background:#120000;color:#ff5555;border-color:#300000;}
.cbtn.r:hover{background:#1a0000;}
.crow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
.ck{background:#0d0d0d;border:1px solid #191919;border-radius:5px;
  padding:10px;margin:3px 0;display:flex;gap:10px;align-items:flex-start;}
.ck-code{font-family:monospace;font-size:.66rem;color:#666;word-break:break-all;flex:1;}
.kb{font-size:.68rem;padding:2px 6px;border-radius:3px;}
.kw{background:#1a1200;color:#ffaa44;border:1px solid #3d2900;}
.ka{background:#001200;color:#44ff77;border:1px solid #003300;}
.ke{background:#120000;color:#ff5555;border:1px solid #300000;}
.ccl{background:#0c0c0c;border:1px solid #191919;border-radius:6px;
  padding:12px;margin:3px 0;display:flex;align-items:center;gap:10px;}
.ccl.sel{border-color:#cc2222;}
.ccl-info{flex:1;cursor:pointer;}
.cn2{font-size:.86rem;color:#fff;font-weight:600;}
.cm{font-size:.72rem;color:#444;margin-top:3px;}
#cp-viewer{display:none;background:#030303;border:1px solid #191919;
  border-radius:8px;overflow:hidden;margin-top:12px;}
#cp-vctrl{padding:10px;background:#060606;display:flex;gap:8px;align-items:center;}
#cp-vctrl .ci{flex:1;}
#cp-viewer{filter:none!important;-webkit-filter:none!important;isolation:isolate;}
#cp-vc{filter:none!important;-webkit-filter:none!important;color-scheme:normal;object-fit:contain;background:#000;}
</style>
<div id="cp-bar">
  <h2>celestial. admin</h2>
  <span class="cp-badge">ADMIN</span>
  <span id="cp-hub">hub offline</span>
  <span id="cp-online-cnt" style="font-size:.7rem;padding:2px 8px;border-radius:3px;
    border:1px solid #1a2a1a;background:#020f02;color:#44aa66;display:none;"></span>
  <button class="cp-x" id="cp-close">✕</button>
</div>
<div id="cp-body">
  <div id="cp-nav">
    <button class="cn on" data-s="keys">Key Manager</button>
    <button class="cn" data-s="clients">View Clients</button>
    <button class="cn" data-s="identity">Identity</button>
    <button class="cn" data-s="info">Info</button>
    <button class="cn red" id="cp-logout" style="margin-top:auto;">Log Out</button>
  </div>
  <div id="cp-main">
    <div class="cs on" id="cs-keys">
      <div class="cb">
        <h3>Create Key</h3>
        <div class="crow">
          <input class="ci" id="ck-name" placeholder="user name" style="width:145px"/>
          <input class="ci" id="ck-days" type="number" value="7" min="1" style="width:65px"/>
          <button class="cbtn g" id="ck-make">create</button>
        </div>
        <div id="ck-new" style="display:none;margin-top:10px;">
          <p style="font-size:.75rem;color:#555;margin:0 0 6px;">share with user:</p>
          <div id="ck-val" style="background:#080808;border:1px solid #1e1e1e;border-radius:5px;
            padding:10px;font-family:monospace;font-size:.7rem;word-break:break-all;color:#77ffaa;"></div>
          <div class="crow" style="margin-top:8px;">
            <button class="cbtn g" id="ck-copy">copy</button>
            <span id="ck-wait" style="font-size:.73rem;color:#ffaa44;">waiting for use…</span>
          </div>
        </div>
      </div>
      <div class="cb">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <h3 style="margin:0;">Keys <span id="ck-cnt" style="color:#444;font-size:.75rem;font-weight:normal;"></span></h3>
          <div style="margin-left:auto;display:flex;gap:6px;">
            <button class="cbtn" id="ck-import" style="font-size:.71rem;">↑ import</button>
            <button class="cbtn" id="ck-export" style="font-size:.71rem;">↓ export</button>
          </div>
        </div>
        <div id="ck-list"></div>
      </div>
    </div>
    <div class="cs" id="cs-clients">
      <div class="cb">
        <h3>Connected Clients</h3>
        <p style="font-size:.76rem;color:#444;margin:0 0 10px;">
          clients auto-connect to hub <code style="color:#666">112456LCD</code> every second.
          click a client to view their screen. remove disconnects and revokes their access.
        </p>
        <div id="cp-clist"><p style="color:#333;font-size:.82rem;">no clients connected.</p></div>
      </div>
      <div class="cb">
        <h3>Global Actions <span style="font-size:.7rem;color:#444;font-weight:normal;">→ all clients</span></h3>
        <div class="crow" style="margin-bottom:8px;">
          <input class="ci" id="cp-ann-txt" placeholder="announcement text…" style="flex:1;min-width:0;"/>
          <button class="cbtn g" id="cp-ann-all">📢 announce all</button>
        </div>
        <div class="crow" style="align-items:center;">
          <select class="ci" id="cp-nuke-sel" style="flex:1;min-width:0;">
            <option value="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0">🎵 Rick Roll</option>
            <option value="https://www.youtube.com/embed/2yJgwwDcgV8?autoplay=1&mute=1&controls=0">🐱 Nyan Cat</option>
            <option value="https://www.youtube.com/embed/wGrbkkAl3hY?autoplay=1&mute=1&controls=0">🎸 Bones?</option>
            <option value="https://www.youtube.com/embed/YE7VzlLtp-4?autoplay=1&mute=1&controls=0">📺 Big Buck Bunny</option>
            <option value="custom">✏️ custom URL…</option>
          </select>
          <input class="ci" id="cp-nuke-url" placeholder="embed URL…" style="display:none;flex:1;min-width:0;"/>
          <button class="cbtn r" id="cp-nuke-all">💥 nuke all</button>
          <button class="cbtn" id="cp-unnuke-all" style="font-size:.72rem;">✕ un-nuke all</button>
        </div>
        <div id="cp-ping-stat" style="font-size:.7rem;color:#444;margin-top:6px;display:none;"></div>
      </div>
      <div id="cp-viewer">
        <video id="cp-vc" autoplay muted playsinline style="display:block;width:100%;background:#000;cursor:crosshair;"></video>
        <canvas id="cp-vc-off" style="display:none;"></canvas>
        <div id="cp-vctrl">
          <label style="font-size:.73rem;display:flex;align-items:center;gap:5px;flex-shrink:0;">
            <input type="checkbox" id="cp-showcur"/> cursor
          </label>
          <input class="ci" id="cp-msginp" placeholder="type message, press Enter to send"/>
          <button class="cbtn" id="cp-send">send</button>
          <button class="cbtn r" id="cp-stopview">stop</button>
        </div>
      </div>
    </div>
    <div class="cs" id="cs-identity">
      <div class="cb">
        <h3>Display Name</h3>
        <p style="font-size:.74rem;color:#444;margin:0 0 10px;">shown in chat as your identity</p>
        <div class="crow">
          <input class="ci" id="ca-name" placeholder="Admin" style="width:160px"/>
          <button class="cbtn g" id="ca-save-name">save</button>
        </div>
        <div id="ca-name-ok" style="display:none;font-size:.72rem;color:#44ff77;margin-top:6px;">saved.</div>
      </div>
      <div class="cb">
        <h3>Chat / Cursor Color</h3>
        <p style="font-size:.74rem;color:#444;margin:0 0 10px;">your name appears in this color in chat, and sets your cursor color for clients</p>
        <div class="crow" style="align-items:center;">
          <input type="color" id="ca-color" value="#c9a84c" style="width:40px;height:34px;border:1px solid #333;background:#0d0d0d;cursor:pointer;border-radius:5px;padding:2px;"/>
          <button class="cbtn g" id="ca-save-color">save</button>
          <button class="cbtn" id="ca-reset-color" style="font-size:.72rem;">reset to gold</button>
        </div>
        <div id="ca-color-ok" style="display:none;font-size:.72rem;color:#44ff77;margin-top:6px;">saved.</div>
      </div>
    </div>
    <div class="cs" id="cs-info">
      <div class="cb">
        <h3>System</h3>
        <p style="font-size:.82rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          hub peer: <code id="cp-pid" style="color:#777;">connecting…</code>
          <button id="cp-reconnect" class="cbtn" style="font-size:.7rem;padding:2px 10px;margin:0;">↺ reconnect</button>
        </p>
        <p style="font-size:.82rem;">registry: <code id="cp-reg-id" style="color:#555;font-size:.72rem;word-break:break-all;"></code></p>
        <p style="font-size:.82rem;color:#444;">admin code: ← → ← → ↑ ↓ A B, then passcode</p>
      </div>
      <div class="cb">
        <h3>Keys</h3>
        <p style="font-size:.78rem;color:#555;margin:0 0 6px;">keys are single-use. admin must be online to activate. users reconnect automatically via device ID after first use.</p>
        <p style="font-size:.78rem;color:#555;margin:0;">key expiry is set at creation and counts from creation date, not first use.</p>
      </div>
      <div class="cb">
        <h3>Screen Viewer</h3>
        <p style="font-size:.78rem;color:#555;margin:0 0 6px;">client is prompted to share their screen via browser's native screen share dialog. 720p @ 30fps. falls back to page-only capture if declined.</p>
        <p style="font-size:.78rem;color:#555;margin:0;">cursor overlay uses your chat/cursor color. messages appear near cursor with a dissolve animation.</p>
      </div>
      <div class="cb">
        <h3>Proxy</h3>
        <p style="font-size:.78rem;color:#555;margin:0 0 6px;">proxy uses BRC (bumblcat rrc) — libcurl WASM + scramjet. local wisp at <code style="color:#666">ws://localhost:3001/</code> routes through residential IP.</p>
        <p style="font-size:.78rem;color:#555;margin:0 0 6px;">fallback chain: BRC → photon (CF worker) → UV (ultraviolet SW) → epoxy.</p>
        <p style="font-size:.78rem;color:#555;margin:0;">origin/referer headers are rewritten to match the proxied site — Cloudflare and Google detection bypassed.</p>
      </div>
    </div>
  </div>
</div>`;
    document.body.appendChild(panelEl);

    panelEl.querySelectorAll('.cn[data-s]').forEach(b => b.onclick = () => {
      panelEl.querySelectorAll('.cn').forEach(x => x.classList.remove('on'));
      panelEl.querySelectorAll('.cs').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById('cs-' + b.dataset.s)?.classList.add('on');
    });

    panelEl.querySelector('#cp-close').onclick     = () => panelEl.style.display = 'none';
    panelEl.querySelector('#cp-logout').onclick    = doLogout;
    panelEl.querySelector('#cp-reconnect').onclick = reconnectHub;
    // Registry ID is static — show it immediately
    var elRegId = panelEl.querySelector('#cp-reg-id');
    if (elRegId) elRegId.textContent = REGISTRY_ID;
    panelEl.querySelector('#ck-make').onclick   = doMakeKey;
    panelEl.querySelector('#ck-copy').onclick   = () =>
      navigator.clipboard?.writeText(document.getElementById('ck-val').textContent).catch(() => {});

    const vc = panelEl.querySelector('#cp-vc');
    let _curRafPending = false;
    vc.addEventListener('mousemove', e => {
      const r = vc.getBoundingClientRect();
      admCX = (e.clientX - r.left) / r.width  * 100;
      admCY = (e.clientY - r.top)  / r.height * 100;
      // rAF gate: only send one cursor update per animation frame (~60fps).
      // Raw mousemove fires 200–500×/sec; flooding the peer causes the CSS
      // transition to restart on every event and makes movement jittery.
      if (_curRafPending) return;
      _curRafPending = true;
      requestAnimationFrame(() => {
        _curRafPending = false;
        if (panelEl.querySelector('#cp-showcur')?.checked !== false) {
          sendTarget({ type: 'cursor', x: admCX, y: admCY });
        }
      });
    });

    // Click-through: clicking the viewer sends a click event to the client
    vc.addEventListener('click', e => {
      const r  = vc.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width  * 100;
      const cy = (e.clientY - r.top)  / r.height * 100;
      sendTarget({ type: 'click', x: cx, y: cy });
    });

    // Cursor visibility toggle
    panelEl.querySelector('#cp-showcur').addEventListener('change', e => {
      if (!e.target.checked) {
        sendTarget({ type: 'hide-cursor' });
      } else {
        // Re-enable: send current position so cursor reappears immediately
        sendTarget({ type: 'cursor', x: admCX, y: admCY });
      }
    });

    panelEl.querySelector('#cp-stopview').onclick = stopView;
    panelEl.querySelector('#cp-send').onclick     = doSendMsg;
    panelEl.querySelector('#cp-msginp').addEventListener('keydown', e => {
      if (e.key === 'Enter') doSendMsg();
    });

    renderKeys();
    panelEl.querySelector('#ck-export').onclick = doExportKeys;
    panelEl.querySelector('#ck-import').onclick = doImportKeys;

    // ── identity panel ──
    const caName = panelEl.querySelector('#ca-name');
    const caColor = panelEl.querySelector('#ca-color');
    const adId = getAdminId();
    if (caName) caName.value = adId.name || '';
    if (caColor) caColor.value = adId.color || '#c9a84c';
    panelEl.querySelector('#ca-save-name').onclick = () => {
      const n = caName.value.trim() || 'Admin';
      const o = getAdminId(); o.name = n; saveAdminId(o);
      const ok = document.getElementById('ca-name-ok');
      if (ok) { ok.style.display = 'block'; setTimeout(() => ok.style.display = 'none', 2000); }
    };
    panelEl.querySelector('#ca-save-color').onclick = () => {
      const o = getAdminId(); o.color = caColor.value; saveAdminId(o);
      const ok = document.getElementById('ca-color-ok');
      if (ok) { ok.style.display = 'block'; setTimeout(() => ok.style.display = 'none', 2000); }
    };
    panelEl.querySelector('#ca-reset-color').onclick = () => {
      caColor.value = '#c9a84c';
      const o = getAdminId(); o.color = '#c9a84c'; saveAdminId(o);
    };

    // ── Enter shortcut: focus message input when viewing a client ──
    panelEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (document.activeElement && document.activeElement.matches('input,textarea,select,[contenteditable]')) return;
      if (!document.getElementById('cs-clients')?.classList.contains('on')) return;
      if (!viewTarget) return;
      const msgInp = document.getElementById('cp-msginp');
      if (msgInp) { e.preventDefault(); msgInp.focus(); }
    });

    // ── Sync hub status if hub was already online when panel opened ──
    // (init() starts the hub before panel exists; _markOnline would have
    //  found null elements then, so we back-fill it now.)
    if (hub && !hub.destroyed) {
      var _h0 = document.getElementById('cp-hub');
      var _p0 = document.getElementById('cp-pid');
      if (_h0) { _h0.textContent = 'hub online'; _h0.className = 'on'; }
      if (_p0 && _hubOnlinePid) _p0.textContent = _hubOnlinePid;
    }

    // ── global actions ──
    const annSel = panelEl.querySelector('#cp-nuke-sel');
    const annUrl = panelEl.querySelector('#cp-nuke-url');
    if (annSel) annSel.addEventListener('change', () => {
      if (annUrl) annUrl.style.display = annSel.value === 'custom' ? 'block' : 'none';
    });
    panelEl.querySelector('#cp-ann-all').onclick = () => {
      const txt = panelEl.querySelector('#cp-ann-txt')?.value?.trim();
      if (!txt) return;
      bcast({ type: 'announce', text: txt });
      showToast(`Announced to ${Object.keys(clients).filter(id => !clients[id].isAdminPeer).length} client(s)`);
      panelEl.querySelector('#cp-ann-txt').value = '';
    };
    panelEl.querySelector('#cp-nuke-all').onclick = () => {
      const src = annSel?.value === 'custom' ? (annUrl?.value?.trim() || '') : (annSel?.value || '');
      if (!src) return;
      bcast({ type: 'nuke', src });
      showToast('Nuked all clients 💥');
    };
    panelEl.querySelector('#cp-unnuke-all').onclick = () => {
      bcast({ type: 'unnuke' });
      showToast('Un-nuked all clients');
    };
  }

  function reconnectHub() {
    var btn = document.getElementById('cp-reconnect');
    if (btn) { btn.disabled = true; btn.textContent = '↺ reconnecting…'; }
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    if (_hubMgr) { _hubMgr.destroy(); _hubMgr = null; }
    hub = null;
    var elHub = document.getElementById('cp-hub');
    if (elHub) { elHub.textContent = 'hub offline'; elHub.className = ''; }
    var elPid = document.getElementById('cp-pid');
    if (elPid) elPid.textContent = 'reconnecting…';
    window.notify && window.notify('Hub connection reset — reconnecting…', 'info', 5000);
    setTimeout(function () {
      startHub();
      if (btn) { btn.disabled = false; btn.textContent = '↺ reconnect'; }
    }, 600);
  }

  function doLogout() {
    isAdmin = false;
    localStorage.removeItem('cst-admin');
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    if (_hubMgr) { _hubMgr.destroy(); _hubMgr = null; }
    hub = null;
    panelEl?.remove(); panelEl = null;
  }

  // ─── key manager ─────────────────────────────────────────────
  function loadKeys() { try { return JSON.parse(localStorage.getItem('cst-keys') || '[]'); } catch { return []; } }
  function saveKeys(k) { localStorage.setItem('cst-keys', JSON.stringify(k)); }

  function doMakeKey() {
    const name = document.getElementById('ck-name').value.trim() || 'user';
    const days = Math.max(1, parseInt(document.getElementById('ck-days').value) || 7);
    const key  = makeKey(name, days);
    const uid  = makeUID();
    const ks   = loadKeys();
    ks.push({ key, name, days, created: Date.now(), used: false, usedBy: null,
              uid, expires: Date.now() + days * 86400000, deviceId: null, badges: [] });
    saveKeys(ks);
    document.getElementById('ck-new').style.display  = 'block';
    document.getElementById('ck-val').textContent    = key;
    document.getElementById('ck-wait').style.display = 'inline';
    renderKeys();
  }

  function renderKeys() {
    const list = document.getElementById('ck-list');
    const cnt  = document.getElementById('ck-cnt');
    if (!list) return;
    const ks = loadKeys();
    if (cnt) cnt.textContent = `(${ks.length})`;
    if (!ks.length) { list.innerHTML = '<p style="color:#333;font-size:.8rem;">no keys yet.</p>'; return; }
    list.innerHTML = ks.slice().reverse().map((k, ri) => {
      const i      = ks.length - 1 - ri;
      const expTs  = k.expires || (k.created + (k.days || 7) * 86400000);
      const dLeft  = Math.ceil((expTs - Date.now()) / 86400000);
      const exp    = dLeft <= 0;
      const cls    = exp ? 'ke' : (k.used ? 'ka' : 'kw');
      const lbl    = exp ? 'expired' : (k.used ? 'active' : 'pending');
      const meta   = [
        `exp ${exp ? 'expired' : _fmtDate(expTs)}`,
        k.used && k.usedBy ? k.usedBy : null,
        k.uid        ? '· ' + k.uid.slice(-6)       : null,
        k.deviceId   ? '· dev …' + k.deviceId.slice(-6) : null,
      ].filter(Boolean).join('  ');
      return `<div class="ck">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:.8rem;color:#aaa;font-weight:600;">${_adminEsc(k.name)}</span>
            <span class="kb ${cls}">${lbl}</span>
            ${!exp ? `<span style="font-size:.68rem;color:#2a2a2a;">${dLeft}d left</span>` : ''}
          </div>
          <div class="ck-code">${k.key}</div>
          <div style="font-size:.67rem;color:#2a2a2a;margin-top:3px;">${meta}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;padding-left:8px;">
          <button onclick="__cstCopyKey(${i})" class="cbtn" style="font-size:.67rem;padding:2px 8px;">copy</button>
          ${!exp ? `<button onclick="__cstExtendKey(${i})" class="cbtn" style="font-size:.67rem;padding:2px 8px;">±days</button>` : ''}
          ${exp
            ? `<button onclick="__cstDeleteKey(${i})" style="background:none;border:none;color:#663333;cursor:pointer;font-size:.68rem;padding:0;margin-top:2px;">× remove</button>`
            : `<button onclick="__cstRevoke(${i})" style="background:none;border:none;color:#2a2a2a;cursor:pointer;font-size:.66rem;padding:0;margin-top:2px;">revoke</button>`
          }
        </div>
      </div>`;
    }).join('');
  }

  window.__cstRevoke = i => {
    const ks = loadKeys(); ks.splice(i, 1); saveKeys(ks); renderKeys();
    broadcastKeysToPartner();
  };

  window.__cstDeleteKey = i => {
    const ks = loadKeys(); ks.splice(i, 1); saveKeys(ks); renderKeys();
  };

  window.__cstCopyKey = i => {
    const ks = loadKeys(); const k = ks[i];
    if (!k) return;
    navigator.clipboard?.writeText(k.key).then(() => showToast('Key copied')).catch(() => {});
  };

  window.__cstExtendKey = i => {
    const ks = loadKeys(); const k = ks[i];
    if (!k) return;
    const expTs  = k.expires || Date.now();
    const dLeft  = Math.ceil((expTs - Date.now()) / 86400000);
    const d = parseInt(prompt(
      `Adjust days for "${k.name}" (${dLeft}d remaining).\n` +
      `Positive = extend, negative = shorten:`, '7'));
    if (!d || isNaN(d)) return;   // 0 or cancel → abort
    const newExpires = expTs + d * 86400000;
    if (newExpires <= Date.now()) {
      if (!confirm(`This will expire "${k.name}" immediately. Continue?`)) return;
    }
    ks[i].expires = newExpires;
    ks[i].days    = (ks[i].days || 0) + d;
    saveKeys(ks); renderKeys(); broadcastKeysToPartner();
    // Push updated expiry to client if they're currently online
    if (k.uid) {
      const cid = Object.keys(clients).find(id => clients[id].uid === k.uid);
      if (cid) sendTo(cid, { type: 'key-extended', expires: ks[i].expires });
    }
    // If client is offline the change is already in localStorage — auto-sync
    // will push it the next time they reconnect and both parties are online.
    const verb = d > 0 ? `+${d}d` : `${d}d`;
    showToast(`${k.name}: ${verb} → ${_fmtDate(ks[i].expires)}`);
  };

  function _adminEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _fmtDate(ts) {
    const d = new Date(ts);
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mo[d.getMonth()] + ' ' + d.getDate() + ' ' + d.getFullYear();
  }

  window.__cstAuthorize = id => {
    const c = clients[id];
    if (!c) return;
    document.getElementById('cst-auth-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'cst-auth-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,.75);' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
    modal.innerHTML = `
      <div style="background:#0d0d0d;border:1px solid #282828;border-radius:12px;padding:22px;min-width:290px;max-width:340px;">
        <div style="font-size:.82rem;color:#555;margin-bottom:4px;">authorizing client</div>
        <div style="font-size:.92rem;color:#aaa;margin-bottom:16px;font-weight:600;">${_adminEsc(c.name)}</div>
        <label style="font-size:.74rem;color:#444;display:block;margin-bottom:4px;">display name</label>
        <input id="cst-auth-name" value="${_adminEsc(c.name || '')}" placeholder="name"
          style="width:100%;background:#111;border:1px solid #222;border-radius:6px;color:#ccc;
          padding:7px 10px;font-size:.8rem;margin-bottom:10px;box-sizing:border-box;outline:none;" />
        <label style="font-size:.74rem;color:#444;display:block;margin-bottom:4px;">access duration (days)</label>
        <input id="cst-auth-days" type="number" value="7" min="1"
          style="width:100%;background:#111;border:1px solid #222;border-radius:6px;color:#ccc;
          padding:7px 10px;font-size:.8rem;margin-bottom:16px;box-sizing:border-box;outline:none;" />
        <div style="display:flex;gap:8px;">
          <button id="cst-auth-go" style="flex:1;background:#0d1f0d;border:1px solid #1e4a1e;border-radius:6px;
            color:#44ff77;padding:9px;cursor:pointer;font-size:.8rem;font-weight:600;">✓ authorize</button>
          <button id="cst-auth-cancel" style="background:none;border:1px solid #222;border-radius:6px;
            color:#444;padding:9px 14px;cursor:pointer;font-size:.8rem;">cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cst-auth-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#cst-auth-go').onclick = () => {
      const name    = modal.querySelector('#cst-auth-name').value.trim() || c.name || 'user';
      const days    = Math.max(1, parseInt(modal.querySelector('#cst-auth-days').value) || 7);
      const now     = Date.now();
      const expires = now + days * 86400000;
      const uid     = c.uid || makeUID();
      const key     = makeKey(name, days);
      const ks      = loadKeys();
      ks.push({ key, name, days, created: now, used: true, usedBy: name,
                uid, expires, deviceId: c.deviceId || null, badges: [] });
      saveKeys(ks);
      sendTo(id, { type: 'key-approved', name, expires, created: now, uid, badges: [], autoLoaded: false });
      c.approved = true; c.name = name;
      modal.remove();
      renderClients(); renderKeys();
      showToast(`Authorized: ${name}`);
      broadcastKeysToPartner();
    };
    // Focus name field
    setTimeout(() => modal.querySelector('#cst-auth-name').focus(), 50);
  };

  // ─── key export / import ─────────────────────────────────────
  function doExportKeys() {
    const ks   = loadKeys();
    const blob = new Blob([JSON.stringify(ks, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'celestial-keys-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${ks.length} key(s)`);
  }

  function doImportKeys() {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (!Array.isArray(imported)) { showToast('Invalid key file'); return; }
          mergeAdminKeys(imported);
          showToast(`Imported ${imported.length} key(s)`);
        } catch { showToast('Failed to parse key file'); }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  // ─── hub (admin WebRTC) ──────────────────────────────────────
  // PeerMgr handles all reconnect / fallback logic automatically.
  function startHub() {
    if (_hubMgr) return;
    loadPeerJS(function () {
      _hubMgr = PeerMgr.connect(undefined, {  // random ID — no stale-lock possible

        onOpen: function (peer, pid) {
          hub = peer;

          // ── UI ───────────────────────────────────────────────
          // Always do live DOM lookup — the panel may not exist yet when
          // startHub() first fires (admin hasn't opened panel via Konami).
          function _markOnline(id) {
            _hubOnlinePid = id;
            var _h = document.getElementById('cp-hub');
            var _p = document.getElementById('cp-pid');
            if (_h) { _h.textContent = 'hub online'; _h.className = 'on'; }
            if (_p && id) _p.textContent = id;
          }
          _markOnline(pid);

          // Show "reconnecting…" when signaling WS drops, then online again
          // when peer.reconnect() re-establishes it.
          peer.on('disconnected', function () {
            if (peer !== hub) return;
            var _h = document.getElementById('cp-hub');
            if (_h) { _h.textContent = 'hub reconnecting…'; _h.className = ''; }
          });
          peer.on('open', function (id) {
            if (peer === hub) _markOnline(id);
          });

          // ── Heartbeat ─────────────────────────────────────────
          if (_heartbeatTimer) clearInterval(_heartbeatTimer);
          _heartbeatTimer = setInterval(function () {
            // Real site-wide online count: all beacon clients + 1 for admin.
            // Sent to every client so the chat widget can show the true total
            // instead of just the chat-mesh subset.
            var realCount = 1 + Object.keys(clients).filter(function (id) {
              return !clients[id].isAdminPeer;
            }).length;
            bcast({ type: 'admin-pulse', viewing: viewTarget !== null, onlineCount: realCount });
          }, 1000);

          // ── Expose hub to chat.js ─────────────────────────────
          window.__cstHubPeer   = hub;
          window.__cstHubPeerId = pid;
          window.dispatchEvent(new CustomEvent('cst-hub-ready'));

          // ── Route incoming connections ─────────────────────────
          // First message determines type: mesh-hello → chat, else → control.
          peer.on('connection', function (conn) {
            conn.on('open', function () {
              conn.once('data', function (d) {
                if (d && d.type === 'mesh-hello') {
                  window.__cstChatIncoming && window.__cstChatIncoming(conn, d);
                } else {
                  var cid = conn.peer;
                  clients[cid] = { conn: conn, vp: null, url: '—', name: cid.slice(-6), approved: false };
                  conn.on('data',  function (d2) { onClientData(cid, d2); });
                  conn.on('close', function () { delete clients[cid]; renderClients(); if (viewTarget === cid) stopView(); });
                  renderClients();
                  if (d) onClientData(cid, d);
                }
              });
            });
          });
        },

        onUnavailable: function () {
          // Random IDs should never produce unavailable-id, but handle defensively.
          _hubMgr = null; hub = null;
          setTimeout(function () { if (!_hubMgr) startHub(); }, 1000);
        },

      }); // end PeerMgr.connect
    }); // end loadPeerJS
  }

  function onClientData(cid, d) {
    if (!d || typeof d !== 'object') return;
    const c = clients[cid];
    if (!c) return;

    if (d.type === 'admin-hello') {
      if (d.sec !== SEC) { try { c.conn.close(); } catch {} delete clients[cid]; return; }
      c.isAdminPeer = true;
      mergeAdminKeys(d.keys || []);
      sendTo(cid, { type: 'admin-keys', keys: loadKeys() });
      return;
    }

    if (d.type === 'admin-key-update') {
      if (c.isAdminPeer) mergeAdminKeys(d.keys || []);
      return;
    }

    if (d.type === 'hello') {
      c.vp         = d.vp;
      c.url        = d.url        || '—';
      c.name       = d.name       || cid.slice(-6);
      c.approved   = d.approved   || false;
      c.uid        = d.uid        || null;
      c.deviceId   = d.deviceId   || null;
      c.keyExpires = d.keyExpires || null;  // client's locally-stored expiry

      // Auto-sync: reconnecting user with uid or deviceId matching a valid key.
      // Also fires for already-approved users if admin changed their expiry while
      // they were offline (expiryChanged guard ensures we don't spam them).
      if (d.uid || d.deviceId) {
        const ks    = loadKeys();
        const match = ks.find(k =>
          k.used && Date.now() < (k.expires || 0) &&
          ((d.uid && k.uid === d.uid) || (d.deviceId && k.deviceId === d.deviceId))
        );
        if (match) {
          const expiryChanged = c.keyExpires != null &&
            Math.abs((match.expires || 0) - c.keyExpires) > 60000; // >1 min diff
          if (!c.approved) {
            // Full reconnect-sync (first hello after new session)
            c.name = match.usedBy || match.name;
            c.approved = true;
            sendTo(cid, {
              type: 'key-approved', name: c.name, expires: match.expires,
              created: match.created, uid: match.uid, badges: match.badges || [],
              autoLoaded: true,
            });
            showToast(`${c.name} — auto-synced`);
          } else if (expiryChanged) {
            // Already approved but admin changed expiry while they were offline
            sendTo(cid, { type: 'key-extended', expires: match.expires });
            showToast(`${c.name} — expiry synced`);
          }
        }
      }
      renderClients();
    }

    // Single-use key registration — admin must be online (we are, since this runs on admin side)
    if (d.type === 'register-key') {
      const kv = checkKey(d.key);
      if (!kv) {
        sendTo(cid, { type: 'key-rejected', reason: 'invalid' });
        return;
      }
      const ks  = loadKeys();
      const idx = ks.findIndex(k => k.key === d.key);
      if (idx < 0) {
        sendTo(cid, { type: 'key-rejected', reason: 'unknown' });
        return;
      }
      if (ks[idx].used) {
        sendTo(cid, { type: 'key-rejected', reason: 'used' });
        return;
      }
      // Approve — mark single-use immediately
      const isFirstUser = ks.filter(k => k.used).length === 0;
      ks[idx].used     = true;
      ks[idx].usedBy   = kv.name;
      ks[idx].deviceId = d.deviceId || null;
      if (!ks[idx].uid)     ks[idx].uid     = makeUID();
      if (!ks[idx].expires) ks[idx].expires = kv.expires;
      if (!ks[idx].badges)  ks[idx].badges  = [];
      if (isFirstUser && !ks[idx].badges.includes('first-user')) ks[idx].badges.push('first-user');
      saveKeys(ks);
      c.name     = kv.name;
      c.approved = true;
      sendTo(cid, {
        type:        'key-approved',
        name:        kv.name,
        expires:     ks[idx].expires,
        created:     ks[idx].created,
        uid:         ks[idx].uid,
        badges:      ks[idx].badges,
        isFirstUser,
      });
      broadcastKeysToPartner();
      // Notify admin that a key was just activated
      window.notify && window.notify('🔑 Key activated: ' + kv.name, 'success', 6000);
      showToast('Key activated: ' + kv.name);
      const ckWait = document.getElementById('ck-wait');
      if (ckWait) { ckWait.style.display = 'inline'; ckWait.style.color = '#44ff77'; ckWait.textContent = '✓ activated by ' + kv.name; }
      renderKeys();
      renderClients();
    }

    if (d.type === 'frame') {
      // Forward to any admin peers also watching this client
      Object.keys(clients).filter(id => clients[id].isAdminPeer && clients[id].watchingCid === cid)
        .forEach(id => sendTo(id, d));
      if (viewTarget !== cid) return;
      const off = document.getElementById('cp-vc-off');
      if (!off) return;
      const img = new Image();
      img.onload = () => {
        // Size canvas ONCE on first frame — never resize (resize clears canvas = flicker)
        if (!off._cstInit) {
          off._cstInit = true;
          off.width  = img.naturalWidth  || 1280;
          off.height = img.naturalHeight || 720;
        }
        off.getContext('2d').drawImage(img, 0, 0, off.width, off.height);
        const vid = document.getElementById('cp-vc');
        if (vid && !vid.srcObject) {
          try {
            viewStream = off.captureStream(30);
            vid.srcObject = viewStream;
            vid.play().catch(() => {});
          } catch(e) {}
        }
      };
      img.src = d.data;
    }
    if (d.type === 'pong' && viewTarget === cid) {
      const lat = Date.now() - (d.pingTs || 0);
      const el = document.getElementById('cp-ping-stat');
      if (el) { el.textContent = lat + 'ms'; el.style.color = lat < 200 ? '#44ff77' : lat < 500 ? '#ffaa44' : '#ff5555'; }
    }
    if (d.type === 'admin-watch') {
      // Secondary admin wants to watch a client's stream
      if (clients[cid]?.isAdminPeer) clients[cid].watchingCid = d.cid || null;
    }
  }

  function renderClients() {
    const list = document.getElementById('cp-clist');
    if (!list) return;
    const ids = Object.keys(clients).filter(id => !clients[id].isAdminPeer);
    var cntEl = document.getElementById('cp-online-cnt');
    if (!ids.length) {
      list.innerHTML = '<p style="color:#333;font-size:.82rem;">no clients connected.</p>';
      if (cntEl) cntEl.style.display = 'none';
      return;
    }
    if (cntEl) {
      cntEl.textContent = ids.length + ' client' + (ids.length === 1 ? '' : 's') + ' online';
      cntEl.style.display = '';
    }
    list.innerHTML = ids.map(id => {
      const c      = clients[id];
      const online = c.conn && c.conn.open;
      const dot    = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;` +
                     `background:${online ? '#44ff77' : '#ff5555'};margin-right:5px;flex-shrink:0;` +
                     `box-shadow:0 0 4px ${online ? 'rgba(68,255,119,.6)' : 'rgba(255,85,85,.4)'};"></span>`;
      const vp     = c.vp ? `${c.vp.w}×${c.vp.h}` : '?×?';
      const status = online ? 'online' : 'offline';
      return `<div class="ccl${viewTarget === id ? ' sel' : ''}">
        <div class="ccl-info" onclick="__cstView('${id}')">
          <div class="cn2" style="display:flex;align-items:center;">${dot}${c.name}${c.approved ? '' : ' <span style="color:#ffaa44;font-size:.7rem;margin-left:4px;">(pending)</span>'}</div>
          <div class="cm" style="margin-left:12px;">${status} · ${vp} · ${c.url}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
          ${!c.approved ? `<button class="cbtn" onclick="__cstAuthorize('${id}')" title="authorize this client" style="padding:5px 8px;font-size:.72rem;color:#44ff77;border-color:#1e4a1e;">authorize</button>` : ''}
          <button class="cbtn" onclick="__cstAnn1('${id}')" title="announce to this user" style="padding:5px 8px;font-size:.72rem;">📢</button>
          <button class="cbtn r" onclick="__cstNuke1('${id}')" title="nuke this client" style="padding:5px 8px;font-size:.72rem;">💥</button>
          <button class="cbtn r" onclick="__cstRemove('${id}')" style="flex-shrink:0;">remove</button>
        </div>
      </div>`;
    }).join('');
  }

  let _viewPingTimer = null;
  window.__cstView = id => {
    if (viewTarget && viewTarget !== id) stopView();
    viewTarget = id;
    // Reset offscreen canvas init flag so it re-sizes on first frame from new client
    const off = document.getElementById('cp-vc-off');
    if (off) { off._cstInit = false; }
    const v = document.getElementById('cp-viewer');
    if (v) v.style.display = 'block';
    sendTarget({ type: 'start-cap', cursorColor: getAdminColor() });
    // Ping check — verify client is still alive
    const ps = document.getElementById('cp-ping-stat');
    if (ps) { ps.style.display = 'block'; ps.textContent = 'pinging…'; ps.style.color = '#444'; }
    sendTarget({ type: 'ping', ts: Date.now() });
    if (_viewPingTimer) clearInterval(_viewPingTimer);
    _viewPingTimer = setInterval(() => {
      if (!viewTarget) { clearInterval(_viewPingTimer); _viewPingTimer = null; return; }
      sendTarget({ type: 'ping', ts: Date.now() });
    }, 5000);
    renderClients();
  };

  window.__cstRemove = id => {
    sendTo(id, { type: 'revoke' });
    if (clients[id]?.conn) try { clients[id].conn.close(); } catch {}
    delete clients[id];
    renderClients();
    if (viewTarget === id) stopView();
  };

  window.__cstAnn1 = id => {
    const txt = document.getElementById('cp-ann-txt')?.value?.trim()
      || prompt('Announcement text for ' + (clients[id]?.name || id) + ':');
    if (!txt) return;
    sendTo(id, { type: 'announce', text: txt });
    showToast(`Announced to ${clients[id]?.name || id}`);
  };
  window.__cstNuke1 = id => {
    const sel = document.getElementById('cp-nuke-sel');
    const urlEl = document.getElementById('cp-nuke-url');
    const src = sel?.value === 'custom' ? (urlEl?.value?.trim() || '') : (sel?.value || 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0');
    sendTo(id, { type: 'nuke', src });
    showToast(`Nuked ${clients[id]?.name || id} 💥`);
  };

  function stopView() {
    if (viewTarget) sendTarget({ type: 'stop-cap' });
    viewTarget = null;
    if (_viewPingTimer) { clearInterval(_viewPingTimer); _viewPingTimer = null; }
    const v = document.getElementById('cp-viewer');
    if (v) v.style.display = 'none';
    const vid = document.getElementById('cp-vc');
    if (vid) { vid.srcObject = null; }
    if (viewStream) { try { viewStream.getTracks().forEach(t => t.stop()); } catch {} viewStream = null; }
    const off = document.getElementById('cp-vc-off');
    if (off) off._cstInit = false;
    const ps = document.getElementById('cp-ping-stat');
    if (ps) ps.style.display = 'none';
    renderClients();
  }

  function sendTo(id, msg) {
    if (!clients[id]) return;
    try { clients[id].conn.send(msg); } catch {}
  }
  function sendTarget(msg) { if (viewTarget) sendTo(viewTarget, msg); }
  function bcast(msg)      { Object.keys(clients).forEach(id => sendTo(id, msg)); }

  // ─── admin-to-admin key sync ─────────────────────────────────
  function mergeAdminKeys(theirKeys) {
    if (!Array.isArray(theirKeys) || !theirKeys.length) return;
    const ours = loadKeys();
    const idx  = new Map(ours.map((k, i) => [k.key, i]));
    let changed = false;
    for (const k of theirKeys) {
      if (!idx.has(k.key)) {
        ours.push(k); changed = true;
      } else {
        const ex = ours[idx.get(k.key)];
        if (!ex.used && k.used) { ex.used = true; ex.usedBy = k.usedBy; changed = true; }
      }
    }
    if (changed) { saveKeys(ours); renderKeys(); }
  }

  function broadcastKeysToPartner() {
    const keys = loadKeys();
    // As primary: push to backup admin peer in clients map
    Object.keys(clients)
      .filter(id => clients[id].isAdminPeer)
      .forEach(id => sendTo(id, { type: 'admin-key-update', keys }));
    // As backup: push via direct partner connection
    if (partnerConn && partnerConn.open) partnerConn.send({ type: 'admin-key-update', keys });
  }

  function connectToPartnerAdmin(targetId) {
    loadPeerJS(function () {
      var _partnerMgr = PeerMgr.connect(undefined, {
        onOpen: function (tmp) {
          var conn = tmp.connect(targetId, { reliable: true });
          partnerConn = conn;
          conn.on('open', function () { conn.send({ type: 'admin-hello', sec: SEC, keys: loadKeys() }); });
          conn.on('data', function (d) {
            if (!d || typeof d !== 'object') return;
            if (d.type === 'admin-keys' || d.type === 'admin-key-update') mergeAdminKeys(d.keys || []);
          });
          conn.on('close', function () { partnerConn = null; _partnerMgr.destroy(); });
          conn.on('error', function () { partnerConn = null; _partnerMgr.destroy(); });
        },
      });
    });
  }

  function doSendMsg() {
    const inp  = document.getElementById('cp-msginp');
    const text = inp?.value?.trim();
    if (!text || !viewTarget) return;
    sendTarget({ type: 'msg', text, x: admCX, y: admCY });
    inp.value = '';
  }

  // ─── client beacon ───────────────────────────────────────────
  function startBeacon() {
    loadPeerJS(() => {
      // PeerMgr creates the peer with multi-server fallback and handles all
      // reconnect / recreate logic.  We just update cPeer when it gives us one.
      let adminConn   = null;
      let connecting  = false;
      let capturing   = false;
      let capTimer    = null;
      let displayStream = null;
      let srcVid  = null;
      let capCv   = null;
      let capCtx  = null;
      let virCur        = null;
      let msgLayer      = null;
      let lastMsg       = null;
      let stylesDone    = false;
      let cursorColor   = '#ff3232';
      let lastPulse     = 0;
      let _hoverEl      = null;   // element currently highlighted by cursor hover
      let _hoverThrottle = 0;     // last hover-check timestamp (throttle to ~15fps)

      // Intervals are created once; cPeer is updated if the peer is recreated.
      let _tryConnTimer = null;
      let _capWatchdog  = null;

      // Hub discovery via the chat registry.
      // Admin hub uses a RANDOM peer ID each session (no stale-locks).
      // We query the same registry that powers the chat mesh, look for the
      // peer with isAdmin:true, and connect directly to its random ID.
      // On disconnect the cached ID is cleared so the next attempt re-discovers.
      let _adminPeerId  = null;   // admin's current random peer ID (null = unknown)
      let _discovering  = false;  // guard: only one registry query at a time

      function _discoverHub() {
        if (_discovering || !cPeer || !cPeer.open) return;
        _discovering = true;

        const regConn = cPeer.connect(REGISTRY_ID, { reliable: true });
        const t = setTimeout(function () {
          _discovering = false;
          try { regConn.close(); } catch {}
        }, 4000);

        regConn.on('open', function () {
          // Lightweight mesh-join — just enough for the registry to send us
          // the peer list.  We never become registry and never persist here.
          const apprD = getApproval();
          regConn.send({ type: 'mesh-join', id: cPeer.id,
            name: apprD?.name || null, isAdmin: false });
        });

        regConn.on('data', function (d) {
          clearTimeout(t);
          _discovering = false;
          try { regConn.close(); } catch {}
          if (!d || d.type !== 'mesh-peers') return;
          const adm = (d.peers || []).find(function (p) { return p.isAdmin; });
          if (adm) _adminPeerId = adm.id;
          // If no admin found, we'll retry on next tryConnect tick (1 s)
        });

        regConn.on('error',  function () { clearTimeout(t); _discovering = false; });
        regConn.on('close',  function () { clearTimeout(t); _discovering = false; });
      }

      PeerMgr.connect(undefined, {
        onOpen: function (peer) {
          cPeer = peer;
          // If the peer was recreated, any old adminConn is dead — reset.
          if (adminConn && !adminConn.open) { adminConn = null; connecting = false; _adminPeerId = null; }
          // peer-unavailable means the cached admin peer ID is stale (admin reconnected).
          // Clear it so the next tryConnect re-discovers via registry.
          peer.on('error', function (err) {
            if (err.type !== 'peer-unavailable') return;
            _adminPeerId = null;
            connecting   = false;
            adminConn    = null;
          });
          // Start intervals only once (survives peer recreation).
          if (!_tryConnTimer) _tryConnTimer = setInterval(tryConnect, 1000);
          if (!_capWatchdog)  _capWatchdog  = setInterval(function () {
            if (capturing && lastPulse && Date.now() - lastPulse > 3000) { stopCap(); hideCur(); }
          }, 1000);
          tryConnect(); // immediate attempt on open / reopen
        },
      });

      function tryConnect() {
        if (adminConn && adminConn.open) {
          if (window.__cstPendingKey) {
            adminConn.send({ type: 'register-key', key: window.__cstPendingKey });
          }
          return;
        }
        if (connecting) return;

        if (!_adminPeerId) {
          _discoverHub();   // async — sets _adminPeerId, picked up next tick
          return;
        }

        connecting = true;
        try {
          const conn = cPeer.connect(_adminPeerId, { reliable: true });
          adminConn = conn;
          conn.on('open', () => {
            if (adminConn !== conn) { try { conn.close(); } catch {} return; }
            connecting = false;
            const appr = getApproval();
            conn.send({
              type:       'hello',
              vp:         { w: innerWidth, h: innerHeight },
              url:        location.hostname,
              name:       appr?.name    || null,
              approved:   isApproved(),
              uid:        appr?.uid     || null,
              deviceId:   getDeviceId(),
              keyExpires: appr?.expires || null,
            });
            if (window.__cstPendingKey) {
              conn.send({ type: 'register-key', key: window.__cstPendingKey, deviceId: getDeviceId() });
            }
          });
          conn.on('data',  onAdminMsg);
          conn.on('close', () => {
            if (adminConn === conn) {
              adminConn    = null;
              connecting   = false;
              _adminPeerId = null;  // admin reconnected with new random ID — re-discover
              stopCap(); hideCur();
            }
          });
          conn.on('error', () => {
            if (adminConn === conn) { adminConn = null; connecting = false; }
          });
        } catch { connecting = false; }
      }

      window.__cstBeaconRegister = () => {
        if (adminConn && adminConn.open && window.__cstPendingKey) {
          adminConn.send({ type: 'register-key', key: window.__cstPendingKey, deviceId: getDeviceId() });
        } else {
          // Not connected yet — tryConnect will send it once connected
          // But if we can't connect after 5s, call offline
          setTimeout(() => {
            if (window.__cstPendingKey) window.__cstGateOffline?.();
          }, 5000);
        }
      };

      // virtual cursor
      function getCur() {
        if (!virCur) {
          virCur = document.createElement('div');
          virCur.style.cssText = 'position:fixed;z-index:2147483644;pointer-events:none;' +
            'width:22px;height:26px;display:none;transition:left .06s,top .06s;';
          const c = cursorColor || '#ff3232';
          // Derive rgba glow from hex color
          const r = parseInt(c.slice(1,3)||'ff',16), g = parseInt(c.slice(3,5)||'32',16), b = parseInt(c.slice(5,7)||'32',16);
          const glow = `rgba(${r},${g},${b},0.35)`;
          virCur.innerHTML = `<svg width="22" height="26" viewBox="0 0 22 26" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">
  <defs>
    <filter id="cst-cshadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="1.5" dy="1.5" stdDeviation="2" flood-color="rgba(0,0,0,0.55)"/>
    </filter>
    <filter id="cst-cglow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <path filter="url(#cst-cglow)" d="M3.5 2.5 L3.5 20.5 L8 15.5 L11.2 23.5 L14 22.5 L10.8 14.5 L18 14.5 Z"
    fill="${glow}" stroke="none"/>
  <path filter="url(#cst-cshadow)" d="M3.5 2.5 L3.5 20.5 L8 15.5 L11.2 23.5 L14 22.5 L10.8 14.5 L18 14.5 Z"
    fill="${c}" stroke="white" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
          document.body.appendChild(virCur);
        }
        return virCur;
      }
      function showCur(x, y) {
        const c = getCur();
        c.style.display = 'block';
        c.style.left = x + 'vw';
        c.style.top  = y + 'vh';
        // Keep active message bubble anchored below the cursor.
        if (lastMsg && lastMsg.parentNode) {
          lastMsg.style.left = x + 'vw';
          lastMsg.style.top  = Math.min(y + 3.5, 90) + 'vh';
        }
        // Color-based text/input/button hover effect
        _applyHoverEffect(x, y);
      }
      function hideCur() {
        if (virCur) virCur.style.display = 'none';
        // Remove any active hover highlight
        if (_hoverEl) {
          _hoverEl.classList.remove('cst-cur-txt', 'cst-cur-inp', 'cst-cur-btn');
          delete _hoverEl.dataset.cstV;
          _hoverEl = null;
        }
      }

      // Derive one of 6 color variant names from the current cursor color hex.
      function _getVariant() {
        const hex = cursorColor || '#ff3232';
        const r = parseInt(hex.slice(1, 3) || 'ff', 16);
        const g = parseInt(hex.slice(3, 5) || '32', 16);
        const b = parseInt(hex.slice(5, 7) || '32', 16);
        if (g > r * 1.25 && g > b * 1.25 && g > 80)  return 'green';
        if (b > r * 1.25 && b > g * 1.25 && b > 80)  return 'blue';
        if (r > 140 && g > 80  && g < r   && b < 90)  return 'orange';
        if (r > 100 && b > 100 && g < Math.max(r, b) * 0.72) return 'purple';
        if (r > 120 && g < 80) return 'red';
        return 'gold';
      }

      // Apply a color-based text/input/button highlight to whatever element sits
      // under the admin cursor.  Throttled to ~15 fps to stay cheap.
      function _applyHoverEffect(x, y) {
        const now = Date.now();
        if (now - _hoverThrottle < 66) return;
        _hoverThrottle = now;

        const xPx = x / 100 * window.innerWidth;
        const yPx = y / 100 * window.innerHeight;

        // Hide cursor momentarily so hit-test finds what's beneath it.
        const prevDisp = virCur ? virCur.style.display : '';
        if (virCur) virCur.style.display = 'none';
        const el = document.elementFromPoint(xPx, yPx);
        if (virCur) virCur.style.display = prevDisp;

        // Clear the previous highlight if cursor moved to a different element.
        if (_hoverEl && _hoverEl !== el) {
          _hoverEl.classList.remove('cst-cur-txt', 'cst-cur-inp', 'cst-cur-btn');
          delete _hoverEl.dataset.cstV;
          _hoverEl = null;
        }
        if (!el || el === _hoverEl) return;

        const tag = (el.tagName || '').toLowerCase();
        let cls = null;
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
          cls = 'cst-cur-inp';
        } else if (tag === 'button' || el.getAttribute('role') === 'button' || el.getAttribute('type') === 'button') {
          cls = 'cst-cur-btn';
        } else if (['p','span','h1','h2','h3','h4','h5','h6','a','label','li','td','th'].includes(tag)
            && el.textContent.trim().length > 0) {
          cls = 'cst-cur-txt';
        }
        if (!cls) return;

        el.classList.add(cls);
        el.dataset.cstV = _getVariant();
        _hoverEl = el;
      }

      function getLayer() {
        if (!msgLayer) {
          msgLayer = document.createElement('div');
          msgLayer.style.cssText = 'position:fixed;inset:0;z-index:2147483643;pointer-events:none;';
          document.body.appendChild(msgLayer);
        }
        if (!stylesDone) {
          stylesDone = true;
          const st = document.createElement('style');
          st.textContent = `
@keyframes cst-pop{from{transform:translateX(-50%) scale(.55);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
@keyframes cst-fall{to{transform:translateY(110vh) rotate(var(--r));opacity:0}}
@keyframes cst-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
.cst-ch{display:inline-block;animation:cst-fall var(--d) ease-in var(--dl) both;}
/* ── cursor hover text effects (6 color variants) ─────────────── */
.cst-cur-txt{transition:color .18s,text-shadow .18s;}
.cst-cur-txt[data-cst-v="green"]{color:#44ff88!important;text-shadow:0 0 9px #44ff8860!important;}
.cst-cur-txt[data-cst-v="green"]::after{content:'|';color:#44ff88;animation:cst-blink .65s step-start infinite;margin-left:1px;font-weight:300;}
.cst-cur-txt[data-cst-v="orange"]{color:#ffaa44!important;text-shadow:0 0 9px #ffaa4460!important;}
.cst-cur-txt[data-cst-v="blue"]{color:#44aaff!important;text-shadow:0 0 9px #44aaff60!important;}
.cst-cur-txt[data-cst-v="red"]{color:#ff5555!important;text-shadow:0 0 9px #ff555560!important;}
.cst-cur-txt[data-cst-v="purple"]{color:#cc55ff!important;text-shadow:0 0 9px #cc55ff60!important;}
.cst-cur-txt[data-cst-v="gold"]{color:#ffd700!important;text-shadow:0 0 9px #ffd70060!important;}
/* ── cursor hover input effects ─────────────────────────────── */
.cst-cur-inp{transition:border-color .18s,box-shadow .18s;}
.cst-cur-inp[data-cst-v="green"]{border-color:#44ff88!important;box-shadow:0 0 7px #44ff8840!important;}
.cst-cur-inp[data-cst-v="green"]::after{content:'';border-right:2px solid #44ff88;animation:cst-blink .65s step-start infinite;}
.cst-cur-inp[data-cst-v="orange"]{border-color:#ffaa44!important;box-shadow:0 0 7px #ffaa4440!important;}
.cst-cur-inp[data-cst-v="blue"]{border-color:#44aaff!important;box-shadow:0 0 7px #44aaff40!important;}
.cst-cur-inp[data-cst-v="red"]{border-color:#ff5555!important;box-shadow:0 0 7px #ff555540!important;}
.cst-cur-inp[data-cst-v="purple"]{border-color:#cc55ff!important;box-shadow:0 0 7px #cc55ff40!important;}
.cst-cur-inp[data-cst-v="gold"]{border-color:#ffd700!important;box-shadow:0 0 7px #ffd70040!important;}
/* ── cursor hover button effects ────────────────────────────── */
.cst-cur-btn{transition:box-shadow .18s;}
.cst-cur-btn[data-cst-v="green"]{box-shadow:0 0 10px #44ff8870!important;}
.cst-cur-btn[data-cst-v="orange"]{box-shadow:0 0 10px #ffaa4470!important;}
.cst-cur-btn[data-cst-v="blue"]{box-shadow:0 0 10px #44aaff70!important;}
.cst-cur-btn[data-cst-v="red"]{box-shadow:0 0 10px #ff555570!important;}
.cst-cur-btn[data-cst-v="purple"]{box-shadow:0 0 10px #cc55ff70!important;}
.cst-cur-btn[data-cst-v="gold"]{box-shadow:0 0 10px #ffd70070!important;}`;
          document.head.appendChild(st);
        }
        return msgLayer;
      }

      function showMsg(text, xp, yp) {
        if (lastMsg && lastMsg.parentNode) {
          // Dismiss previous bubble quickly if still showing
          breakMsg(lastMsg);
        }
        const el = document.createElement('div');
        // Place bubble just below cursor tip using vw/vh to match cursor units exactly
        const ty = Math.min(yp + 3.5, 90);
        el.style.cssText = `position:absolute;left:${xp}vw;top:${ty}vh;transform:translateX(-50%);
          background:rgba(6,6,6,.92);color:#fff;font-family:system-ui,sans-serif;
          font-size:.84rem;padding:8px 14px;border-radius:7px;border:1px solid rgba(255,50,50,.3);
          max-width:260px;word-break:break-word;animation:cst-pop .22s ease-out;
          transition:left .06s,top .06s;white-space:pre-wrap;`;
        el.textContent = text;
        getLayer().appendChild(el);
        lastMsg = el;
        setTimeout(() => breakMsg(el), 4500);
      }

      function breakMsg(el) {
        if (!el.parentNode) return;
        const txt = el.textContent;
        el.innerHTML = '';
        [...txt].forEach((ch, i) => {
          const sp = document.createElement('span');
          sp.className = 'cst-ch';
          sp.style.cssText = `--r:${(Math.random()*680-340).toFixed(0)}deg;--d:${(.35+Math.random()*.55).toFixed(2)}s;--dl:${i*22}ms;`;
          sp.textContent = ch === ' ' ? ' ' : ch;
          el.appendChild(sp);
        });
        setTimeout(() => { el.remove(); if (lastMsg === el) lastMsg = null; }, 1200);
      }

      function onAdminMsg(d) {
        if (!d || typeof d !== 'object') return;
        if (d.type === 'key-approved') {
          const extra = { created: d.created, uid: d.uid, badges: d.badges, isFirstUser: d.isFirstUser };
          if (d.autoLoaded) {
            // Admin auto-synced — compare old vs new expiry to show a meaningful message
            const prevAppr    = getApproval();
            const prevExpires = prevAppr?.expires || 0;
            const wasLegacy   = !!(prevAppr && !prevAppr?.uid);
            setApproved(d.name, d.expires, extra);
            renderBadgeButton();
            document.getElementById('cst-gate')?.remove();
            // Show delta only when expiry actually changed by more than 1 hr
            if (d.expires && prevExpires && Math.abs(d.expires - prevExpires) > 3600000) {
              const deltaDays = Math.round((d.expires - prevExpires) / 86400000);
              if (deltaDays > 0) {
                const msg = `Your key validity has been extended by ${deltaDays} day${deltaDays !== 1 ? 's' : ''}`;
                showToast(msg); window.notify?.(msg, 'success', 8000);
              } else if (deltaDays < 0) {
                const absDays = Math.abs(deltaDays);
                const msg = `Your key validity has been decreased by ${absDays} day${absDays !== 1 ? 's' : ''}`;
                showToast(msg); window.notify?.(msg, 'warning', 8000);
              }
            } else {
              showToast(wasLegacy ? 'Your key has been updated.' : 'Key automatically loaded.');
            }
          } else {
            window.__cstGateApproved?.(d.name, d.expires, extra);
          }
        }
        if (d.type === 'key-rejected') { window.__cstGateRejected?.(d.reason); }
        if (d.type === 'key-extended') {
          // Admin changed expiry while client was online (or just reconnected)
          const appr2 = getApproval();
          if (appr2 && d.expires) {
            const prevExpires = appr2.expires || 0;
            const deltaDays   = Math.round((d.expires - prevExpires) / 86400000);
            appr2.expires     = d.expires;
            localStorage.setItem('cst-approved', JSON.stringify(appr2));
            renderBadgeButton();
            if (deltaDays > 0) {
              const msg = `Your key validity has been extended by ${deltaDays} day${deltaDays !== 1 ? 's' : ''}`;
              showToast(msg); window.notify?.(msg, 'success', 8000);
            } else if (deltaDays < 0) {
              const absDays = Math.abs(deltaDays);
              const msg = `Your key validity has been decreased by ${absDays} day${absDays !== 1 ? 's' : ''}`;
              showToast(msg); window.notify?.(msg, 'warning', 8000);
            }
          }
        }
        if (d.type === 'revoke')       {
          clearApproval();
          bc?.postMessage('revoked');
          // Show gate again on this page
          if (!document.getElementById('cst-gate')) showGate();
        }
        if (d.type === 'start-cap')   { if (d.cursorColor) { cursorColor = d.cursorColor; if (virCur) { virCur.remove(); virCur = null; } } capturing = true; startCap(); }
        if (d.type === 'stop-cap')    { stopCap(); hideCur(); }
        if (d.type === 'cursor')      { showCur(d.x, d.y); }
        if (d.type === 'hide-cursor') { hideCur(); }
        if (d.type === 'msg')         { showMsg(d.text, d.x||50, d.y||30); }
        if (d.type === 'admin-pulse') {
          lastPulse = Date.now();
          if (!d.viewing && capturing) { stopCap(); hideCur(); }
          // Publish real online count for chat.js to use
          if (typeof d.onlineCount === 'number') {
            window.__cstHubOnline   = d.onlineCount;
            window.__cstHubOnlineTs = Date.now();
            window.dispatchEvent(new CustomEvent('cst-hub-online'));
          }
        }
        if (d.type === 'click') {
          // Admin clicked on the screen viewer — simulate the click at that position
          const xPx = Math.round(d.x / 100 * window.innerWidth);
          const yPx = Math.round(d.y / 100 * window.innerHeight);
          // Temporarily hide cursor so hit-test finds real elements
          const prevD = virCur ? virCur.style.display : '';
          if (virCur) virCur.style.display = 'none';
          const target = document.elementFromPoint(xPx, yPx);
          if (virCur) virCur.style.display = prevD;
          if (target) {
            try { target.click(); } catch {}
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
              try { target.focus(); } catch {}
            }
          }
        }
        if (d.type === 'ping')        { try { adminConn?.send({ type: 'pong', pingTs: d.ts }); } catch {} }
        if (d.type === 'announce')    { window.notify?.(d.text || '', 'info', 10000); }
        if (d.type === 'nuke')        { doNuke(d.src); }
        if (d.type === 'unnuke')      { document.getElementById('cst-nuke-overlay')?.remove(); }
      }

      function startCap() {
        if (capTimer) return;
        let busy = false;
        // Try getDisplayMedia (whole screen, 720p, 30fps)
        if (navigator.mediaDevices?.getDisplayMedia) {
          navigator.mediaDevices.getDisplayMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
          }).then(stream => {
            displayStream = stream;
            srcVid = document.createElement('video');
            srcVid.srcObject = stream;
            srcVid.muted = true;
            srcVid.autoplay = true;
            srcVid.playsInline = true;
            srcVid.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;pointer-events:none;';
            document.body.appendChild(srcVid);
            capCv  = document.createElement('canvas');
            capCtx = capCv.getContext('2d');
            stream.getVideoTracks()[0].addEventListener('ended', stopCap);
          }).catch(() => {
            // getDisplayMedia denied or unsupported — fall back to html2canvas
            displayStream = null;
          });
        }
        capTimer = setInterval(async () => {
          if (!capturing || !adminConn?.open || busy) return;
          busy = true;
          try {
            let data = null;
            if (displayStream && srcVid && srcVid.readyState >= 2) {
              const vw = srcVid.videoWidth, vh = srcVid.videoHeight;
              if (vw && vh) {
                const scale = Math.min(1, 1280/vw, 720/vh);
                capCv.width  = Math.round(vw * scale);
                capCv.height = Math.round(vh * scale);
                capCtx.drawImage(srcVid, 0, 0, capCv.width, capCv.height);
                data = capCv.toDataURL('image/jpeg', 0.65);
              }
            } else if (!displayStream) {
              data = await grab();
            }
            if (data && adminConn?.open) adminConn.send({ type: 'frame', data });
          } finally { busy = false; }
        }, 33);
      }
      function stopCap() {
        capturing = false;
        if (capTimer) { clearInterval(capTimer); capTimer = null; }
        if (displayStream) { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
        if (srcVid) { srcVid.remove(); srcVid = null; }
        capCv = null; capCtx = null;
      }

      async function grab() {
        if (!window.html2canvas) {
          await new Promise(res => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.onload = res; s.onerror = res; document.head.appendChild(s);
          });
        }
        try {
          const c = await html2canvas(document.body, { scale:.4, logging:false, useCORS:false, allowTaint:true });
          return c.toDataURL('image/jpeg', .6);
        } catch { return null; }
      }

      function doNuke(src) {
        document.getElementById('cst-nuke-overlay')?.remove();
        const el = document.createElement('div');
        el.id = 'cst-nuke-overlay';
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;overflow:hidden;';
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;';
        // Set allow BEFORE src so the autoplay permission is active when the
        // iframe first navigates (some browsers require this ordering).
        iframe.allow = 'autoplay; fullscreen; encrypted-media; gyroscope; accelerometer; clipboard-write; picture-in-picture; web-share';
        iframe.setAttribute('allowfullscreen', '');
        el.appendChild(iframe);
        document.body.appendChild(el);
        // Setting src after the iframe is in the DOM lets it start with the
        // correct autoplay context.  For YouTube the &mute=1 param is required
        // for Chrome's autoplay policy; add it automatically if missing.
        var finalSrc = src;
        if (/youtube\.com\/embed/.test(src) && src.indexOf('mute=') === -1) {
          finalSrc = src + (src.indexOf('?') === -1 ? '?' : '&') + 'mute=1';
        }
        iframe.src = finalSrc;
      }
    });
  }

  // ─── PeerJS loader ───────────────────────────────────────────
  // Also ensures peer-mgr.js is present (guards against SW cache serving
  // an old index.html that doesn't have the <script> tag for it yet).
  function loadPeerJS(cb) {
    function _loadPeer() {
      if (window.Peer) { cb(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
      s.onload = cb; s.onerror = function () {};
      document.head.appendChild(s);
    }
    if (window.PeerMgr) { _loadPeer(); return; }
    const s = document.createElement('script');
    s.src = '/assets/js/peer-mgr.js';
    s.onload = _loadPeer; s.onerror = _loadPeer; // try peer.js regardless
    document.head.appendChild(s);
  }

  // ─── init ────────────────────────────────────────────────────
  function init() {
    if (isAdmin) {
      // Admin: panel opens via Konami code (← → ← → ↑ ↓ A B) + passcode
      // No visible button — keep it hidden
      // Unlock secret/hidden themes for admin (picker.js runs before us so option
      // was still disabled when it tried to restore the value — fix it here)
      document.querySelectorAll('#themepicker option[disabled]').forEach(opt => {
        opt.disabled = false;
      });
      const _picker = document.getElementById('themepicker');
      if (_picker) {
        const _saved = localStorage.getItem('theme');
        if (_saved) _picker.value = _saved;
      }
      // Start hub for admin
      startHub();
    } else {
      startBeacon();
      if (isApproved()) {
        renderBadgeButton();
      } else {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showGate);
        else showGate();
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
