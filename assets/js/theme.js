if (localStorage.getItem("theme") != null) {
  document.body.setAttribute("theme", localStorage.getItem("theme"));
}

if (localStorage.getItem("theme") === "breakaway") {
  const s = document.createElement("script");
  s.src = "/assets/js/breakaway.js";
  document.body.appendChild(s);
}

if (localStorage.getItem("theme") === "sovereign") {
  const s = document.createElement("script");
  s.src = "/assets/js/sovereign.js";
  document.body.appendChild(s);
}

/* hiddenV1 / demo removed — reset anyone who still has them */
if (
  localStorage.getItem("theme") === "hiddenV1" ||
  localStorage.getItem("theme") === "demo"
) {
  localStorage.setItem("theme", "default");
  document.body.setAttribute("theme", "default");
}