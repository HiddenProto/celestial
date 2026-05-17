/* apex.js — Exotic: Apex visual engine (admin-exclusive)
   Palette: bright mint (hsl 158, #00e899) on near-black (#000d07).
   Inspired by the Sol's RNG Exotic: Apex aura — mint & black. */
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

  /* Mint hue band 145–175 (seafoam-green to teal-mint, 30° wide) */
  const MN = 145, MX = 175, MB = MX - MN;
  const mintHue  = () => rand(MN, MX);
  /* Wrap hue within the mint band with an incremental drift */
  const wrapMint = (h, d) => MN + ((h - MN + d + MB * 10) % MB);

  /* ── Drifting mint particles ──────────────────────────────────── */
  const PCOUNT = 110;
  const parts  = [];
  function makePart(anywhere) {
    return {
      x: rand(0, W), y: anywhere ? rand(0, H) : H + 5,
      r: rand(0.28, 2.0),
      hue: mintHue(), hueSpd: rand(-0.05, 0.07),
      alpha: rand(0.06, 0.55),
      vx: rand(-0.10, 0.10), vy: rand(-0.16, 0.03),
      phase: rand(0, Math.PI * 2), phaseSpd: rand(0.004, 0.018),
    };
  }
  for (let i = 0; i < PCOUNT; i++) parts.push(makePart(true));

  /* ── Aura rings (4 concentric, mint hues) ────────────────────── */
  const RINGS = [
    { rW: 0.22, rH: 0.13, hue: 158, hueSpd:  0.030, pulse: 0.00, pulseSpd: 0.022, alpha: 0.32, lw: 2.8 },
    { rW: 0.38, rH: 0.22, hue: 168, hueSpd: -0.020, pulse: 1.57, pulseSpd: 0.016, alpha: 0.22, lw: 2.0 },
    { rW: 0.54, rH: 0.31, hue: 150, hueSpd:  0.018, pulse: 3.14, pulseSpd: 0.012, alpha: 0.15, lw: 1.4 },
    { rW: 0.70, rH: 0.41, hue: 163, hueSpd: -0.012, pulse: 0.78, pulseSpd: 0.008, alpha: 0.08, lw: 0.9 },
  ];

  /* ── Nebula wisps (mint-teal clouds) ──────────────────────────── */
  const wisps = [];
  function makeWisp() {
    return {
      x: rand(0, W), y: rand(0, H),
      rx: rand(88, 255), ry: rand(50, 138),
      hue: mintHue(), hueSpd: rand(-0.03, 0.05),
      alpha: 0, peak: rand(0.028, 0.068),
      phase: 0, speed: rand(0.0006, 0.0016),
      vx: rand(-0.05, 0.05), vy: rand(-0.04, 0.04),
    };
  }
  for (let i = 0; i < 5; i++) wisps.push(makeWisp());

  /* ── Slash streaks (the aura's "slashing effects") ───────────── */
  const slashes   = [];
  const MAX_SLASH = 14;
  let slashNext   = Date.now() + rand(600, 1800);
  function makeSlash() {
    const cx = W / 2, cy = H / 2;
    const angle = rand(0, Math.PI * 2);
    const dist  = rand(Math.min(W, H) * 0.06, Math.min(W, H) * 0.42);
    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist * 0.60,
      angle: angle + rand(-0.5, 0.5),
      len: rand(28, 115),
      hue: mintHue(), life: 1, decay: rand(0.022, 0.060),
      width: rand(0.7, 2.2),
    };
  }

  /* ── Cursor sparks (mint) ─────────────────────────────────────── */
  const sparks = [];
  const MAX_SP = 26;
  let mx = -999, my = -999, sparkPend = false, sparkHue = 158;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (sparkPend || sparks.length >= MAX_SP) return;
    sparkPend = true;
    requestAnimationFrame(() => {
      sparkPend = false;
      if (Math.random() < 0.42 && sparks.length < MAX_SP) {
        sparkHue = wrapMint(sparkHue, 5);
        for (let i = 0; i < randI(1, 3); i++) {
          sparks.push({
            x: mx + rand(-5, 5), y: my + rand(-5, 5),
            vx: rand(-1.8, 1.8), vy: rand(-2.8, 0.5),
            r: rand(0.9, 2.5), life: 1, decay: rand(0.040, 0.095),
            hue: mintHue(),
          });
        }
      }
    });
  });

  /* ── Mint beam sweep ──────────────────────────────────────────── */
  let beamY = -0.12, beamOn = false, beamHue = 158;
  let beamNext = Date.now() + rand(4000, 10000);

  /* ── Orb + ring rotation state ───────────────────────────────── */
  let orbPulse = 0, ringRot = 0;

  /* ── Gem watermark (mint diamond) ────────────────────────────── */
  const GEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 86">
    <defs>
      <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="rgba(0,200,120,0.55)"/>
        <stop offset="50%"  stop-color="rgba(0,255,175,0.52)"/>
        <stop offset="100%" stop-color="rgba(0,160,90,0.55)"/>
      </linearGradient>
    </defs>
    <polygon points="50,3 95,28 80,78 20,78 5,28"
      fill="none" stroke="url(#mg)" stroke-width="2.4" stroke-linejoin="round"/>
    <polygon points="50,18 80,32 70,64 30,64 20,32"
      fill="none" stroke="rgba(0,255,175,0.30)" stroke-width="1.2" stroke-linejoin="round"/>
    <line x1="50" y1="3"  x2="20" y2="32"  stroke="rgba(0,180,100,0.24)" stroke-width="1.1"/>
    <line x1="50" y1="3"  x2="80" y2="32"  stroke="rgba(0,220,130,0.24)" stroke-width="1.1"/>
    <line x1="5"  y1="28" x2="95" y2="28"  stroke="rgba(0,255,175,0.18)" stroke-width="0.9"/>
    <line x1="20" y1="78" x2="30" y2="64"  stroke="rgba(0,180,100,0.15)" stroke-width="0.8"/>
    <line x1="80" y1="78" x2="70" y2="64"  stroke="rgba(0,220,130,0.15)" stroke-width="0.8"/>
    <circle cx="50" cy="3" r="4" fill="rgba(0,255,175,0.65)"/>
    <circle cx="50" cy="3" r="2" fill="rgba(220,255,240,0.85)"/>
  </svg>`;
  const gemImg = new Image();
  gemImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(GEM_SVG);
  let gemPulse = 0;

  /* ── Helper: draw a glowing mint ellipse ring ────────────────── */
  function drawRing(cx, cy, rx, ry, hue, alpha, lw) {
    // Outer glow pass
    ctx.strokeStyle = `hsla(${hue},100%,58%,${alpha * 0.40})`;
    ctx.lineWidth   = lw * 4.0;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Teal shimmer (+15° shifted)
    ctx.strokeStyle = `hsla(${(hue + 15) % 360},100%,72%,${alpha * 0.22})`;
    ctx.lineWidth   = lw * 2.0;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Bright core line
    ctx.strokeStyle = `hsla(${hue},100%,88%,${alpha * 0.82})`;
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ── Theme check (every 90 frames) ───────────────────────────── */
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

    // ── Nebula wisps
    for (const w of wisps) {
      if (w.phase === 0)      { w.alpha += w.speed; if (w.alpha >= w.peak) { w.alpha = w.peak; w.phase = 1; } }
      else if (w.phase === 1) { w.alpha += w.speed * 0.06; if (w.alpha >= w.peak * 1.05) w.phase = 2; }
      else                    { w.alpha -= w.speed * 0.50; if (w.alpha <= 0) { Object.assign(w, makeWisp()); w.x = rand(0, W); w.y = rand(0, H); } }
      w.x += w.vx; w.y += w.vy;
      w.hue = wrapMint(w.hue, w.hueSpd);
      ctx.save();
      ctx.globalAlpha = w.alpha;
      ctx.fillStyle   = `hsl(${w.hue},100%,50%)`;
      ctx.scale(1, w.ry / w.rx);
      ctx.beginPath();
      ctx.arc(w.x, w.y * (w.rx / w.ry), w.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Aura rings
    for (const ring of RINGS) {
      ring.hue   = wrapMint(ring.hue, ring.hueSpd);
      ring.pulse += ring.pulseSpd;
      const sc = 1 + 0.055 * Math.sin(ring.pulse);
      drawRing(cx, cy, W * ring.rW * sc, H * ring.rH * sc, ring.hue, ring.alpha, ring.lw);
    }

    // ── Floating orb (mint sphere above center with pulsing black 4-pointed star)
    orbPulse += 0.018;
    ringRot   += 0.008;
    const orbY = Math.max(60, cy * 0.30) + 8 * Math.sin(orbPulse);
    const orbR = Math.min(W, H) * 0.044 * (1 + 0.07 * Math.sin(orbPulse * 1.4));

    // Outer halo (screen blend so it lightens the background)
    const halo = ctx.createRadialGradient(cx, orbY, 0, cx, orbY, orbR * 3.2);
    halo.addColorStop(0,   `hsla(158,100%,78%,0.50)`);
    halo.addColorStop(0.4, `hsla(158,100%,55%,0.24)`);
    halo.addColorStop(1,   `hsla(158,100%,40%,0.00)`);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, orbY, orbR * 3.2, 0, Math.PI * 2); ctx.fill();

    // Rotating flat rings around orb (the "large circle that rotates quickly")
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.30 + 0.10 * Math.sin(orbPulse);
    ctx.strokeStyle = `hsl(158,100%,65%)`;
    ctx.lineWidth   = 1.1;
    ctx.beginPath();
    ctx.ellipse(cx, orbY, orbR * 2.9, orbR * 0.35, ringRot, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.ellipse(cx, orbY, orbR * 2.2, orbR * 0.28, ringRot + 0.9, 0, Math.PI * 2);
    ctx.stroke();

    // Core orb sphere
    ctx.globalAlpha = 0.72 + 0.18 * Math.sin(orbPulse);
    ctx.fillStyle   = `hsl(158,100%,62%)`;
    ctx.beginPath(); ctx.arc(cx, orbY, orbR, 0, Math.PI * 2); ctx.fill();

    // Pulsing black 4-pointed star at center
    ctx.globalAlpha = 0.92;
    ctx.fillStyle   = '#000a05';
    const ss = orbR * 0.40;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI / 4) + orbPulse * 0.14;
      const r = i % 2 === 0 ? ss : ss * 0.30;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * r, orbY + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // ── Mint particles
    for (const p of parts) {
      p.hue   = wrapMint(p.hue, p.hueSpd);
      p.phase += p.phaseSpd;
      const a = p.alpha * (0.5 + 0.5 * Math.sin(p.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle   = `hsl(${p.hue.toFixed(0)},100%,68%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < -5) p.x = W + 5; else if (p.x > W + 5) p.x = -5;
      if (p.y < -5) p.y = H + 5; else if (p.y > H + 5) p.y = -5;
    }
    ctx.globalAlpha = 1;

    // ── Slash streaks (spawned randomly around center)
    if (slashes.length < MAX_SLASH && now > slashNext) {
      slashes.push(makeSlash());
      slashNext = now + rand(350, 1600);
    }
    for (let i = slashes.length - 1; i >= 0; i--) {
      const sl = slashes[i];
      const hw = sl.len * 0.5;
      ctx.save();
      ctx.globalAlpha = sl.life * 0.82;
      ctx.strokeStyle = `hsl(${sl.hue},100%,72%)`;
      ctx.lineWidth   = sl.width * sl.life;
      ctx.lineCap     = 'round';
      ctx.shadowColor = `hsl(${sl.hue},100%,60%)`;
      ctx.shadowBlur  = 5;
      ctx.beginPath();
      ctx.moveTo(sl.x - Math.cos(sl.angle) * hw, sl.y - Math.sin(sl.angle) * hw);
      ctx.lineTo(sl.x + Math.cos(sl.angle) * hw, sl.y + Math.sin(sl.angle) * hw);
      ctx.stroke();
      ctx.restore();
      sl.life -= sl.decay;
      if (sl.life <= 0) slashes.splice(i, 1);
    }

    // ── Mint beam sweep (from top to bottom, periodically)
    if (!beamOn && now > beamNext) { beamOn = true; beamY = -0.12; beamHue = mintHue(); }
    if (beamOn) {
      beamY += 0.0025;
      const by   = beamY * H;
      const fade = beamY < 0.10 ? beamY / 0.10 : beamY > 0.88 ? (1 - beamY) / 0.12 : 1;
      const vg   = ctx.createLinearGradient(0, by - 26, 0, by + 26);
      vg.addColorStop(0,   'rgba(0,0,0,0)');
      vg.addColorStop(0.5, `hsla(${beamHue},100%,72%,${0.12 * fade})`);
      vg.addColorStop(1,   'rgba(0,0,0,0)');
      const hg   = ctx.createLinearGradient(0, by, W, by);
      hg.addColorStop(0,    `hsla(${beamHue},100%,62%,0)`);
      hg.addColorStop(0.22, `hsla(${beamHue},100%,62%,${0.09 * fade})`);
      hg.addColorStop(0.50, `hsla(${beamHue},100%,78%,${0.13 * fade})`);
      hg.addColorStop(0.78, `hsla(${beamHue},100%,62%,${0.09 * fade})`);
      hg.addColorStop(1,    `hsla(${beamHue},100%,62%,0)`);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = vg; ctx.fillRect(0, by - 26, W, 52);
      ctx.fillStyle = hg; ctx.globalAlpha = 0.62; ctx.fillRect(0, by - 26, W, 52);
      ctx.restore();
      if (beamY > 1.12) { beamOn = false; beamNext = now + rand(5000, 16000); }
    }

    // ── Cursor sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      ctx.globalAlpha = s.life * 0.90;
      ctx.fillStyle   = `hsl(${s.hue},100%,70%)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.1, s.r * s.life), 0, Math.PI * 2);
      ctx.fill();
      s.x += s.vx; s.y += s.vy; s.vy -= 0.055; s.life -= s.decay;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    ctx.globalAlpha = 1;

    // ── Whirlpool beneath center (swirling rings at base)
    const wpY = Math.min(H - 30, cy * 1.65);
    const wpP = orbPulse * 0.65;
    ctx.save();
    ctx.globalAlpha = 0.10 + 0.05 * Math.sin(wpP);
    ctx.strokeStyle = `hsl(158,100%,60%)`;
    ctx.lineWidth   = 1.1;
    ctx.beginPath();
    ctx.ellipse(cx, wpY, W * 0.17 * (1 + 0.04 * Math.sin(wpP)), H * 0.048, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.055 + 0.03 * Math.sin(wpP + 1.2);
    ctx.lineWidth   = 0.7;
    ctx.beginPath();
    ctx.ellipse(cx, wpY, W * 0.25 * (1 + 0.03 * Math.sin(wpP + 0.6)), H * 0.068, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── Gem watermark (hue-rotates slightly within mint range)
    gemPulse += 0.008;
    const gmAlpha = 0.26 + 0.10 * Math.sin(gemPulse);
    if (gemImg.complete && gemImg.naturalWidth) {
      const gW = 86, gH = 74;
      ctx.save();
      ctx.globalAlpha = gmAlpha;
      /* Oscillate ±14° around mint so it never drifts outside the green band */
      ctx.filter = `hue-rotate(${(Math.sin(gemPulse * 0.7) * 14).toFixed(1)}deg) saturate(1.5) brightness(1.1)`;
      ctx.drawImage(gemImg, W - gW - 16, H - gH - 12, gW, gH);
      ctx.restore();
    }
  }

  loop();
})();
