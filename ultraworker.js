importScripts(
  "/violet/violet.bundle.js",
)
importScripts("/violet/violet.config.js")
// BRC (Bumblcat RRC) engine
importScripts("/scram/brc.js");
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

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

async function handleRequest(event) {
  // BRC routes — handled via Controller RPC back to the main page
  if (typeof $brcController !== "undefined" && $brcController.shouldRoute(event)) {
    return $brcController.route(event)
  }
  // Original scramjet routes
  if (scramjet) {
    try {
      await scramjet.loadConfig();
      if (scramjet.route(event)) {
        return scramjet.fetch(event);
      }
    } catch(e) {}
  }
  // Non-proxied resources pass through normally
  return fetch(event.request)
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event))
})
