// we be injecting
// thank you slqnt big hug and kisses
// no homo..

// inject lithium/lethal.js from rohan
import { currentFrame } from "/lithium.mjs";
// fetch json
const exts = await fetch("/assets/json/ext.json").then(r => r.json());

currentFrame.addEventListener("load", () => {
  const url = currentFrame.dataset.displayUrl;
  exts.forEach(e => {
    const sites = [].concat(e.website);
    if (e.includes === "yes" ? sites.some(s => url.includes(s)) : sites.includes(new URL(url).hostname)) { // i only gotta check if includes is yes so it can be included in every page
      const s = currentFrame.contentDocument.createElement("script");
      s.textContent = e.src;
      currentFrame.contentDocument.body.prepend(s);
    }
  });
});
