(function () {
  "use strict";

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  /* Concept checks (MC / true-false / written answer) live in ../../js/checks.js. */

  function replay(el) {
    el.classList.remove("play");
    void el.offsetWidth;
    el.classList.add("play");
    el.dispatchEvent(new Event("notes-replay"));
  }

  function initReplays() {
    $all("[data-replay]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-replay"));
        if (target) replay(target);
      });
    });
    /* Autoplay clips start when the student scrolls to them, and start again
       each time the box comes back into view, so a clip is never found already
       finished. Without IntersectionObserver they simply play at load. */
    var autos = $all(".visual[data-autoplay]");
    if (!autos.length) return;
    if (typeof IntersectionObserver !== "function") {
      autos.forEach(replay);
      return;
    }
    var lastPlay = new WeakMap();
    var watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var now = performance.now();
        if (now - (lastPlay.get(entry.target) || -1e9) < 1200) return;
        lastPlay.set(entry.target, now);
        replay(entry.target);
      });
    }, { threshold: 0.45 });
    autos.forEach(function (v) { watcher.observe(v); });
  }

  function initChain() {
    $all("[data-chain]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-chain");
        if (window.NotesScenes && window.NotesScenes.chain) {
          window.NotesScenes.chain.setMode(mode);
        }
        $all("[data-chain]").forEach(function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
      });
    });
  }

  function initRods() {
    $all("[data-rods]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("data-rods") === "in";
        if (window.NotesScenes && window.NotesScenes.reactor) {
          window.NotesScenes.reactor.setRods(on);
        }
        $all("[data-rods]").forEach(function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initReplays();
    initChain();
    initRods();
  });
})();
