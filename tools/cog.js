document.title = "celestial. | apps";

document.open();
document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>celestial. | games</title>
  <link rel="stylesheet" href="/assets/css/home.css">
  <link rel="stylesheet" href="/assets/css/edugs.css">
  <style>
    .card {
    width:210px;
    background:var(--pallet2);
    border-radius:6px;
    overflow:hidden;
    cursor:pointer;
    display:flex;
    align-items:flex-end;
    justify-content:center;
    position:relative;
    border:2px solid transparent;
    transition:border 0.2s, transform 0.2s;
    gap:10px;
    height:110px;
}
    </style>
</head>
<body theme="default">

<div class="search">
  <input class="textbook" placeholder="search..">
  
  <select style="width:100px;">
    <option selected value="all">all</option>
    <option value="popular">popular</option>
    <option value="ai">ai</option>
    <option value="movies">streaming</option>
    <option value="fun">fun</option>
    <option value="gamesites">g<span>am</span>e sites</option>
    <option value="sm">social media</option>
    <option value="cg">cloud ga<span>mi</span>ng</option>
    <option value="music">music</option>
    <option value="misc">other</option>
  </select>
</div>

<div class="gs"></div>

<script src="/assets/js/t.js"></script>
</body>
<script src="/assets/js/theme.js"></script>
</html>
`);
document.close();
