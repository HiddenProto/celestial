importScripts(
  "/violet/violet.bundle.js",
)
importScripts("/violet/violet.config.js")
// BRC (Bumblcat RRC) engine
// Wrapped in try/catch: brc.js references DOM APIs (document, window, HTMLElement,
// localStorage) which throw in SW context. controller.sw.js does NOT need $brc,
// so a failure here must not prevent controller.sw.js from loading.
try {
  importScripts("/scram/brc.js");
} catch(e) {
  console.warn("[ultraworker] brc.js not available in SW context:", e.message);
}
// Original scramjet engine (legacy)
try {
  importScripts("/sj/scramjet.all.js");
} catch(e) {
  console.warn("[ultraworker] scramjet engine not available:", e.message);
}

// BRC controller SW module
try {
  importScripts("/scram/controller.sw.js");
} catch(e) {
  console.warn("[ultraworker] BRC controller SW not available:", e.message);
}

// Setup original scramjet SW handler
let scramjet = null;
try {
  if (typeof $scramjetLoadWorker === "function") {
    const { ScramjetServiceWorker } = $scramjetLoadWorker();
    scramjet = new ScramjetServiceWorker();
  }
} catch(e) {
  console.warn("[ultraworker] scramjet SW init failed:", e.message);
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
  // IMPORTANT: do NOT call loadConfig() for any other URL; it blocks until the
  // main page responds, which hangs BRC WASM fetches and causes the ready timeout.
  if (scramjet) {
    try {
      const { pathname } = new URL(event.request.url);
      if (pathname.startsWith(SCRAMJET_PREFIX)) {
        await scramjet.loadConfig();
        if (scramjet.route(event)) {
          return scramjet.fetch(event);
        }
      }
    } catch(e) {}
  }
  // Non-proxied resources pass through normally
  return fetch(event.request)
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event))
})
