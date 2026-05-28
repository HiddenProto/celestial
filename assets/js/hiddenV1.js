/* hiddenV1.js — HiddenV1 theme
   A static grid of green dots whose brightness each flicker at an
   independent random frequency.  Starts are fully randomised so no two
   dots are ever in sync.  Fast dots (>10 Hz) complete full cycles in under
   two animation frames — a screenshot captures pure noise; the pattern
   only exists in the living image. */
(function () {
  if (localStorage.getItem('theme') !== 'hiddenV1') return;

  /* ── Canvas layer ─────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const SPACING = 16;               // grid pitch (px between dot centres)
  const DOT_S   = 3;                // square dot side-length (px)
  const HALF    = (DOT_S / 2) | 0; // half-size for centring on grid point

  /* byStyle groups dots that share the same colour so ctx.fillStyle only
     changes once per ~30 hue buckets instead of ~8 000 times per frame. */
  let W, H, byStyle = [];

  /* ── HSL → "rgb(r,g,b)" string  (s=100%, l=55% baked in) ──── */
  function hslStr(h) {
    h /= 360;
    // s=1, l=0.55 → q = l+s-l*s = 1.0,  p = 2*0.55-1 = 0.1
    const q = 1.0, p = 0.1;
    const ch = t => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 0.5)   return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return `rgb(${ch(h+1/3)*255|0},${ch(h)*255|0},${ch(h-1/3)*255|0})`;
  }

  /* ── Build / rebuild the dot grid ─────────────────────────── */
  function buildGrid() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;

    const cols = Math.ceil(W / SPACING) + 1;
    const rows = Math.ceil(H / SPACING) + 1;

    const map = new Map(); // hue (int) → { style, dots[] }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {

        /* Speed in radians / second.
           Slow   ≈ 0.3–1.6 Hz — visibly breathing
           Medium ≈ 2–8 Hz    — fast enough to feel alive
           Fast   ≈ 10–30 Hz  — one cycle per 2-6 frames;
                                 a screenshot shows pure random noise  */
        const tier  = Math.random();
        const speed = tier < 0.30 ?  2 + Math.random() * 8
                    : tier < 0.65 ? 14 + Math.random() * 32
                    :               64 + Math.random() * 126;

        const hue = (108 + Math.random() * 30) | 0; // 108–137: matrix-green → teal

        if (!map.has(hue)) map.set(hue, { style: hslStr(hue), dots: [] });
        map.get(hue).dots.push({
          px:    Math.round((c + 0.5) * SPACING) - HALF,
          py:    Math.round((r + 0.5) * SPACING) - HALF,
          speed,
          phase: Math.random() * Math.PI * 2,  // fully random start — no two dots sync
          peak:  0.08 + Math.random() * 0.82,  // per-dot max brightness
        });
      }
    }

    byStyle = [...map.values()];
  }

  buildGrid();
  window.addEventListener('resize', buildGrid);

  /* ── Render loop ───────────────────────────────────────────── */
  let frame = 0, alive = true;

  function loop() {
    if (document.hidden) { requestAnimationFrame(loop); return; }
    if (++frame % 90 === 0) alive = localStorage.getItem('theme') === 'hiddenV1';
    if (!alive) { canvas.remove(); return; }
    requestAnimationFrame(loop);

    ctx.clearRect(0, 0, W, H);
    const t = performance.now() * 0.001;

    for (const { style, dots } of byStyle) {
      ctx.fillStyle = style;                  // one style change per hue bucket

      for (const d of dots) {
        /* sin² gives a sharper, more abrupt pulse than plain |sin|:
           the dot snaps from dark to bright and back, mimicking the
           binary feel of a voltage-driven display element. */
        const s = Math.sin(d.speed * t + d.phase);
        const a = s * s * d.peak;
        if (a < 0.015) continue;             // skip near-invisible dots cheaply
        ctx.globalAlpha = a;
        ctx.fillRect(d.px, d.py, DOT_S, DOT_S);
      }
    }

    ctx.globalAlpha = 1;
  }

  loop();
})();
