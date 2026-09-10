(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs || {}).forEach(function (key) {
      el.setAttribute(key, String(attrs[key]));
    });
    return el;
  }

  function setFeedback(el, ok, text) {
    if (!el) return;
    el.textContent = text;
    el.className = "feedback " + (ok ? "ok" : "no");
  }

  function initMc() {
    $all("[data-check='mc']").forEach(function (box) {
      var answer = box.getAttribute("data-answer");
      var out = $(".feedback", box);
      $all("button[data-choice]", box).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var pick = btn.getAttribute("data-choice");
          $all("button[data-choice]", box).forEach(function (b) {
            b.classList.remove("correct", "wrong");
            b.disabled = true;
          });
          if (pick === answer) {
            btn.classList.add("correct");
            setFeedback(out, true, "Yes.");
          } else {
            btn.classList.add("wrong");
            var right = $("button[data-choice='" + answer + "']", box);
            if (right) right.classList.add("correct");
            setFeedback(out, false, "Not this one.");
          }
        });
      });
    });
  }

  function initTf() {
    $all("[data-check='tf']").forEach(function (box) {
      $all(".tf-item", box).forEach(function (item) {
        var answer = item.getAttribute("data-answer") === "true";
        var out = $(".feedback", item);
        $all("button[data-tf]", item).forEach(function (btn) {
          btn.addEventListener("click", function () {
            var pick = btn.getAttribute("data-tf") === "true";
            $all("button[data-tf]", item).forEach(function (b) {
              b.disabled = true;
            });
            if (pick === answer) {
              btn.classList.add("correct");
              setFeedback(out, true, "Yes.");
            } else {
              btn.classList.add("wrong");
              setFeedback(out, false, answer ? "True." : "False.");
            }
          });
        });
      });
    });
  }

  function replay(el) {
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

  function initImaging() {
    /* imaging is a three.js scene; replay is handled by data-scene + notes-replay */
  }

  function initIsotopes() {
    $all("[data-iso]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (window.NotesScenes && window.NotesScenes.hydrogen) {
          window.NotesScenes.hydrogen.setN(Number(btn.getAttribute("data-iso")));
        }
      });
    });
  }

  function initNuclides() {
    $all("[data-nuclide]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (window.NotesScenes && window.NotesScenes.nuclide) {
          window.NotesScenes.nuclide.setKey(btn.getAttribute("data-nuclide"));
        }
      });
    });
  }

  var series = [
    { el: "U", a: 238, z: 92, n: 146, kind: "α" },
    { el: "Th", a: 234, z: 90, n: 144, kind: "β" },
    { el: "Pa", a: 234, z: 91, n: 143, kind: "β" },
    { el: "U", a: 234, z: 92, n: 142, kind: "α" },
    { el: "Th", a: 230, z: 90, n: 140, kind: "α" },
    { el: "Ra", a: 226, z: 88, n: 138, kind: "α" },
    { el: "Rn", a: 222, z: 86, n: 136, kind: "α" },
    { el: "Po", a: 218, z: 84, n: 134, kind: "α" },
    { el: "Pb", a: 214, z: 82, n: 132, kind: "β" },
    { el: "Bi", a: 214, z: 83, n: 131, kind: "β" },
    { el: "Po", a: 214, z: 84, n: 130, kind: "α" },
    { el: "Pb", a: 210, z: 82, n: 128, kind: "β" },
    { el: "Bi", a: 210, z: 83, n: 127, kind: "β" },
    { el: "Po", a: 210, z: 84, n: 126, kind: "α" },
    { el: "Pb", a: 206, z: 82, n: 124, kind: "stable" }
  ];

  function initSeries() {
    var az = $("#series-az");
    var nz = $("#series-nz");
    var readout = $("#series-readout");
    if (!az || !nz) return;
    var step = 0;
    var left = 48;
    var right = 292;
    var top = 22;
    var bottom = 208;
    var zMin = 81;
    var zMax = 93;
    var aMin = 204;
    var aMax = 240;
    var nMin = 122;
    var nMax = 148;

    function xFromZ(z) {
      return left + (z - zMin) * (right - left) / (zMax - zMin);
    }
    function yFromA(a) {
      return bottom - (a - aMin) * (bottom - top) / (aMax - aMin);
    }
    function yFromN(n) {
      return bottom - (n - nMin) * (bottom - top) / (nMax - nMin);
    }

    function plot(svg, yOf, key) {
      $all(".plot", svg).forEach(function (node) { node.remove(); });
      var pts = "";
      var i;
      var dots = [];
      for (i = 0; i <= step; i += 1) {
        var nu = series[i];
        var x = xFromZ(nu.z);
        var y = yOf(key === "a" ? nu.a : nu.n);
        pts += x + "," + y + " ";
        var fill = "#8aa39c";
        if (i === step) fill = "#0e5f56";
        else if (i > 0 && series[i - 1].kind === "β") fill = "#1d4f91";
        else if (i > 0) fill = "#c0392b";
        dots.push({ x: x, y: y, r: i === step ? 5 : 3.2, fill: fill });
      }
      svg.appendChild(svgEl("polyline", {
        class: "plot",
        points: pts,
        fill: "none",
        stroke: "#6b7380",
        "stroke-width": "1.6"
      }));
      dots.forEach(function (dot) {
        svg.appendChild(svgEl("circle", {
          class: "plot", cx: dot.x, cy: dot.y, r: dot.r, fill: dot.fill
        }));
      });
    }

    function draw() {
      plot(az, yFromA, "a");
      plot(nz, yFromN, "n");
      var nu = series[step];
      var next = nu.kind === "stable" ? "stable" : "next " + nu.kind;
      readout.textContent =
        nu.el + "-" + nu.a + "   Z = " + nu.z + "   N = " + nu.n + "   ·  " + next +
        "   ·  γ would not move this point";
    }

    $("#series-next") && $("#series-next").addEventListener("click", function () {
      step = Math.min(series.length - 1, step + 1);
      draw();
    });
    $("#series-reset") && $("#series-reset").addEventListener("click", function () {
      step = 0;
      draw();
    });
    draw();
  }

  function initDecayEq() {
    $all("[data-decay]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-decay");
        $all("[data-decay-panel]").forEach(function (p) {
          p.hidden = p.getAttribute("data-decay-panel") !== kind;
        });
        var vis = document.getElementById("decay-" + kind);
        if (vis) replay(vis);
      });
    });
  }

  function jitter(n) {
    return n + Math.round((Math.random() - 0.5) * 8);
  }

  function initGm() {
    var display = $("#gm-rate");
    var bgEl = $("#gm-bg");
    var corr = $("#gm-corr");
    if (!display) return;
    var bg = 1;
    var extra = 0;
    var gridOn = true;
    var picked = 0;
    var needGridOff = false;
    function applyExtra() {
      extra = gridOn && needGridOff ? 0 : picked;
    }
    function tick() {
      var shown = Math.max(0, jitter(bg + extra));
      display.textContent = String(shown);
      if (corr) corr.textContent = String(Math.max(0, shown - bg));
    }
    setInterval(tick, 700);
    tick();
    $("#gm-bg-btn") && $("#gm-bg-btn").addEventListener("click", function () {
      picked = 0;
      needGridOff = false;
      applyExtra();
    });
    $all("[data-gm-src]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        picked = Number(btn.getAttribute("data-gm-src"));
        needGridOff = btn.getAttribute("data-need-grid") === "off";
        applyExtra();
      });
    });
    $("#gm-grid") && $("#gm-grid").addEventListener("click", function () {
      gridOn = !gridOn;
      this.setAttribute("aria-pressed", gridOn ? "true" : "false");
      this.textContent = gridOn ? "plastic grid on (blocks α)" : "plastic grid off (α can enter)";
      applyExtra();
    });
    if (bgEl) bgEl.textContent = "Hong Kong typical background ≈ 1 count s⁻¹";
  }

  function initIonCurrent() {
    $all("[data-current]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (window.NotesScenes && window.NotesScenes.current && window.NotesScenes.current.setKind) {
          window.NotesScenes.current.setKind(btn.getAttribute("data-current"));
        }
      });
    });
  }

  function initTracks() {
    var buttons = $all("[data-track]");
    function press(kind) {
      buttons.forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-track") === kind ? "true" : "false");
      });
    }
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-track");
        if (window.NotesScenes && window.NotesScenes.tracks) {
          window.NotesScenes.tracks.setKind(kind);
        }
        press(kind);
      });
    });
    if (buttons.length) press("alpha");
  }

  var sources = {
    abg: { a: 200, b: 385, g: 254, label: "α + β + γ" },
    bg: { a: 0, b: 385, g: 254, label: "β + γ  (Example 25.6)" },
    ag: { a: 150, b: 0, g: 254, label: "α + γ" }
  };

  function absorberCount(src, paper, al, pb, bg) {
    var count = bg;
    var alphaStopped = paper || al || pb;
    var betaStopped = al || pb;
    if (src.a && !alphaStopped) count += src.a;
    if (src.b && !betaStopped) count += src.b;
    if (src.g) count += pb ? src.g / 2 : src.g;
    return Math.max(bg, Math.round(count));
  }

  function initAbsorbers() {
    var rateEl = $("#abs-rate");
    var note = $("#abs-note");
    if (!rateEl) return;
    var src = sources.bg;
    var paper = false;
    var al = false;
    var pb = false;
    var bg = 61;

    function render() {
      var r = jitter(absorberCount(src, paper, al, pb, bg));
      rateEl.textContent = r + " cpm";
      var bits = [];
      if (paper) bits.push("paper");
      if (al) bits.push("5 mm Al");
      if (pb) bits.push("25 mm Pb");
      if (note) {
        note.textContent = src.label + (bits.length ? "  ·  " + bits.join(", ") : "  ·  air only") +
          "  ·  background ≈ " + bg + " cpm";
      }
      if (window.NotesScenes && window.NotesScenes.absorbers) {
        window.NotesScenes.absorbers.set({
          hasA: !!src.a,
          hasB: !!src.b,
          hasG: !!src.g,
          paper: paper,
          al: al,
          pb: pb
        });
      }
    }

    $all("[data-src]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        src = sources[btn.getAttribute("data-src")];
        render();
      });
    });
    $("#abs-paper") && $("#abs-paper").addEventListener("click", function () {
      paper = !paper;
      this.setAttribute("aria-pressed", paper ? "true" : "false");
      render();
    });
    $("#abs-al") && $("#abs-al").addEventListener("click", function () {
      al = !al;
      this.setAttribute("aria-pressed", al ? "true" : "false");
      render();
    });
    $("#abs-pb") && $("#abs-pb").addEventListener("click", function () {
      pb = !pb;
      this.setAttribute("aria-pressed", pb ? "true" : "false");
      render();
    });
    render();
  }

  var flowSteps = [
    { text: "Unknown source in front of a GM tube. Subtract background later." },
    { text: "Insert paper. Example 25.6: no drop (700 → 700) → no α. A drop would mean α is present." },
    { text: "Insert ~5 mm Al. Example 25.6: drop from the paper reading (700 → 315) → β is present." },
    { text: "β present. Continue to the Pb test for γ." },
    { text: "Insert ~25 mm Pb. Example 25.6: drop but still above background (315 → 190) → γ is present (halved, not zero)." },
    { text: "γ present. Strength only halved by 25 mm Pb, never read below background." },
    { text: "Confirm: E or B splits α / β; γ straight. Tracks: thick / thin / faint." }
  ];

  function initFlow() {
    var svg = $("#id-flow");
    var talk = $("#flow-talk");
    if (!svg) return;
    var i = 0;
    var hasAlpha = null;
    var hasBeta = null;

    function talkText() {
      if (hasAlpha === true && i <= 1) {
        return "Significant drop at paper → α is present. Still insert Al, then Pb.";
      }
      if (hasAlpha === true && i === 2) {
        return "α already found. Insert ~5 mm Al to test for β, then Pb for γ.";
      }
      if (hasAlpha === true && i === 4) {
        return "Insert ~25 mm Pb to test for γ. Remaining count above background → γ is present.";
      }
      if (hasBeta === false && i === 4) {
        return "No drop at Al → no β. Insert ~25 mm Pb to test for γ.";
      }
      return flowSteps[i].text;
    }

    function show() {
      $all(".node", svg).forEach(function (n) {
        n.classList.remove("active", "done");
        var raw = n.getAttribute("data-step");
        if (raw === "alpha") {
          if (hasAlpha === true) n.classList.add(i <= 1 ? "active" : "done");
          return;
        }
        var idx = Number(raw);
        if (idx === 1 && hasAlpha === true && i <= 1) {
          n.classList.add("done");
          return;
        }
        if (idx === 3 && hasBeta !== true) return;
        if (idx < i) n.classList.add("done");
        if (idx === i) n.classList.add("active");
      });
      $all(".edge", svg).forEach(function (e) {
        var branch = e.getAttribute("data-side");
        var need = Number(e.getAttribute("data-until"));
        var lit = false;
        if (branch === "alpha") lit = hasAlpha === true;
        else if (branch === "no-alpha") lit = hasAlpha === false && i >= 2;
        else if (branch === "beta") lit = hasBeta === true && i >= need;
        else if (branch === "no-beta") lit = hasBeta === false && i >= 4;
        else lit = i >= need;
        e.classList.toggle("lit", lit);
      });
      if (talk) talk.textContent = talkText();
    }

    $("#flow-next") && $("#flow-next").addEventListener("click", function () {
      if (i === 1 && hasAlpha === null) hasAlpha = false;
      if (i === 2 && hasBeta === null) {
        if (hasAlpha === true) {
          i = Math.min(flowSteps.length - 1, 4);
          show();
          return;
        }
        hasBeta = true;
      }
      i = Math.min(flowSteps.length - 1, i + 1);
      show();
    });
    $("#flow-reset") && $("#flow-reset").addEventListener("click", function () {
      hasAlpha = null;
      hasBeta = null;
      i = 0;
      show();
    });
    $all(".node", svg).forEach(function (n) {
      n.addEventListener("click", function () {
        var raw = n.getAttribute("data-step");
        if (raw === "alpha") {
          hasAlpha = true;
          hasBeta = null;
          i = 1;
          show();
          return;
        }
        var idx = Number(raw);
        if (idx === 0) {
          hasAlpha = null;
          hasBeta = null;
        } else if (idx === 1) {
          hasBeta = null;
        } else if (idx === 2) {
          if (hasAlpha === null) hasAlpha = false;
          hasBeta = null;
        } else if (idx === 3) {
          hasBeta = true;
          if (hasAlpha === null) hasAlpha = false;
        } else if (idx === 4) {
          if (hasBeta === null && hasAlpha !== true) hasBeta = false;
        }
        i = idx;
        show();
      });
    });
    show();
  }

  function initFields() {
    var flip = $("#b-flip");
    var mark = document.querySelector("[data-b-mark]");
    if (!flip && !mark) return;
    var into = true;

    function setB() {
      if (window.NotesScenes && window.NotesScenes.bfield) {
        window.NotesScenes.bfield.setInto(into);
      }
      $all("[data-b-mark]").forEach(function (t) {
        t.textContent = into ? "×  B into the page" : "·  B out of the page";
      });
    }

    if (flip) {
      flip.addEventListener("click", function () {
        into = !into;
        setB();
      });
    }
    setB();
  }

  function initBadge() {
    $all("[data-badge]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-badge");
        if (window.NotesScenes && window.NotesScenes.badge) {
          window.NotesScenes.badge.setKind(kind);
        }
      });
    });
  }

  function initCompare() {
    $all("[data-compare]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.getAttribute("data-compare");
        $all("tr[data-row]").forEach(function (tr) {
          tr.classList.toggle("on", tr.getAttribute("data-row") === row);
        });
      });
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

  document.addEventListener("DOMContentLoaded", function () {
    initBoxScale();
    initMc();
    initTf();
    initReplays();
    initImaging();
    initIsotopes();
    initNuclides();
    initSeries();
    initDecayEq();
    initGm();
    initIonCurrent();
    initTracks();
    initAbsorbers();
    initFlow();
    initFields();
    initBadge();
    initCompare();
  });
})();
