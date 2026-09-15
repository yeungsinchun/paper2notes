(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

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
    $all(".visual[data-autoplay]").forEach(function (v) {
      replay(v);
    });
  }

  function initPipeline() {
    $all("[data-leak]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("data-leak") === "on";
        if (window.NotesScenes && window.NotesScenes.pipeline) {
          window.NotesScenes.pipeline.setLeak(on);
        }
        $all("[data-leak]").forEach(function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
      });
    });
  }

  function initThickness() {
    var slider = $("#thick-slider");
    if (!slider) return;
    function apply() {
      var v = Number(slider.value);
      if (window.NotesScenes && window.NotesScenes.thickness) {
        window.NotesScenes.thickness.setThick(v);
      }
    }
    slider.addEventListener("input", apply);
    apply();
  }

  function initSmoke() {
    $all("[data-fire]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("data-fire") === "on";
        if (window.NotesScenes && window.NotesScenes.smoke) {
          window.NotesScenes.smoke.setFire(on);
        }
        $all("[data-fire]").forEach(function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
      });
    });
  }

  function initDating() {
    $all("[data-age]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = Number(btn.getAttribute("data-age"));
        if (window.NotesScenes && window.NotesScenes.dating) {
          window.NotesScenes.dating.setAge(i);
        }
        $all("[data-age]").forEach(function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initReplays();
    initPipeline();
    initThickness();
    initSmoke();
    initDating();
  });
})();
