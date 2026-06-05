// Dedicated service worker for the SCRAMJET engine (scramjet v2 + UV, no BRC).
//
// Why this exists: when scramjet shared ultraworker.js with BRC, BRC's heavy
// navigator.serviceWorker messaging collided with scramjet v2's config channel,
// so scramjet.route() never matched and every /scramjet/ request fell through to
// a 404. Running scramjet in its own worker (no BRC) — mirroring the setup
// celestial.press uses — keeps the config handshake clean.
//
// lithium.mjs registers THIS worker only when the saved engine is "scramjet";
// otherwise it registers ultraworker.js (BRC + UV).

importScripts("/violet/violet.bundle.js"); // self.Ultraviolet
importScripts("/violet/violet.config.js"); // self.__uv$config
importScripts("/violet/violet.sw.js");     // self.UVServiceWorker
importScripts("/sj/scramjet.all.js");      // $scramjetLoadWorker

if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", { value: true, writable: true });
}

// UV — for /service/ultra/ embeds (e.g. the music player's proxy-only tracks).
let uv = null;
try {
  if (typeof self.UVServiceWorker === "function" && self.__uv$config) {
    uv = new self.UVServiceWorker(self.__uv$config);
  }
} catch (e) { console.warn("[scramworker] UV init failed:", e.message); }

// Scramjet — created eagerly so its config channel is up before the first
// /scramjet/ request (lazy creation missed the sync).
let scramjet = null;
try {
  const { ScramjetServiceWorker } = $scramjetLoadWorker();
  scramjet = new ScramjetServiceWorker();
} catch (e) { console.warn("[scramworker] scramjet init failed:", e.message); }

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function handleRequest(event) {
  const { pathname } = new URL(event.request.url);

  // player.html must load as a clean same-origin document (in-app media player).
  if (pathname === "/player.html") {
    return fetch(new Request(event.request.url, { credentials: "include" }));
  }

  // Scramjet first — loadConfig() then route()/fetch() (matches celestial.press;
  // no scramjet.config gate, which v2 doesn't expose the same way).
  if (scramjet) {
    try {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return scramjet.fetch(event);
    } catch (e) { console.warn("[scramworker] scramjet fetch failed:", e.message); }
  }

  // UV for its own prefix.
  if (uv && pathname.startsWith("/service/ultra/")) {
    try { if (uv.route(event)) return await uv.fetch(event); } catch (e) {}
  }

  // Passthrough for anything we don't proxy. A cross-origin request the page
  // fired (e.g. an analytics beacon) can fail CORS / the network here — return a
  // network-error Response instead of letting the rejection surface as an
  // "Uncaught (in promise) Failed to fetch" in the console.
  try {
    return await fetch(event.request);
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));
