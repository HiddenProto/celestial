// pre-const
const cloaktog = document.getElementById("cloakTog");

cloaktog.checked = localStorage.autoCloak === "1";

cloaktog.onchange = () => {
  localStorage.autoCloak = cloaktog.checked ? "1" : "0";
  if (cloaktog.checked) location.reload();
  location.reload();
};

const s = document.getElementById("cloakSelect");
s.value = localStorage.getItem("lastCloak") || "ab";
s.onchange = () => localStorage.setItem("lastCloak", s.value);

// settings

// showing the sections
function show(id) {
  const sections = ["cloak", "browsing", "appear", "ext", "misc"];

  sections.forEach((s) => {
    document.getElementById(s).style.display = s === id ? "block" : "none";
  });
}

// secret theme
let t = "";
if (localStorage.getItem("theme"))
  document.body.setAttribute("theme", localStorage.getItem("theme"));

onkeydown = (e) => {
  if (document.activeElement.tagName !== "INPUT") {
    t += e.key.toLowerCase();
    if (t.endsWith("femlover")) {
      alert("you found an easter egg! creep");
      document.body.setAttribute("theme", "eww");
      localStorage.setItem("theme", "eww");
      t = "";
      location.reload();
    }
    if (t.endsWith("revert")) {
      document.body.setAttribute("theme", "default");
      localStorage.setItem("theme", "default");
      t = "";
      location.reload();
    }
    if (t.endsWith("gnmath")) {
      alert(`W gn-math ❤‍🩹`);
      document.body.setAttribute("theme", "chad");
      localStorage.setItem("theme", "chad");
      t = "";
      location.reload();
    }
    if (t.length > 20) t = t.slice(-20);
  }
};

// cloaking

// aboutblank, blob and aboutblank v2
function launch(v) {
  if (!v || v === "select") return;
  localStorage.setItem("lastCloak", v);
  let func;
  if (v === "blob") func = blob;
  if (v === "ab") func = ab;
  if (v === "abbuff") func = abbuff;
  if (!func) return;
  func();
}

function launchCloak() {
  launch(document.getElementById("cloakSelect").value);
}

function autoCloak() {
  if (localStorage.autoCloak !== "1") return;
  const v = localStorage.lastCloak;
  if (v === "blob") blob();
  if (v === "ab") ab();
  if (v === "abbuff") abbuff();
}

function ab() {
  let inFrame;
  try {
    inFrame = window !== top;
  } catch {
    inFrame = true;
  }
  if (!inFrame && !navigator.userAgent.includes("Firefox")) {
    const popup = open("about:blank", "_blank");
    if (!popup || popup.closed) return;
    const doc = popup.document;
    const iframe = doc.createElement("iframe");
    const style = iframe.style;
    const link = doc.createElement("link");
    const name = localStorage.getItem("name") || "about:blank";
    const icon =
      localStorage.getItem("icon") || "https://example.com/favicon.ico";
    doc.title = name;
    link.rel = "icon";
    link.href = icon;
    iframe.src = location.href;
    style.position = "fixed";
    style.top = style.bottom = style.left = style.right = 0;
    style.border = style.outline = "none";
    style.width = style.height = "100%";
    doc.head.appendChild(link);
    doc.body.appendChild(iframe);
    location.replace("https://google.com");
  }
}

function blob() {
  const html = `<!DOCTYPE html><title> </title><iframe src="https://${location.host}/index.html" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe>`;
  const b = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(b);
  const w = window.open(url, "_blank");
  if (w) location.replace("https://google.com");
}

function abbuff() {
  const w = open(
    "about:blank",
    "_blank",
    `width=${screen.availWidth},height=${screen.availHeight}`
  );
  if (!w) return;

  w.document.write(
    `<!DOCTYPE html><title>about:blank</title><link rel="icon" href="https://ssl.gstatic.com/classroom/favicon.png"><style>html,body{margin:0;height:100%}</style><iframe src="https://${location.host}/index.html" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe><script>if(!window.__done){window.__done=1;setTimeout(()=>opener.location.replace("https://google.com"),100)}<\/script>`
  );
}

window.addEventListener("load", () => {
  if (localStorage.autoCloak === "1") autoCloak();
});

// tab cloak
// stolen from jmw lite & rewritten
let initialTitle = "celestial";
let initialFavicon = document.getElementById("favicon").href;

const presets = {
  google: { title: "Google", favicon: "https://www.google.com/favicon.ico" },
  khan: {
    title: "Khan Academy",
    favicon: "https://khanacademy.org/favicon.ico",
  },
  schoology: {
    title: "Schoology",
    favicon: "https://www.powerschool.com/favicon.ico",
  },
  gc: {
    title: "Home - Classroom",
    favicon: "https://ssl.gstatic.com/classroom/favicon.png",
  },
  clever: {
    title: "Clever | Portal",
    favicon: "https://clever.com/favicon.ico",
  },
  nt: { title: "New Tab", favicon: "/assets/img/newtab.png" },
};

function applyCloak() {
  const title = document.getElementById("titleInput").value;
  const favicon = document.getElementById("faviconInput").value;
  if (title)
    (document.title = title), localStorage.setItem("savedTitle", title);
  if (favicon)
    updateFavicon(
      favicon.startsWith("https://") ? favicon : "https://" + favicon
    ),
      localStorage.setItem("savedFavicon", favicon);
}

function resetCloak() {
  document.title = initialTitle;
  updateFavicon(initialFavicon);
  ["titleInput", "faviconInput", "tabCloak"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
  localStorage.removeItem("savedTitle");
  localStorage.removeItem("savedFavicon");
}

function applyPreset() {
  const preset = presets[document.getElementById("tabCloak").value];
  if (preset) {
    document.getElementById("titleInput").value = preset.title;
    document.getElementById("faviconInput").value = preset.favicon;
    applyCloak();
  }
}

function updateFavicon(url) {
  const old = document.getElementById("favicon");
  if (old) old.remove();
  const link = document.createElement("link");
  link.id = "favicon";
  link.rel = "icon";
  link.href = url;
  document.head.appendChild(link);
}

document.addEventListener("DOMContentLoaded", () => {
  const title = localStorage.getItem("savedTitle");
  const favicon = localStorage.getItem("savedFavicon");
  if (title)
    (document.title = title),
      (document.getElementById("titleInput").value = title);
  if (favicon)
    updateFavicon(favicon),
      (document.getElementById("faviconInput").value = favicon);
});
// switch cloak
var savedTitle = "";
var savedFavicon = "";
var toggle;

function updateFavicon(url) {
  var old = document.getElementById("favicon");
  if (old) old.remove();
  var link = document.createElement("link");
  link.id = "favicon";
  link.rel = "icon";
  link.href = url;
  document.head.appendChild(link);
}

function switchCloak() {
  if (document.hidden) {
    savedTitle = document.title;
    savedFavicon = document.getElementById("favicon")
      ? document.getElementById("favicon").href
      : "/assets/img/logo-blackbg.png";

    var currentTitle = localStorage.getItem("savedTitle");
    var currentFavicon = localStorage.getItem("savedFavicon");

    if (currentTitle && currentFavicon) {
      document.title = currentTitle;
      updateFavicon(currentFavicon);
    } else {
      document.title = "Google Slides";
      updateFavicon(
        "https://ssl.gstatic.com/docs/presentations/images/favicon-2023q4.ico"
      );
    }

    localStorage.setItem("switchCloakTitle", document.title);
    localStorage.setItem(
      "switchCloakFavicon",
      document.querySelector("#favicon")?.href || ""
    );
  } else {
    document.title = "celestial.";
    updateFavicon("/assets/img/logo-blackbg.png");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  toggle = document.getElementById("switchTog");
  if (!toggle) return;

  var stored = localStorage.getItem("switchCloakOn");
  if (stored === "true") {
    toggle.checked = true;
    document.title = "celestial.";
    updateFavicon("/assets/img/logo-blackbg.png");
    document.addEventListener("visibilitychange", switchCloak);
  }

  toggle.onchange = function () {
    if (toggle.checked) {
      localStorage.setItem("switchCloakOn", "true");
      document.title = "celestial.";
      updateFavicon("/assets/img/logo-blackbg.png");
      document.addEventListener("visibilitychange", switchCloak);
    } else {
      localStorage.setItem("switchCloakOn", "false");
      document.removeEventListener("visibilitychange", switchCloak);
      document.title = localStorage.getItem("savedTitle") || "celestial.";
      updateFavicon(
        localStorage.getItem("savedFavicon") || "/assets/img/logo-blackbg.png"
      );
    }
  };
});

// anti tab close
window.onbeforeunload = function (e) {
  if (localStorage.getItem("antiTog") === "true") {
    e.preventDefault();
    e.returnValue = "";
  }
};

document.getElementById("antiTog").onchange = function () {
  localStorage.setItem("antiTog", this.checked);
};

document.getElementById("antiTog").checked =
  localStorage.getItem("antiTog") === "true";

// anti-deledao
document.getElementById("deleTog").onchange = function () {
  localStorage.setItem("deleTog", this.checked);
  location.reload();
};

document.getElementById("deleTog").checked =
  localStorage.getItem("deleTog") === "true";

// panic cloaking
let panicKey = null;
let panicUrl = null;

function ripmygranny() {
  const url = document.getElementById('panicUrl').value.trim();
  const key = document.getElementById('panicKey').value.trim();
  if (!url || !key) return;
  localStorage.setItem('panicUrl', url);
  localStorage.setItem('panicKey', key);
  panicUrl = url;
  panicKey = key.toLowerCase();
  if (!window.panicListener) {
    window.panicListener = (e) => {
      if (e.key.toLowerCase() === panicKey) {
        location.replace(panicUrl);
      }
    };
    document.addEventListener('keydown', window.panicListener);
  }
}

function revivegranny() {
  localStorage.removeItem('panicUrl');
  localStorage.removeItem('panicKey');
  panicUrl = null;
  panicKey = null;
  if (window.panicListener) {
    document.removeEventListener('keydown', window.panicListener);
    window.panicListener = null;
  }
  document.getElementById('panicUrl').value = '';
  document.getElementById('panicKey').value = '';
}

// extensions
// userscript.mjs

// misc
// data export/import
function applySettings() {
  const theme = localStorage.getItem("theme") || "default";
  document.documentElement.setAttribute("data-theme", theme);

  if (typeof setTransport === "function") {
    setTransport(localStorage.getItem("transportz") || "libcurl");
  }
  if (typeof setProxy === "function") {
    setProxy(localStorage.getItem("pr0xy") || "scramjet");
  }

  const savedTitle = localStorage.getItem("savedTitle");
  const name = localStorage.getItem("name");
  if (name || savedTitle) document.title = name || savedTitle;

  const savedFavicon = localStorage.getItem("savedFavicon");
  const icon = localStorage.getItem("icon");
  const favicon = icon || savedFavicon;

  if (favicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = favicon;
  }

  const autoCloak = localStorage.getItem("autoCloak") === "1";
  const lastCloak = localStorage.getItem("lastCloak");
  const switchCloakOn = localStorage.getItem("switchCloakOn") === "true";
  const antiTog = localStorage.getItem("antiTog") === "true";

  if (autoCloak && typeof enableCloak === "function") enableCloak();
  if (lastCloak && typeof applyCloak === "function") applyCloak(lastCloak);
  if (switchCloakOn && typeof enableSwitchCloak === "function")
    enableSwitchCloak();
  if (antiTog && typeof enableAnti === "function") enableAnti();

  if (localStorage.getItem("deleTog") === "true") {
    const script = document.createElement("script");
    script.src = "/clst.deledao.js";
    document.head.appendChild(script);
  }

  if (theme === "custom") {
    const bg = localStorage.getItem("customBg");
    if (bg) {
      document.documentElement.style.setProperty("--background", bg);
    }
  }

  // panic cloaking
  const savedPanicUrl = localStorage.getItem("panicUrl");
  const savedPanicKey = localStorage.getItem("panicKey");
  if (savedPanicUrl && savedPanicKey) {
    panicUrl = savedPanicUrl;
    panicKey = savedPanicKey.toLowerCase();
    if (!window.panicListener) {
      window.panicListener = (e) => {
        if (e.key.toLowerCase() === panicKey) {
          location.replace(panicUrl);
        }
      };
      document.addEventListener('keydown', window.panicListener);
    }
  }
}

function cookieStorage() {
  return document.cookie.split(";").map((c) => {
    const [name, ...rest] = c.trim().split("=");
    return { name, value: rest.join("=") };
  });
}

// ============================================================
// Browsing settings — init selects from localStorage + save on change
// ============================================================
(function initBrowsingSettings() {
  const tselect = document.getElementById('tselect');
  const pr0xySelect = document.getElementById('pr0xySelect');
  const wispSelect = document.getElementById('wispSelect');
  const wispCustom = document.getElementById('wispCustom');
  if (!tselect || !pr0xySelect || !wispSelect) return;

  // Restore saved values into selects
  tselect.value = localStorage.getItem('transportz') || 'libcurl';
  pr0xySelect.value = localStorage.getItem('pr0xy') || 'scram';
  const savedWisp = localStorage.getItem('location') || 'wss://celestial-wisp.onrender.com/';
  if ([...wispSelect.options].some(o => o.value === savedWisp)) {
    wispSelect.value = savedWisp;
  } else if (savedWisp) {
    wispSelect.value = 'custom';
    if (wispCustom) { wispCustom.style.display = 'block'; wispCustom.value = savedWisp; }
  }

  // Save on change (blocked when CF mode is active)
  tselect.addEventListener('change', () => {
    if (localStorage.getItem('cfmode') === '1') return;
    localStorage.setItem('transportz', tselect.value);
    location.reload();
  });

  pr0xySelect.addEventListener('change', () => {
    if (localStorage.getItem('cfmode') === '1') return;
    localStorage.setItem('pr0xy', pr0xySelect.value);
    location.reload();
  });

  wispSelect.addEventListener('change', () => {
    if (localStorage.getItem('cfmode') === '1') return;
    if (wispSelect.value === 'custom') {
      if (wispCustom) wispCustom.style.display = 'block';
    } else {
      if (wispCustom) wispCustom.style.display = 'none';
      localStorage.setItem('location', wispSelect.value);
      location.reload();
    }
  });

  if (wispCustom) {
    wispCustom.addEventListener('change', () => {
      if (localStorage.getItem('cfmode') === '1') return;
      const val = wispCustom.value.trim();
      if (val) { localStorage.setItem('location', val); location.reload(); }
    });
  }
})();

// ============================================================
// Cloudflare Mode
// ============================================================
(function initCFMode() {
  const cfModeTog = document.getElementById('cfModeTog');
  if (!cfModeTog) return;

  const LOCK_IDS = ['tselect', 'pr0xySelect', 'wispSelect', 'wispCustom'];

  function setLocked(locked) {
    LOCK_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = locked;
      el.classList.toggle('cf-locked', locked);
    });
    // Lock the test & auto-pick button
    const testBtn = document.querySelector('button[onclick="__testWisp()"]');
    if (testBtn) {
      testBtn.disabled = locked;
      testBtn.classList.toggle('cf-locked', locked);
    }
  }

  function applyCFMode(enabled) {
    if (enabled) {
      // Backup current settings (only if not already backed up)
      if (!localStorage.getItem('cfmode_prev_transport'))
        localStorage.setItem('cfmode_prev_transport', localStorage.getItem('transportz') || 'libcurl');
      if (!localStorage.getItem('cfmode_prev_proxy'))
        localStorage.setItem('cfmode_prev_proxy', localStorage.getItem('pr0xy') || 'scramjet');

      // Force CF-optimal settings: libcurl + BRC
      localStorage.setItem('cfmode', '1');
      localStorage.setItem('transportz', 'libcurl');
      localStorage.setItem('pr0xy', 'scram');

      // Update selects to show locked values
      const t = document.getElementById('tselect');
      const p = document.getElementById('pr0xySelect');
      if (t) t.value = 'libcurl';
      if (p) p.value = 'scram';

      setLocked(true);
    } else {
      // Restore previous settings
      const prevTransport = localStorage.getItem('cfmode_prev_transport') || 'libcurl';
      const prevProxy    = localStorage.getItem('cfmode_prev_proxy')     || 'scram';

      localStorage.setItem('transportz', prevTransport);
      localStorage.setItem('pr0xy', prevProxy);
      localStorage.removeItem('cfmode');
      localStorage.removeItem('cfmode_prev_transport');
      localStorage.removeItem('cfmode_prev_proxy');

      // Restore selects
      const t = document.getElementById('tselect');
      const p = document.getElementById('pr0xySelect');
      if (t) t.value = prevTransport;
      if (p) p.value = prevProxy;

      setLocked(false);
    }
    // Reload so transport/proxy changes take effect immediately
    location.reload();
  }

  // On load — restore locked state if CF mode was previously on
  const isCFMode = localStorage.getItem('cfmode') === '1';
  cfModeTog.checked = isCFMode;
  if (isCFMode) setLocked(true);

  cfModeTog.onchange = () => applyCFMode(cfModeTog.checked);
})();

// ============================================================
// Virtual Entity Mode
// ============================================================
(function initVEMode() {
  const veTog = document.getElementById('veTog');
  if (!veTog) return;

  // VE is implicitly on when CF mode is active (CF mode implies VE)
  const isVE = localStorage.getItem('ve-mode') === '1' || localStorage.getItem('cfmode') === '1';
  veTog.checked = isVE;

  // If CF mode is on, disable the toggle (VE is forced)
  if (localStorage.getItem('cfmode') === '1') {
    veTog.disabled = true;
    veTog.parentElement.title = 'Automatically enabled by Cloudflare bypass mode';
  }

  veTog.onchange = () => {
    localStorage.setItem('ve-mode', veTog.checked ? '1' : '0');
    location.reload();
  };
})();

function restoreCookies(cookies) {
  if (!Array.isArray(cookies)) return;
  cookies.forEach((c) => {
    document.cookie = `${c.name}=${c.value}; path=/`;
  });
}

function exportData() {
  const data = {
    name: localStorage.getItem("name") || "",
    icon: localStorage.getItem("icon") || "",
    lastCloak: localStorage.getItem("lastCloak") || "",
    autoCloak: localStorage.getItem("autoCloak") || "0",
    savedTitle: localStorage.getItem("savedTitle") || "",
    savedFavicon: localStorage.getItem("savedFavicon") || "",
    switchCloakOn: localStorage.getItem("switchCloakOn") || "false",
    antiTog: localStorage.getItem("antiTog") || "false",
    deleTog: localStorage.getItem("deleTog") || "false",
    theme: localStorage.getItem("theme") || "default",
    transportz: localStorage.getItem("transportz") || "libcurl",
    pr0xy: localStorage.getItem("pr0xy") || "scramjet",
    customBg: localStorage.getItem("customBg") || "",
    panicUrl: localStorage.getItem("panicUrl") || "",
    panicKey: localStorage.getItem("panicKey") || "",
    cookies: cookieStorage(),
  };

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const time = new Date().toISOString().replace(/:/g, "-").split(".")[0];
  a.href = url;
  a.download = `celestial_data_timestamp_${time}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        Object.keys(data).forEach((key) => {
          if (key !== "cookies") {
            localStorage.setItem(key, data[key]);
          }
        });

        restoreCookies(data.cookies);
        applySettings();

        location.reload();
      } catch (err) {
        alert("Failed to import data: " + err.message);
      }
    };

    reader.readAsText(file);
  };

  input.click();
}

window.addEventListener("DOMContentLoaded", applySettings);


// other stuff