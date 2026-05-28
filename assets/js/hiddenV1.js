/* hiddenV1.js — HiddenV1 theme
   ──────────────────────────────────────────────────────────────
   The entire UI is replaced by a field of flickering dots.

   Every 150 ms, an offscreen canvas samples the DOM: element
   backgrounds + text positions are painted, then pixel luminance
   at each dot centre drives that dot's flicker frequency.

     Bright pixel → fast frequency (>24 Hz, above flicker-fusion)
       → eye time-averages the flicker into a steady bright glow
     Dark pixel  → slow frequency (<6 Hz)
       → eye sees a slow pulsing dim dot

   A camera shutter captures one frozen instant — every dot is
   randomly on or off — pure noise.  Human vision integrates
   ~100 ms and reads the full image.

   Inspired by vghvhg.oneapp.dev by bumblcat. */

(function () {
  if (localStorage.getItem('theme') !== 'hiddenV1') return;

  /* ═══════════════════════════════════════════════════
     CONFIG
  ═══════════════════════════════════════════════════ */
  const SPACING    = 5;     // px between dot centres
  const DOT_S      = 2;     // square dot side (px)
  const HALF       = (DOT_S / 2) | 0;
  const FREQ_MIN   = 0.4;   // Hz — dimmest dots (slow visible pulse)
  const FREQ_MAX   = 52;    // Hz — brightest dots (above flicker fusion)
  const SAMPLE_MS  = 150;   // DOM re-sample interval (ms)
  const DOT_COLOR  = '#00dd44'; // matrix green

  /* ═══════════════════════════════════════════════════
     CANVAS — covers everything, z-index above all UI
  ═══════════════════════════════════════════════════ */
  const canvas = document.createElement('canvas');
  canvas.id = 'hv1-canvas';
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:2147483647;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  /* Offscreen canvas for DOM brightness sampling */
  const off   = document.createElement('canvas');
  const octx  = off.getContext('2d', { willReadFrequently: true });

  /* ═══════════════════════════════════════════════════
     HIDE REAL UI
  ═══════════════════════════════════════════════════ */
  const hiddenEls = [];
  function hideUI() {
    for (const el of document.body.children) {
      if (el === canvas) continue;
      if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
      hiddenEls.push({ el, opacity: el.style.opacity, pe: el.style.pointerEvents });
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    }
  }
  function showUI() {
    for (const { el, opacity, pe } of hiddenEls) {
      el.style.opacity      = opacity;
      el.style.pointerEvents = pe;
    }
    hiddenEls.length = 0;
  }
  hideUI();

  /* ═══════════════════════════════════════════════════
     DOT GRID
  ═══════════════════════════════════════════════════ */
  let W = 0, H = 0;
  /* One entry per dot (flat array for speed) */
  let dotCount = 0;
  let dotPx, dotPy;         // pixel positions (Int16Array)
  let dotHz, dotPhase;      // flicker state (Float32Array)
  let dotBright;            // alpha when ON (Float32Array)

  const TAU = Math.PI * 2;

  function buildGrid() {
    W = canvas.width  = off.width  = window.innerWidth;
    H = canvas.height = off.height = window.innerHeight;

    const cols = Math.ceil(W / SPACING) + 1;
    const rows = Math.ceil(H / SPACING) + 1;
    dotCount = cols * rows;

    dotPx     = new Int16Array(dotCount);
    dotPy     = new Int16Array(dotCount);
    dotHz     = new Float32Array(dotCount).fill(FREQ_MIN);
    dotBright = new Float32Array(dotCount).fill(0.12);
    dotPhase  = new Float32Array(dotCount);

    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dotPx[i] = Math.round((c + 0.5) * SPACING) - HALF;
        dotPy[i] = Math.round((r + 0.5) * SPACING) - HALF;
        dotPhase[i] = Math.random() * TAU; // random start phase
        i++;
      }
    }
  }

  buildGrid();
  window.addEventListener('resize', () => { buildGrid(); sampleDOM(); });

  /* ═══════════════════════════════════════════════════
     DOM BRIGHTNESS SAMPLER
     Paints a simplified version of the real DOM into
     an offscreen canvas, then reads pixel luminance.
  ═══════════════════════════════════════════════════ */

  /* Parse "rgb(r,g,b)" / "rgba(r,g,b,a)" → {r,g,b,a} or null */
  function parseRGBA(str) {
    if (!str || str === 'transparent') return null;
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }

  function lum(r, g, b) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

  /* Recursively paint element backgrounds + borders onto offscreen ctx */
  function paintEl(el) {
    if (el === canvas || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > W || rect.top > H) return;

    const style = getComputedStyle(el);
    const bg    = parseRGBA(style.backgroundColor);

    /* Paint background if non-trivially dark */
    if (bg && bg.a > 0.02) {
      const brightness = lum(bg.r, bg.g, bg.b) * bg.a;
      if (brightness > 0.02) {
        octx.fillStyle = `rgba(${bg.r},${bg.g},${bg.b},${(bg.a * 0.9).toFixed(2)})`;
        octx.fillRect(rect.left, rect.top, rect.width, rect.height);
      }
    }

    /* Paint each direct text node as a bright band */
    const textCol = parseRGBA(style.color);
    if (textCol) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3) continue;
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNode(node);
        for (const r of range.getClientRects()) {
          if (r.width < 1 || r.height < 1) continue;
          /* Fill text rect with the text colour — gives us brightness at text positions */
          octx.fillStyle =
            `rgba(${textCol.r},${textCol.g},${textCol.b},${Math.min(textCol.a, 0.95)})`;
          octx.fillRect(r.left, r.top, r.width, r.height);
        }
      }
    }

    for (const child of el.children) paintEl(child);
  }

  function sampleDOM() {
    /* Temporarily show UI so styles compute correctly,
       sample, then hide again */
    for (const { el } of hiddenEls) el.style.removeProperty('opacity');

    octx.clearRect(0, 0, W, H);
    for (const child of document.body.children) paintEl(child);

    /* Re-hide */
    for (const { el } of hiddenEls) el.style.setProperty('opacity', '0', 'important');

    /* Read pixel luminance and update each dot's frequency */
    const img  = octx.getImageData(0, 0, W, H);
    const data = img.data;

    for (let i = 0; i < dotCount; i++) {
      const px = dotPx[i], py = dotPy[i];
      if (px < 0 || py < 0 || px >= W || py >= H) continue;

      /* Sample the 3x3 neighbourhood to smooth out single-pixel noise */
      let sum = 0, cnt = 0;
      for (let dy = 0; dy <= DOT_S; dy++) {
        for (let dx = 0; dx <= DOT_S; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx >= W || ny >= H) continue;
          const idx = (ny * W + nx) << 2;
          sum += lum(data[idx], data[idx + 1], data[idx + 2]) * (data[idx + 3] / 255);
          cnt++;
        }
      }
      const brightness = cnt ? sum / cnt : 0;

      /* Apply a gamma curve to increase contrast in the mid-range */
      const curved = Math.pow(brightness, 0.55);

      dotHz[i]     = FREQ_MIN + curved * (FREQ_MAX - FREQ_MIN);
      dotBright[i] = 0.08 + curved * 0.82;
    }
  }

  /* Initial sample (with a short delay so DOM is fully laid out) */
  setTimeout(sampleDOM, 120);

  /* Re-sample periodically for live UI changes */
  const sampleTimer = setInterval(() => {
    if (!alive) { clearInterval(sampleTimer); return; }
    sampleDOM();
  }, SAMPLE_MS);

  /* Re-sample on DOM mutations (new chat messages, panel changes, etc.) */
  const observer = new MutationObserver(() => sampleDOM());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  /* ═══════════════════════════════════════════════════
     RENDER LOOP — square-wave flicker for every dot
  ═══════════════════════════════════════════════════ */
  let frame = 0, alive = true;

  function loop() {
    if (!alive) { canvas.remove(); showUI(); observer.disconnect(); return; }
    if (++frame % 90 === 0) alive = localStorage.getItem('theme') === 'hiddenV1';
    requestAnimationFrame(loop);

    ctx.clearRect(0, 0, W, H);
    const t = performance.now() * 0.001;

    ctx.fillStyle = DOT_COLOR;

    for (let i = 0; i < dotCount; i++) {
      /* Square-wave: ON during positive half of the sine cycle */
      if (Math.sin(dotHz[i] * TAU * t + dotPhase[i]) <= 0) continue;
      ctx.globalAlpha = dotBright[i];
      ctx.fillRect(dotPx[i], dotPy[i], DOT_S, DOT_S);
    }

    ctx.globalAlpha = 1;
  }

  loop();
})();
