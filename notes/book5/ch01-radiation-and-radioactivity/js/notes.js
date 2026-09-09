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

  function initImaging() {
    var host = $("#imaging-vis");
    if (!host) return;
    var rays = $all("[data-xray]", host);
    var filmFlesh = $("#film-under-flesh");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var t0 = performance.now();
    var lengths = rays.map(function (ray) {
      try {
        return ray.getTotalLength();
      } catch (err) {
        return 140;
      }
    });
    function apply(sec) {
      rays.forEach(function (ray, i) {
        var len = lengths[i];
        var dur = 0.5 + len / 260;
        var u = reduced ? 1 : Math.max(0, Math.min(1, sec / dur));
        ray.style.strokeDasharray = String(len);
        ray.style.strokeDashoffset = String(len * (1 - u));
      });
      if (filmFlesh) {
        var develop = reduced ? 1 : Math.max(0, Math.min(1, (sec - 0.65) / 0.45));
        var r = Math.round(244 - develop * 218);
        var g = Math.round(239 - develop * 217);
        var b = Math.round(224 - develop * 208);
        filmFlesh.setAttribute("fill", "rgb(" + r + "," + g + "," + b + ")");
      }
    }
    host.addEventListener("notes-replay", function () {
      t0 = performance.now();
    });
    function frame(now) {
      apply((now - t0) / 1000);
      requestAnimationFrame(frame);
    }
    apply(reduced ? 8 : 0);
    requestAnimationFrame(frame);
  }

  function initAtomZoom() {
    var g = $("#atom-zoom");
    var slider = $("#atom-zoom-slider");
    if (!g || !slider) return;
    slider.addEventListener("input", function () {
      var z = Number(slider.value);
      g.setAttribute("transform", "translate(220 140) scale(" + z + ") translate(-220 -140)");
    });
  }

  function honeycomb(count) {
    var coords = [];
    var span = 4;
    var q;
    for (q = -span; q <= span; q += 1) {
      var r;
      for (r = -span; r <= span; r += 1) {
        var s = -q - r;
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= span) {
          coords.push({
            x: q + r / 2,
            y: r * Math.sqrt(3) / 2,
            order: q * q + r * r + s * s
          });
        }
      }
    }
    coords.sort(function (a, b) { return a.order - b.order; });
    return coords.slice(0, count);
  }

  function drawCluster(parent, cx, cy, protons, neutrons, spacing) {
    var items = [];
    var i;
    for (i = 0; i < protons; i += 1) items.push("#c0392b");
    for (i = 0; i < neutrons; i += 1) items.push("#2f7a4a");
    var pts = honeycomb(items.length);
    pts.forEach(function (pt, idx) {
      parent.appendChild(svgEl("circle", {
        cx: cx + pt.x * spacing,
        cy: cy + pt.y * spacing,
        r: spacing * 0.42,
        fill: items[idx]
      }));
    });
  }

  function drawShells(parent, cx, cy, electrons) {
    var inner = Math.min(2, electrons);
    var outer = Math.max(0, electrons - 2);
    function place(n, radius) {
      var i;
      for (i = 0; i < n; i += 1) {
        var angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        parent.appendChild(svgEl("circle", {
          cx: cx + radius * Math.cos(angle),
          cy: cy + radius * Math.sin(angle),
          r: 6,
          fill: "#2a62a8"
        }));
      }
    }
    if (inner) {
      parent.appendChild(svgEl("circle", {
        cx: cx, cy: cy, r: 28, fill: "none", stroke: "#9bb6c4"
      }));
      place(inner, 28);
    }
    if (outer) {
      parent.appendChild(svgEl("circle", {
        cx: cx, cy: cy, r: 48, fill: "none", stroke: "#9bb6c4"
      }));
      place(outer, 48);
    }
  }

  function initIsotopes() {
    var nucleus = $("#iso-nucleus");
    var label = $("#iso-label");
    if (!nucleus) return;
    function draw(nNeutrons) {
      nucleus.innerHTML = "";
      drawCluster(nucleus, 200, 108, 1, nNeutrons, 14);
      var names = ["¹H  protium  N = 0", "²H  deuterium  N = 1", "³H  tritium  N = 2"];
      if (label) label.textContent = names[nNeutrons] + "  ·  Z = 1";
    }
    $all("[data-iso]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        draw(Number(btn.getAttribute("data-iso")));
      });
    });
    draw(0);
  }

  function initNuclides() {
    var stage = $("#nuclide-stage");
    var counts = $("#nuclide-counts");
    if (!stage) return;
    var data = {
      H: { a: 1, z: 1, n: 0, e: 1, name: "H" },
      He: { a: 4, z: 2, n: 2, e: 2, name: "He" },
      Li: { a: 7, z: 3, n: 4, e: 3, name: "Li" },
      C: { a: 12, z: 6, n: 6, e: 6, name: "C" }
    };
    function draw(key) {
      var d = data[key];
      stage.innerHTML = "";
      drawCluster(stage, 430, 100, d.z, d.n, 11);
      drawShells(stage, 430, 100, d.e);
      if (counts) {
        counts.innerHTML =
          '<span class="nuc"><span class="az"><span>' + d.a + "</span><span>" + d.z +
          "</span></span>" + d.name + "</span>   A = " + d.a +
          "   Z = " + d.z + "   N = " + d.n + "   electrons = " + d.e;
      }
    }
    $all("[data-nuclide]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        draw(btn.getAttribute("data-nuclide"));
      });
    });
    draw("C");
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
    var canvas = $("#track-canvas");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var kind = "alpha";
    var t = 0;
    var running = true;

    function drawAlpha() {
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#f4f0e4";
      ctx.lineCap = "round";
      var i;
      for (i = 0; i < 5; i += 1) {
        var y = 36 + i * 32;
        var length = 90 + (i % 3) * 18;
        var grow = Math.min(length, (t * 3 + i * 12) % (length + 40));
        ctx.beginPath();
        ctx.moveTo(28, y);
        ctx.lineTo(28 + grow, y);
        ctx.stroke();
      }
    }

    function drawBeta() {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#dfe7f2";
      var i;
      for (i = 0; i < 6; i += 1) {
        ctx.beginPath();
        var x = 28;
        var y = 30 + i * 26;
        ctx.moveTo(x, y);
        var s;
        for (s = 0; s < 22; s += 1) {
          x += 12;
          y += Math.sin(s * 1.65 + i * 0.7 + t * 0.12) * 9;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function drawGamma() {
      ctx.fillStyle = "#f4f0e4";
      var i;
      for (i = 0; i < 9; i += 1) {
        var x = 50 + ((i * 53 + t * 2) % 520);
        var y = 28 + ((i * 71) % 150);
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        if (i % 3 === 0) {
          ctx.strokeStyle = "rgba(244,240,228,0.45)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 18, y + 10);
          ctx.stroke();
        }
      }
    }

    function frame() {
      ctx.fillStyle = "#11150f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (kind === "alpha") drawAlpha();
      else if (kind === "beta") drawBeta();
      else drawGamma();
      t += 1;
      if (running) requestAnimationFrame(frame);
    }

    $all("[data-track]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        kind = btn.getAttribute("data-track");
      });
    });
    frame();
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

  function setRay(id, x2, faded) {
    var el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("x2", String(x2));
    el.setAttribute("opacity", faded ? "0.35" : "1");
    if (id === "ray-g") {
      el.setAttribute("stroke-dasharray", faded ? "6 5" : "0");
    }
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
    var paperX = 250;
    var alX = 330;
    var pbX = 430;
    var gmX = 560;

    function stopX(kind) {
      if (kind === "a") {
        if (paper) return paperX;
        if (al) return alX;
        if (pb) return pbX;
        return gmX;
      }
      if (kind === "b") {
        if (al) return alX;
        if (pb) return pbX;
        return gmX;
      }
      return gmX;
    }

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
      setRay("ray-a", src.a ? stopX("a") : 90, !src.a);
      setRay("ray-b", src.b ? stopX("b") : 90, !src.b);
      setRay("ray-g", src.g ? stopX("g") : 90, !src.g || pb);
      var paperSlab = $("#slab-paper");
      var alSlab = $("#slab-al");
      var pbSlab = $("#slab-pb");
      if (paperSlab) paperSlab.setAttribute("opacity", paper ? "1" : "0.22");
      if (alSlab) alSlab.setAttribute("opacity", al ? "1" : "0.22");
      if (pbSlab) pbSlab.setAttribute("opacity", pb ? "1" : "0.22");
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
      if (hasAlpha === true && i === 4 && hasBeta !== true) {
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
          if (hasBeta === null) hasBeta = false;
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

  document.addEventListener("DOMContentLoaded", function () {
    initMc();
    initTf();
    initReplays();
    initImaging();
    initAtomZoom();
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
