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

  var BOX_SCALES = [0.85, 1, 1.15, 1.3, 1.5];

  function nearestBoxScale(s) {
    var best = BOX_SCALES[0];
    var i;
    for (i = 0; i < BOX_SCALES.length; i += 1) {
      if (Math.abs(BOX_SCALES[i] - s) < Math.abs(best - s)) best = BOX_SCALES[i];
    }
    return best;
  }

  function currentBoxScale(stage) {
    return nearestBoxScale(Number(getComputedStyle(stage).getPropertyValue("--box-scale") || "1"));
  }

  function applyBoxScale(stage, s) {
    var scale = nearestBoxScale(s);
    stage.style.setProperty("--box-scale", String(scale));
    var down = stage.querySelector('[data-box-scale="down"]');
    var up = stage.querySelector('[data-box-scale="up"]');
    if (down) down.disabled = scale <= BOX_SCALES[0];
    if (up) up.disabled = scale >= BOX_SCALES[BOX_SCALES.length - 1];
    window.dispatchEvent(new Event("resize"));
  }

  function ensureBoxScaleChrome(stage) {
    if (stage.querySelector(".box-scale")) return;
    var group = document.createElement("div");
    group.className = "box-scale";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Scale this diagram");
    group.innerHTML = '<button type="button" data-box-scale="down" aria-label="Smaller">−</button>' +
      '<button type="button" data-box-scale="up" aria-label="Larger">+</button>';
    stage.insertBefore(group, stage.firstChild);
  }

  function initBoxScale() {
    $all(".visual.play.stage").forEach(function (stage) {
      ensureBoxScaleChrome(stage);
      applyBoxScale(stage, 1);
    });
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-box-scale]");
      if (!btn) return;
      var stage = btn.closest(".visual.play.stage");
      if (!stage) return;
      ev.preventDefault();
      var dir = btn.getAttribute("data-box-scale");
      var idx = BOX_SCALES.indexOf(currentBoxScale(stage));
      if (idx < 0) idx = BOX_SCALES.indexOf(1);
      if (dir === "up") idx = Math.min(BOX_SCALES.length - 1, idx + 1);
      if (dir === "down") idx = Math.max(0, idx - 1);
      applyBoxScale(stage, BOX_SCALES[idx]);
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
    initBoxScale();
    initReplays();
    initPipeline();
    initThickness();
    initSmoke();
    initDating();
  });
})();
