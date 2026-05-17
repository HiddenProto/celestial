/* apex.js — Exotic: Apex visual engine (admin-exclusive) */
(function () {
  if (localStorage.getItem('theme') !== 'apex') return;

  /* ── Canvas ─────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W, H;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const rand  = (a, b) => Math.random() * (b - a) + a;
  const randI = (a, b) => Math.floor(rand(a, b + 1));

  /* ── Prismatic drifting particles ────────────────────────────── */
  const PCOUNT = 90;
  const parts  = [];
  function makePart(anywhere) {
    return {
      x: rand(0, W), y: anywhere ? rand(0, H) : H + 5,
      r: rand(0.35, 2.4),
      hue: rand(0, 360), hueSpd: rand(0.12, 0.55),
      alpha: rand(0.06, 0.55),
      vx: rand(-0.09, 0.09), vy: rand(-0.13, 0.04),
      phase: rand(0, Math.PI * 2), phaseSpd: rand(0.004, 0.019),
    };
  }
  for (let i = 0; i < PCOUNT; i++) parts.push(makePart(true));

  /* ── Aura rings (concentric, each with own hue + pulse) ─────── */
  const RINGS = [
    { rW: 0.26, rH: 0.15, hue: 270, hueSpd: 0.07, pulse: 0.00, pulseSpd: 0.018, alpha: 0.22, lw: 2.4 },
    { rW: 0.41, rH: 0.23, hue: 190, hueSpd: -0.05, pulse: 1.57, pulseSpd: 0.013, alpha: 0.16, lw: 1.8 },
    { rW: 0.57, rH: 0.32, hue: 320, hueSpd: 0.04, pulse: 3.14, pulseSpd: 0.010, alpha: 0.12, lw: 1.3 },
    { rW: 0.72, rH: 0.42, hue: 220, hueSpd: -0.03, pulse: 0.78, pulseSpd: 0.008, alpha: 0.07, lw: 0.9 },
  ];

  /* ── Nebula wisps ────────────────────────────────────────────── */
  const wisps = [];
  function makeWisp() {
    return {
      x: rand(0, W), y: rand(0, H),
      rx: rand(85, 240), ry: rand(48, 130),
      hue: rand(200, 320), hueSpd: rand(0.04, 0.12),
      alpha: 0, peak: rand(0.035, 0.085),
      phase: 0, speed: rand(0.0007, 0.0018),
      vx: rand(-0.06, 0.06), vy: rand(-0.04, 0.04),
    };
  }
  for (let i = 0; i < 4; i++) wisps.push(makeWisp());

  /* ── Cursor sparks ───────────────────────────────────────────── */
  const sparks   = [];
  const MAX_SP   = 22;
  let mx = -999, my = -999, sparkPend = false, sparkHue = 0;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (sparkPend || sparks.length >= MAX_SP) return;
    sparkPend = true;
    requestAnimationFrame(() => {
      sparkPend = false;
      if (Math.random() < 0.38 && sparks.length < MAX_SP) {
        sparkHue = (sparkHue + 18) % 360;
        for (let i = 0; i < randI(1, 2); i++) {
          sparks.push({
            x: mx + rand(-4, 4), y: my + rand(-4, 4),
            vx: rand(-1.6, 1.6), vy: rand(-2.5, 0.4),
            r: rand(0.9, 2.4), life: 1, decay: rand(0.046, 0.105),
            hue: (sparkHue + rand(-25, 25) + 360) % 360,
          });
        }
      }
    });
  });

  /* ── Prismatic beam ──────────────────────────────────────────── */
  let beamY = -0.12, beamOn = false, beamHue = 270;
  let beamNext = Date.now() + rand(5000, 13000);

  /* ── Apex prism watermark ────────────────────────────────────── */
  const PRISM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 86">
    <defs>
      <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="rgba(140,30,255,0.55)"/>
        <stop offset="50%"  stop-color="rgba(0,210,255,0.50)"/>
        <stop offset="100%" stop-color="rgba(255,0,180,0.55)"/>
      </linearGradient>
    </defs>
    <!-- Outer gem shape -->
    <polygon points="50,3 95,28 80,78 20,78 5,28"
      fill="none" stroke="url(#pg)" stroke-width="2.4"
      stroke-linejoin="round"/>
    <!-- Inner facet -->
    <polygon points="50,18 80,32 70,64 30,64 20,32"
      fill="none" stroke="rgba(0,210,255,0.28)" stroke-width="1.2"
      stroke-linejoin="round"/>
    <!-- Top facet lines -->
    <line x1="50" y1="3"  x2="20" y2="32"  stroke="rgba(255,0,180,0.22)"  stroke-width="1.1"/>
    <line x1="50" y1="3"  x2="80" y2="32"  stroke="rgba(140,30,255,0.22)" stroke-width="1.1"/>
    <line x1="5"  y1="28" x2="95" y2="28"  stroke="rgba(0,210,255,0.18)"  stroke-width="0.9"/>
    <!-- Bottom facet lines -->
    <line x1="20" y1="78" x2="30" y2="64"  stroke="rgba(255,0,180,0.15)"  stroke-width="0.8"/>
    <line x1="80" y1="78" x2="70" y2="64"  stroke="rgba(140,30,255,0.15)" stroke-width="0.8"/>
    <!-- Apex gem tip glow dot -->
    <circle cx="50" cy="3" r="4" fill="rgba(0,210,255,0.60)"/>
    <circle cx="50" cy="3" r="2" fill="rgba(255,255,255,0.80)"/>
  </svg>`;
  const prismImg = new Image();
  prismImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PRISM_SVG);
  let prismPulse = 0;

  /* ── Helper: draw a glowing ellipse ring ────────────────────── */
  function drawRing(cx, cy, rx, ry, hue, alpha, lw) {
    // Outer glow pass
    ctx.strokeStyle = `hsla(${hue},100%,65%,${alpha * 0.35})`;
    ctx.lineWidth   = lw * 3.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Secondary shimmer pass (hue-shifted +90)
    ctx.strokeStyle = `hsla(${(hue + 90) % 360},100%,70%,${alpha * 0.20})`;
    ctx.lineWidth   = lw * 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Core bright line
    ctx.strokeStyle = `hsla(${hue},100%,82%,${alpha * 0.75})`;
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ── Theme check (every 90 frames) ──────────────────────────── */
  let frameCount = 0, themeOk = true;

  /* ── Main render loop ────────────────────────────────────────── */
  function loop() {
    if (document.hidden) { requestAnimationFrame(loop); return; }

    if (++frameCount % 90 === 0) {
      themeOk = localStorage.getItem('theme') === 'apex';
    }
    if (!themeOk) { canvas.remove(); return; }

    requestAnimationFrame(loop);
    ctx.clearRect(0, 0, W, H);
    const now = Date.now();
    const cx  = W / 2, cy = H / 2;

    // ── Nebula wisps (hue-shifting blobs)
    for (const w of wisps) {
      if (w.phase === 0)      { w.alpha += w.speed; if (w.alpha >= w.peak) { w.alpha = w.peak; w.phase = 1; } }
      else if (w.phase === 1) { w.alpha += w.speed * 0.08; if (w.alpha >= w.peak * 1.06) w.phase = 2; }
      else                    { w.alpha -= w.speed * 0.55; if (w.alpha <= 0) { Object.assign(w, makeWisp()); w.x = rand(0, W); w.y = rand(0, H); } }
      w.x += w.vx; w.y += w.vy;
      w.hue = (w.hue + w.hueSpd) % 360;
      ctx.save();
      ctx.globalAlpha = w.alpha;
      ctx.fillStyle   = `hsl(${w.hue},100%,58%)`;
      ctx.scale(1, w.ry / w.rx);
      ctx.beginPath();
      ctx.arc(w.x, w.y * (w.rx / w.ry), w.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Aura rings
    for (const ring of RINGS) {
      ring.hue   = (ring.hue + ring.hueSpd) % 360;
      ring.pulse += ring.pulseSpd;
      const sc = 1 + 0.045 * Math.sin(ring.pulse);
      drawRing(cx, cy, W * ring.rW * sc, H * ring.rH * sc, ring.hue, ring.alpha, ring.lw);
    }

    // ── Prismatic particles (per-particle color, can't batch)
    for (const p of parts) {
      p.hue   = (p.hue + p.hueSpd) % 360;
      p.phase += p.phaseSpd;
      const a = p.alpha * (0.5 + 0.5 * Math.sin(p.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle   = `hsl(${Math.round(p.hue)},100%,70%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < -5) p.x = W + 5; else if (p.x > W + 5) p.x = -5;
      if (p.y < -5) p.y = H + 5; else if (p.y > H + 5) p.y = -5;
    }
    ctx.globalAlpha = 1;

    // ── Prismatic beam sweep
    if (!beamOn && now > beamNext) { beamOn = true; beamY = -0.12; beamHue = rand(0, 360); }
    if (beamOn) {
      beamY += 0.0028;
      const by   = beamY * H;
      const fade = beamY < 0.1 ? beamY / 0.1 : beamY > 0.88 ? (1 - beamY) / 0.12 : 1;
      // Vertical falloff gradient
      const vg = ctx.createLinearGradient(0, by - 22, 0, by + 22);
      vg.addColorStop(0,   'rgba(0,0,0,0)');
      vg.addColorStop(0.5, `hsla(${beamHue},100%,75%,${0.11 * fade})`);
      vg.addColorStop(1,   'rgba(0,0,0,0)');
      // Horizontal color shift
      const hg = ctx.createLinearGradient(0, by, W, by);
      hg.addColorStop(0,    `hsla(${beamHue},100%,65%,0)`);
      hg.addColorStop(0.25, `hsla(${beamHue},100%,65%,${0.09 * fade})`);
      hg.addColorStop(0.5,  `hsla(${(beamHue + 80) % 360},100%,68%,${0.12 * fade})`);
      hg.addColorStop(0.75, `hsla(${(beamHue + 160) % 360},100%,65%,${0.09 * fade})`);
      hg.addColorStop(1,    `hsla(${beamHue},100%,65%,0)`);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = vg; ctx.fillRect(0, by - 22, W, 44);
      ctx.fillStyle = hg; ctx.globalAlpha = 0.6; ctx.fillRect(0, by - 22, W, 44);
      ctx.restore();
      if (beamY > 1.12) { beamOn = false; beamNext = now + rand(7000, 19000); }
    }

    // ── Cursor sparks (color-shifting)
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      ctx.globalAlpha = s.life * 0.88;
      ctx.fillStyle   = `hsl(${s.hue},100%,72%)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.1, s.r * s.life), 0, Math.PI * 2);
      ctx.fill();
      s.x += s.vx; s.y += s.vy; s.vy -= 0.055; s.life -= s.decay;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    ctx.globalAlpha = 1;

    // ── Prism watermark (hue-rotates continuously)
    prismPulse += 0.009;
    const prAlpha = 0.28 + 0.11 * Math.sin(prismPulse);
    if (prismImg.complete && prismImg.naturalWidth) {
      const pW = 88, pH = 76;
      ctx.save();
      ctx.globalAlpha = prAlpha;
      ctx.filter      = `hue-rotate(${((prismPulse * 55) % 360).toFixed(0)}deg) saturate(1.4)`;
      ctx.drawImage(prismImg, W - pW - 18, H - pH - 14, pW, pH);
      ctx.restore();
    }
  }

  loop();
})();
