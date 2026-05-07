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
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
}
  body {
    margin: 0;
  }
button {
    width:auto;
    border-radius:5px;
    padding:10px;
    background:var(--button);
    color:var(--color);
    border:none;
    appearance:none;
    font-family:'Inter',sans-serif;
    text-align:center;
    max-width:200px;
    cursor:pointer;
}

.gridthing {
    width: 100%;
    height: 100%;
    background:
        repeating-linear-gradient(60deg,
            #fff3 0 1px,
            transparent 1px 40px),
        repeating-linear-gradient(-60deg,
            #fff3 0 1px,
            transparent 1px 40px);
}

body[theme="light"] .gridthing {
    background:
        repeating-linear-gradient(60deg,
            #0002 0 1px,
            transparent 1px 40px),
        repeating-linear-gradient(-60deg,
            #0002 0 1px,
            transparent 1px 40px);
}

body[theme="midnight"] .gridthing {
  background:
    repeating-linear-gradient(60deg,
      rgba(80, 140, 255, 0.15) 0 1px,
      transparent 1px 40px),
    repeating-linear-gradient(-60deg,
      rgba(80, 140, 255, 0.15) 0 1px,
      transparent 1px 40px);
}

body[theme="pisscolorlmao"] .gridthing {
  background:
    repeating-linear-gradient(60deg,
      rgba(173, 173, 67, 0.18) 0 1px,
      transparent 1px 40px),
    repeating-linear-gradient(-60deg,
      rgba(173, 173, 67, 0.18) 0 1px,
      transparent 1px 40px);
}

body[theme="gradientblue"] .gridthing {
  background:
    repeating-linear-gradient(60deg,
      rgba(73, 153, 219, 0.18) 0 1px,
      transparent 1px 40px),
    repeating-linear-gradient(-60deg,
      rgba(73, 153, 219, 0.18) 0 1px,
      transparent 1px 40px);
}
body[theme="eww"] .gridthing {
  background:
    repeating-linear-gradient(60deg,
      rgba(255, 255, 255, 0.51) 0 1px,
      transparent 1px 40px),
    repeating-linear-gradient(-60deg,
      rgba(255, 255, 255, 0.385) 0 1px,
      transparent 1px 40px);
}

        p {
          font-size:15px;
          color:gray;
        }

        .row {
          display:flex;
          gap:25px;
          flex-wrap:wrap;
          align-items:center;
          justify-content:center;
        }

        .menu-box {
          border:1px solid var(--border);
          padding:15px;
          width:300px;
          height:250px;
          background:var(--pallet2);
          border-radius:10px;
          cursor:pointer;
          transition:0.4s;
        }

        .menu-box:hover {
          transform:scale(1.03);
        }

        .menu-box img {
          width:120px;
          padding:10px;
          border:1px solid var(--border);
        }

        .unavailable {
          cursor:not-allowed;
          background:var(--pallet);
        }

        body[theme="light"] .menu-box img {
          filter: invert(1);
        }

        .gradientthing {
          overflow-y:auto;
          overflow-x:hidden;
        }
  </style>
</head>

<body theme="default">
<div class="gradientthing" align="center">
<h1>media menu</h1>
<div class="row">
<div class="menu-box" data-url="/tab.html?autofill=https://app.apponfly.com/trial">
<img src="/assets/img/icns/comp.png" />
<h2>access virtual machine</h2>
<p>access our free virtual machine.</p>
</div>
<div class="menu-box" data-url="/tab.html?autofill=https://musicthing.space/music/">
<img src="/assets/img/icns/music.png" />
<h2>listen to music</h2>
<p>listen to your favorite songs.</p>
</div>
<div class="menu-box" data-url="/tab.html?autofill=https://www.cineby.sc/">
<img src="/assets/img/icns/pop.png" />
<h2>watch movies</h2>
<p>access movies, for free, no charge.</p>
</div>
<div class="menu-box" data-url="/tab.html?autofill=https://duck.ai">
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
<script>
document.querySelectorAll(".menu-box").forEach(box => {
  box.addEventListener("click", () => {
    const url = box.getAttribute("data-url");
    if (url) window.location.href = url;
  });
});
</script>
</body>
<script src="/assets/js/theme.js"></script>
</html>
`);
document.close();
