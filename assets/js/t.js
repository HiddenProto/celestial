// quick apps /tools/
import { makeURL, getProxied, setWisp, setProxy, setTransport } from "/lithium.mjs";

// Configure proxy from user settings (same as tab.html does)
const _wispLoc = localStorage.getItem("location") || "wss://celestial-wisp.onrender.com/";
setWisp(
  (_wispLoc.startsWith("wss://") || _wispLoc.startsWith("ws://"))
    ? _wispLoc
    : (location.protocol === "https:" ? "wss://" : "ws://") + location.host + _wispLoc
);
setProxy(localStorage.getItem("pr0xy") || "scram");
setTransport(localStorage.getItem("transportz") || "epoxy");

const search = localStorage.getItem("search-engine") || "https://search.brave.com/search?q=%s";

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
        card.onclick = async () => {
          const proxied = await getProxied(makeURL(g.url, search));
          location.href = proxied;
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
