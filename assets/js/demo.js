/* demo.js — Demo/beta-build theme
   Makes the site look like a work-in-progress: dashed borders,
   WIP badges, TODO notes, skeleton bars, and a beta warning banner. */
(function () {
  if (localStorage.getItem('theme') !== 'demo') return;

  /* ── extra styles ────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    body[theme="demo"] .box {
      border-style: dashed !important;
    }
    body[theme="demo"] button {
      border-style: dashed !important;
      opacity: 0.8;
    }
    body[theme="demo"] .select,
    body[theme="demo"] input[type="text"],
    body[theme="demo"] input[type="number"],
    body[theme="demo"] textarea {
      border-style: dashed !important;
    }
    body[theme="demo"] img {
      opacity: 0.55;
      filter: grayscale(0.4);
    }
    @keyframes demo-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    .demo-wip {
      display: inline-block;
      font: 700 9px monospace;
      color: rgba(200,165,45,0.65);
      background: rgba(200,165,45,0.07);
      border: 1px dashed rgba(200,165,45,0.32);
      padding: 1px 6px;
      border-radius: 3px;
      margin-left: 6px;
      vertical-align: middle;
      user-select: none;
      pointer-events: none;
    }
    .demo-todo {
      display: block;
      font: 10px/1.6 monospace;
      color: rgba(200,165,45,0.38);
      margin-top: 6px;
      pointer-events: none;
    }
    .demo-skeleton {
      display: inline-block;
      width: 90px; height: 9px;
      border-radius: 3px;
      vertical-align: middle;
      background: linear-gradient(90deg,
        rgba(200,165,45,0.08) 25%,
        rgba(200,165,45,0.18) 50%,
        rgba(200,165,45,0.08) 75%);
      background-size: 400px 100%;
      animation: demo-shimmer 1.8s infinite linear;
    }
  `;
  document.head.appendChild(style);

  /* ── top banner ─────────────────────────────────────────────── */
  const banner = document.createElement('div');
  banner.id = 'demo-banner';
  banner.innerHTML = '⚠&nbsp;&nbsp;BETA BUILD&nbsp;&nbsp;—&nbsp;&nbsp;some elements are incomplete or placeholders';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;height:24px;' +
    'background:rgba(200,155,20,0.07);' +
    'border-bottom:1px dashed rgba(200,155,20,0.28);' +
    'color:rgba(200,155,20,0.55);' +
    'font:700 10px/24px monospace;text-align:center;' +
    'letter-spacing:3px;z-index:2147483647;' +
    'pointer-events:none;user-select:none;';
  document.body.appendChild(banner);

  /* ── dev build stamp (bottom-left) ──────────────────────────── */
  const stamp = document.createElement('div');
  stamp.id = 'demo-stamp';
  stamp.textContent = 'DEV BUILD';
  stamp.style.cssText =
    'position:fixed;bottom:10px;left:12px;' +
    'font:800 9px monospace;letter-spacing:3px;' +
    'color:rgba(200,165,45,0.25);' +
    'pointer-events:none;user-select:none;z-index:2147483647;';
  document.body.appendChild(stamp);

  /* ── content injected into .box elements ─────────────────────── */
  const WIP_TAGS   = ['[ WIP ]', '[ TODO ]', '[ STUB ]'];
  const TODO_LINES = [
    '// TODO: finish implementation',
    '// placeholder — design not finalized',
    '// needs review before release',
    '// incomplete — check back later',
    '// stub — functionality pending',
  ];

  function markBoxes() {
    const boxes = document.querySelectorAll('.box');
    boxes.forEach((box, i) => {
      if (box.dataset.demoMarked) return;
      box.dataset.demoMarked = '1';

      const h = box.querySelector('h3, h2, h4');

      /* WIP badge on every ~3rd box */
      if (i % 3 === 1 && h) {
        const wip = document.createElement('span');
        wip.className = 'demo-wip';
        wip.textContent = WIP_TAGS[i % WIP_TAGS.length];
        h.appendChild(wip);
      }

      /* Skeleton shimmer replacing a desc paragraph on every ~4th box */
      if (i % 4 === 2) {
        const desc = box.querySelector('.desc, p');
        if (desc) {
          const skel = document.createElement('span');
          skel.className = 'demo-skeleton';
          skel.style.width = (60 + (i * 17) % 80) + 'px';
          desc.appendChild(document.createTextNode(' '));
          desc.appendChild(skel);
        }
      }

      /* TODO comment on every ~5th box */
      if (i % 5 === 3) {
        const todo = document.createElement('span');
        todo.className = 'demo-todo';
        todo.textContent = TODO_LINES[i % TODO_LINES.length];
        box.appendChild(todo);
      }
    });
  }

  setTimeout(markBoxes, 250);
  setTimeout(markBoxes, 900); // catch late-rendered content
})();
