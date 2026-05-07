import {
	setWisp,
	makeURL,
	getProxied,
	setTransport,
	setProxy,
} from "/lithium.mjs"




// new tab
// homepage
document.title = "new tab";
const h1 = document.querySelector('#main');
const url = document.querySelector('.url');
const card = document.querySelector('#card');
const card2 = document.querySelector('#card2');
const card3 = document.querySelector('#card3');
const foot = document.querySelector('.footer .a2');
const foot2 = document.querySelector('.footer .a3');
const foot3 = document.querySelector('.footer .ap');
// const text = document.querySelector('.wallahi');

 h1.textContent = "celestial.";
 url.placeholder = "search with ease";
 card.querySelector('p').innerHTML = "ga<span>m</span>es";
 card2.querySelector('p').textContent = "quick apps";
 card3.querySelector('p').textContent = "media";
 // i know this is stupid but it looks really ugly when looking in the code so im doing this
 foot.innerHTML = "dis<span>c</span>ord";
 foot.href = "https://dsc.gg/gnetwork";
 foot.target = "_blank"
 foot2.textContent = "legal";
 foot3.textContent = "partners";

 if (document.body.getAttribute("theme") === "saywallahibro") {
  h1.innerHTML = "pro<span>x</span>y.";
  // text.style.display = "block";
}