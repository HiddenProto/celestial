// serve.js — Celestial local HTTPS + Wisp + PeerJS dev server
// Run: node serve.js
//
// Certs are generated ONCE and stored in ./certs/ — never regenerated on
// subsequent runs.  Delete ./certs/ to force a fresh certificate.
//
// PeerJS signaling runs on a separate plain-HTTP port (default 9001).
// Chrome allows ws://localhost from https://localhost pages (localhost is
// always a trusted origin), so no second cert bypass is needed.
'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const net    = require('net');
const { execSync }       = require('child_process');
const { WebSocketServer } = require('ws');

const ROOT  = __dirname;
const CERTS = path.join(ROOT, 'certs');
const CERT  = path.join(CERTS, 'cert.pem');
const KEY   = path.join(CERTS, 'key.pem');
const PORT      = Number(process.env.PORT)      || 58443;
const PEER_PORT = Number(process.env.PEER_PORT) || 9001;
const BUF   = 1 << 24; // 16 MB flow-control window

// ── Persistent self-signed certificate ──────────────────────────────────────
// Generated once, reused forever.  10-year validity so you never have to
// redo this during local dev.
if (!fs.existsSync(CERT) || !fs.existsSync(KEY)) {
  fs.mkdirSync(CERTS, { recursive: true });
  console.log('[cert] Generating self-signed certificate (10 yr)...');

  // Find openssl — bundled with Git for Windows, or system openssl on Unix
  const candidates = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
  ];
  let openssl = null;
  for (const c of candidates) {
    try { execSync(`"${c}" version`, { stdio: 'ignore' }); openssl = c; break; } catch {}
  }
  if (!openssl) {
    console.error('[cert] openssl not found.');
    console.error('[cert] Install Git for Windows (https://git-scm.com) — it includes openssl.');
    process.exit(1);
  }

  execSync(
    `"${openssl}" req -newkey rsa:2048 -new -nodes -x509 -days 3650` +
    ` -subj "/CN=localhost/O=Celestial/C=US"` +
    ` -keyout "${KEY}" -out "${CERT}"`,
    { stdio: 'inherit' }
  );
  console.log('[cert] Saved to ./certs/ — will reuse on every future run.\n');
}

// ── MIME table ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.wasm': 'application/wasm',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json',
};

// ── Static file handler ──────────────────────────────────────────────────────
function staticHandler(req, res) {
  let urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // Security: prevent directory traversal
  const abs = path.resolve(path.join(ROOT, decodeURIComponent(urlPath)));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    res.writeHead(403); return res.end('Forbidden');
  }

  // Try path directly, then as directory → index.html
  for (const p of [abs, path.join(abs, 'index.html')]) {
    try {
      const stat = fs.statSync(p);
      if (!stat.isFile()) continue;
      const ext = path.extname(p).toLowerCase();
      res.writeHead(200, {
        'Content-Type':                  MIME[ext] || 'application/octet-stream',
        // SharedArrayBuffer isolation required by epoxy-tls
        'Cross-Origin-Opener-Policy':    'same-origin',
        'Cross-Origin-Embedder-Policy':  'require-corp',
        'Access-Control-Allow-Origin':   '*',
      });
      fs.createReadStream(p).pipe(res);
      return;
    } catch { /* try next */ }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404: ' + urlPath);
}

// ── HTTPS server ─────────────────────────────────────────────────────────────
const server = https.createServer(
  { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) },
  staticHandler
);

// ── Wisp WebSocket server ─────────────────────────────────────────────────────
// Implements the Wisp protocol directly — same logic as celestial-wisp/index.js.
// No extra npm package needed beyond ws.
const wispWss = new WebSocketServer({
  noServer:        true,
  handleProtocols: (protocols) => protocols.values().next().value || false,
  verifyClient:    (_, cb) => cb(true),
});

// Route WebSocket upgrades: /wisp/* → wisp handler
server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').startsWith('/wisp')) {
    wispWss.handleUpgrade(req, socket, head, ws => wispWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// Wisp protocol handler
wispWss.on('connection', ws => {
  const streams = new Map(); // streamId → net.Socket

  // Send initial CONTINUE for stream 0 (required by Wisp spec)
  const init = Buffer.alloc(9);
  init[0] = 0x03; init.writeUInt32LE(0, 1); init.writeUInt32LE(BUF, 5);
  ws.send(init);

  ws.on('message', (raw, isBinary) => {
    if (!isBinary) return;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (buf.length < 5) return;

    const type = buf[0];
    const sid  = buf.readUInt32LE(1);
    const body = buf.subarray(5);

    if (type === 0x01) { // CONNECT
      if (body.length < 3) return;
      const port     = body.readUInt16LE(1);
      const hostname = body.subarray(3).toString('utf8');

      const sock = net.createConnection({ host: hostname, port }, () => {
        const pkt = Buffer.alloc(9);
        pkt[0] = 0x03; pkt.writeUInt32LE(sid, 1); pkt.writeUInt32LE(BUF, 5);
        if (ws.readyState === 1) ws.send(pkt);
      });

      sock.on('data', chunk => {
        const pkt = Buffer.allocUnsafe(5 + chunk.length);
        pkt[0] = 0x02; pkt.writeUInt32LE(sid, 1);
        chunk.copy(pkt, 5);
        if (ws.readyState === 1) ws.send(pkt);
      });

      const closeStream = reason => {
        streams.delete(sid);
        const pkt = Buffer.alloc(6);
        pkt[0] = 0x04; pkt.writeUInt32LE(sid, 1); pkt[5] = reason;
        if (ws.readyState === 1) ws.send(pkt);
      };

      sock.on('close', () => closeStream(0x02));
      sock.on('error', () => closeStream(0x03));
      streams.set(sid, sock);

    } else if (type === 0x02) { // DATA
      const sock = streams.get(sid);
      if (sock && !sock.destroyed) sock.write(body);

    } else if (type === 0x04) { // CLOSE
      const sock = streams.get(sid);
      if (sock) { sock.destroy(); streams.delete(sid); }
    }
  });

  const cleanup = () => { streams.forEach(s => s.destroy()); streams.clear(); };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

// ── PeerJS signaling server ───────────────────────────────────────────────────
// Runs on plain HTTP so no second cert bypass is needed in the browser.
// Chrome (and all Chromium browsers) always allow ws://localhost from HTTPS pages
// because localhost is treated as a "potentially trustworthy" origin.
function startPeerServer() {
  try {
    const { PeerServer } = require('peer');
    const peerServer = PeerServer({
      port:            PEER_PORT,
      path:            '/',          // WS endpoint → ws://localhost:PORT/peerjs
      allow_discovery: false,        // don't expose /peers list to clients
    });

    peerServer.on('connection', client => {
      console.log(`[peer] + ${client.getId()}`);
    });
    peerServer.on('disconnect', client => {
      console.log(`[peer] - ${client.getId()}`);
    });

    return true;
  } catch (e) {
    console.warn(`[peer] Could not start PeerJS server: ${e.message}`);
    console.warn('[peer] The site will fall back to 0.peerjs.com for signaling.');
    return false;
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[error] Port ${PORT} is already in use.`);
    console.error('[error] Another instance of serve.js may still be running.');
    console.error('[error] start.bat will kill the old process and retry.\n');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const peerOk = startPeerServer();

  console.log('\n✦  Celestial local dev server');
  console.log(`   HTTPS  →  https://localhost:${PORT}`);
  console.log(`   Wisp   →  wss://localhost:${PORT}/wisp/`);
  if (peerOk) {
    console.log(`   PeerJS →  ws://localhost:${PEER_PORT}/peerjs  (local signaling — always-on)`);
  } else {
    console.log('   PeerJS →  0.peerjs.com (local server unavailable)');
  }
  console.log();
  console.log('   Cert warning? Click anywhere on the Chrome page and type: thisisunsafe');
  console.log('   Or permanently trust: certs/cert.pem in your OS certificate store.\n');
});
