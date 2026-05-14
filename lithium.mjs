//////////////////////////////
///          Init          ///
//////////////////////////////
import { BareMuxConnection } from "/mux/index.mjs";

//////////////////////////////
///         Options        ///
//////////////////////////////
const connection = new BareMuxConnection("/bareworker.js");

let wispURL;
let transportURL;
let proxyOption;

export let tabCounter = 0;
export let currentTab = 0;
export let framesElement;
export let currentFrame;
export const addressInput = document.getElementById("address");




// NOTE: "bou-ksn" maps to libcurl here because this map is used by BareMux
// (bareworker.js — a CLASSIC service worker) via importScripts().  importScripts
// cannot load ES modules, so sending /bou-ksn.mjs to the bareworker causes a
// JSON parse crash and the "Cannot read properties of undefined (reading 'fetch')"
// SW error.  BOU-KSN is used as a page-context JS class for BRC transport only
// (see _createBRCTransport), where it's loaded via dynamic import() which does
// support ES modules.  BareMux/UV transport stays on libcurl.
const transportOptions = {
	"bou-ksn": "/curl/index.mjs",  // bareworker compat — BOU-KSN class used separately for BRC
	epoxy:     "/epoxy/index.mjs",
	libcurl:   "/curl/index.mjs",
};

//////////////////////////////
///           SW           ///
//////////////////////////////
const stockSW = "/ultraworker.js";
const swAllowedHostnames = ["localhost", "127.0.0.1"];

/**
 * Registers the service worker if supported and allowed.
 * @returns {Promise<void>}
 * @throws Will throw if service workers are unsupported or not HTTPS on disallowed hosts.
 */
async function registerSW() {
	if (!navigator.serviceWorker) {
		if (
			location.protocol !== "https:" &&
			!swAllowedHostnames.includes(location.hostname)
		)
			throw new Error("Service workers cannot be registered without https.");

		throw new Error("whoops! this browser doesn't support service workers.");
	}

	await navigator.serviceWorker.register(stockSW);
}
await import("/violet/violet.bundle.js");
await import("/violet/violet.config.js");
await import("/scram/brc.js");
// Compatibility shim: controller.api.js references $brc.BrcHeaders, but this
// version of brc.js exports it as ScramjetHeaders. Alias it so the Controller
// request handler doesn't throw "Cannot read properties of undefined (reading
// 'fromRawHeaders')".
if (window.$brc && !window.$brc.BrcHeaders && window.$brc.ScramjetHeaders) {
	window.$brc.BrcHeaders = window.$brc.ScramjetHeaders;
}

//////////////////////////////
///      BRC Controller    ///
//////////////////////////////

/** @type {any} Active BRC Controller instance, null until initialized */
let brcController = null;
/** @type {Map<number, any>} tabNumber → BRC Frame instance */
const brcFrameMap = new Map();
/** @type {Promise<void>|null} Singleton init promise */
let _brcInitPromise = null;

//////////////////////////////
///    Scramjet (legacy)    ///
//////////////////////////////
/** @type {any} Original scramjet controller instance */
let _scramjetController = null;
/** @type {Promise<void>|null} Singleton scramjet init promise */
let _scramjetInitPromise = null;

/**
 * Ensures the original scramjet controller is initialized. Safe to call multiple times.
 */
async function ensureScramjet() {
	if (_scramjetInitPromise) return _scramjetInitPromise;
	_scramjetInitPromise = (async () => {
		try {
			await _loadScript("/sj/scramjet.all.js");
			const { ScramjetController } = window.$scramjetLoadController();
			_scramjetController = new ScramjetController({
				files: {
					wasm: "/sj/scramjet.wasm.wasm",
					all: "/sj/scramjet.all.js",
					sync: "/sj/scramjet.sync.js",
				},
				flags: {
					strictRewrites: false,  // relaxed mode — wider site compat
					scramitize: false,
					captureErrors: true,
					allowInvalidJs: true,
					allowFailedIntercepts: true,
				},
			});
			// init() is async — must be awaited so the config channel is established
			// before the SW calls loadConfig(). Not awaiting causes loadConfig() to hang.
			await _scramjetController.init();
			console.log("lethal.js: scramjet controller ready");
		} catch (e) {
			console.warn("lethal.js: scramjet init failed —", e.message);
			_scramjetController = null;
		}
	})();
	return _scramjetInitPromise;
}

/**
 * Creates a ProxyTransport for BRC based on the current transport setting.
 * Reads from localStorage directly so it works before setTransport/setWisp are called.
 */
async function _createBRCTransport() {
	// Read wisp from localStorage — setWisp may not have been called yet
	const savedWisp = localStorage.getItem("location") || "wss://celestial-wisp.onrender.com/";
	const wisp = wispURL || (
		(savedWisp.startsWith("wss://") || savedWisp.startsWith("ws://"))
			? savedWisp
			: (location.protocol === "https:" ? "wss://" : "ws://") + location.host + savedWisp
	);

	// Transport preference — BOU-KSN, epoxy, or libcurl
	const cfMode = localStorage.getItem("cfmode") === "1";
	const veMode = cfMode || localStorage.getItem("ve-mode") === "1";
	const savedTransport = localStorage.getItem("transportz") || "libcurl";

	// BOU-KSN: disabled — causes "Cannot read properties of undefined (reading 'fetch')"
	// inside BRC's fetch handler. Re-enable once the transport API incompatibility is fixed.
	// if (savedTransport === "bou-ksn" || cfMode) { ... }

	const useEpoxy = savedTransport === "epoxy";
	let transport;
	if (useEpoxy) {
		try {
			const { default: EpoxyTransport } = await import("/epoxy/index.mjs");
			transport = new EpoxyTransport({ wisp });
		} catch (e) {
			console.warn("lethal.js: epoxy transport failed, trying libcurl:", e.message);
		}
	}
	if (!transport) {
		const { default: LibcurlClient } = await import("/curl/index.mjs");
		transport = new LibcurlClient({ wisp });
	}

	// Apply Virtual Entity header injection when VE or CF mode is on
	if (veMode) {
		transport = _wrapVirtualEntity(transport);
		console.log("lethal.js: Virtual Entity active — browser identity headers injected");
	}

	return _wrapTransportHeaders(transport);
}

// ── Virtual Entity header set ─────────────────────────────────────────────────
// Mimics Chrome 136 on Windows — injected into every proxied request when
// Virtual Entity mode is enabled (ve-mode=1) or CF mode is active (cfmode=1).
// Makes BRC-routed traffic look indistinguishable from a real browser to
// bot-detection systems (Cloudflare, Google, YouTube, etc.).
const _VE_HEADERS = [
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

/**
 * Wraps a transport to inject realistic Chrome browser headers (Virtual Entity).
 * Headers already present in the outgoing request take priority — VE headers
 * are only added for names that the request doesn't already include.
 */
function _wrapVirtualEntity(transport) {
	const origRequest = transport.request.bind(transport);
	transport.request = async function(remote, method, body, headers, signal) {
		let merged;
		if (Array.isArray(headers)) {
			const existingLC = new Set(headers.map(([n]) => n.toLowerCase()));
			const extra = _VE_HEADERS.filter(([n]) => !existingLC.has(n.toLowerCase()));
			merged = [...extra, ...headers];
		} else if (headers && typeof headers === 'object') {
			const existingLC = new Set(Object.keys(headers).map(k => k.toLowerCase()));
			const extra = _VE_HEADERS.filter(([n]) => !existingLC.has(n.toLowerCase()));
			merged = [...extra, ...Object.entries(headers)];
		} else {
			merged = [..._VE_HEADERS];
		}
		return origRequest(remote, method, body, merged, signal);
	};
	return transport;
}

/**
 * Wraps a ProxyTransport so that response headers are always returned as a
 * flat [[name, value], ...] array, regardless of what the underlying transport
 * returns.  LibcurlClient (and some epoxy versions) return headers as a plain
 * dict  { name: [values] }  which is NOT iterable as [name, value] pairs.
 * brc.js's cookie processor (function m) does  `for (let [t,s] of rawHeaders)`
 * without a fallback, so a non-iterable object throws "TypeError: i is not
 * iterable".  This shim fixes that at the transport boundary.
 */
function _wrapTransportHeaders(transport) {
	const origRequest = transport.request.bind(transport);
	transport.request = async function(remote, method, body, headers, signal) {
		const resp = await origRequest(remote, method, body, headers, signal);
		if (resp && resp.headers && !Array.isArray(resp.headers)) {
			const flat = [];
			for (const [name, values] of Object.entries(resp.headers)) {
				const arr = Array.isArray(values) ? values : [values];
				for (const value of arr) {
					flat.push([name, value]);
				}
			}
			resp.headers = flat;
		}
		return resp;
	};
	return transport;
}

/** Injects a script tag and waits for it to load (needed for IIFE scripts). */
function _loadScript(src) {
	return new Promise((resolve, reject) => {
		if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
		const s = document.createElement("script");
		s.src = src;
		s.onload = resolve;
		s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
		document.head.appendChild(s);
	});
}

/**
 * Ensures the BRC Controller is initialized. Safe to call multiple times.
 * Resolves when BRC is ready (or failed gracefully).
 */
async function ensureBRC() {
	if (_brcInitPromise) return _brcInitPromise;
	_brcInitPromise = (async () => {
		try {
			// Load controller API as script tag (IIFE — sets window.$brcController)
			console.log("lethal.js: BRC [1/5] loading controller.api.js…");
			await _loadScript("/scram/controller.api.js");

			// Wait for a SW controller to be active
			// Double-check inside the promise to avoid a race where the event fires
			// before our listener is registered (controller already active).
			console.log("lethal.js: BRC [2/5] waiting for SW controller…");
			let sw = navigator.serviceWorker.controller;
			if (!sw) {
				await new Promise((resolve) => {
					if (navigator.serviceWorker.controller) { resolve(); return; }
					navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
				});
				sw = navigator.serviceWorker.controller;
			}
			if (!sw) throw new Error("no SW controller available");

			console.log("lethal.js: BRC [3/5] creating transport…");
			const transport = await _createBRCTransport();

			console.log("lethal.js: BRC [4/5] creating Controller…");
			const { Controller, config } = window.$brcController;
			config.brcPath     = "/scram/brc.js";
			config.injectPath  = "/scram/controller.inject.js";
			config.wasmPath    = "/scram/brc.wasm";

			// Use a temp variable — brcController must stay null until fully ready.
			// getProxied() does `brcController !== null` as a zero-wait readiness check,
			// so assigning brcController here (before wait() completes) would let
			// requests through before WASM is loaded and SW RPC is operational.
			const _ctrl = new Controller({ serviceworker: sw, transport });

			// Wait for WASM to load and SW handshake to complete.
			// 8s timeout — with brc.wasm cached in the SW this resolves in ~150-300ms.
			console.log("lethal.js: BRC [5/5] waiting for WASM + SW handshake…");
			await Promise.race([
				_ctrl.wait(),
				new Promise((_, reject) => setTimeout(() => reject(new Error("BRC ready timeout")), 8000)),
			]);

			// Only expose brcController AFTER wait() — now it's truly ready.
			brcController = _ctrl;

			// Wire up any existing tabs
			document.querySelectorAll('iframe[id^="frame-"]').forEach((iframe) => {
				const num = parseInt(iframe.id.replace("frame-", ""), 10);
				if (!brcFrameMap.has(num)) {
					try { brcFrameMap.set(num, brcController.createFrame(iframe)); } catch {}
				}
			});

			// Pre-register a BRC frame for embedded contexts (e.g. tab.html) where no
			// frame-N iframes exist. We do this here — during BRC init — so the SW has
			// time to receive and process the route-registration postMessage BEFORE the
			// user navigates (avoiding the Vercel 404 that results from a race between
			// createFrame() and the subsequent location.href assignment).
			if (!document.querySelector('iframe[id^="frame-"]') && !brcFrameMap.has(0)) {
				let hidden = document.getElementById('brc-hidden-frame');
				if (!hidden) {
					hidden = document.createElement('iframe');
					hidden.id = 'brc-hidden-frame';
					hidden.style.cssText = 'display:none;position:absolute;width:0;height:0;pointer-events:none;';
					document.body.appendChild(hidden);
				}
				try { brcFrameMap.set(0, brcController.createFrame(hidden)); } catch(e) {}
			}

			console.log("lethal.js: BRC controller ready ✦");
			document.dispatchEvent(new CustomEvent("brc-ready"));
			// Only forward events to the top frame when running inside a subframe
			// (e.g. tab.html). In the top frame document === window.top.document so
			// dispatching twice would fire every listener twice → duplicate toasts.
			try {
				if (window !== window.top) {
					window.top.document.dispatchEvent(new CustomEvent("brc-ready"));
				}
			} catch {}

			// Keep the SW alive by sending a heartbeat every 25 s.
			// Chrome terminates idle SWs after ~30 s, which wipes the registered route
			// prefixes in controller.sw.js (i[]).  The heartbeat prevents that.
			setInterval(() => {
				navigator.serviceWorker.controller?.postMessage?.({ type: "keepalive" });
			}, 25000);
		} catch (e) {
			console.warn("lethal.js: BRC init failed —", e.message);
			brcController = null;
			// Pre-warm scramjet immediately so the fallback is ready when the user navigates
			ensureScramjet().catch(() => {});
			const failEv = new CustomEvent("brc-failed", { detail: { error: e.message } });
			document.dispatchEvent(failEv);
			// Only forward to top when in a subframe (avoid duplicate notifications)
			try {
				if (window !== window.top) {
					window.top.document.dispatchEvent(new CustomEvent("brc-failed", { detail: { error: e.message } }));
				}
			} catch {}
		}
	})();
	return _brcInitPromise;
}

registerSW()
	.then(async () => {
		console.log("lethal.js: SW registered");
		// Kick off BRC init in the background if the user has it selected.
		// Scramjet is currently incompatible — no longer pre-warmed.
		if (localStorage.getItem("pr0xy") === "scram") {
			ensureBRC().catch(() => {});
		}
	})
	.catch((err) =>
		console.error("lethal.js: failed to register service worker:", err),
	);


//////////////////////////////
///        Functions       ///
//////////////////////////////

/**
 * Creates a valid URL from input or returns a search URL.
 * @param {string} input - The input string or URL.
 * @param {string} [template="http://duckduckgo.com/?q=%s"] - Search URL template.
 * @returns {string} Valid URL string.
 */
export function makeURL(input, template = "http://duckduckgo.com/?q=%s") {
	// Preserve internal celestial:// protocol and bare paths — don't rewrite them
	if (input.startsWith("celestial://") || input.startsWith("/")) return input;

	try {
		return new URL(input).toString();
	} catch (err) { }

	const url = new URL(`http://${input}`);
	if (url.hostname.includes(".")) return url.toString();

	return template.replace("%s", encodeURIComponent(input));
}

/**
 * Updates BareMux connection with current transport and wisp URLs.
 * @returns {Promise<void>}
 */
async function updateBareMux() {
	if (transportURL != null && wispURL != null) {
		console.log(`lethal.js: setting transport to ${transportURL} and wisp to ${wispURL}`);
		await connection.setTransport(transportURL, [{ wisp: wispURL }]);
	}
}

/**
 * Sets the transport URL and updates BareMux.
 * @param {string} transport - Transport name or URL.
 * @returns {Promise<void>}
 */
export async function setTransport(transport) {
	console.log(`lethal.js: setting transport to ${transport}`);
	transportURL = transportOptions[transport] || transport;
	await updateBareMux();
}

/**
 * Gets the current transport URL.
 * @returns {string | undefined}
 */
export function getTransport() {
	return transportURL;
}

/**
 * Sets the wisp URL and updates BareMux.
 * @param {string} wisp - Wisp URL.
 * @returns {Promise<void>}
 */
export async function setWisp(wisp) {
	console.log(`lethal.js: setting wisp to ${wisp}`);
	wispURL = wisp;
	await updateBareMux();
}

/**
 * Gets the current wisp URL.
 * @returns {string | undefined}
 */
export function getWisp() {
	return wispURL;
}

/**
 * Sets the proxy backend option and dynamically imports scripts if needed.
 * @param {string} proxy - Proxy backend name.
 * @returns {Promise<void>}
 */
export async function setProxy(proxy) {
	console.log(`lethal.js: proxy backend is ${proxy}`);
	if (proxy === "violet") {
		await import("/violet/violet.bundle.js");
		await import("/violet/violet.config.js");
	}
	proxyOption = proxy;
	// Eagerly pre-init scramjet if selected
	if (proxy === "scramjet") ensureScramjet().catch(() => {});
}

/**
 * Gets the current proxy backend option.
 * @returns {string | undefined}
 */
export function getProxy() {
	return proxyOption;
}

/**
 * Gets the proxied URL based on the current proxy option.
 * @param {string} input - The input URL or hostname.
 * @returns {Promise<string>}
 */
export async function getProxied(input) {
	const url = makeURL(input);

	// ── Internal / same-origin URLs — never proxy these ──────────────────────
	// celestial:// is the internal protocol for built-in pages
	if (url.startsWith("celestial://")) {
		const path = url.slice("celestial://".length).replace(/^\/+/, "");
		if (path === "newtab" || path === "") return "/tab.html";
		return "/" + path; // best-effort: celestial://foo → /foo
	}
	// Same-origin URLs are already served by this Vercel deployment — no proxy needed
	try {
		const parsed = new URL(url);
		if (parsed.origin === location.origin) return url;
	} catch {}
	// Bare relative paths (starting with /) are same-origin by definition
	if (url.startsWith("/")) return url;
	// ─────────────────────────────────────────────────────────────────────────

	if (proxyOption === "scram") {
		// If BRC init is in flight, wait for it (up to 5 s) before falling back.
		// In fresh document contexts (e.g. cog.js quick-apps via document.write)
		// BRC starts from scratch but resolves in ~150–300 ms once WASM is cached.
		// Without this wait the very first click always misses BRC and falls through.
		if (!brcController && _brcInitPromise) {
			await Promise.race([
				_brcInitPromise,
				new Promise(r => setTimeout(r, 5000)),
			]);
		}
		const brcReady = brcController !== null;

		if (brcReady && brcController) {
			let frame = brcFrameMap.get(currentTab);
			// Frame might be missing due to a race between tab creation and BRC
			// init completing — create it on the fly if so.
			if (!frame) {
				let iframe = document.getElementById(`frame-${currentTab}`);
				// In embedded contexts (e.g. tab.html inside an iframe) there is no
				// frame-N element. Create a hidden iframe so we can still get a BRC
				// prefix and build the proxied URL correctly.
				if (!iframe) {
					iframe = document.getElementById('brc-hidden-frame');
					if (!iframe) {
						iframe = document.createElement('iframe');
						iframe.id = 'brc-hidden-frame';
						iframe.style.cssText = 'display:none;position:absolute;width:0;height:0;pointer-events:none;';
						document.body.appendChild(iframe);
					}
				}
				if (iframe) {
					try {
						frame = brcController.createFrame(iframe);
						brcFrameMap.set(currentTab, frame);
						// Give the SW 150 ms to receive and process the route-registration
						// postMessage from createFrame() before we return the prefix URL.
						// Without this delay the SW's shouldRoute() check fires before the
						// route is registered, falls through to Vercel, and returns 404.
						await new Promise(r => setTimeout(r, 150));
					} catch(e) {}
				}
			}
			if (frame) return frame.prefix + encodeURIComponent(url);
		}
		// BRC not ready — skip scramjet (currently incompatible), fall through to UV.
	} else if (proxyOption === "scramjet") {
		// Scramjet is currently marked incompatible — fall straight through to UV.
		console.warn("lethal.js: scramjet selected but incompatible, falling back to UV");
	}
	return window.__uv$config.prefix + window.__uv$config.encodeUrl(url);
}

/**
 * Sets the container element for frames.
 * @param {HTMLElement} frames - The frames container element.
 */
export function setFrames(frames) {
	framesElement = frames;
}

/**
 * Class representing a browser tab with its own iframe.
 */
export class Tab {
	/* 
	 * Creates a new tab with an iframe and appends it to frames container.
	 */
	constructor() {
		tabCounter++;
		this.tabNumber = tabCounter;
		this.displayUrl = "";

		this.frame = document.createElement("iframe");
		this.frame.setAttribute("class", "searchframe");
		this.frame.setAttribute("title", "P-Frame");
		this.frame.setAttribute("src", "/tab.html");
		this.frame.setAttribute("loading", "lazy");
		this.frame.setAttribute("id", `frame-${tabCounter}`);
		framesElement.appendChild(this.frame);

		this.switch();

		this.frame.addEventListener("load", () => this.handleLoad());

		// Register a BRC frame for this tab (async — non-blocking)
		const tabNum = this.tabNumber;
		const frameEl = this.frame;
		ensureBRC().then(() => {
			if (brcController && !brcFrameMap.has(tabNum)) {
				try { brcFrameMap.set(tabNum, brcController.createFrame(frameEl)); } catch {}
			}
		}).catch(() => {});

		document.dispatchEvent(
			new CustomEvent("new-tab", {
				detail: { tabNumber: tabCounter },
			}),
		);
	}

	/**
	 * Switches to this tab, hiding other iframes and updating the address input.
	 */
	switch() {
		currentTab = this.tabNumber;
		const frames = document.querySelectorAll("iframe");
		[...frames].forEach((frame) => frame.classList.add("hidden"));
		this.frame.classList.remove("hidden");

		currentFrame = document.getElementById(`frame-${this.tabNumber}`);

		if (this.displayUrl) addressInput.value = this.displayUrl;

		document.dispatchEvent(
			new CustomEvent("switch-tab", {
				detail: { tabNumber: this.tabNumber },
			}),
		);
	}

	/**
	 * Closes this tab by removing its iframe and dispatching a close event.
	 */
	close() {
		this.frame.remove();
		brcFrameMap.delete(this.tabNumber);

		document.dispatchEvent(
			new CustomEvent("close-tab", {
				detail: { tabNumber: this.tabNumber },
			}),
		);
	}

	/**
	 * Handles iframe load event: updates history and address input.
	 */
	handleLoad() {
		// Safety net: if the frame landed on a broken /scramjet/ URL (SW doesn't
		// handle scramjet routes when scramjet is incompatible), extract the
		// original URL and re-proxy it through the current proxy settings.
		try {
			const href = this.frame?.contentWindow?.location?.href || '';
			const SCRAMJET_ORIGIN_PREFIX = location.origin + '/scramjet/';
			if (href.startsWith(SCRAMJET_ORIGIN_PREFIX)) {
				const encoded = href.slice(SCRAMJET_ORIGIN_PREFIX.length);
				const originalUrl = decodeURIComponent(encoded);
				if (originalUrl.startsWith('http')) {
					getProxied(originalUrl).then(proxied => {
						// Only reroute when we got a real proxy URL back (not another scramjet path)
						if (!proxied.includes('/scramjet/') && this.frame?.contentWindow) {
							this.frame.contentWindow.location.href = proxied;
						}
					}).catch(() => {});
					return; // skip the rest of handleLoad — another load event will follow
				}
			}
		} catch(e) {} // cross-origin guard

		this.statusObject = { isLoading: true, timesErrored: 0 };
		// After the iframe navigates to a proxied (cross-origin) page, reading
		// location.href or document.title throws a SecurityError. Swallow it.
		let url, title;
		try {
			url = decodeURIComponent(
				this.frame?.contentWindow?.location.href.split("/").pop()
			);
			title = this.frame?.contentWindow?.document.title;
		} catch(e) { url = ""; title = ""; }

		let history = localStorage.getItem("history")
			? JSON.parse(localStorage.getItem("history"))
			: [];
		history = [...history, { url, title }];
		localStorage.setItem("history", JSON.stringify(history));

		const checkForIframeError = () => {
			try {
				const iframeDoc = this.frame.contentDocument || this.frame.contentWindow.document;

				const bodyText = iframeDoc.body?.textContent?.toLowerCase() || "";

				const hasBareClientError = bodyText.includes("there are no bare clients");
				const hasErrorTitle = iframeDoc.querySelector("#errorTitle");

				const shouldReload =
					this.statusObject.timesErrored < 5 && (hasBareClientError || hasErrorTitle);

				if (shouldReload) {
					this.statusObject.timesErrored++;
					this.frame.contentWindow.location.reload();
					return true;
				} else {
					this.statusObject.timesErrored = 0;
					return false;
				}
			} catch {
				return false;
			}
		};

		if (!checkForIframeError()) {
			setTimeout(checkForIframeError, 1000);
		}

		document.dispatchEvent(
			new CustomEvent("url-changed", {
				detail: { tabId: this.tabNumber, title, url },
			}),
		);
		// lithium wont like detect folders/directories, so i had to do this. pretty inefficient.
		if (url === "tab.html") url = "celestial://newtab";
		if (url === "index.html?type=g") url = "celestial://games";
		if (url === "index.html?type=part") url = "celestial://misc";
		if (url === "index.html?type=c") url = "celestial://chat";
		if (url === "index.html?type=m") url = "celestial://media";
		if (url === "index.html?type=ap") url = "celestial://quick";
		if (url === "index.html?type=s") url = "celestial://settings";
		if (url === "index.html?type=l") url = "celestial://legal";
		if (url === "index.html#r") url = "celestial://ngg";
		if (url.includes("tab.html?autofill=")) url = "loading..";
		if (url === "b.html") url = "loading..";

		this.displayUrl = url;
		this.frame.dataset.displayUrl = url;

		if (currentTab !== this.tabNumber) return;

		addressInput.value = url;


	}
}


/**
 * Creates a new tab.
 * @returns {Promise<void>}
 */
export async function newTab() {
	new Tab();
}

/**
 * Switches to the specified tab number.
 * @param {number} tabNumber - Tab number to switch to.
 */
export function switchTab(tabNumber) {
	const frames = document.querySelectorAll("iframe");
	frames.forEach((frame) => {
		frame.classList.toggle("hidden", frame.id !== `frame-${tabNumber}`);
	});

	currentTab = tabNumber;
	currentFrame = document.getElementById(`frame-${tabNumber}`);

	addressInput.value = currentFrame.dataset.displayUrl || "";

	document.dispatchEvent(
		new CustomEvent("switch-tab", {
			detail: { tabNumber },
		}),
	);
}


/**
 * Closes the tab with the specified tab number.
 * @param {number} tabNumber - Tab number to close.
 */
export function closeTab(tabNumber) {
	const frames = document.querySelectorAll("iframe");
	[...frames].forEach((frame) => {
		if (frame.id === `frame-${tabNumber}`) {
			frame.remove();
		}
	});

	if (currentTab === tabNumber) {
		const otherFrames = document.querySelectorAll('iframe[id^="frame-"]');
		if (otherFrames.length > 0) {
			switchTab(parseInt(otherFrames[0].id.replace("frame-", "")));
		} else {
			newTab();
		}
	}

	document.dispatchEvent(
		new CustomEvent("close-tab", {
			detail: { tabNumber },
		}),
	);
}