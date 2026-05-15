/* sovereign.js — optimised visual engine for the SOVEREIGN admin theme */
(function () {
  if (localStorage.getItem('theme') !== 'sovereign') return;

  /* ── Canvas setup ──────────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:1;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const rand  = (a, b) => Math.random() * (b - a) + a;
  const randI = (a, b) => Math.floor(rand(a, b + 1));

  /* ── Crown watermark ───────────────────────────────────────────────────── */
  const CROWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70">
    <path d="M5,60 L15,20 L35,45 L50,5 L65,45 L85,20 L95,60 Z"
      fill="none" stroke="rgba(201,168,76,0.18)" stroke-width="3"
      stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="50" cy="5"  r="4" fill="rgba(201,168,76,0.22)"/>
    <circle cx="15" cy="20" r="3" fill="rgba(201,168,76,0.18)"/>
    <circle cx="85" cy="20" r="3" fill="rgba(201,168,76,0.18)"/>
    <rect x="5" y="60" width="90" height="7" rx="3"
      fill="rgba(201,168,76,0.12)" stroke="rgba(201,168,76,0.18)" stroke-width="1.5"/>
  </svg>`;
  const crownImg = new Image();
  crownImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CROWN_SVG);
  let crownAlpha = 0, crownPulse = 0;

  /* ── Drifting stars (reduced count, batched draw) ──────────────────────── */
  const STAR_COUNT = 75;
  const stars = [];
  function makeStar(fromBottom) {
    return {
      x: rand(0, W), y: fromBottom ? H + 5 : rand(0, H),
      r: rand(0.3, 2.2),
      alpha: rand(0.07, 0.55),
      vx: rand(-0.12, 0.12), vy: rand(-0.14, 0.06),
      phase: rand(0, Math.PI * 2), phaseSpeed: rand(0.006, 0.022),
    };
  }
  for (let i = 0; i < STAR_COUNT; i++) stars.push(makeStar(false));

  /* ── Nebula wisps (simple ellipse fill — no per-frame gradient) ────────── */
  const wisps = [];
  function makeWisp() {
    return {
      x: rand(0, W), y: rand(0, H),
      rx: rand(90, 260), ry: rand(50, 140),
      alpha: 0, peak: rand(0.04, 0.10),
      phase: 0, speed: rand(0.0008, 0.002),
      vx: rand(-0.07, 0.07), vy: rand(-0.05, 0.05),
    };
  }
  for (let i = 0; i < 4; i++) wisps.push(makeWisp());

  /* ── Shooting stars ────────────────────────────────────────────────────── */
  const shoots = [];
  function addShoot() {
    const angle = rand(0.18, 0.58);
    shoots.push({
      x: rand(0, W * 0.7), y: rand(0, H * 0.6),
      dx: Math.cos(angle) * rand(5, 11),
      dy: Math.sin(angle) * rand(2.5, 5.5),
      life: 1, decay: rand(0.012, 0.025), tail: rand(80, 200),
    });
  }

  /* ── Cursor sparks (RAF-throttled, hard-capped) ────────────────────────── */
  const sparks = [];
  const MAX_SPARKS = 18;
  let mx = -999, my = -999, sparkPending = false;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (sparkPending || sparks.length >= MAX_SPARKS) return;
    sparkPending = true;
    requestAnimationFrame(() => {
      sparkPending = false;
      if (Math.random() < 0.35 && sparks.length < MAX_SPARKS) {
        for (let i = 0; i < randI(1, 2); i++) {
          sparks.push({
            x: mx + rand(-4, 4), y: my + rand(-4, 4),
            vx: rand(-1.5, 1.5), vy: rand(-2.4, 0.3),
            r: rand(0.8, 2.2), life: 1, decay: rand(0.05, 0.12),
          });
        }
      }
    });
  });

  /* ── Scanning beam ─────────────────────────────────────────────────────── */
  let beamY = -0.12, beamOn = false;
  let beamNext = Date.now() + rand(6000, 16000);

  /* ── Constellation ─────────────────────────────────────────────────────── */
  let constLines = [], constAlpha = 0, constNext = Date.now() + 4000;
  function rebuildConstellations() {
    const maxDist = 165, lines = [];
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < Math.min(i + 10, stars.length); j++) {
        const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 80 && d < maxDist) lines.push({ i, j, d });
      }
    }
    constLines = lines.sort(() => Math.random() - 0.5).slice(0, 12);
  }
  rebuildConstellations();

  /* ── Theme cache — only read localStorage every 90 frames ─────────────── */
  let frameCount = 0, themeOk = true;

  /* ── Main render loop ──────────────────────────────────────────────────── */
  function loop() {
    if (document.hidden) { requestAnimationFrame(loop); return; }

    if (++frameCount % 90 === 0) {
      themeOk = localStorage.getItem('theme') === 'sovereign';
    }
    if (!themeOk) { canvas.remove(); return; }

    requestAnimationFrame(loop);
    ctx.clearRect(0, 0, W, H);
    const now = Date.now();

    // ── Nebula wisps (simple ellipse, no radial gradient)
    for (const w of wisps) {
      if (w.phase === 0)      { w.alpha += w.speed; if (w.alpha >= w.peak) { w.alpha = w.peak; w.phase = 1; } }
      else if (w.phase === 1) { w.alpha += w.speed * 0.1; if (w.alpha >= w.peak * 1.06) w.phase = 2; }
      else                    { w.alpha -= w.speed * 0.6; if (w.alpha <= 0) { Object.assign(w, makeWisp()); w.x = rand(0, W); w.y = rand(0, H); } }
      w.x += w.vx; w.y += w.vy;
      ctx.save();
      ctx.globalAlpha = w.alpha;
      ctx.fillStyle = 'rgba(201,155,65,1)';
      ctx.scale(1, w.ry / w.rx);
      ctx.beginPath();
      ctx.arc(w.x, w.y * (w.rx / w.ry), w.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Constellation lines (batched per-alpha stroke)
    if (constAlpha < 1 && now < constNext - 2000) constAlpha = Math.min(1, constAlpha + 0.012);
    else if (constAlpha > 0 && now > constNext - 2000) constAlpha = Math.max(0, constAlpha - 0.008);
    if (constAlpha <= 0 && now > constNext) { constAlpha = 0; rebuildConstellations(); constNext = now + rand(5000, 14000); }
    if (constAlpha > 0.01) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.0006);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (const { i, j, d } of constLines) {
        ctx.moveTo(stars[i].x, stars[i].y);
        ctx.lineTo(stars[j].x, stars[j].y);
      }
      ctx.strokeStyle = `rgba(201,168,76,${constAlpha * 0.15 * pulse})`;
      ctx.stroke();
    }

    // ── Stars (batched into 3 alpha groups)
    const g0 = [], g1 = [], g2 = [];
    for (const s of stars) {
      s.phase += s.phaseSpeed;
      const a = s.alpha * (0.5 + 0.5 * Math.sin(s.phase));
      s._a = a;
      if      (a < 0.18) g0.push(s);
      else if (a < 0.38) g1.push(s);
      else               g2.push(s);
      s.x += s.vx; s.y += s.vy;
      if (s.x < -5) s.x = W + 5; else if (s.x > W + 5) s.x = -5;
      if (s.y < -5) s.y = H + 5; else if (s.y > H + 5) s.y = -5;
    }
    for (const [group, alpha] of [[g0, 0.12], [g1, 0.28], [g2, 0.50]]) {
      if (!group.length) continue;
      ctx.fillStyle = `rgba(225,190,100,${alpha})`;
      ctx.beginPath();
      for (const s of group) ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Shooting stars
    for (let i = shoots.length - 1; i >= 0; i--) {
      const s = shoots[i];
      const g = ctx.createLinearGradient(
        s.x, s.y, s.x - s.dx * (s.tail / 8), s.y - s.dy * (s.tail / 8)
      );
      g.addColorStop(0, `rgba(255,230,140,${s.life * 0.9})`);
      g.addColorStop(1, 'rgba(220,175,70,0)');
      ctx.beginPath(); ctx.strokeStyle = g; ctx.lineWidth = s.life * 1.6;
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.dx * (s.tail / 8), s.y - s.dy * (s.tail / 8));
      ctx.stroke();
      s.x += s.dx; s.y += s.dy; s.life -= s.decay;
      if (s.life <= 0) shoots.splice(i, 1);
    }
    if (Math.random() < 0.003 && shoots.length < 4) addShoot();

    // ── Cursor sparks (batched)
    if (sparks.length) {
      ctx.beginPath();
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        ctx.moveTo(s.x, s.y);
        ctx.arc(s.x, s.y, Math.max(0.1, s.r * s.life), 0, Math.PI * 2);
        s.x += s.vx; s.y += s.vy; s.vy -= 0.06; s.life -= s.decay;
        if (s.life <= 0) sparks.splice(i, 1);
      }
      ctx.fillStyle = 'rgba(255,215,80,0.7)';
      ctx.fill();
    }

    // ── Scanning beam
    if (!beamOn && now > beamNext) { beamOn = true; beamY = -0.12; }
    if (beamOn) {
      beamY += 0.003;
      const by   = beamY * H;
      const fade = beamY < 0.1 ? beamY / 0.1 : beamY > 0.88 ? (1 - beamY) / 0.12 : 1;
      const bg   = ctx.createLinearGradient(0, by - 18, 0, by + 18);
      bg.addColorStop(0,   'rgba(201,168,76,0)');
      bg.addColorStop(0.5, `rgba(255,215,100,${0.09 * fade})`);
      bg.addColorStop(1,   'rgba(201,168,76,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, by - 18, W, 36);
      if (beamY > 1.12) { beamOn = false; beamNext = now + rand(8000, 22000); }
    }

    // ── Crown watermark
    crownPulse += 0.012;
    crownAlpha = 0.28 + 0.10 * Math.sin(crownPulse);
    if (crownImg.complete && crownImg.naturalWidth) {
      const cW = 110, cH = 77;
      ctx.save();
      ctx.globalAlpha = crownAlpha;
      ctx.drawImage(crownImg, W - cW - 22, H - cH - 18, cW, cH);
      ctx.restore();
    }
  }

  loop();
})();
