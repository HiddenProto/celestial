/* ============================================================
   CELESTIAL ADMIN SYSTEM v2
   Konami: ← → ← → ↑ ↓ A B  →  passcode  →  admin panel
   Keys require admin online to activate. Single-use.
   ============================================================ */
(function () {
  'use strict';

  const SEQ  = ['ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','b'];
  const PASS = 'Hr332941369';
  const HUB  = 'celestial-hub-112456LCD';
  const SEC  = 'Hr332941369';

  let isAdmin    = localStorage.getItem('cst-admin') === '1';
  let buf        = [];

  // ─── sovereign theme (admin-exclusive) ───────────────────────
  function _applySovereignTheme() {
    const cur = document.body.getAttribute('theme');
    if (cur && cur !== 'sovereign') {
      localStorage.setItem('cst-prev-theme', cur);
    }
    localStorage.setItem('theme', 'sovereign');
    document.body.setAttribute('theme', 'sovereign');
    if (!document.querySelector('script[src="/assets/js/sovereign.js"]')) {
      const s = document.createElement('script');
      s.src = '/assets/js/sovereign.js';
      document.body.appendChild(s);
    }
  }

  let hub        = null;
  let cPeer      = null;
  let clients    = {};
  let partnerConn = null;
  let viewTarget = null;
  let admCX = 50, admCY = 50;
  let panelEl    = null;

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
    'first-user': { label: 'First User', icon: '⭐', desc: 'Among the very first users of Celestial.' },
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
    btn.innerHTML = (hasBadges ? '<span style="font-size:.9rem">⭐</span>' : '') +
      `<span>${appr.name || 'user'}</span>`;
    btn.onmouseenter = () => btn.style.background = '#181818';
    btn.onmouseleave = () => btn.style.background = '#0d0d0d';
    btn.onclick = showBadgePanel;
    document.body.appendChild(btn);
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
  function openPanel() {
    if (panelEl) { panelEl.style.display = 'flex'; return; }
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
#cp-vc{display:block;width:100%;background:#000;cursor:crosshair;}
#cp-vctrl{padding:10px;background:#060606;display:flex;gap:8px;align-items:center;}
#cp-vctrl .ci{flex:1;}
</style>
<div id="cp-bar">
  <h2>celestial. admin</h2>
  <span class="cp-badge">ADMIN</span>
  <span id="cp-hub">hub offline</span>
  <button class="cp-x" id="cp-close">✕</button>
</div>
<div id="cp-body">
  <div id="cp-nav">
    <button class="cn on" data-s="keys">Key Manager</button>
    <button class="cn" data-s="clients">View Clients</button>
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
        <h3>Keys <span id="ck-cnt" style="color:#444;font-size:.75rem;font-weight:normal;"></span></h3>
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
      <div id="cp-viewer">
        <canvas id="cp-vc"></canvas>
        <div id="cp-vctrl">
          <label style="font-size:.73rem;display:flex;align-items:center;gap:5px;flex-shrink:0;">
            <input type="checkbox" id="cp-showcur" checked/> cursor
          </label>
          <input class="ci" id="cp-msginp" placeholder="type message, press Enter to send"/>
          <button class="cbtn" id="cp-send">send</button>
          <button class="cbtn r" id="cp-stopview">stop</button>
        </div>
      </div>
    </div>
    <div class="cs" id="cs-info">
      <div class="cb">
        <h3>System</h3>
        <p style="font-size:.82rem;">hub peer ID: <code id="cp-pid" style="color:#777;">connecting…</code></p>
        <p style="font-size:.82rem;">hub channel: <code style="color:#777;">112456LCD</code></p>
        <p style="font-size:.82rem;color:#444;">code: ← → ← → ↑ ↓ A B, then passcode</p>
        <p style="font-size:.82rem;color:#444;">keys are single-use and require admin online to activate.</p>
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

    panelEl.querySelector('#cp-close').onclick  = () => panelEl.style.display = 'none';
    panelEl.querySelector('#cp-logout').onclick = doLogout;
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
  }

  function doLogout() {
    isAdmin = false;
    localStorage.removeItem('cst-admin');
    if (hub) { hub.destroy(); hub = null; }
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
      const i     = ks.length - 1 - ri;
      const dLeft = Math.ceil((k.created + k.days * 86400000 - Date.now()) / 86400000);
      const exp   = dLeft <= 0;
      const cls   = exp ? 'ke' : (k.used ? 'ka' : 'kw');
      const lbl   = exp ? 'expired' : (k.used ? `in use${k.usedBy ? ' ('+k.usedBy+')' : ''}` : 'waiting');
      return `<div class="ck">
        <div style="flex:1;min-width:0;">
          <div style="font-size:.8rem;color:#aaa;margin-bottom:3px;">${k.name}</div>
          <div class="ck-code">${k.key}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <span class="kb ${cls}">${lbl}</span>
          <div style="font-size:.68rem;color:#333;margin-top:3px;">${exp?'exp':dLeft+'d'}</div>
          <button onclick="__cstRevoke(${i})" style="background:none;border:none;color:#2a2a2a;cursor:pointer;font-size:.66rem;margin-top:2px;padding:0;">revoke</button>
        </div>
      </div>`;
    }).join('');
  }

  window.__cstRevoke = i => {
    const ks = loadKeys(); ks.splice(i, 1); saveKeys(ks); renderKeys();
    broadcastKeysToPartner();
  };

  // ─── hub (admin WebRTC) ──────────────────────────────────────
  function startHub() { loadPeerJS(() => tryCreateHub(HUB)); }

  function tryCreateHub(id) {
    hub = new Peer(id, { debug: 0 });
    hub.on('open', pid => {
      const el = document.getElementById('cp-hub');
      if (el) { el.textContent = 'hub online'; el.className = 'on'; }
      const pi = document.getElementById('cp-pid');
      if (pi) pi.textContent = pid;
    });
    hub.on('connection', conn => {
      conn.on('open', () => {
        const cid = conn.peer;
        clients[cid] = { conn, vp: null, url: '—', name: cid.slice(-6), approved: false };
        conn.on('data',  d => onClientData(cid, d));
        conn.on('close', () => { delete clients[cid]; renderClients(); if (viewTarget === cid) stopView(); });
        renderClients();
      });
    });
    hub.on('error', err => {
      if (err.type === 'unavailable-id') {
        hub.destroy();
        tryCreateHub(HUB + '-b');
        // Primary is online — connect to it for key sync
        if (id === HUB) connectToPartnerAdmin(HUB);
      }
    });
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
      c.vp       = d.vp;
      c.url      = d.url || '—';
      c.name     = d.name || cid.slice(-6);
      c.approved = d.approved || false;

      // Auto-sync: reconnecting user with uid or deviceId matching a valid key
      if (d.uid || d.deviceId) {
        const ks    = loadKeys();
        const match = ks.find(k =>
          k.used && Date.now() < (k.expires || 0) &&
          ((d.uid && k.uid === d.uid) || (d.deviceId && k.deviceId === d.deviceId))
        );
        if (match && !c.approved) {
          c.name     = match.usedBy || match.name;
          c.approved = true;
          sendTo(cid, {
            type:       'key-approved',
            name:       c.name,
            expires:    match.expires,
            created:    match.created,
            uid:        match.uid,
            badges:     match.badges || [],
            autoLoaded: true,
          });
          // Notify admin panel that this user was auto-synced
          showToast(`${c.name} — auto-synced`);
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
      document.getElementById('ck-wait').style.display = 'none';
      renderKeys();
      renderClients();
    }

    if (d.type === 'frame' && viewTarget === cid) {
      const cv = document.getElementById('cp-vc');
      if (!cv) return;
      const img = new Image();
      img.onload = () => {
        // Only reset dimensions when they actually change to avoid canvas clear flash
        if (cv.width !== img.width || cv.height !== img.height) {
          cv.width = img.width; cv.height = img.height;
        }
        cv.getContext('2d').drawImage(img, 0, 0);
      };
      img.src = d.data;
    }
  }

  function renderClients() {
    const list = document.getElementById('cp-clist');
    if (!list) return;
    const ids = Object.keys(clients).filter(id => !clients[id].isAdminPeer);
    if (!ids.length) { list.innerHTML = '<p style="color:#333;font-size:.82rem;">no clients connected.</p>'; return; }
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
        <button class="cbtn r" onclick="__cstRemove('${id}')" style="flex-shrink:0;">remove</button>
      </div>`;
    }).join('');
  }

  window.__cstView = id => {
    viewTarget = id;
    const v = document.getElementById('cp-viewer');
    if (v) v.style.display = 'block';
    sendTarget({ type: 'start-cap' });
    renderClients();
  };

  window.__cstRemove = id => {
    sendTo(id, { type: 'revoke' });
    if (clients[id]?.conn) try { clients[id].conn.close(); } catch {}
    delete clients[id];
    renderClients();
    if (viewTarget === id) stopView();
  };

  function stopView() {
    if (viewTarget) sendTarget({ type: 'stop-cap' });
    viewTarget = null;
    const v = document.getElementById('cp-viewer');
    if (v) v.style.display = 'none';
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
    loadPeerJS(() => {
      const tmp = new Peer(undefined, { debug: 0 });
      tmp.on('open', () => {
        const conn = tmp.connect(targetId, { reliable: true });
        partnerConn = conn;
        conn.on('open', () => conn.send({ type: 'admin-hello', sec: SEC, keys: loadKeys() }));
        conn.on('data', d => {
          if (!d || typeof d !== 'object') return;
          if (d.type === 'admin-keys' || d.type === 'admin-key-update') mergeAdminKeys(d.keys || []);
        });
        conn.on('close', () => { partnerConn = null; });
        conn.on('error', () => { partnerConn = null; });
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
      cPeer = new Peer(undefined, { debug: 0 });
      let adminConn  = null;
      let connecting = false;
      let capturing  = false;
      let capTimer   = null;
      let virCur     = null;
      let msgLayer   = null;
      let lastMsg    = null;
      let stylesDone = false;

      cPeer.on('open', () => {
        tryConnect();
        setInterval(tryConnect, 1000);
      });

      function tryConnect() {
        if (adminConn && adminConn.open) {
          // If there's a pending key and we're connected, register it
          if (window.__cstPendingKey) {
            adminConn.send({ type: 'register-key', key: window.__cstPendingKey });
          }
          return;
        }
        // Guard: don't create multiple simultaneous connection attempts
        if (connecting) return;
        connecting = true;
        try {
          const conn = cPeer.connect(HUB, { reliable: true });
          adminConn = conn;
          conn.on('open', () => {
            if (adminConn !== conn) { try { conn.close(); } catch {} return; }
            connecting = false;
            const appr = getApproval();
            conn.send({
              type:     'hello',
              vp:       { w: innerWidth, h: innerHeight },
              url:      location.hostname,
              name:     appr?.name || null,
              approved: isApproved(),
              uid:      appr?.uid     || null,
              deviceId: getDeviceId(),
            });
            // If gate is waiting for admin, send register request now
            if (window.__cstPendingKey) {
              conn.send({ type: 'register-key', key: window.__cstPendingKey, deviceId: getDeviceId() });
            }
          });
          conn.on('data',  onAdminMsg);
          conn.on('close', () => {
            if (adminConn === conn) { adminConn = null; connecting = false; stopCap(); hideCur(); }
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
    fill="rgba(255,60,60,0.35)" stroke="none"/>
  <path filter="url(#cst-cshadow)" d="M3.5 2.5 L3.5 20.5 L8 15.5 L11.2 23.5 L14 22.5 L10.8 14.5 L18 14.5 Z"
    fill="#ff3232" stroke="white" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
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
        // Use vw/vh so units match the cursor exactly (% inside the fixed
        // layer is equivalent but can drift a pixel at certain screen sizes).
        if (lastMsg && lastMsg.parentNode) {
          lastMsg.style.left = x + 'vw';
          lastMsg.style.top  = Math.min(y + 3.5, 90) + 'vh';
        }
      }
      function hideCur() { if (virCur) virCur.style.display = 'none'; }

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
.cst-ch{display:inline-block;animation:cst-fall var(--d) ease-in var(--dl) both;}`;
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
            // Admin auto-synced this user — no gate open
            const wasLegacy = !!(getApproval() && !getApproval()?.uid);
            setApproved(d.name, d.expires, extra);
            renderBadgeButton();
            document.getElementById('cst-gate')?.remove();
            showToast(wasLegacy
              ? 'Your key has been updated and 20+ days have been added.'
              : 'key automatically loaded.');
          } else {
            window.__cstGateApproved?.(d.name, d.expires, extra);
          }
        }
        if (d.type === 'key-rejected') { window.__cstGateRejected?.(d.reason); }
        if (d.type === 'revoke')       {
          clearApproval();
          bc?.postMessage('revoked');
          // Show gate again on this page
          if (!document.getElementById('cst-gate')) showGate();
        }
        if (d.type === 'start-cap')   { capturing = true; startCap(); showCur(50,50); }
        if (d.type === 'stop-cap')    { stopCap(); hideCur(); }
        if (d.type === 'cursor')      { showCur(d.x, d.y); }
        if (d.type === 'hide-cursor') { hideCur(); }
        if (d.type === 'msg')         { showMsg(d.text, d.x||50, d.y||30); }
      }

      function startCap() {
        if (capTimer) return;
        let busy = false;
        capTimer = setInterval(async () => {
          if (!capturing || !adminConn?.open || busy) return;
          busy = true;
          try {
            const data = await grab();
            if (data && adminConn?.open) adminConn.send({ type: 'frame', data });
          } finally { busy = false; }
        }, 300);
      }
      function stopCap() { capturing = false; if (capTimer) { clearInterval(capTimer); capTimer = null; } }

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
    });
  }

  // ─── PeerJS loader ───────────────────────────────────────────
  function loadPeerJS(cb) {
    if (window.Peer) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    s.onload = cb; s.onerror = () => {};
    document.head.appendChild(s);
  }

  // ─── init ────────────────────────────────────────────────────
  function init() {
    if (isAdmin) {
      // Admin: panel opens via Konami code (← → ← → ↑ ↓ A B) + passcode
      // No visible button — keep it hidden
      // Unlock secret/hidden themes for admin
      document.querySelectorAll('#themepicker option[disabled]').forEach(opt => {
        opt.disabled = false;
      });
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
