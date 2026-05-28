/* hiddenV1.js — HiddenV1 theme
   A static grid of green square dots where FLICKER SPEED encodes BRIGHTNESS.

   How it works:
     Each dot is assigned a random brightness level (0.05 – 0.90).
     That brightness level directly sets the dot's flicker frequency:
       dim  (≈0.5–4 Hz)  → clearly visible slow pulse, perceived as dark
       mid  (≈8–22 Hz)   → fast flutter, perceived as medium glow
       bright (≈26–50 Hz) → above the ~24 Hz flicker-fusion threshold,
                            the eye averages the cycles into a steady bright spot

     Every dot uses a square-wave toggle (on / off) with a fully random phase
     start, so no two dots are ever in sync.  A camera shutter captures a
     single instant — each dot is randomly on or off — pure noise.
     The human eye time-averages over ~100 ms and sees the full brightness map. */

(function () {
  if (localStorage.getItem('theme') !== 'hiddenV1') return;

  /* ── Canvas ──────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const SPACING = 15;   // grid pitch (px between dot centres)
  const DOT_S   = 3;    // square dot side-length (px)
  const HALF    = (DOT_S / 2) | 0;

  /* Flicker-frequency range mapped linearly from brightness */
  const FREQ_DIM    =  0.5;   // Hz for the dimmest dots
  const FREQ_BRIGHT = 50;     // Hz for the brightest dots

  /* Hue range: 108–137° = matrix-green to teal-green */
  function hslStr(h) {    // s=100%, l=55% baked in
    h /= 360;
    const q = 1.0, p = 0.1;
    const ch = t => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 0.5)   return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return `rgb(${ch(h + 1/3) * 255 | 0},${ch(h) * 255 | 0},${ch(h - 1/3) * 255 | 0})`;
  }

  /* ── Build the dot grid ──────────────────────────────────── */
  /* Dots are grouped by their colour string (one fillStyle change per
     ~30 hue buckets instead of one per dot). */
  let W, H, byStyle = [];
  const TAU = Math.PI * 2;

  function buildGrid() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;

    const cols = Math.ceil(W / SPACING) + 1;
    const rows = Math.ceil(H / SPACING) + 1;

    const map = new Map();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {

        /* Random brightness, then derive flicker frequency from it */
        const brightness = 0.05 + Math.random() * 0.85;   // 0.05 – 0.90

        /* Linear map: dim→slow, bright→fast */
        const hz = FREQ_DIM + brightness * (FREQ_BRIGHT - FREQ_DIM);

        /* Fully random phase: ensures no two dots are ever in sync */
        const phase = Math.random() * TAU;

        const hue = (108 + Math.random() * 30) | 0;   // 108–137°
        if (!map.has(hue)) map.set(hue, { style: hslStr(hue), dots: [] });
        map.get(hue).dots.push({
          px:         Math.round((c + 0.5) * SPACING) - HALF,
          py:         Math.round((r + 0.5) * SPACING) - HALF,
          hz,
          phase,
          brightness, // alpha when the dot is in its ON half-cycle
        });
      }
    }

    byStyle = [...map.values()];
  }

  buildGrid();
  window.addEventListener('resize', buildGrid);

  /* ── Render loop ─────────────────────────────────────────── */
  let frame = 0, alive = true;

  function loop() {
    if (document.hidden) { requestAnimationFrame(loop); return; }
    if (++frame % 90 === 0) alive = localStorage.getItem('theme') === 'hiddenV1';
    if (!alive) { canvas.remove(); return; }
    requestAnimationFrame(loop);

    ctx.clearRect(0, 0, W, H);
    const t = performance.now() * 0.001;

    for (const { style, dots } of byStyle) {
      ctx.fillStyle = style;

      for (const d of dots) {
        /* Square wave: on during the positive half-cycle of the sine,
           off during the negative half.  Duty cycle = 50 % for every dot,
           but the FREQUENCY sets the perceived brightness:
             < 10 Hz → eye tracks the blink  → dot looks dim / pulsing
             > 24 Hz → eye averages the cycles → dot looks like a steady glow */
        if (Math.sin(d.hz * TAU * t + d.phase) <= 0) continue;

        ctx.globalAlpha = d.brightness;
        ctx.fillRect(d.px, d.py, DOT_S, DOT_S);
      }
    }

    ctx.globalAlpha = 1;
  }

  loop();
})();
