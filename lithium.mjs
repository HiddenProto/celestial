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




const transportOptions = {
	epoxy: "/epoxy/index.mjs",
	libcurl: "/curl/index.mjs"
};

//////////////////////////////
///           SW           ///
//////////////////////////////
const stockSW = "./ultraworker.js";
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
				naiiveRewriter: true,
				scramitize: false,
			});
			_scramjetController.init();
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

	// CF mode forces epoxy; otherwise use saved transport preference
	const cfMode = localStorage.getItem("cfmode") === "1";
	const savedTransport = localStorage.getItem("transportz") || "libcurl";
	const useEpoxy = cfMode || savedTransport === "epoxy";

	if (useEpoxy) {
		try {
			const { default: EpoxyTransport } = await import("/epoxy/index.mjs");
			return new EpoxyTransport({ wisp });
		} catch (e) {
			console.warn("lethal.js: epoxy transport failed, trying libcurl:", e.message);
		}
	}
	const { default: LibcurlClient } = await import("/curl/index.mjs");
	return new LibcurlClient({ wisp });
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

			brcController = new Controller({ serviceworker: sw, transport });

			// Wait for WASM to load and SW handshake to complete.
			// 8s timeout — with brc.wasm cached in the SW this always resolves in
			// ~150-300ms. The short timeout means failures surface quickly instead
			// of hanging navigations for 30 seconds.
			console.log("lethal.js: BRC [5/5] waiting for WASM + SW handshake…");
			await Promise.race([
				brcController.wait(),
				new Promise((_, reject) => setTimeout(() => reject(new Error("BRC ready timeout")), 8000)),
			]);

			// Wire up any existing tabs
			document.querySelectorAll('iframe[id^="frame-"]').forEach((iframe) => {
				const num = parseInt(iframe.id.replace("frame-", ""), 10);
				if (!brcFrameMap.has(num)) {
					try { brcFrameMap.set(num, brcController.createFrame(iframe)); } catch {}
				}
			});

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
		// Eagerly init BRC if it's the selected proxy.
		// Also pre-warm scramjet as the fallback so it's ready instantly if BRC
		// isn't done loading yet when the user first navigates.
		if (localStorage.getItem("pr0xy") === "scram") {
			ensureBRC().catch(() => {});
			ensureScramjet().catch(() => {});
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
	if (proxyOption === "scram") {
		// Wait for BRC with a 1.5s timeout before falling back to scramjet.
		// With brc.wasm cached in the SW, BRC is ready in ~150-300ms so this
		// race almost always resolves immediately. The 1.5s cap only fires on the
		// very first-ever page load (cold cache) so the user still gets a response
		// quickly rather than hanging.
		const brcReady = await Promise.race([
			ensureBRC().then(() => !!brcController),
			new Promise(resolve => setTimeout(() => resolve(false), 1500)),
		]);

		if (brcReady && brcController) {
			let frame = brcFrameMap.get(currentTab);
			// Frame might be missing due to a race between tab creation and BRC
			// init completing — create it on the fly if so.
			if (!frame) {
				const iframe = document.getElementById(`frame-${currentTab}`);
				if (iframe) {
					try {
						frame = brcController.createFrame(iframe);
						brcFrameMap.set(currentTab, frame);
					} catch(e) {}
				}
			}
			if (frame) return frame.prefix + encodeURIComponent(url);
		}
		// BRC timed out or failed — use scramjet (already pre-warmed alongside BRC).
		await ensureScramjet();
		if (_scramjetController) {
			try { return _scramjetController.encodeUrl(url); } catch(e) {}
		}
		// Final fallback: UV
	} else if (proxyOption === "scramjet") {
		await ensureScramjet();
		if (_scramjetController) {
			try {
				return _scramjetController.encodeUrl(url);
			} catch (e) {
				console.warn("lethal.js: scramjet encodeUrl failed —", e.message);
			}
		}
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
		this.statusObject = { isLoading: true, timesErrored: 0 };
		let url = decodeURIComponent(
			this.frame?.contentWindow?.location.href.split("/").pop()
		);
		let title = this.frame?.contentWindow?.document.title;

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