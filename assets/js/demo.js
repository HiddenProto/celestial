/* demo.js — Demo theme
   Adds a persistent top banner and a tiled diagonal DEMO watermark.
   The real UI remains fully visible but clearly marked as a demo build. */
(function () {
  if (localStorage.getItem('theme') !== 'demo') return;

  /* ── top banner ─────────────────────────────────────────────────── */
  const banner = document.createElement('div');
  banner.id = 'demo-banner';
  banner.textContent = '◈  DEMO MODE  ◈';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;height:24px;' +
    'background:rgba(255,200,0,0.07);' +
    'border-bottom:1px solid rgba(255,200,0,0.22);' +
    'color:rgba(255,200,0,0.55);' +
    'font:600 10px/24px monospace;text-align:center;' +
    'letter-spacing:5px;text-transform:uppercase;' +
    'z-index:2147483647;pointer-events:none;user-select:none;';
  document.body.appendChild(banner);

  /* ── diagonal DEMO watermark ─────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.id = 'demo-watermark';
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:2147483646;opacity:0.04;';
  document.body.appendChild(canvas);

  function draw() {
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.font = 'bold 52px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 5);
    const col = 240, row = 130;
    for (let x = -W * 1.5; x < W * 1.5; x += col) {
      for (let y = -H * 1.5; y < H * 1.5; y += row) {
        ctx.fillText('DEMO', x, y);
      }
    }
    ctx.restore();
  }

  draw();
  window.addEventListener('resize', draw);
})();
