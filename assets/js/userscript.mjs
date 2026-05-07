// this is basically ext.mjs but the user can do it yipee!
import { currentFrame } from "/lithium.mjs";

window.addExt = addExt;
window.removeExt = removeExt;

const siteInput = document.getElementById('siteInject');
const includeEverywhere = document.getElementById('includeEverywhere');
const addBtn = document.getElementById('addExtBtn');

let db;
const request = indexedDB.open("customExtDB", 1);
request.onupgradeneeded = e => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("extensions")) {
    db.createObjectStore("extensions", { keyPath: "id", autoIncrement: true });
  }
};
request.onsuccess = e => {
  db = e.target.result;
  extList();
};
request.onerror = e => console.error("IndexedDB error:", e);

includeEverywhere.addEventListener('change', () => {
  siteInput.value = '';
  siteInput.disabled = includeEverywhere.checked;
  siteInput.style.cursor = includeEverywhere.checked ? 'not-allowed' : 'text';
});

function extList() {
  if (!db) return;
  const list = document.getElementById('extList');
  list.innerHTML = '';
  const tx = db.transaction("extensions", "readonly");
  const store = tx.objectStore("extensions");
  store.openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      const ext = cursor.value;
      const item = document.createElement('div');
      item.className = 'extItem';
      const siteText = ext.website?.join(', ') || 'all sites';
      item.innerHTML = `<span>${siteText} (includes: ${ext.includes === 'yes' ? 'yes' : 'no'}, everywhere: ${ext.allsites === 'yes' ? 'yes' : 'no'})</span>
                        <button onclick="removeExt(${ext.id})">remove</button>`;
      list.appendChild(item);
      cursor.continue();
    }
  };
}

function addExt() {
  if (!db) return;
  const code = document.getElementById('extCode').value.trim();
  if (!code) return alert('code cannot be empty');

  const ext = {
    website: includeEverywhere.checked ? [] : (siteInput.value ? [siteInput.value] : []),
    includes: document.getElementById('includesCheckbox').checked ? 'yes' : 'no',
    allsites: includeEverywhere.checked ? 'yes' : 'no',
    src: code
  };

  const tx = db.transaction("extensions", "readwrite");
  tx.objectStore("extensions").add(ext).onsuccess = () => {
    document.getElementById('extCode').value = '';
    siteInput.value = '';
    document.getElementById('includesCheckbox').checked = false;
    includeEverywhere.checked = false;
    siteInput.disabled = false;
    siteInput.style.cursor = 'text';
    extList();
    injectExtensions(currentFrame);
  };
}

function removeExt(id) {
  if (!db) return;
  const tx = db.transaction("extensions", "readwrite");
  tx.objectStore("extensions").delete(id).onsuccess = () => {
    extList();
    injectExtensions(currentFrame);
  };
}

function getAllExts(callback) {
  if (!db) return callback([]);
  const tx = db.transaction("extensions", "readonly");
  const store = tx.objectStore("extensions");
  const exts = [];
  store.openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      exts.push(cursor.value);
      cursor.continue();
    } else callback(exts);
  };
}

function injectExtensions(frame) {
  if (!frame) return;

  const waitAndInject = () => {
    const doc = frame.contentDocument;
    if (!doc || !doc.body || doc.readyState === 'uninitialized') {
      setTimeout(waitAndInject, 50);
      return;
    }

    const url = frame.dataset.displayUrl || '';
    const hostname = (() => {
      try { return new URL(url, location.origin).hostname; } catch { return ''; }
    })();

    getAllExts(exts => {
      exts.forEach(ext => {
        const sites = Array.isArray(ext.website) ? ext.website : [];
        let inject = false;

        if (ext.allsites === 'yes') inject = true;
        else if (ext.includes === 'yes') inject = sites.some(s => url.includes(s));
        else inject = sites.includes(hostname);

        if (inject) {
          const marker = `ext-injected-${ext.id}`;
          if (!doc.querySelector(`script[data-ext-id="${ext.id}"]`)) {
            const s = doc.createElement('script');
            s.setAttribute('data-ext-id', ext.id);
            s.textContent = ext.src;
            doc.body.prepend(s);
          }
        }
      });
    });
  };

  waitAndInject();
}

function watchFrameURL(frame) {
  if (!frame) return;

  let lastURL = frame.dataset.displayUrl || '';

  const attachLoadListener = () => {
    frame.addEventListener('load', () => {
      injectExtensions(frame);
      attachLoadListener();
    }, { once: true });
  };
  attachLoadListener();

  setInterval(() => {
    const url = frame.dataset.displayUrl || '';
    if (url !== lastURL) {
      lastURL = url;
      injectExtensions(frame);
    }
  }, 300);
}

if (currentFrame) watchFrameURL(currentFrame);
if (addBtn) addBtn.addEventListener('click', addExt);

window.addEventListener('DOMContentLoaded', () => {
  if (!currentFrame) return;
  injectExtensions(currentFrame);
});