/* hiddenV1.js — HiddenV1 theme
   ASCII art 3D rotating cube with a climbing dot texture over a full-screen
   random-noise character grid.  Directly inspired by vghvhg.oneapp.dev by bumblcat.

   Background noise refreshes at 25 Hz (every ~40 ms).
   Cube blink-state flips at 60 Hz (every ~16 ms).
   The two independent rates mean no screenshot can ever capture a "clean" frame —
   the live effect is the only way to see it. */
(function () {
  if (localStorage.getItem('theme') !== 'hiddenV1') return;

  /* ── <pre> background layer ──────────────────────────────── */
  const pre = document.createElement('pre');
  pre.style.cssText =
    'position:fixed;inset:0;margin:0;padding:8px 0 0 4px;overflow:hidden;' +
    'pointer-events:none;z-index:0;' +
    'color:#00dd44;background:transparent;' +
    'font-family:monospace;font-size:11px;line-height:7px;' +
    'font-weight:bold;letter-spacing:2px;white-space:pre;';
  document.body.appendChild(pre);

  /* ── Grid sizing (recalculated on resize) ────────────────── */
  /* Each character cell ≈ 8.5 px wide (6.6 px glyph + 2 px spacing),
     7 px tall (line-height).  Round down so we never overflow the viewport. */
  const CHAR_W = 8.5;
  const CHAR_H = 7;
  let W = 0, H = 0;

  function calcGrid() {
    W = Math.max(40, Math.floor(window.innerWidth  / CHAR_W));
    H = Math.max(20, Math.floor(window.innerHeight / CHAR_H));
    initBg();
  }

  /* ── Background noise state ──────────────────────────────── */
  let bgStates = null;

  function initBg() {
    bgStates = new Uint8Array(W * H);
    for (let i = 0; i < bgStates.length; i++)
      bgStates[i] = Math.random() > 0.5 ? 1 : 0;
  }

  calcGrid();
  window.addEventListener('resize', calcGrid);

  /* ── Timing constants ────────────────────────────────────── */
  const BG_INTERVAL   = 1000 / 25;   // 40 ms  — background noise rate
  const CUBE_INTERVAL = 1000 / 60;   // ~16 ms — cube blink rate

  let lastBg   = 0;
  let lastCube = 0;
  let cubeVisible = false;

  /* ── 3D state ────────────────────────────────────────────── */
  let angleX = 0;
  let angleY = 0;
  let textureShiftY = 0;

  /* ── Theme-alive check ───────────────────────────────────── */
  let tick = 0, alive = true;

  /* ── Main render loop ────────────────────────────────────── */
  function render(ts) {
    if (!alive) { pre.remove(); return; }
    if (++tick % 90 === 0) alive = localStorage.getItem('theme') === 'hiddenV1';
    requestAnimationFrame(render);

    /* 1 ── Refresh background noise at 25 Hz */
    if (ts - lastBg >= BG_INTERVAL) {
      lastBg = ts;
      for (let i = 0; i < bgStates.length; i++)
        bgStates[i] = Math.random() > 0.5 ? 1 : 0;
    }

    /* 2 ── Flip cube blink at 60 Hz */
    if (ts - lastCube >= CUBE_INTERVAL) {
      lastCube  = ts;
      cubeVisible = !cubeVisible;
    }

    /* 3 ── Build output grid from background noise */
    // Using a flat array of single-character strings is faster than nested arrays
    const grid = new Array(W * H).fill(' ');
    const zBuf = new Float32Array(W * H).fill(-Infinity);

    for (let i = 0; i < bgStates.length; i++) {
      if (bgStates[i]) {
        grid[i]  = '.';
        zBuf[i]  = -100;
      }
    }

    /* 4 ── Advance 3D rotation & texture scroll */
    angleX        += 0.020;
    angleY        += 0.015;
    textureShiftY -= 0.08;   // texture crawls upward over time

    const cosCx = Math.cos(angleX), sinCx = Math.sin(angleX);
    const cosCy = Math.cos(angleY), sinCy = Math.sin(angleY);

    /* Cube scale: keep it readable but not overwhelming on large viewports */
    const DIST   = 2.8;
    const scaleX = Math.min(W * 0.38, 95);
    const scaleY = Math.min(H * 0.38, 52);
    const midX   = W / 2;
    const midY   = H / 2;

    /* 5 ── Rasterise the 6 cube faces */
    const STEP = 0.04;
    for (let u = -1; u <= 1; u += STEP) {
      for (let v = -1; v <= 1; v += STEP) {

        // Each face defined by its 3-D position; tu/tv are texture coords
        const faces = [
          u,  v,  1,  u,  v,   // front
          u,  v, -1,  u,  v,   // back
          u,  1,  v,  u,  v,   // top
          u, -1,  v,  u,  v,   // bottom
          1,  u,  v,  u,  v,   // right
         -1,  u,  v,  u,  v,   // left
        ];

        for (let f = 0; f < 6; f++) {
          const base = f * 5;
          const fx = faces[base], fy = faces[base+1], fz = faces[base+2];
          const tu = faces[base+3], tv = faces[base+4];

          // Standard X-then-Y rotation
          const y1 = fy * cosCx - fz * sinCx;
          const z1 = fy * sinCx + fz * cosCx;
          const x2 = fx * cosCy + z1 * sinCy;
          const z2 = -fx * sinCy + z1 * cosCy;

          // Perspective projection
          const px = Math.round(midX + (x2 / (z2 + DIST)) * scaleX);
          const py = Math.round(midY + (y1 / (z2 + DIST)) * scaleY);

          if (px >= 0 && px < W && py >= 0 && py < H) {
            const idx = py * W + px;
            if (z2 > zBuf[idx]) {
              zBuf[idx] = z2;
              // Climbing dot texture: sin/cos pattern that scrolls upward
              const shiftedV = tv + textureShiftY;
              const isDot = (Math.abs(Math.sin(tu * 10) * Math.cos(shiftedV * 10)) > 0.2);
              grid[idx] = (cubeVisible && isDot) ? '.' : ' ';
            }
          }
        }
      }
    }

    /* 6 ── Render flat array → string of newline-separated rows */
    let out = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) out += grid[y * W + x];
      if (y < H - 1) out += '\n';
    }
    pre.textContent = out;
  }

  requestAnimationFrame(render);
})();
