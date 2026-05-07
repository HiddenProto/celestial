document.title = "celestial. | games"
document.open();
document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <script src="/clst.instant.js"></script> 
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>celestial. | games</title>
  <link rel="stylesheet" href="/assets/css/home.css">
  <link rel="stylesheet" href="/assets/css/edugs.css">
</head>
<body theme="default">

<div class="search">
  <input class="textbook" placeholder="">
  
  <select>
    <option selected value="all">All Ga<span>m<span>es</option>
    <option value="exclusive">Popular</option>
    <option value="sandbox">Sandbox</option>
    <option value="indie">Indie</option>
    <option value="rpg">RPG</option>
    <option value="sports">Sports</option>
    <option value="2player">2 Player</option>
    <option value="adventure">Adventure</option>
    <option value="horror">Horror</option>
    <option value="shooter">Shooter</option>
    <option value="puzzle">Strategy</option>
    <option value="port">Web Ports</option>
    <option value="rhythm">Rhythm</option>
    <option value="platformer">Platformer</option>
    <option value="other">Other</option>
  </select>
  <select>
    <option selected value="abc">In Order</option>
    <option value="new">Newest</option>
  </select>
</div>
<div id="idk"></div> <!--pinned-->

<div class="gs"></div> <!--game list-->

<script type="module" src="/assets/js/newscards.js"></script>
</body>
<script type="module" src="/assets/js/theme.js"></script>
</html>
`);
document.close();
