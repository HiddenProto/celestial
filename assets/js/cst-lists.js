/* ============================================================
   cst-lists.js — single source of truth for the option lists used
   across celestial: user settings (index.html) AND the admin panel.
   Add an entry here ONCE and it shows up in every dropdown that opts in
   via data-cst-list="<name>" (full replace) or data-cst-sync="<name>"
   (append missing, keeps a hardcoded blank/first option).

   Values MUST match what the code actually reads from localStorage:
     proxies    → localStorage 'pr0xy'      (scram | scramjet | violet)
     transports → localStorage 'transportz' (libcurl | epoxy | photon)
     wisps      → localStorage 'location'    (wss URL | __local__ | static | custom)
     themes     → localStorage 'theme'
   ============================================================ */
(function () {
  'use strict';

  window.CST_LISTS = {
    proxies: [
      { value: 'scram',    label: 'bumblcat rrc' },
      { value: 'scramjet', label: 'scramjet' },
      { value: 'violet',   label: 'ultraviolet' },
    ],
    transports: [
      { value: 'libcurl', label: 'libcurl' },
      { value: 'epoxy',   label: 'epoxy' },
      { value: 'photon',  label: 'photon (coming soon)', disabled: true },
    ],
    wisps: [
      { value: 'wss://celestial.press/wisp/',        label: '00x1' },
      { value: 'wss://wisp.mercurywork.shop/',       label: 'mercury workshop' },
      { value: 'wss://celestial-wisp.onrender.com/', label: "bumblcat's server" },
      { value: 'wss://anura.pro/wisp/',              label: 'anura (free)' },
      { value: 'wss://wisp.nodeppt.com/',            label: 'nodeppt (free)' },
      { value: '__local__', label: 'local Wisp' },
      { value: 'static',    label: 'no Wisp (photon)' },
      { value: 'custom',    label: 'custom server...' },
    ],
    themes: [
      { value: 'default',       label: 'default',           style: 'color:white;background:black' },
      { value: 'light',         label: 'light',             style: 'color:black;background:#f5f5f5' },
      { value: 'midnight',      label: 'midnight blue',     style: 'color:white;background:darkblue' },
      { value: 'mocha',         label: 'mocha',             style: 'color:white;background:rgb(24,18,14)' },
      { value: 'pisscolorlmao', label: 'jmw v6',            style: 'color:#adad43;background:#222222' },
      { value: 'quasar',        label: 'quasar',            style: 'color:white;background:rgb(73,153,219)' },
      { value: 'ccm',           label: 'catppuccin mocha',  style: 'color:white;background:#1a1b26' },
      { value: 'frappe',        label: 'catppuccin frappe', style: 'color:#d9e0ee;background:#0d0d1f' },
      { value: 'saywallahibro', label: 'no name brand',     style: 'color:black;background:yellow' },
      { value: 'breakaway',     label: 'breakaway',         style: 'color:#ff3333;background:#070707' },
      { value: 'eww',  label: 'secret theme...',   style: 'color:white;background:pink', disabled: true },
      { value: 'chad', label: 'secret theme 2...', style: 'color:white;background:red',  disabled: true },
      { value: 'apex', label: 'Exotic: Apex',      style: 'color:#c084ff;background:#04000d', disabled: true },
    ],
  };

  function _opt(it) {
    var o = document.createElement('option');
    o.value = it.value;
    o.textContent = it.label;
    if (it.disabled) o.disabled = true;
    if (it.style) o.setAttribute('style', it.style);
    return o;
  }

  // Full replace: rebuild every option from the list.
  window.cstFillSelect = function (sel, listName, opts) {
    var list = window.CST_LISTS[listName];
    if (!sel || !list) return;
    opts = opts || {};
    sel.innerHTML = '';
    list.forEach(function (it) {
      if (opts.skipDisabled && it.disabled) return;
      sel.appendChild(_opt(it));
    });
  };

  // Additive sync: append only the entries the select doesn't already have
  // (keeps a hardcoded blank/first option, e.g. the admin "— no change —").
  window.cstSyncSelect = function (sel, listName) {
    var list = window.CST_LISTS[listName];
    if (!sel || !list) return;
    var have = {};
    Array.prototype.forEach.call(sel.options, function (o) { have[o.value] = 1; });
    list.forEach(function (it) { if (!have[it.value]) sel.appendChild(_opt(it)); });
  };

  // Apply to every opted-in <select> under root (document by default).
  window.cstAutoFill = function (root) {
    var r = root || document;
    r.querySelectorAll('select[data-cst-list]').forEach(function (sel) {
      window.cstFillSelect(sel, sel.getAttribute('data-cst-list'),
        { skipDisabled: sel.hasAttribute('data-cst-skip-disabled') });
    });
    r.querySelectorAll('select[data-cst-sync]').forEach(function (sel) {
      window.cstSyncSelect(sel, sel.getAttribute('data-cst-sync'));
    });
  };

  // Fill the user-settings selects immediately — this script is included after
  // them in index.html, so they exist by now, and the restore scripts
  // (prox.js / s.js / picker.js) run afterwards and set the saved value.
  window.cstAutoFill();
})();
