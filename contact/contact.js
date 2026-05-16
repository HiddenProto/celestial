document.title = "celestial. | media";

document.open();
document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="shortcut icon" type="image/png" href="/assets/img/logo-blackbg.png" />
  <link rel="stylesheet" href="/assets/css/home.css" />
  <link rel="stylesheet" href="/assets/css/xtra.css" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; }
    body { margin: 0; }
    button {
      width: auto; border-radius: 5px; padding: 10px;
      background: var(--button); color: var(--color); border: none;
      appearance: none; font-family: 'Inter', sans-serif;
      text-align: center; max-width: 200px; cursor: pointer;
    }
    .gridthing {
      width: 100%; height: 100%;
      background:
        repeating-linear-gradient(60deg, #fff3 0 1px, transparent 1px 40px),
        repeating-linear-gradient(-60deg, #fff3 0 1px, transparent 1px 40px);
    }
    body[theme="light"] .gridthing {
      background:
        repeating-linear-gradient(60deg, #0002 0 1px, transparent 1px 40px),
        repeating-linear-gradient(-60deg, #0002 0 1px, transparent 1px 40px);
    }
    body[theme="midnight"] .gridthing {
      background:
        repeating-linear-gradient(60deg, rgba(80,140,255,0.15) 0 1px, transparent 1px 40px),
        repeating-linear-gradient(-60deg, rgba(80,140,255,0.15) 0 1px, transparent 1px 40px);
    }
    p { font-size: 15px; color: gray; }
    .row {
      display: flex; gap: 25px; flex-wrap: wrap;
      align-items: center; justify-content: center;
    }
    .menu-box {
      border: 1px solid var(--border); padding: 15px;
      width: 300px; height: 250px; background: var(--pallet2);
      border-radius: 10px; cursor: pointer; transition: 0.4s;
    }
    .menu-box:hover { transform: scale(1.03); }
    .menu-box img { width: 120px; padding: 10px; border: 1px solid var(--border); }
    .menu-box.unavailable { cursor: not-allowed; background: var(--pallet); }
    body[theme="light"] .menu-box img { filter: invert(1); }
    .gradientthing { overflow-y: auto; overflow-x: hidden; }
    #media-search {
      width: min(400px, 90vw);
      margin: 0 auto 22px;
      display: block;
    }
  </style>
</head>
<body theme="default">
<div class="gradientthing" align="center">
  <h1>media menu</h1>
  <input id="media-search" class="textbook" placeholder="search media..." autocomplete="off" />
  <div class="row">
    <div class="menu-box" data-url="https://app.apponfly.com/trial">
      <img src="/assets/img/icns/comp.png" />
      <h2>access virtual machine</h2>
      <p>access our free virtual machine.</p>
    </div>
    <div class="menu-box" data-url="https://musicthing.space/music/">
      <img src="/assets/img/icns/music.png" />
      <h2>listen to music</h2>
      <p>listen to your favorite songs.</p>
    </div>
    <div class="menu-box" data-url="https://www.cineby.sc/">
      <img src="/assets/img/icns/pop.png" />
      <h2>watch movies</h2>
      <p>access movies, for free, no charge.</p>
    </div>
    <div class="menu-box" data-url="https://duck.ai">
      <img src="/assets/img/icns/ai.png" />
      <h2>access AI</h2>
      <p>access AI with multiple models, no charge.</p>
    </div>
    <div class="menu-box unavailable">
      <img src="/assets/img/icns/chat.png" />
      <h2>access chat</h2>
      <p>coming soon!</p>
    </div>
  </div>
</div>
<script type="module">
  import { setWisp, setProxy, setTransport, getProxied, makeURL } from "/lithium.mjs";

  const _wispLoc = localStorage.getItem("location") || "wss://celestial-wisp.onrender.com/";
  setWisp(
    (_wispLoc.startsWith("wss://") || _wispLoc.startsWith("ws://"))
      ? _wispLoc
      : (location.protocol === "https:" ? "wss://" : "ws://") + location.host + _wispLoc
  );
  setProxy(localStorage.getItem("pr0xy") || "scram");
  setTransport(localStorage.getItem("transportz") || "epoxy");

  const search = localStorage.getItem("search-engine") || "https://search.brave.com/search?q=%s";

  document.querySelectorAll(".menu-box[data-url]").forEach(box => {
    box.addEventListener("click", async () => {
      const url = box.getAttribute("data-url");
      if (url) location.href = await getProxied(makeURL(url, search));
    });
  });

  document.getElementById("media-search").addEventListener("input", e => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll(".menu-box").forEach(box => {
      const text = (box.querySelector("h2")?.textContent + " " + (box.querySelector("p")?.textContent || "")).toLowerCase();
      box.style.display = q && !text.includes(q) ? "none" : "";
    });
  });
</script>
<script src="/assets/js/theme.js"></script>
</body>
</html>
`);
document.close();
