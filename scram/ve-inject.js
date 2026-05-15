/**
 * ve-inject.js — Virtual Entity browser fingerprint injection
 * ─────────────────────────────────────────────────────────────
 * Injected as the FIRST script into every BRC-proxied page.
 * Goal: make bot-detection systems see a real Chrome 136 / Windows 10 browser.
 *
 * Covers:
 *  1. navigator — webdriver=false, userAgent, platform, vendor, languages,
 *                 hardwareConcurrency, deviceMemory, maxTouchPoints, plugins
 *  2. window.chrome — runtime, app, loadTimes, csi (Chrome presence check)
 *  3. WebGL — vendor/renderer strings (canvas fingerprint)
 *  4. Permissions API — notifications returns "default" not "denied"
 *  5. Media capabilities — autoplay, encrypted-media unlocked
 *  6. Sign-in helpers — credentials flag, iframe allow propagation
 */
(function ve() {
  'use strict';
  if (typeof window === 'undefined') return;

  // ── Helper: safe Object.defineProperty ────────────────────────────────────
  function def(obj, prop, val, opts) {
    try {
      Object.defineProperty(obj, prop, Object.assign({
        get: typeof val === 'function' ? val : () => val,
        configurable: true,
        enumerable: true,
      }, opts));
    } catch (_) {}
  }

  // ── 1. navigator overrides ─────────────────────────────────────────────────
  const nav = window.Navigator && window.Navigator.prototype || Object.getPrototypeOf(navigator);

  // webdriver MUST be false — its presence or true value is the #1 bot signal
  def(nav, 'webdriver', false);

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
  def(nav, 'userAgent',   UA);
  def(nav, 'appVersion',  '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
  def(nav, 'platform',    'Win32');
  def(nav, 'vendor',      'Google Inc.');
  def(nav, 'vendorSub',   '');
  def(nav, 'productSub',  '20030107');
  def(nav, 'appCodeName', 'Mozilla');
  def(nav, 'appName',     'Netscape');
  def(nav, 'language',    'en-US');
  def(nav, 'languages',   Object.freeze(['en-US', 'en']));
  def(nav, 'hardwareConcurrency', 8);
  def(nav, 'deviceMemory',        8);
  def(nav, 'maxTouchPoints',      0);
  def(nav, 'cookieEnabled',       true);
  def(nav, 'doNotTrack',          null);
  def(nav, 'globalPrivacyControl', undefined);
  // connection — basic NetworkInformation object
  try {
    const conn = navigator.connection || {};
    if (!conn.effectiveType) def(conn, 'effectiveType', '4g');
    if (!conn.rtt)            def(conn, 'rtt', 50);
    if (!conn.downlink)       def(conn, 'downlink', 10);
    if (!conn.saveData)       def(conn, 'saveData', false);
    if (!navigator.connection) def(nav, 'connection', conn);
  } catch (_) {}

  // Chrome 136 has built-in PDF viewer plugins (headless has empty list)
  try {
    const mime = { type: 'application/pdf', suffixes: 'pdf', description: '', enabledPlugin: null };
    function makePlugin(name) {
      const p = { name, filename: 'internal-pdf-viewer', description: '', length: 1, 0: mime };
      p.item = i => (i === 0 ? mime : null);
      p.namedItem = n => (n === 'application/pdf' ? mime : null);
      p[Symbol.iterator] = function*() { yield mime; };
      return p;
    }
    const names = [
      'PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer',
      'Microsoft Edge PDF Viewer', 'WebKit built-in PDF',
    ];
    const arr = names.map(makePlugin);
    Object.assign(arr, {
      item: i => arr[i] || null,
      namedItem: n => arr.find(p => p.name === n) || null,
      refresh: () => {},
      [Symbol.iterator]: Array.prototype[Symbol.iterator].bind(arr),
    });
    def(nav, 'plugins', arr);

    const mimeArr = [mime];
    Object.assign(mimeArr, {
      item: i => mimeArr[i] || null,
      namedItem: n => mimeArr.find(m => m.type === n) || null,
      [Symbol.iterator]: Array.prototype[Symbol.iterator].bind(mimeArr),
    });
    def(nav, 'mimeTypes', mimeArr);
  } catch (_) {}

  // ── 2. window.chrome ───────────────────────────────────────────────────────
  // Absence of window.chrome is the #2 bot signal for Google services.
  if (!window.chrome || !window.chrome.runtime) {
    const chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails:      () => null,
        getIsInstalled:  () => false,
        installState:    cb => cb && cb('not_installed'),
        runningState:    () => 'cannot_run',
      },
      runtime: {
        // No id — not an extension. Having an empty runtime (but no id) is correct for normal Chrome.
        OnInstalledReason:        { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason:  { APP_UPDATE: 'app_update', GC_POLL: 'gc_poll', OS_UPDATE: 'os_update' },
        PlatformArch:             { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs:               { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        PlatformNaclArch:         { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
        connect:     () => {},
        sendMessage: () => {},
      },
      loadTimes: function() {
        const t0 = performance.timeOrigin / 1000;
        return {
          requestTime:              t0,
          startLoadTime:            t0,
          commitLoadTime:           t0 + 0.05,
          finishDocumentLoadTime:   0,
          finishLoadTime:           0,
          firstPaintTime:           0,
          firstPaintAfterLoadTime:  0,
          navigationType:           'Other',
          wasFetchedViaSpdy:        true,
          wasNpnNegotiated:         true,
          npnNegotiatedProtocol:    'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo:           'h2',
        };
      },
      csi: function() {
        return {
          startE: Math.floor(performance.timeOrigin),
          onloadT: Math.floor(performance.timeOrigin + performance.now()),
          pageT: performance.now(),
          tran: 15,
        };
      },
    };
    try { Object.defineProperty(window, 'chrome', { value: chrome, writable: true, configurable: true }); }
    catch (_) { try { window.chrome = chrome; } catch (__) {} }
  }

  // ── 3. WebGL fingerprint ───────────────────────────────────────────────────
  // Bot detectors query UNMASKED_VENDOR/RENDERER for canvas fingerprinting.
  const GL_VENDOR   = 0x9245;
  const GL_RENDERER = 0x9246;
  const GL_VENDOR_STR   = 'Google Inc. (NVIDIA)';
  const GL_RENDERER_STR = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';

  function patchWebGL(proto) {
    if (!proto) return;
    const orig = proto.getParameter;
    proto.getParameter = function(param) {
      if (param === GL_VENDOR)   return GL_VENDOR_STR;
      if (param === GL_RENDERER) return GL_RENDERER_STR;
      return orig.call(this, param);
    };
  }
  try { patchWebGL(WebGLRenderingContext.prototype); } catch (_) {}
  try { patchWebGL(WebGL2RenderingContext.prototype); } catch (_) {}

  // ── 4. Permissions API ─────────────────────────────────────────────────────
  // Headless Chrome returns "denied" for notifications — real Chrome returns "default".
  // Google's sign-in and reCAPTCHA check this.
  try {
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = async function(desc) {
      if (desc && desc.name === 'notifications') {
        return Object.assign(Object.create(PermissionStatus.prototype), { state: 'default', onchange: null });
      }
      try { return await origQuery(desc); }
      catch (_) { return { state: 'prompt', onchange: null }; }
    };
  } catch (_) {}

  // ── 5. Automation / headless detection patches ─────────────────────────────
  // Remove keys that headless Chrome leaves behind on window/document
  try { delete window.__nightmare; }    catch (_) {}
  try { delete window._phantom; }       catch (_) {}
  try { delete window.callPhantom; }    catch (_) {}
  try { delete window.__selenium_evaluate; } catch (_) {}
  try { delete window.__webdriver_evaluate; } catch (_) {}
  try { delete window.domAutomation; }  catch (_) {}
  try { delete window.domAutomationController; } catch (_) {}

  // Overwrite error stack trace toString to hide "HeadlessChrome" in UA
  const origErr = window.Error;
  try {
    window.Error = function(...args) {
      const e = new origErr(...args);
      if (e.stack) e.stack = e.stack.replace(/HeadlessChrome/g, 'Chrome');
      return e;
    };
    Object.setPrototypeOf(window.Error, origErr);
    window.Error.prototype = origErr.prototype;
  } catch (_) {}

  // ── 6. Screen / window geometry ────────────────────────────────────────────
  // Reasonable 1920×1080 desktop values — only set if the host page hasn't set them.
  // We don't aggressively override screen because some proxy hosts may want real values.
  try {
    const scr = window.Screen && window.Screen.prototype || Object.getPrototypeOf(screen);
    if (screen.width  < 1024) def(scr, 'width',       1920);
    if (screen.height < 600)  def(scr, 'height',      1080);
    if (screen.availWidth  < 1024) def(scr, 'availWidth',  1920);
    if (screen.availHeight < 600)  def(scr, 'availHeight', 1040);
    def(scr, 'colorDepth', 24);
    def(scr, 'pixelDepth', 24);
  } catch (_) {}

  // ── 7. iframe allow-feature propagation ────────────────────────────────────
  // When a proxied page creates iframes (e.g. YouTube embeds), ensure they
  // inherit autoplay + encrypted-media so videos play inside sub-iframes.
  const ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture; web-share; clipboard-write';
  const origCreate = document.createElement.bind(document);
  try {
    document.createElement = function(tag, opts) {
      const el = origCreate(tag, opts);
      if (typeof tag === 'string' && tag.toLowerCase() === 'iframe') {
        // Set after the next microtask so the caller can still read/write allow
        Promise.resolve().then(() => {
          if (!el.allow) el.allow = ALLOW;
        });
      }
      return el;
    };
  } catch (_) {}

  // ── 8. YouTube-specific helpers ────────────────────────────────────────────
  // YouTube checks document.featurePolicy / permissionsPolicy for autoplay.
  // We stub these so they always report the feature as allowed.
  try {
    if (document.featurePolicy && typeof document.featurePolicy.allowsFeature === 'function') {
      const origAllows = document.featurePolicy.allowsFeature.bind(document.featurePolicy);
      document.featurePolicy.allowsFeature = function(feature) {
        if (['autoplay', 'encrypted-media', 'fullscreen', 'picture-in-picture'].includes(feature)) return true;
        return origAllows(feature);
      };
    }
  } catch (_) {}

  // YouTube iframe API postMessage bridge — allow messages from youtube.com origins
  // regardless of the current proxy origin, so the YouTube iframe API works.
  try {
    const origAEL = window.addEventListener.bind(window);
    const origREL = window.removeEventListener.bind(window);
    const ytOrigins = ['https://www.youtube.com', 'https://www.youtube-nocookie.com'];
    // Monkey-patch postMessage to strip origin checks for YouTube API messages
    const origPM = window.postMessage.bind(window);
    window.postMessage = function(data, targetOrigin, transfer) {
      return origPM(data, targetOrigin || '*', transfer);
    };
  } catch (_) {}

})();
