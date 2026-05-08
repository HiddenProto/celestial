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
const { BrcController } = window.$brcLoadController();
const scramjet = new BrcController({
	files: {
		wasm: "/scram/brc.wasm",
		all: "/scram/brc.js",
		sync: "/scram/brc.sync.js",
	},
	flags: {
		rewriterLogs: false,
		naiiveRewriter: false,
		scramitize: false,
	},
	siteFlags: {
		"https://www.google.com/(search|sorry).*": {
			naiiveRewriter: true,
		},
	},
});
scramjet.init();


registerSW()
	.then(() => console.log("lethal.js: SW registered"))
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
	if (proxyOption === "scram") return scramjet.encodeUrl(url);
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