/* hiddenV1.js — HiddenV1 theme
   The entire UI is replaced by a flickering dot matrix.
   An offscreen canvas samples the DOM every 150 ms; pixel brightness
   at each dot's position drives its flicker frequency.

     Fast (>24 Hz) = above flicker-fusion → eye sees steady bright glow
     Slow (<6 Hz)  = eye sees slow dim pulse
     Screenshot    = one frozen instant → random on/off noise

   Inspired by vghvhg.oneapp.dev by bumblcat. */
(function () {
  if (localStorage.getItem('theme') !== 'hiddenV1') return;

  /* ─── config ──────────────────────────────────────────────── */
  const SPACING   = 7;     // px between dot centres
  const DOT_S     = 3;     // square dot side (px)
  const HALF      = 1;     // (DOT_S/2)|0
  const FREQ_MIN  = 0.15;  // Hz — darkest dots
  const FREQ_MAX  = 60;    // Hz — brightest dots (above flicker fusion)
  const SAMPLE_MS = 150;   // ms between DOM re-samples

  /* ─── canvas (above ALL ui) ───────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.id    = 'hv1-canvas';
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:2147483647;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  /* offscreen canvas for brightness sampling */
  const off  = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });

  /* ─── hide real UI ────────────────────────────────────────── */
  const hidden = [];
  function hideUI() {
    for (const el of document.body.children) {
      if (el === canvas || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      hidden.push(el);
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    }
  }
  function revealUI() {
    hidden.forEach(el => { el.style.removeProperty('opacity'); el.style.removeProperty('pointer-events'); });
    hidden.length = 0;
  }
  hideUI();

  /* ─── dot grid ────────────────────────────────────────────── */
  let W = 0, H = 0, dotCount = 0;
  let dotPx, dotPy, dotHz, dotPhase, dotBright;
  const TAU = Math.PI * 2;

  function buildGrid() {
    W = canvas.width = off.width  = window.innerWidth;
    H = canvas.height = off.height = window.innerHeight;
    const cols = Math.ceil(W / SPACING) + 1;
    const rows = Math.ceil(H / SPACING) + 1;
    dotCount = cols * rows;
    dotPx     = new Int16Array(dotCount);
    dotPy     = new Int16Array(dotCount);
    dotHz     = new Float32Array(dotCount).fill(FREQ_MIN);
    dotBright = new Float32Array(dotCount).fill(0);
    dotPhase  = new Float32Array(dotCount);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        dotPx[i] = Math.round((c + 0.5) * SPACING) - HALF;
        dotPy[i] = Math.round((r + 0.5) * SPACING) - HALF;
        dotPhase[i] = Math.random() * TAU;
      }
    }
  }
  buildGrid();
  window.addEventListener('resize', () => { buildGrid(); scheduleSample(); });

  /* ─── DOM brightness sampler ──────────────────────────────── */

  /* Elements whose bounding rect should register as BRIGHT
     (they contain primary readable content) */
  const BRIGHT_TAGS = new Set([
    'H1','H2','H3','H4','H5','H6',
    'P','SPAN','A','BUTTON','LABEL','LI',
    'TD','TH','B','I','EM','STRONG','CODE',
    'INPUT','SELECT','TEXTAREA',
  ]);

  function parseRGB(str) {
    if (!str) return null;
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return m ? { r:+m[1], g:+m[2], b:+m[3], a: m[4]!==undefined?+m[4]:1 } : null;
  }
  const lum = (r,g,b) => (0.299*r + 0.587*g + 0.114*b) / 255;

  function sampleDOM() {
    /* Temporarily restore opacity so styles compute correctly. */
    hidden.forEach(el => el.style.removeProperty('opacity'));

    /* ── Paint offscreen canvas ─────────────────────────────── */
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, W, H);

    /* Walk every element once using querySelectorAll — faster
       and simpler than manual recursion. */
    for (const el of document.body.querySelectorAll('*')) {
      if (el === canvas) continue;

      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right < 0 || rect.bottom < 0 || rect.left > W || rect.top > H) continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;

      /* --- background colour ---------------------------------- */
      const bg = parseRGB(cs.backgroundColor);
      if (bg && bg.a > 0.05) {
        const l = lum(bg.r, bg.g, bg.b);
        /* Boost: even very dark panel backgrounds get rendered at
           a boosted level so they survive the contrast stretch. */
        const boostedAlpha = Math.min(1, bg.a * (1 + l * 8));
        if (l * bg.a > 0.005) {
          octx.fillStyle =
            `rgba(${bg.r},${bg.g},${bg.b},${boostedAlpha.toFixed(2)})`;
          octx.fillRect(rect.left, rect.top, rect.width, rect.height);
        }
      }

      /* --- text content → pure white -------------------------
         1. Tag-based: known text-bearing tags
         2. Leaf check: any element with no children but with text  */
      const hasText = el.textContent.trim().length > 0;
      const isTextTag = BRIGHT_TAGS.has(el.tagName);
      const isLeaf    = el.children.length === 0 && hasText;

      if (hasText && (isTextTag || isLeaf)) {
        /* Use Range to get the precise bounding box of the actual
           text glyphs rather than the whole element box. */
        let painted = false;
        for (const node of el.childNodes) {
          if (node.nodeType !== 3 || !node.textContent.trim()) continue;
          try {
            const rng = document.createRange();
            rng.selectNode(node);
            for (const r of rng.getClientRects()) {
              if (r.width < 1 || r.height < 1) continue;
              octx.fillStyle = '#fff';
              octx.fillRect(r.left, r.top, r.width, r.height);
              painted = true;
            }
          } catch (_) {}
        }
        /* Fallback: if range gave nothing, paint the whole element
           rect at medium-high brightness */
        if (!painted) {
          octx.fillStyle = 'rgba(255,255,255,0.75)';
          octx.fillRect(rect.left, rect.top, rect.width, rect.height);
        }
      }
    }

    /* Re-hide */
    hidden.forEach(el => el.style.setProperty('opacity', '0', 'important'));

    /* ── Read pixel brightness ──────────────────────────────── */
    const img  = octx.getImageData(0, 0, W, H);
    const data = img.data;

    /* First pass: store raw luminance per dot (skip OOB dots) */
    let lo = 1, hi = 0;
    for (let i = 0; i < dotCount; i++) {
      const px = dotPx[i], py = dotPy[i];
      if (px < 0 || py < 0 || px + DOT_S > W || py + DOT_S > H) {
        dotBright[i] = -1; // mark as OOB
        continue;
      }
      /* Average over the dot's own pixel footprint */
      let sum = 0;
      for (let dy = 0; dy < DOT_S; dy++) {
        for (let dx = 0; dx < DOT_S; dx++) {
          const idx = ((py + dy) * W + (px + dx)) << 2;
          sum += lum(data[idx], data[idx+1], data[idx+2])
               * (data[idx+3] / 255);
        }
      }
      const b = sum / (DOT_S * DOT_S);
      dotBright[i] = b;
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }

    /* Second pass: histogram stretch + double smoothstep S-curve */
    const span = Math.max(hi - lo, 0.03);
    for (let i = 0; i < dotCount; i++) {
      if (dotBright[i] < 0) {
        /* OOB dot — keep at minimum */
        dotHz[i]     = FREQ_MIN;
        dotBright[i] = 0.03;
        continue;
      }
      let v = (dotBright[i] - lo) / span;  // [0..1]

      /* Double smoothstep: crushes midtones, exaggerates extremes */
      v = v * v * (3 - 2 * v);
      v = v * v * (3 - 2 * v);

      dotHz[i]     = FREQ_MIN + v * (FREQ_MAX - FREQ_MIN);
      dotBright[i] = 0.03 + v * 0.92;  // 0.03 (nearly invisible) → 0.95
    }
  }

  /* Debounced sample scheduler */
  let samplePending = false;
  function scheduleSample() {
    if (samplePending) return;
    samplePending = true;
    setTimeout(() => { samplePending = false; if (alive) sampleDOM(); }, 16);
  }

  setTimeout(sampleDOM, 300);   // initial — wait for full layout
  setTimeout(sampleDOM, 800);   // second pass — catch late-rendered content
  const sampleTimer = setInterval(() => { if (alive) sampleDOM(); }, SAMPLE_MS);

  /* Re-sample on DOM changes (debounced) */
  const observer = new MutationObserver(scheduleSample);
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true,
  });

  /* ─── render loop ─────────────────────────────────────────── */
  let frame = 0, alive = true;

  function loop() {
    if (!alive) {
      canvas.remove();
      revealUI();
      observer.disconnect();
      clearInterval(sampleTimer);
      return;
    }
    if (++frame % 90 === 0) alive = localStorage.getItem('theme') === 'hiddenV1';
    requestAnimationFrame(loop);

    ctx.clearRect(0, 0, W, H);
    const t = performance.now() * 0.001;

    ctx.fillStyle = '#00dd44';
    for (let i = 0; i < dotCount; i++) {
      /* Square wave: ON during positive half-cycle */
      if (Math.sin(dotHz[i] * TAU * t + dotPhase[i]) <= 0) continue;
      ctx.globalAlpha = dotBright[i];
      ctx.fillRect(dotPx[i], dotPy[i], DOT_S, DOT_S);
    }
    ctx.globalAlpha = 1;
  }

  loop();
})();
