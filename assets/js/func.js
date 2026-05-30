document.title = "celestial.";

// self-explanitory

function _activeFrame() {
  return document.querySelector('iframe.searchframe:not(.hidden)');
}

function reload() {
  const iframe = _activeFrame();
  if (!iframe) return;
  try { iframe.contentWindow.location.reload(); }
  catch { try { iframe.src = iframe.src; } catch {} } // fallback: re-assign src
}

function back() {
  const iframe = _activeFrame();
  if (!iframe) return;
  // contentWindow/history can throw if the frame is mid-navigation or in an
  // error state — guard so the button never silently dies.
  try { iframe.contentWindow.history.back(); } catch {}
}

function forward() {
  const iframe = _activeFrame();
  if (!iframe) return;
  try { iframe.contentWindow.history.go(1); } catch {}
}

// alt + s to put whatever is in the iframe in another window

addEventListener("keydown", e => {
  if (e.altKey && e.key === "s") {
    const f = document.querySelector("iframe.searchframe:not(.hidden)");
    if (!f) return;

    const w = 650, h = 450;
    const l = (screen.availWidth - w) / 2;
    const t = (screen.availHeight - h) / 2;

    const win = open("about:blank", "_blank", `width=${w},height=${h},left=${l},top=${t}`);
    if (!win) return;

    win.document.write(`<style>html,body{margin:0;height:100%}</style>
<iframe src="${f.src}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`);
  }
});

// inspector gadget
// see what i did there
// you're permitted to laugh
function inspect() {
  const f = document.querySelector('iframe.searchframe:not(.hidden)');
  if (!f) return alert('No frame found.');
  try {
    // load and show console
    const d = f.contentWindow.document;

    if (f.contentWindow.__erudaOn) {
      try { f.contentWindow.eruda.destroy(); } catch { }
      d.querySelectorAll('script[src*="eruda"]').forEach(s => s.remove());
      f.contentWindow.__erudaOn = false;
      return;
    }

    const s = d.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda';
    s.onload = () => {
      f.contentWindow.eruda.init();
      f.contentWindow.eruda.show();
      f.contentWindow.__erudaOn = true;
    };
    // kidnap my child 🤑
    d.body.appendChild(s);
  } catch {
    alert('Cross-origin frame, cannot inject.');
  }
}