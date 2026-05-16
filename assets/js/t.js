// quick apps /tools/
var grid   = document.querySelector(".gs");
var searchEl = document.querySelector(".textbook");
var cat    = document.querySelector("select");

// Load apps from local JSON
fetch("/assets/json/tools.json").then(r => r.json())
  .then(games => {
    function showGames(list) {
      grid.innerHTML = "";
      list.forEach(g => {
        var card = document.createElement("div");
        card.className = "card";
        card.onclick = () => {
          location.href = "/tab.html?autofill=" + encodeURIComponent(g.url);
        };
        card.innerHTML = `<div class="thumb" style="background-image:url('${g.img || "/assets/img/placeholder.png"}')"></div><p>${g.name}</p>`;
        grid.appendChild(card);
      });
    }

    function update() {
      let filtered = games.filter(g =>
        g.name.toLowerCase().includes(searchEl.value.toLowerCase())
      );
      if (cat.value !== "all") {
        filtered = filtered.filter(g => g.categories?.includes(cat.value));
      }
      showGames(filtered);
    }

    searchEl.addEventListener("input", update);
    cat.addEventListener("change", update);

    games.sort((a, b) => a.name.localeCompare(b.name));
    showGames(games);
  });
