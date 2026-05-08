importScripts(
  "/violet/violet.bundle.js",
)
importScripts("/violet/violet.config.js")
importScripts("/scram/brc.js");

// BRC controller SW module — deployed alongside brc.js once the workflow includes controller dist
try {
  importScripts("/scram/controller.sw.js");
} catch(e) {
  console.warn("[ultraworker] BRC controller SW not available:", e.message);
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
  // Non-proxied resources pass through normally
  return fetch(event.request)
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event))
})
