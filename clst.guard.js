(() => {
  let e = document.createElement("script");
  e.innerText = 'console.warn("We see you, lightspeed.");';
  document.head.appendChild(e);
})();

const HtmlGuard = {
  protections: {
    antiDevTools() {
      function e(e) {
        return (
          "function" == typeof e &&
          !1 === window.eval.toString().includes("return") &&
          window.eval.toString().includes("[native code]") &&
          window.eval.toString().length < 40
        );
      }

      let t = setInterval(() => {
        if (!(e(Date.now) && e(window.eval) && 4 === window.eval("2+2"))) {
          alert("Do not spoof functions!");
          document.head.innerHTML = "";
          document.body.innerHTML = "";
          location.reload();
          clearInterval(t);
          return;
        }

        let o = Date.now();
        let r;
        window.eval("// The use of DevTools is prohibited in this web application\ndebugger");
        if ((r = Date.now()) - o > 50) {
          alert("DevTools not allowed!");
          document.head.innerHTML = "";
          document.body.innerHTML = "";
          location.reload();
          clearInterval(t);
        }
      }, 150);
    },

    blockContextMenu() {
      document.oncontextmenu = () => false;
    },

    blockDrag() {
      document.ondragstart = () => false;
    },

    blockSelection() {
      document.onselectstart = () => false;
    },

    blockConsoleOutput() {
      ["log", "debug", "warn", "error", "dir", "dirxml", "assert", "table"].forEach((e) => {
        console[e] = () => null;
      });
    },
  },

  loader: {
    loadStyleByRef(e) {
      let t = document.createElement("link");
      t.rel = "stylesheet";
      t.href = e;
      document.head.appendChild(t);
    },

    loadScriptBySrc(e) {
      let t = document.createElement("script");
      t.src = e;
      document.head.appendChild(t);
    },

    loadScriptBySrc_ContentLoaded(e) {
      document.addEventListener("DOMContentLoaded", () => {
        HtmlGuard.loader.loadScriptBySrc(e);
      });
    },
  },
};

if (Math.random() == Math.random() == Math.random()) {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  location.reload();
}

document.onkeydown = (e) => {
  if (
    123 == event.keyCode ||
    (e.ctrlKey && e.shiftKey && 73 == e.keyCode) ||
    (e.ctrlKey && e.shiftKey && 74 == e.keyCode) ||
    (e.ctrlKey && 85 == e.keyCode)
  ) {
    return false;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  function e() {
    let e = "html-guard-attribute";
    let r = ":not([" + e + "])";

    for (let n of document.querySelectorAll("*" + r)) {
      for (var l = 0; l < o(5, 15); l++) {
        let a = "";
        for (var i = 0; i < o(10, 20); i++) {
          a += t(1, 5) + "\n";
        }
        n.parentNode.insertBefore(document.createComment(a), n);
      }
    }

    for (let d of document.querySelectorAll(":not([id])" + r)) {
      d.id = t(5, 15);
    }

    for (let c of document.querySelectorAll("*")) {
      let s = c.attributes;
      for (let f of s) {
        if (f.name.startsWith("_")) {
          c.setAttribute(f.name.substring(1), f.value);
          c.removeAttribute(f.name);
        }
      }
    }

    for (let u of document.querySelectorAll("*" + r)) {
      for (let h = 0; h < o(1, 8); h++) {
        u.classList.add(t(6, 20));
      }
      for (let y = 0; y < o(10, 55); y++) {
        u.setAttribute(t(6, 12), 1 == o(0, 1) ? t(1, 5) : "");
      }
      u.setAttribute(e, "");
    }
  }

  function t(e, t) {
    if (e > t) throw RangeError("min > max");
    let o = Math.floor(Math.random() * (t - e + 1)) + e;
    let r = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let n = "";
    for (let l = 0; l < o; l++) {
      n += r.charAt(Math.floor(Math.random() * r.length));
    }
    return n;
  }

  function o(e, t) {
    if (e > t) throw RangeError("min > max");
    return Math.floor(Math.random() * (t - e + 1)) + e;
  }

  e();
  setInterval(() => {
    e();
  }, 2e3);
});