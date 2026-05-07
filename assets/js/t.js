// quick apps /tools/
// literally copied from newscards.js but modified
var grid = document.querySelector(".gs");
var search = document.querySelector(".textbook");
var cat = document.querySelector("select");

const _fetchTools = (urls) => fetch(urls[0]).then(r => { if (!r.ok) throw 0; return r.json(); }).catch(() => urls.length > 1 ? _fetchTools(urls.slice(1)) : Promise.reject());
_fetchTools(["https://creditrepair911.us/assets/json/tools.json", "/assets/json/tools.json"])
  .then(games => {
    function showGames(list) {
      grid.innerHTML = "";
      list.forEach(g => {
        var card = document.createElement("div");
        card.className = "card";
        card.onclick = () =>
            location.href = `/tab.html?autofill=${encodeURIComponent(g.url)}`;
        card.innerHTML = `<div class="thumb" style="background-image:url('${g.img || "/assets/img/placeholder.png"}')"></div><p>${g.name}</p>`;
        grid.appendChild(card);
      });
    }

    function update() {
      let filtered = games.filter(g =>
        g.name.toLowerCase().includes(search.value.toLowerCase())
      );

      if (cat.value !== "all") {
        filtered = filtered.filter(g => g.categories?.includes(cat.value));
      }

      showGames(filtered);
    }

    search.addEventListener("input", update);
    cat.addEventListener("change", update);
    
    games.sort((a, b) => a.name.localeCompare(b.name));
    showGames(games);
  });
