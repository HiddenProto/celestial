/**
 * ve-inject.js — Virtual Entity browser fingerprint injection
 * ─────────────────────────────────────────────────────────────
 * SAFE-ONLY overrides: only Object.defineProperty value spoofs.
 * We do NOT override any native functions (createElement, postMessage,
 * getParameter, permissions.query, Error) — those overrides are detectable
 * via Function.prototype.toString() returning non-"[native code]" strings,
 * which is a primary Google/YouTube bot-detection signal.
 *
 * Rule: if the patch requires wrapping a native function, skip it.
 */
(function ve() {
  'use strict';
  if (typeof window === 'undefined') return;

  // ── Helper: safe Object.defineProperty (value only, no function wrap) ─────
  function def(obj, prop, val) {
    try {
      Object.defineProperty(obj, prop, {
        get: () => val,
        configurable: true,
        enumerable: true,
      });
    } catch (_) {}
  }

  // ── 1. navigator value overrides ───────────────────────────────────────────
  // These are plain value getters — no native function is wrapped, so
  // toString() checks against these properties cannot detect the override.
  const navProto = window.Navigator && window.Navigator.prototype
    || Object.getPrototypeOf(navigator);

  // webdriver: real Chrome in a real browser has this as undefined (not true).
  // Only patch if it's actually set to true (which shouldn't happen in real Chrome).
  if (navigator.webdriver === true) {
    def(navProto, 'webdriver', undefined);
  }

  const VE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

  // Only override if the current UA differs (e.g. the page runs in a context
  // where BRC has changed the UA string).
  if (navigator.userAgent !== VE_UA) {
    def(navProto, 'userAgent',  VE_UA);
    def(navProto, 'appVersion', '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
  }

  // These are safe to always set — they're plain string/number values.
  def(navProto, 'platform',    'Win32');
  def(navProto, 'vendor',      'Google Inc.');
  def(navProto, 'vendorSub',   '');
  def(navProto, 'productSub',  '20030107');
  def(navProto, 'language',    'en-US');
  def(navProto, 'languages',   Object.freeze(['en-US', 'en']));
  def(navProto, 'hardwareConcurrency', 8);
  def(navProto, 'deviceMemory',        8);
  def(navProto, 'maxTouchPoints',      0);
  def(navProto, 'cookieEnabled',       true);
  def(navProto, 'doNotTrack',          null);

  // ── 2. window.chrome guard ─────────────────────────────────────────────────
  // In a real Chrome browser (which this is), window.chrome already exists.
  // This block is a safety net only — it should be a no-op on real Chrome.
  // We do NOT replace an existing chrome object; only fill in if truly missing.
  if (!window.chrome) {
    try {
      Object.defineProperty(window, 'chrome', {
        value: {
          app: {
            isInstalled: false,
            getDetails:     () => null,
            getIsInstalled: () => false,
            installState:   cb => cb && cb('not_installed'),
            runningState:   () => 'cannot_run',
          },
          runtime: {},
          loadTimes: function() {
            const t0 = performance.timeOrigin / 1000;
            return {
              requestTime: t0, startLoadTime: t0, commitLoadTime: t0 + 0.05,
              finishDocumentLoadTime: 0, finishLoadTime: 0,
              firstPaintTime: 0, firstPaintAfterLoadTime: 0,
              navigationType: 'Other',
              wasFetchedViaSpdy: true, wasNpnNegotiated: true,
              npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false,
              connectionInfo: 'h2',
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
        },
        writable: true,
        configurable: true,
      });
    } catch (_) {}
  }

  // ── 3. iframe allow delegation ─────────────────────────────────────────────
  // For iframes the proxied PAGE creates (YouTube embeds, etc.):
  // We set allow via a MutationObserver rather than wrapping createElement —
  // MutationObserver is not detectable via toString() checks.
  try {
    const ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture; web-share; clipboard-write';
    const obs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeName === 'IFRAME' && !node.allow) {
            node.allow = ALLOW;
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

})();
