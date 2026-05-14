/* sovereign.js — ambient gold particle system for the admin-exclusive SOVEREIGN theme */
(function () {
  if (localStorage.getItem('theme') !== 'sovereign') return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:1;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function rand(a, b) { return Math.random() * (b - a) + a; }

  // ── Drifting star particles ──────────────────────────────────────────────────
  const STAR_COUNT = 90;
  const stars = [];

  function makeStar() {
    return {
      x:          rand(0, W),
      y:          rand(0, H),
      r:          rand(0.3, 1.9),
      alpha:      rand(0.08, 0.55),
      vx:         rand(-0.10, 0.10),
      vy:         rand(-0.10, 0.07),
      phase:      rand(0, Math.PI * 2),
      phaseSpeed: rand(0.007, 0.022),
    };
  }

  for (let i = 0; i < STAR_COUNT; i++) stars.push(makeStar());

  // ── Shooting stars ───────────────────────────────────────────────────────────
  const shoots = [];

  function addShoot() {
    const angle = rand(0.20, 0.55);
    shoots.push({
      x:     rand(0, W * 0.65),
      y:     rand(0, H * 0.55),
      dx:    Math.cos(angle) * rand(5, 10),
      dy:    Math.sin(angle) * rand(2.5, 5),
      life:  1,
      decay: rand(0.011, 0.024),
      tail:  rand(90, 220),
    });
  }

  // ── Nebula wisps (slow large blobs that appear & fade) ───────────────────────
  const wisps = [];

  function makeWisp() {
    return {
      x:      rand(0, W),
      y:      rand(0, H),
      rx:     rand(120, 280),
      ry:     rand(60, 150),
      alpha:  0,
      peak:   rand(0.04, 0.09),
      phase:  0,          // 0=fadein 1=hold 2=fadeout
      speed:  rand(0.0008, 0.002),
      vx:     rand(-0.08, 0.08),
      vy:     rand(-0.05, 0.05),
    };
  }

  for (let i = 0; i < 4; i++) wisps.push(makeWisp());

  // ── Main loop ────────────────────────────────────────────────────────────────
  function loop() {
    if (localStorage.getItem('theme') !== 'sovereign') { canvas.remove(); return; }
    requestAnimationFrame(loop);
    ctx.clearRect(0, 0, W, H);

    // Draw nebula wisps
    for (const w of wisps) {
      if (w.phase === 0) {
        w.alpha += w.speed;
        if (w.alpha >= w.peak) { w.alpha = w.peak; w.phase = 1; }
      } else if (w.phase === 1) {
        // hold for a while, then fade
        w.alpha += w.speed * 0.1;
        if (w.alpha >= w.peak * 1.05) w.phase = 2;
      } else {
        w.alpha -= w.speed * 0.7;
        if (w.alpha <= 0) {
          // respawn
          Object.assign(w, makeWisp());
          w.x = rand(0, W); w.y = rand(0, H);
        }
      }
      w.x += w.vx; w.y += w.vy;
      const grd = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, Math.max(w.rx, w.ry));
      grd.addColorStop(0,   `rgba(201,168,76,${w.alpha})`);
      grd.addColorStop(0.5, `rgba(130,80,20,${w.alpha * 0.4})`);
      grd.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.save();
      ctx.scale(1, w.ry / w.rx);
      ctx.beginPath();
      ctx.arc(w.x, w.y * (w.rx / w.ry), w.rx, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.restore();
    }

    // Draw drifting stars
    for (const s of stars) {
      s.phase += s.phaseSpeed;
      const a = s.alpha * (0.55 + 0.45 * Math.sin(s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 185, 95, ${a})`;
      ctx.fill();
      s.x += s.vx; s.y += s.vy;
      if (s.x < -4) s.x = W + 4;
      if (s.x > W + 4) s.x = -4;
      if (s.y < -4) s.y = H + 4;
      if (s.y > H + 4) s.y = -4;
    }

    // Draw shooting stars
    for (let i = shoots.length - 1; i >= 0; i--) {
      const s = shoots[i];
      const grd = ctx.createLinearGradient(
        s.x, s.y,
        s.x - s.dx * (s.tail / 8), s.y - s.dy * (s.tail / 8)
      );
      grd.addColorStop(0, `rgba(255, 228, 140, ${s.life * 0.92})`);
      grd.addColorStop(0.4, `rgba(220, 175, 70, ${s.life * 0.4})`);
      grd.addColorStop(1, 'rgba(220, 175, 70, 0)');
      ctx.beginPath();
      ctx.strokeStyle = grd;
      ctx.lineWidth = s.life * 1.6;
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.dx * (s.tail / 8), s.y - s.dy * (s.tail / 8));
      ctx.stroke();
      s.x += s.dx; s.y += s.dy;
      s.life -= s.decay;
      if (s.life <= 0) shoots.splice(i, 1);
    }

    // Spawn new shooting star occasionally
    if (Math.random() < 0.003 && shoots.length < 4) addShoot();
  }

  loop();
})();
