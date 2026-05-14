// BRC controller SW module — the ONLY thing needed for BRC routing in the SW.
// controller.sw.js is tiny (4.4 KB) and self-contained; it does NOT need $brc
// from brc.js, and it does NOT need UV's violet.bundle.js.
try {
  importScripts("/scram/controller.sw.js");
} catch(e) {
  console.warn("[ultraworker] BRC controller SW not available:", e.message);
}

// UV (Ultraviolet) engine — loaded lazily on first /service/ultra/ request.
// violet.config.js is ~1 KB; violet.sw.js is ~7 KB — cheap enough to lazy-load
// synchronously via importScripts() on the first UV hit.
let _uvSW = null;
let _uvLoaded = false;

function _ensureUVSW() {
  if (_uvLoaded) return;
  _uvLoaded = true;
  try {
    importScripts("/violet/violet.config.js"); // sets self.__uv$config
    importScripts("/violet/violet.sw.js");     // sets self.UVServiceWorker
    if (typeof self.UVServiceWorker === "function" && self.__uv$config) {
      _uvSW = new self.UVServiceWorker(self.__uv$config);
    }
  } catch(e) {
    console.warn("[ultraworker] UV SW init failed:", e.message);
  }
}

// Scramjet engine — loaded lazily on first /scramjet/ request (177 KB).
// Eagerly loading it added ~150–300 ms to every SW cold start, which delayed
// BRC's WASM handshake and made BRC appear slow.
let scramjet = null;
let _scramjetLoaded = false;

function _ensureScramjetSW() {
  if (_scramjetLoaded) return;
  _scramjetLoaded = true;
  try {
    importScripts("/sj/scramjet.all.js");
    if (typeof $scramjetLoadWorker === "function") {
      const { ScramjetServiceWorker } = $scramjetLoadWorker();
      scramjet = new ScramjetServiceWorker();
    }
  } catch(e) {
    console.warn("[ultraworker] scramjet SW init failed:", e.message);
  }
}

if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    value: true,
    writable: true,
  })
}

// Cache name — bump the version suffix to force a cache refresh after deploys
const BRC_CACHE = "brc-wasm-v1";
// Files to pre-cache on install so BRC WASM is always available instantly
const BRC_PRECACHE = ["/scram/brc.wasm"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Pre-cache BRC WASM so controller init is fast (~150ms) on every page load
  // after the first visit instead of waiting for a network fetch each time.
  event.waitUntil(
    caches.open(BRC_CACHE).then(cache => cache.addAll(BRC_PRECACHE)).catch(() => {})
  );
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Scramjet's hard-coded URL prefix — only call loadConfig for actual scramjet URLs
// so we never block BRC WASM fetches or other non-scramjet requests.
const SCRAMJET_PREFIX = "/scramjet/";

async function handleRequest(event) {
  // Serve BRC WASM from the SW cache so controller init is instant on warm loads.
  // Cache-first: if the file is cached return it immediately; otherwise fetch,
  // cache the response, and return it (populates cache for next time).
  const { pathname } = new URL(event.request.url);
  if (BRC_PRECACHE.includes(pathname)) {
    const cache = await caches.open(BRC_CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
    return response;
  }

  // BRC routes — handled via Controller RPC back to the main page
  if (typeof $brcController !== "undefined" && $brcController.shouldRoute(event)) {
    return $brcController.route(event)
  }

  // Scramjet routes — only for URLs that actually start with /scramjet/
  // Scramjet is lazy-loaded on first hit so it doesn't slow down SW cold starts.
  if (pathname.startsWith(SCRAMJET_PREFIX)) {
    _ensureScramjetSW();
    if (scramjet) {
      try {
        // loadConfig() blocks waiting for the main page to respond with scramjet config.
        // Guard with a 4s timeout so a dead/reloading tab doesn't hang the fetch forever.
        await Promise.race([
          scramjet.loadConfig(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("loadConfig timeout")), 4000)),
        ]);
        // config must be set before calling route() — it accesses this.config.prefix directly
        if (scramjet.config && scramjet.route(event)) {
          return scramjet.fetch(event);
        }
      } catch(e) {
        console.warn("[ultraworker] scramjet fetch failed:", e.message);
      }
    }
  }

  // UV (Ultraviolet) routes — lazy-loaded on first hit
  if (pathname.startsWith("/service/ultra/")) {
    _ensureUVSW();
    if (_uvSW && _uvSW.route(event)) {
      return _uvSW.fetch(event);
    }
  }

  // Non-proxied resources pass through normally
  return fetch(event.request)
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event))
})
