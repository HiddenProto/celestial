(function () {
  if (localStorage.getItem('theme') !== 'breakaway') return;

  const NS = 'http://www.w3.org/2000/svg';
  const rnd = (a, b) => Math.random() * (b - a) + a;
  const rndI = (a, b) => Math.floor(rnd(a, b + 1));
  const wait = ms => new Promise(res => setTimeout(res, ms));

  const svg = document.createElementNS(NS, 'svg');
  svg.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;overflow:visible;';
  document.body.appendChild(svg);

  // Generate points for one crack arm with slight angle drift per segment
  function armPoints(x, y, angle, len, segs) {
    const pts = [[x, y]];
    let a = angle, rem = len, cx = x, cy = y;
    for (let i = 0; i < segs && rem > 12; i++) {
      a += rnd(-0.38, 0.38);
      const l = rem * rnd(0.32, 0.68);
      cx += Math.cos(a) * l;
      cy += Math.sin(a) * l;
      pts.push([cx, cy]);
      rem -= l;
    }
    return pts;
  }

  function makePath(pts) {
    if (pts.length < 2) return null;
    const el = document.createElementNS(NS, 'path');
    const d = 'M' + pts[0].join(',') + pts.slice(1).map(p => 'L' + p.join(',')).join('');
    el.setAttribute('d', d);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    return el;
  }

  function buildCracks(impX, impY) {
    const w = window.innerWidth, h = window.innerHeight;
    const diag = Math.hypot(w, h);
    const group = document.createElementNS(NS, 'g');
    const paths = [];
    const numArms = rndI(6, 13);
    const baseStep = (Math.PI * 2) / numArms;

    for (let i = 0; i < numArms; i++) {
      const angle = baseStep * i + rnd(-0.55, 0.55);
      const len = rnd(diag * 0.18, diag * 0.95);
      const segs = rndI(2, 5);
      const pts = armPoints(impX, impY, angle, len, segs);

      const el = makePath(pts);
      if (!el) continue;
      el.setAttribute('stroke', `rgba(255,${rndI(28,72)},${rndI(18,55)},${rnd(0.55,0.95)})`);
      el.setAttribute('stroke-width', rnd(0.9, 2.4));
      group.appendChild(el);
      paths.push(el);

      // branch cracks off this arm
      const numBranches = rndI(1, 3);
      for (let b = 0; b < numBranches; b++) {
        if (pts.length < 2) continue;
        const bi = rndI(1, pts.length - 1);
        const [bx, by] = pts[bi];
        const ba = angle + rnd(Math.PI / 5, Math.PI / 1.8) * (Math.random() > 0.5 ? 1 : -1);
        const bl = len * rnd(0.08, 0.38);
        const bpts = armPoints(bx, by, ba, bl, rndI(1, 3));
        const bel = makePath(bpts);
        if (!bel) continue;
        bel.setAttribute('stroke', `rgba(255,${rndI(28,82)},${rndI(14,52)},${rnd(0.3,0.65)})`);
        bel.setAttribute('stroke-width', rnd(0.5, 1.4));
        group.appendChild(bel);
        paths.push(bel);
      }
    }

    // impact point glow
    const c1 = document.createElementNS(NS, 'circle');
    c1.setAttribute('cx', impX); c1.setAttribute('cy', impY);
    c1.setAttribute('r', rnd(7, 18)); c1.setAttribute('fill', 'rgba(255,40,40,0.13)');
    group.appendChild(c1);
    const c2 = document.createElementNS(NS, 'circle');
    c2.setAttribute('cx', impX); c2.setAttribute('cy', impY);
    c2.setAttribute('r', rnd(2, 5)); c2.setAttribute('fill', 'rgba(255,80,80,0.65)');
    group.appendChild(c2);

    return { group, paths };
  }

  async function crackCycle() {
    while (localStorage.getItem('theme') === 'breakaway') {
      const w = window.innerWidth, h = window.innerHeight;
      const impX = rnd(w * 0.07, w * 0.87);
      const impY = rnd(h * 0.05, h * 0.82);

      const { group, paths } = buildCracks(impX, impY);
      group.style.opacity = '1';
      svg.appendChild(group);

      // Set up stroke-dashoffset draw-in — must be in DOM before getTotalLength
      const animated = paths.map(p => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len; // start invisible
        return { p, len };
      });

      // Draw in — each crack forms with a staggered delay
      const drawDur = rnd(500, 1600);
      animated.forEach(({ p }, i) => {
        const delay = i * rnd(25, 90);
        const dur = drawDur * rnd(0.55, 1.0);
        setTimeout(() => {
          p.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(0.1, 0, 0.9, 1)`;
          p.style.strokeDashoffset = '0';
        }, delay);
      });
      await wait(drawDur + animated.length * 90 + 250);

      // Hold — crack stays visible
      await wait(rnd(2000, 8500));

      // Undo — crack retracts (reverse dashoffset back to hidden)
      const retractDur = rnd(400, 1200);
      const shuffled = [...animated].sort(() => Math.random() - 0.5);
      shuffled.forEach(({ p, len }, i) => {
        const delay = i * rnd(15, 60);
        setTimeout(() => {
          p.style.transition = `stroke-dashoffset ${retractDur * rnd(0.5, 1.0)}ms cubic-bezier(0.1, 0, 0.9, 1)`;
          p.style.strokeDashoffset = len;
        }, delay);
      });
      // Fade out impact glow simultaneously
      group.style.transition = `opacity ${retractDur + 200}ms ease-in`;
      group.style.opacity = '0';
      await wait(retractDur + shuffled.length * 60 + 300);

      svg.removeChild(group);

      // Pause before next random crack forms
      await wait(rnd(600, 3500));
    }

    svg.remove();
  }

  crackCycle();
})();
