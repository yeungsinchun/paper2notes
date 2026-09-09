(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
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
            setFeedback(out, false, "The marked option is the one from the shortlist.");
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

  function initSpectrum() {
    var slider = $("#spectrum-slider");
    var mark = $("#spectrum-mark");
    var label = $("#spectrum-label");
    if (!slider || !mark) return;
    function update() {
      var f = Number(slider.value);
      mark.setAttribute("x1", String(f));
      mark.setAttribute("x2", String(f));
      var ionizing = f >= 72;
      label.textContent = ionizing
        ? "This band can knock electrons out (UV and above in the book cut)."
        : "Non-ionizing on this spectrum: energy too low to knock electrons out.";
      label.dataset.ion = ionizing ? "1" : "0";
    }
    slider.addEventListener("input", update);
    update();
  }

  function initImaging() {
    var bone = $("#xray-bone");
    var flesh = $("#xray-flesh");
    var film = $("#xray-film");
    if (!bone) return;
    $all("[data-tissue]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-tissue");
        bone.setAttribute("opacity", kind === "bone" ? "1" : "0.25");
        flesh.setAttribute("opacity", kind === "flesh" ? "1" : "0.25");
        if (kind === "bone") {
          film.setAttribute("fill", "#f4efe0");
        } else if (kind === "flesh") {
          film.setAttribute("fill", "#3d3426");
        } else {
          film.setAttribute("fill", "#1c1812");
        }
      });
    });
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

  function initIsotopes() {
    var nExtra = $("#iso-neutrons");
    var label = $("#iso-label");
    if (!nExtra) return;
    $all("[data-iso]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var n = Number(btn.getAttribute("data-iso"));
        nExtra.innerHTML = "";
        for (var i = 0; i < n; i += 1) {
          var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          c.setAttribute("cx", String(210 + (i % 2) * 16));
          c.setAttribute("cy", String(118 + Math.floor(i / 2) * 16));
          c.setAttribute("r", "8");
          c.setAttribute("fill", "#2f7a4a");
          nExtra.appendChild(c);
        }
        var names = ["¹H  (protium, N = 0)", "²H  deuterium (N = 1)", "³H  tritium (N = 2)"];
        if (label) label.textContent = names[n] + "  ·  Z stays 1";
      });
    });
  }

  function initNuclides() {
    var shells = $("#nuclide-shells");
    var counts = $("#nuclide-counts");
    if (!shells) return;
    var data = {
      H: { a: 1, z: 1, n: 0, e: 1, name: "¹₁H" },
      He: { a: 4, z: 2, n: 2, e: 2, name: "⁴₂He" },
      Li: { a: 7, z: 3, n: 4, e: 3, name: "⁷₃Li" },
      C: { a: 12, z: 6, n: 6, e: 6, name: "¹²₆C" }
    };
    function draw(key) {
      var d = data[key];
      shells.innerHTML = "";
      var i;
      for (i = 0; i < d.z; i += 1) {
        var p = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        p.setAttribute("cx", String(470 + (i % 3) * 14));
        p.setAttribute("cy", String(70 + Math.floor(i / 3) * 14));
        p.setAttribute("r", "6");
        p.setAttribute("fill", "#c0392b");
        shells.appendChild(p);
      }
      for (i = 0; i < d.n; i += 1) {
        var n = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        n.setAttribute("cx", String(478 + (i % 3) * 14));
        n.setAttribute("cy", String(78 + Math.floor(i / 3) * 14));
        n.setAttribute("r", "6");
        n.setAttribute("fill", "#2f7a4a");
        shells.appendChild(n);
      }
      if (counts) {
        counts.textContent = d.name + "   A = " + d.a + "   Z = " + d.z + "   N = " + d.n + "   electrons = " + d.e;
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

    function xZ(z) {
      return 40 + (z - 80) * 18;
    }
    function yA(a) {
      return 220 - (a - 206) * 6.2;
    }
    function yN(n) {
      return 220 - (n - 124) * 8.8;
    }

    function draw() {
      function plot(svg, yfn, key) {
        $all(".plot", svg).forEach(function (n) { n.remove(); });
        var pts = "";
        var i;
        for (i = 0; i <= step; i += 1) {
          var nu = series[i];
          var x = xZ(nu.z);
          var y = yfn(key === "a" ? nu.a : nu.n);
          pts += x + "," + y + " ";
          var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          c.setAttribute("class", "plot");
          c.setAttribute("cx", String(x));
          c.setAttribute("cy", String(y));
          c.setAttribute("r", i === step ? "5" : "3");
          var fill = "#8aa39c";
          if (i === step) fill = "#0e5f56";
          else if (i > 0 && series[i - 1].kind === "β") fill = "#1d4f91";
          else if (i > 0) fill = "#c0392b";
          c.setAttribute("fill", fill);
          svg.appendChild(c);
        }
        var poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        poly.setAttribute("class", "plot");
        poly.setAttribute("points", pts);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "#6b7380");
        poly.setAttribute("stroke-width", "1.6");
        svg.appendChild(poly);
      }
      plot(az, yA, "a");
      plot(nz, yN, "n");
      var nu = series[step];
      var next = nu.kind === "stable" ? "stable (end)" : "next: " + nu.kind;
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
    function tick() {
      var shown = Math.max(0, jitter(bg + extra));
      display.textContent = String(shown);
      if (corr) corr.textContent = String(Math.max(0, shown - bg));
    }
    setInterval(tick, 700);
    tick();
    $("#gm-bg-btn") && $("#gm-bg-btn").addEventListener("click", function () {
      extra = 0;
    });
    $all("[data-gm-src]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        extra = Number(btn.getAttribute("data-gm-src"));
        if (gridOn && btn.getAttribute("data-need-grid") === "off") extra = 0;
      });
    });
    $("#gm-grid") && $("#gm-grid").addEventListener("click", function () {
      gridOn = !gridOn;
      this.setAttribute("aria-pressed", gridOn ? "true" : "false");
      this.textContent = gridOn ? "plastic grid on (blocks α)" : "plastic grid off (α can enter)";
    });
    if (bgEl) bgEl.textContent = "HK typical background ≈ 1 count s⁻¹";
  }

  function initIonCurrent() {
    var needle = $("#galvo-needle");
    if (!needle) return;
    $all("[data-current]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ang = btn.getAttribute("data-current") === "alpha" ? -35 : -12;
        needle.setAttribute("transform", "rotate(" + ang + " 200 150)");
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
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#f4f0e4";
      for (var i = 0; i < 5; i += 1) {
        var y = 40 + i * 28;
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(30 + (t * 4 + i * 20) % 300, y + Math.sin(i) * 2);
        ctx.stroke();
      }
    }

    function drawBeta() {
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "#dfe7f2";
      for (var i = 0; i < 7; i += 1) {
        ctx.beginPath();
        var x = 30;
        var y = 35 + i * 22;
        ctx.moveTo(x, y);
        for (var s = 0; s < 18; s += 1) {
          x += 14;
          y += Math.sin(s * 1.7 + i + t * 0.2) * 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function drawGamma() {
      ctx.fillStyle = "#f4f0e4";
      for (var i = 0; i < 12; i += 1) {
        var x = 40 + ((i * 47 + t * 3) % 300);
        var y = 30 + ((i * 73) % 150);
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, 6.3);
        ctx.fill();
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
    abg: { a: 1, b: 1, g: 1, label: "α + β + γ" },
    bg: { a: 0, b: 1, g: 1, label: "β + γ  (Example 25.6 pattern)" },
    ag: { a: 1, b: 0, g: 1, label: "α + γ" }
  };

  function initAbsorbers() {
    var rateEl = $("#abs-rate");
    var note = $("#abs-note");
    if (!rateEl) return;
    var src = sources.bg;
    var paper = false;
    var al = false;
    var pb = false;
    var bg = 61;

    function rate() {
      var r = bg;
      if (src.a && !paper) r += 0;
      if (src.b && !al && !pb) r += src.b ? 385 : 0;
      if (src.g) r += pb ? 130 : 255;
      if (src === sources.bg) {
        if (!paper && !al && !pb) return jitter(701);
        if (paper && !al && !pb) return jitter(700);
        if (al && !pb) return jitter(316);
        return jitter(189);
      }
      if (src === sources.ag) {
        if (!paper && !al && !pb) return jitter(450);
        if (paper || al) {
          if (pb) return jitter(100);
          return jitter(300);
        }
      }
      if (!paper && !al && !pb) return jitter(980);
      if (paper && !al && !pb) return jitter(440);
      if (al && !pb) return jitter(432);
      return jitter(250);
    }

    function render() {
      var r = rate();
      rateEl.textContent = r + " cpm";
      var bits = [];
      if (paper) bits.push("paper");
      if (al) bits.push("5 mm Al");
      if (pb) bits.push("25 mm Pb");
      if (note) {
        note.textContent = src.label + (bits.length ? "  ·  absorbers: " + bits.join(", ") : "  ·  air only") +
          "  ·  background ≈ " + bg + " cpm";
      }
      document.dispatchEvent(new CustomEvent("abs-update", {
        detail: { paper: paper, al: al, pb: pb, src: src, rate: r, bg: bg }
      }));
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
    { id: "n0", text: "Unknown source in front of a GM tube. Subtract background later." },
    { id: "n1", text: "Insert paper. Significant drop? → α is present. No drop? → no α." },
    { id: "n2", text: "Insert ~5 mm Al. Significant drop from the paper reading? → β is present." },
    { id: "n3", text: "Insert ~25 mm Pb. Drop, but still above background? → γ is present (strength only halved, not zero)." },
    { id: "n4", text: "Confirm with E or B: α toward − / one B sense; β opposite and bent more; γ straight." },
    { id: "n5", text: "Confirm with tracks: α thick-straight; β thin-irregular; γ faint/scattered." }
  ];

  function initFlow() {
    var svg = $("#id-flow");
    var talk = $("#flow-talk");
    if (!svg) return;
    var i = 0;

    function show() {
      $all(".node", svg).forEach(function (n) {
        n.classList.remove("active", "done");
        var idx = Number(n.getAttribute("data-step"));
        if (idx < i) n.classList.add("done");
        if (idx === i) n.classList.add("active");
      });
      $all(".edge", svg).forEach(function (e) {
        var need = Number(e.getAttribute("data-until"));
        e.classList.toggle("lit", i >= need);
      });
      if (talk) talk.textContent = flowSteps[i].text;
    }

    $("#flow-next") && $("#flow-next").addEventListener("click", function () {
      i = Math.min(flowSteps.length - 1, i + 1);
      show();
    });
    $("#flow-reset") && $("#flow-reset").addEventListener("click", function () {
      i = 0;
      show();
    });
    $all(".node", svg).forEach(function (n) {
      n.addEventListener("click", function () {
        i = Number(n.getAttribute("data-step"));
        show();
      });
    });
    show();
  }

  function initFields() {
    var eAlpha = $("#e-alpha");
    var eBeta = $("#e-beta");
    var bAlpha = $("#b-alpha");
    var bBeta = $("#b-beta");
    var flip = $("#b-flip");
    if (!eAlpha) return;
    var into = true;

    function setB() {
      var a = into ? "M 40 90 C 140 90 170 40 260 28" : "M 40 90 C 140 90 170 140 260 152";
      var b = into ? "M 40 90 C 110 90 120 170 210 188" : "M 40 90 C 110 90 120 10 210 8";
      if (bAlpha) bAlpha.setAttribute("d", a);
      if (bBeta) bBeta.setAttribute("d", b);
      $all("[data-b-mark]").forEach(function (t) {
        t.textContent = into ? "×  B into page" : "·  B out of page";
      });
    }

    if (flip) {
      flip.addEventListener("click", function () {
        into = !into;
        setB();
      });
    }
    setB();

    var t = 0;
    function bounce() {
      t += 0.05;
      if (eAlpha) eAlpha.setAttribute("stroke-dashoffset", String(-t * 18));
      if (eBeta) eBeta.setAttribute("stroke-dashoffset", String(-t * 28));
      if (bAlpha) bAlpha.setAttribute("stroke-dashoffset", String(-t * 18));
      if (bBeta) bBeta.setAttribute("stroke-dashoffset", String(-t * 28));
      requestAnimationFrame(bounce);
    }
    bounce();
  }

  function initBadge() {
    var a = $("#badge-open");
    var b = $("#badge-al");
    var c = $("#badge-pb");
    if (!a) return;
    $all("[data-badge]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-badge");
        a.className = "film";
        b.className = "film";
        c.className = "film";
        if (kind === "alpha") {
          a.classList.add("pale");
          a.textContent = "α never reaches film (paper wrap)";
          b.textContent = "blank";
          c.textContent = "blank";
        } else if (kind === "beta") {
          a.classList.add("dark");
          b.classList.add("pale");
          a.textContent = "open window blackened";
          b.textContent = "Al stops most β";
          c.textContent = "Pb: blank";
        } else {
          a.classList.add("mid");
          b.classList.add("mid");
          c.classList.add("mid");
          a.textContent = "γ blacks all regions";
          b.textContent = "γ through Al";
          c.textContent = "γ through Pb";
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

  function initPuWorked() {
    var out = $("#pu-out");
    var aIn = $("#pu-a");
    if (!out || !aIn) return;
    function run() {
      var nA = Number(aIn.value);
      var nB = 4;
      var zAfterA = 94 - 2 * nA;
      var zFinal = zAfterA + nB;
      out.innerHTML =
        "ΔA = 239 − 207 = 32 → n<sub>α</sub> = 32 / 4 = <strong>" + nA + "</strong><br>" +
        "Z after only α: 94 − 2×" + nA + " = " + zAfterA + "<br>" +
        "Need Z = 82, so n<sub>β</sub> = 82 − " + zAfterA + " = <strong>" + (82 - zAfterA) + "</strong>" +
        (nA === 8 ? "  (bookkeeping matches ²⁰⁷₈₂Pb when n<sub>β</sub> = 4)" : "  (try n<sub>α</sub> = 8 from ΔA)");
    }
    aIn.addEventListener("input", run);
    run();
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMc();
    initTf();
    initReplays();
    initSpectrum();
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
    initPuWorked();
  });
})();
