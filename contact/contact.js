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
    body[theme="light"] .menu-box img { filter: invert(1); }
    .gradientthing { overflow-y: auto; overflow-x: hidden; }
  </style>
</head>
<body theme="default">
<div class="gradientthing" align="center">
  <h1>media menu</h1>
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
  </div>
</div>
<script>
  document.querySelectorAll(".menu-box[data-url]").forEach(function(box) {
    box.addEventListener("click", function() {
      var url = box.getAttribute("data-url");
      if (url) window.location.href = "/tab.html?autofill=" + encodeURIComponent(url);
    });
  });
</script>
<script src="/assets/js/theme.js"></script>
</body>
</html>
`);
document.close();
