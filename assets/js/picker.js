// same thing as theme.js
const themepicker = document.getElementById("themepicker");

if (localStorage.getItem("theme")) {
  document.body.setAttribute("data-theme", localStorage.getItem("theme"));
  themepicker.value = localStorage.getItem("theme");
} else {
  document.body.setAttribute("data-theme", "default");
  localStorage.setItem("theme", "default");
}

themepicker.addEventListener("change", function(e) {
  let theme = e.target.value;
  if (theme !== "select") {
    localStorage.setItem("theme", theme);
    location.reload();
  }
});