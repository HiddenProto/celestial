/**
 * BOU-KSN  —  Bumblcat Optimized Unified · Kernel Socket Network
 * ─────────────────────────────────────────────────────────────────────────────
 * A smart, BareMux-compatible proxy transport that wraps libcurl / epoxy with
 * an intelligence layer. Zero extra WASM — pure orchestration JS.
 *
 * Optimizations used
 * ──────────────────
 * 1. Domain-aware server routing
 *    Google, YouTube, Gmail, googleapis → Mercury Workshop (high Google reputation,
 *    bypasses "unusual traffic" / suspicious-activity checks that datacenter IPs trigger).
 *    Everything else → bumblcat's private server (low latency, cross-origin support).
 *
 * 2. RTT benchmarking
 *    On first instantiation, BOU-KSN pings the primary server and the fallback server
 *    over a plain WebSocket and records round-trip time. Subsequent requests for
 *    non-Google domains go to whichever server responded fastest. The benchmark is
 *    async and non-blocking — the first few requests use the configured default while
 *    the benchmark runs in the background.
 *
 * 3. Sub-transport selection
 *    Google-routed requests use epoxy (HTTP/2, correct Sec-* / Origin header forwarding —
 *    required for Google's bot-detection to accept the connection).
 *    All other requests use libcurl (lower overhead, faster for most sites).
 *    Automatic fallback to libcurl if epoxy fails to initialise.
 *
 * 4. LRU response cache (static assets)
 *    JS, CSS, fonts, images, WASM — responses up to 4 MB are stored in-memory with
 *    an LRU eviction policy (configurable, default 80 slots). Cache-hits bypass the
 *    entire transport stack and return instantly from RAM.
 *
 * 5. In-flight request deduplication
 *    Identical concurrent GET requests (same URL) share one in-flight promise. The
 *    second caller gets the same response without triggering a second network hit.
 *
 * 6. Automatic retry with server fallback
 *    On failure, BOU-KSN waits (exponential backoff: 80 ms → 320 ms) and retries,
 *    switching to the fallback server on the second attempt.
 *
 * 7. Virtual Entity headers always active
 *    Chrome 136 on Windows headers (User-Agent, sec-ch-ua, Sec-Fetch-*, Accept,
 *    Accept-Language, Accept-Encoding, Cache-Control) are injected on every request.
 *    Headers explicitly set by the caller always take priority.
 *
 * 8. Connection pre-warming
 *    The `ready` getter immediately initialises the primary sub-transport so the
 *    first proxied request doesn't pay the WASM init cost.
 */

// ── Virtual Entity header set (Chrome 136 / Windows) ───────────────────────
const VE = [
  ['User-Agent',               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'],
  ['Accept',                   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'],
  ['Accept-Language',          'en-US,en;q=0.9'],
  ['Accept-Encoding',          'gzip, deflate, br, zstd'],
  ['sec-ch-ua',                '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"'],
  ['sec-ch-ua-mobile',         '?0'],
  ['sec-ch-ua-platform',       '"Windows"'],
  ['Upgrade-Insecure-Requests','1'],
  ['Sec-Fetch-Site',           'none'],
  ['Sec-Fetch-Mode',           'navigate'],
  ['Sec-Fetch-User',           '?1'],
  ['Sec-Fetch-Dest',           'document'],
  ['Cache-Control',            'max-age=0'],
];

// ── Server pool ─────────────────────────────────────────────────────────────
const POOL = {
  primary:  'wss://celestial-wisp.onrender.com/',
  google:   'wss://wisp.mercurywork.shop/',   // excellent Google reputation
  fallback: 'wss://anura.pro/wisp/',          // free public fallback
};

// ── Google-family domains that must route through Mercury Workshop ───────────
const GOOGLE_DOMAINS = [
  'google.com', 'youtube.com', 'googleapis.com', 'gmail.com',
  'googlevideo.com', 'ytimg.com', 'googleusercontent.com',
  'ggpht.com', 'gstatic.com', 'accounts.google.com', 'google-analytics.com',
  'googletagmanager.com', 'doubleclick.net', 'googlesyndication.com',
];

// ── Static-asset pattern (eligible for LRU cache) ───────────────────────────
const STATIC_RE = /\.(js|mjs|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|ico|webp|avif|wasm|mp4|m4v|ogg|opus|flac)(\?|#|$)/i;

// ── Helpers ──────────────────────────────────────────────────────────────────
function _hostname(remote) {
  try {
    if (remote instanceof URL) return remote.hostname;
    if (typeof remote === 'string') return new URL(remote).hostname;
    // bare-mux RemoteInfo object
    return remote.hostname ?? remote.host?.split(':')[0] ?? '';
  } catch { return ''; }
}

function _pathname(remote) {
  try {
    if (remote instanceof URL) return remote.pathname;
    return '';
  } catch { return ''; }
}

function _isGoogle(remote) {
  const h = _hostname(remote);
  return GOOGLE_DOMAINS.some(d => h === d || h.endsWith('.' + d));
}

function _isStatic(remote) {
  return STATIC_RE.test(_pathname(remote));
}

function _mergeVE(headers) {
  if (Array.isArray(headers)) {
    const have = new Set(headers.map(([n]) => n.toLowerCase()));
    return [...VE.filter(([n]) => !have.has(n.toLowerCase())), ...headers];
  }
  if (headers && typeof headers === 'object') {
    const have = new Set(Object.keys(headers).map(k => k.toLowerCase()));
    return [...VE.filter(([n]) => !have.has(n.toLowerCase())), ...Object.entries(headers)];
  }
  return [...VE];
}

function _normalizeHeaders(h) {
  if (Array.isArray(h)) return h;
  if (!h || typeof h !== 'object') return [];
  return Object.entries(h).flatMap(([n, v]) =>
    (Array.isArray(v) ? v : [v]).map(val => [n, val])
  );
}

async function _pingMs(url) {
  const t0 = performance.now();
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    const timer = setTimeout(() => { try { ws.close(); } catch {} rej(new Error('timeout')); }, 4500);
    ws.onopen  = () => { clearTimeout(timer); try { ws.close(); } catch {} res(); };
    ws.onerror = () => { clearTimeout(timer); rej(new Error('ws error')); };
  });
  return performance.now() - t0;
}

// ── BOU-KSN transport class ──────────────────────────────────────────────────
export default class BouKSN {
  /**
   * @param {{ wisp?: string }} opts
   *   wisp — primary wisp server URL. Defaults to bumblcat's server.
   *         Mercury Workshop is always used for Google-family domains regardless.
   */
  constructor({ wisp } = {}) {
    this._primary  = wisp || POOL.primary;
    this._fastest  = this._primary;   // updated by benchmark
    this._pool     = new Map();       // serverURL → transport instance
    this._pending  = new Map();       // cacheKey  → in-flight Promise
    this._cache    = new Map();       // cacheKey  → { status, statusText, headers, bytes }
    this._cacheQ   = [];              // LRU order
    this._cacheMax = 80;

    // Non-blocking pre-warm + benchmark
    this._warmup();
  }

  // ── Initialisation ─────────────────────────────────────────────────────────
  async _warmup() {
    // Pre-warm primary transport so first request doesn't pay WASM cost
    this._mkTransport(this._primary, false).catch(() => {});

    // Benchmark primary vs fallback in parallel
    const servers = [this._primary, POOL.fallback].filter((s, i, a) => a.indexOf(s) === i);
    const results = await Promise.allSettled(servers.map(s => _pingMs(s).then(rtt => ({ s, rtt }))));
    let best = null;
    for (const r of results) {
      if (r.status === 'fulfilled' && (!best || r.value.rtt < best.rtt)) best = r.value;
    }
    if (best && best.s !== this._fastest) {
      this._fastest = best.s;
      console.log(`[BOU-KSN] benchmark → ${best.s} (${best.rtt.toFixed(0)} ms RTT)`);
    }
  }

  // ── Sub-transport factory ───────────────────────────────────────────────────
  async _mkTransport(serverURL, useEpoxy) {
    const key = serverURL + (useEpoxy ? ':epoxy' : ':libcurl');
    if (this._pool.has(key)) return this._pool.get(key);

    let t;
    if (useEpoxy) {
      try {
        const { default: Epoxy } = await import('/epoxy/index.mjs');
        t = new Epoxy({ wisp: serverURL });
      } catch (e) {
        console.warn('[BOU-KSN] epoxy init failed, falling back to libcurl:', e.message);
      }
    }
    if (!t) {
      const { default: Libcurl } = await import('/curl/index.mjs');
      t = new Libcurl({ wisp: serverURL });
    }
    this._pool.set(key, t);
    return t;
  }

  // ── Routing decision ────────────────────────────────────────────────────────
  _route(remote) {
    if (_isGoogle(remote)) {
      // Google family → Mercury Workshop + epoxy (HTTP/2, proper header forwarding)
      return { server: POOL.google, epoxy: true };
    }
    return { server: this._fastest, epoxy: false };
  }

  // ── LRU cache helpers ───────────────────────────────────────────────────────
  _cacheGet(k) {
    if (!this._cache.has(k)) return null;
    const i = this._cacheQ.indexOf(k); // promote to MRU
    if (i !== -1) { this._cacheQ.splice(i, 1); this._cacheQ.push(k); }
    return this._cache.get(k);
  }
  _cacheSet(k, v) {
    if (this._cache.size >= this._cacheMax) this._cache.delete(this._cacheQ.shift());
    this._cache.set(k, v); this._cacheQ.push(k);
  }
  static _makeStream(bytes) {
    return new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
  }

  // ── Public: BareMux request() ───────────────────────────────────────────────
  async request(remote, method, body, headers, signal) {
    const ckey = `${method}:${remote instanceof URL ? remote.href : JSON.stringify(remote)}`;

    // ── Cache hit (GET static assets only) ────────────────────────────────────
    if (method === 'GET' && _isStatic(remote)) {
      const hit = this._cacheGet(ckey);
      if (hit) {
        return {
          status: hit.status, statusText: hit.statusText,
          headers: hit.headers,
          body: BouKSN._makeStream(hit.bytes),
        };
      }
    }

    // ── In-flight dedup ────────────────────────────────────────────────────────
    if (method === 'GET' && this._pending.has(ckey)) return this._pending.get(ckey);

    const p = this._exec(remote, method, body, headers, signal, ckey);
    if (method === 'GET') {
      this._pending.set(ckey, p);
      p.finally(() => this._pending.delete(ckey));
    }
    return p;
  }

  async _exec(remote, method, body, headers, signal, ckey) {
    const merged  = _mergeVE(headers);
    const { server, epoxy } = this._route(remote);
    const isStaticGet = method === 'GET' && _isStatic(remote);

    // Attempt order: routed server → fallback server
    const attempts = [
      () => this._mkTransport(server, epoxy),
      () => this._mkTransport(POOL.fallback, false),
    ];

    let lastErr;
    for (let i = 0; i < attempts.length; i++) {
      try {
        const t    = await attempts[i]();
        const resp = await t.request(remote, method, body, merged, signal);
        const hdrs = _normalizeHeaders(resp.headers);
        const out  = { ...resp, headers: hdrs };

        // ── Cache eligible static GET responses ─────────────────────────────
        if (isStaticGet && resp.status === 200) {
          const reader = out.body.getReader();
          const chunks = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.length;
            if (total > 4 * 1024 * 1024) break; // skip >4 MB
          }
          if (total <= 4 * 1024 * 1024) {
            const bytes = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) { bytes.set(c, off); off += c.length; }
            this._cacheSet(ckey, { status: hdrs ? out.status : resp.status, statusText: out.statusText, headers: hdrs, bytes });
            return { ...out, body: BouKSN._makeStream(bytes) };
          }
          // Body too large — return what we have as a stream
          const combined = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { combined.set(c, off); off += c.length; }
          return { ...out, body: BouKSN._makeStream(combined) };
        }

        return out;
      } catch (e) {
        lastErr = e;
        if (i < attempts.length - 1) {
          await new Promise(r => setTimeout(r, 80 * (2 ** i))); // 80ms, 160ms
        }
      }
    }
    throw lastErr;
  }

  // ── WebSocket proxy (if underlying transport supports it) ────────────────────
  async connect(url, origin, protocols, requestHeaders, signal) {
    const { server, epoxy } = this._route(url instanceof URL ? url : new URL(url));
    const t = await this._mkTransport(server, epoxy);
    if (typeof t.connect === 'function') {
      return t.connect(url, origin, protocols, requestHeaders, signal);
    }
    throw new Error('[BOU-KSN] connect() not supported by underlying transport');
  }

  meta() { return {}; }

  /** Pre-warm the primary transport so the first request is instant. */
  get ready() {
    return this._mkTransport(this._fastest, false).then(() => {});
  }
}
