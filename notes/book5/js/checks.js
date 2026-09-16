/* Concept checks shared by every Book 5 page.
   Markup contract:
   - .check[data-check="mc"][data-answer="B"] > .choices > button[data-choice] ; .feedback ; .explain[hidden]
   - .check[data-check="tf"] > .tf-item[data-answer="true|false"] > button[data-tf] ; .feedback ; .explain[hidden]
   - .check[data-check="sa"] > button[data-reveal] ; .model[hidden]
   After the student answers, the explanation is shown so every check teaches the reasoning. */
(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function setFeedback(el, ok, text) {
    if (!el) return;
    el.textContent = text;
    el.className = "feedback " + (ok ? "ok" : "no");
  }

  function reveal(box) {
    $all(".explain[hidden]", box).forEach(function (ex) {
      if (ex.closest(".tf-item") && ex.closest(".tf-item") !== box) return;
      ex.hidden = false;
    });
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
            setFeedback(out, true, "Correct.");
          } else {
            btn.classList.add("wrong");
            var right = $("button[data-choice='" + answer + "']", box);
            if (right) right.classList.add("correct");
            setFeedback(out, false, "Not quite. The answer is " + answer + ".");
          }
          var ex = $(":scope > .explain", box);
          if (ex) ex.hidden = false;
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
              setFeedback(out, true, "Correct.");
            } else {
              btn.classList.add("wrong");
              setFeedback(out, false, "Not quite. This statement is " + (answer ? "true" : "false") + ".");
            }
            reveal(item);
          });
        });
      });
    });
  }

  function initSa() {
    $all("[data-check='sa']").forEach(function (box) {
      var btn = $("button[data-reveal]", box);
      var model = $(".model", box);
      if (!btn || !model) return;
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", function () {
        var open = model.hidden;
        model.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.textContent = open ? "Hide model answer" : "Show model answer";
      });
    });
  }

  function numberChecks() {
    var n = 0;
    $all(".check").forEach(function (box) {
      var h = $("h3", box);
      if (!h || h.getAttribute("data-numbered")) return;
      n += 1;
      var label = box.getAttribute("data-check") === "sa" ? "Write it out" : "Check";
      h.textContent = label + " " + n;
      h.removeAttribute("data-src");
      h.setAttribute("data-numbered", "true");
    });
  }

  var PAPER_LOS = {"dse-lq-2013-9":["apply the exponential law of decay","determine the half-life of a radioisotope from its decay graph or from numerical data","relate the decay constant and the half-life","represent the number of undecayed nuclei by the exponential law of decay","solve problems involving radioactive decay"],"dse-lq-2014-10":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","describe the origin and nature of α, β and γ radiations","discuss uses of radioactive isotopes","suggest safety precautions in handling radioactive sources"],"dse-lq-2016-9":["determine the half-life of a radioisotope from its decay graph or from numerical data","represent radioactive transmutations in α, β and γ decays using equations","solve problems involving radioactive decay"],"dse-lq-2017-10":["describe the origin and nature of α, β and γ radiations","discuss uses of radioactive isotopes","represent radioactive transmutations in α, β and γ decays using equations"],"dse-lq-2018-10":["determine the half-life of a radioisotope from its decay graph or from numerical data","discuss uses of radioactive isotopes","represent radioactive transmutations in α, β and γ decays using equations","solve problems involving radioactive decay"],"dse-lq-2021-9":["discuss potential hazards of ionizing radiation and the ways to minimise the radiation dose absorbed","discuss uses of radioactive isotopes","represent radioactive transmutations in α, β and γ decays using equations","solve problems involving radioactive decay"],"dse-lq-2023-9":["determine the half-life of a radioisotope from its decay graph or from numerical data","represent radioactive transmutations in α, β and γ decays using equations","solve problems involving radioactive decay"],"dse-lq-2025-12":["apply the exponential law of decay","determine the half-life of a radioisotope from its decay graph or from numerical data","relate the decay constant and the half-life","represent the number of undecayed nuclei by the exponential law of decay","solve problems involving radioactive decay"],"dse-lq-2026-12":["discuss uses of radioactive isotopes","represent radioactive transmutations in α, β and γ decays using equations","use symbolic notations to represent nuclides"],"dse-mc-2012-35":["define half-life as the period of time over which the number of radioactive nuclei decreases by a factor of one-half","determine the half-life of a radioisotope from its decay graph or from numerical data","solve problems involving radioactive decay"],"dse-mc-2012-36":["define atomic number as the number of protons in the nucleus and mass number as the sum of the number of protons and neutrons in the nucleus of an atom","define isotope"],"dse-mc-2013-34":["define atomic number as the number of protons in the nucleus and mass number as the sum of the number of protons and neutrons in the nucleus of an atom","represent radioactive transmutations in α, β and γ decays using equations","use symbolic notations to represent nuclides"],"dse-mc-2013-35":["determine the half-life of a radioisotope from its decay graph or from numerical data","solve problems involving radioactive decay"],"dse-mc-2014-31":["define isotope","represent radioactive transmutations in α, β and γ decays using equations","use symbolic notations to represent nuclides"],"dse-mc-2014-32":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","detect radiation in terms of count rate using a GM counter","detect radiation with a photographic film and GM counter"],"dse-mc-2015-31":["describe the origin and nature of α, β and γ radiations","realise the occurrence of radioactive decay in unstable nuclides"],"dse-mc-2015-32":["detect radiation with a photographic film and GM counter","suggest safety precautions in handling radioactive sources"],"dse-mc-2015-33":["determine the half-life of a radioisotope from its decay graph or from numerical data","discuss uses of radioactive isotopes","solve problems involving radioactive decay"],"dse-mc-2016-32":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","describe the origin and nature of α, β and γ radiations"],"dse-mc-2016-33":["determine the half-life of a radioisotope from its decay graph or from numerical data","solve problems involving radioactive decay"],"dse-mc-2017-31":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks"],"dse-mc-2017-32":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","describe the origin and nature of α, β and γ radiations","detect radiation with a photographic film and GM counter"],"dse-mc-2018-32":["determine the half-life of a radioisotope from its decay graph or from numerical data","solve problems involving radioactive decay"],"dse-mc-2019-31":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","detect radiation in terms of count rate using a GM counter"],"dse-mc-2019-32":["apply the exponential law of decay","relate the decay constant and the half-life","represent the number of undecayed nuclei by the exponential law of decay","solve problems involving radioactive decay"],"dse-mc-2020-30":["detect radiation in terms of count rate using a GM counter","examine the random nature of radioactive decay","realise the existence of background radiation"],"dse-mc-2020-31":["define isotope","represent radioactive transmutations in α, β and γ decays using equations","use symbolic notations to represent nuclides"],"dse-mc-2020-32":["apply the exponential law of decay","relate the decay constant and the half-life","represent the number of undecayed nuclei by the exponential law of decay"],"dse-mc-2020-33":["determine the half-life of a radioisotope from its decay graph or from numerical data","solve problems involving radioactive decay"],"dse-mc-2021-31":["define atomic number as the number of protons in the nucleus and mass number as the sum of the number of protons and neutrons in the nucleus of an atom","represent radioactive transmutations in α, β and γ decays using equations","use symbolic notations to represent nuclides"],"dse-mc-2021-32":["solve problems involving radioactive decay"],"dse-mc-2021-33":["realise the existence of background radiation","realise the existence of radioactive isotopes in some elements"],"dse-mc-2022-31":["discuss the uses of X-rays","realise X-rays as ionizing electromagnetic radiations of short wavelengths with high penetrating power","realise the emission of X-rays when fast electrons hit a heavy metal target"],"dse-mc-2022-32":["determine the half-life of a radioisotope from its decay graph or from numerical data","solve problems involving radioactive decay"],"dse-mc-2023-31":["define half-life as the period of time over which the number of radioactive nuclei decreases by a factor of one-half","solve problems involving radioactive decay","state the proportional relationship between the activity of a sample and the number of undecayed nuclei"],"dse-mc-2024-32":["determine the half-life of a radioisotope from its decay graph or from numerical data","solve problems involving radioactive decay"],"dse-mc-2024-33":["discuss uses of radioactive isotopes"],"dse-mc-2025-31":["state the proportional relationship between the activity of a sample and the number of undecayed nuclei"],"dse-mc-2025-32":["represent radioactive transmutations in α, β and γ decays using equations","use symbolic notations to represent nuclides"],"dse-mc-2026-32":["discuss potential hazards of ionizing radiation and the ways to minimise the radiation dose absorbed","represent radiation equivalent dose using the unit sievert (Sv)"],"dse-mc-pp-34":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","describe the origin and nature of α, β and γ radiations"],"dse-mc-pp-35":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","detect radiation in terms of count rate using a GM counter","detect radiation with a photographic film and GM counter"],"dse-mc-sap-35":["state the proportional relationship between the activity of a sample and the number of undecayed nuclei"],"dse-mc-sap-36":["compare α, β and γ radiations in terms of their penetrating power, ranges, ionizing power, behaviour in electric field and magnetic field, and cloud chamber tracks","detect radiation in terms of count rate using a GM counter","detect radiation with a photographic film and GM counter"]};
  var QUIZ_KEYS = {"dse-mc-2012-35":{"option":"C","pct":65},"dse-mc-2012-36":{"option":"D","pct":51},"dse-mc-2013-34":{"option":"A","pct":76},"dse-mc-2013-35":{"option":"B","pct":56},"dse-mc-2014-31":{"option":"D","pct":54},"dse-mc-2014-32":{"option":"A","pct":61},"dse-mc-2015-31":{"option":"A","pct":36},"dse-mc-2015-32":{"option":"A","pct":35},"dse-mc-2015-33":{"option":"D","pct":60},"dse-mc-2016-32":{"option":"A","pct":77},"dse-mc-2016-33":{"option":"C","pct":66},"dse-mc-2017-31":{"option":"A","pct":57},"dse-mc-2017-32":{"option":"C","pct":64},"dse-mc-2018-32":{"option":"B","pct":40},"dse-mc-2019-31":{"option":"D","pct":68},"dse-mc-2019-32":{"option":"B","pct":64},"dse-mc-2020-30":{"option":"D","pct":63},"dse-mc-2020-31":{"option":"B","pct":55},"dse-mc-2020-32":{"option":"D","pct":49},"dse-mc-2020-33":{"option":"C","pct":38},"dse-mc-2021-31":{"option":"B","pct":84},"dse-mc-2021-32":{"option":"D","pct":76},"dse-mc-2021-33":{"option":"D","pct":48},"dse-mc-2022-31":{"option":"C","pct":63},"dse-mc-2022-32":{"option":"A","pct":50},"dse-mc-2023-31":{"option":"C","pct":71},"dse-mc-2024-32":{"option":"D","pct":68},"dse-mc-2024-33":{"option":"B","pct":51},"dse-mc-2025-31":{"option":"B","pct":59},"dse-mc-2025-32":{"option":"B","pct":65},"dse-mc-pp-34":{"option":"C"},"dse-mc-sap-36":{"option":"C"},"dse-mc-sap-35":{"option":"D"},"dse-mc-2026-32":{"option":"A"}};

  function normalizeLo(text) {
    return (text || "").replace(/extension/gi, " ").replace(/\s+/g, " ").trim();
  }

  function loNumbersFor(paperId, loTexts) {
    var stems = PAPER_LOS[paperId] || [];
    var nums = [];
    var i, j, lo, stem;
    for (i = 0; i < loTexts.length; i += 1) {
      lo = normalizeLo(loTexts[i]);
      for (j = 0; j < stems.length; j += 1) {
        stem = normalizeLo(stems[j]);
        if (stem && (lo.indexOf(stem) !== -1 || stem.indexOf(lo) !== -1)) {
          nums.push(i + 1);
          break;
        }
      }
    }
    if (!nums.length && loTexts.length) nums.push(loTexts.length);
    return nums;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  /* Every classified paper on this page (MC deck first, then LQ), one per printed
     page, as a stand-alone document the browser's print dialog saves as a PDF.
     Nothing is fetched beyond the scans already on the page. */
  function sectionPapersHtml() {
    var title = (document.title || "").trim();
    var pages = [];
    $all("[data-quiz]").forEach(function (deck) {
      var kind = deck.getAttribute("data-quiz") === "lq" ? "Long question" : "Multiple choice";
      $all(".quiz-slide", deck).forEach(function (slide) {
        var img = $("img", slide);
        if (!img) return;
        var cap = $("figcaption", slide);
        var src = new URL(img.getAttribute("src"), location.href).href;
        pages.push(
          '<section class="paper"><h2>' + escapeHtml(kind) + " \u00b7 " +
          escapeHtml(cap ? cap.textContent.trim() : "") + "</h2>" +
          '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(img.getAttribute("alt") || "") + '"></section>'
        );
      });
    });
    return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<title>" + escapeHtml(title) + " \u2013 classified papers</title>" +
      "<style>" +
      "body{margin:0;font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b2129;background:#fff}" +
      "h1{font-size:20px;margin:24px 24px 4px}" +
      ".lead{margin:0 24px 16px;color:#5d6673}" +
      ".paper{page-break-after:always;break-after:page;padding:16px 24px}" +
      ".paper:last-child{page-break-after:auto;break-after:auto}" +
      ".paper h2{font-size:15px;margin:0 0 10px;color:#5d6673}" +
      ".paper img{display:block;max-width:100%;height:auto}" +
      "@media print{h1,.lead{margin-top:0}.paper img{max-height:calc(100vh - 70px)}}" +
      "</style></head><body>" +
      "<h1>" + escapeHtml(title) + "</h1>" +
      '<p class="lead">' + pages.length + " classified paper" + (pages.length === 1 ? "" : "s") +
      " for this section. Use Save as PDF in the print dialog.</p>" +
      pages.join("") + "</body></html>";
  }

  function exportSectionPapers() {
    var html = sectionPapersHtml();
    var win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    var imgs = Array.prototype.slice.call(win.document.images);
    var pending = 0;
    var subscribed = false;
    var printed = false;
    function go() {
      if (!subscribed || pending !== 0 || printed) return;
      printed = true;
      win.focus();
      win.print();
    }
    imgs.forEach(function (img) {
      if (img.complete) return;
      pending += 1;
      var settled = false;
      function done() {
        if (settled) return;
        settled = true;
        pending -= 1;
        go();
      }
      img.addEventListener("load", done);
      img.addEventListener("error", done);
      if (img.complete) done();
    });
    subscribed = true;
    go();
  }

  /* Section quiz: one DSE paper at a time in a single card.
     Card: LO line (which objective this paper tests, paper id), the scan,
     A-D tiles for MC, verdict. Prev / Next and "n of N" with dots under it.
     Papers are ordered by their last-matching LO so the LO line changes as the student moves on. */
  function initQuizDecks() {
    $all("[data-quiz]").forEach(function (deck) {
      if (deck.getAttribute("data-quiz-ready")) return;
      deck.setAttribute("data-quiz-ready", "true");
      var slides = $all(".quiz-slide", deck);
      if (!slides.length) return;
      var status = $(".quiz-status", deck);
      var loTexts = $all(".lo-list li").map(function (li) {
        var p = $("p", li);
        return ((p ? p.textContent : li.textContent) || "").replace(/\s+/g, " ").trim();
      }).filter(Boolean);
      var playlist = slides.map(function (slide) {
        var nums = loNumbersFor(slide.id, loTexts);
        return { slide: slide, primary: nums.length ? nums[nums.length - 1] : 0 };
      }).sort(function (a, b) { return a.primary - b.primary; });
      var index = 0;
      var isLq = deck.getAttribute("data-quiz") === "lq";
      var slidesBox = $(".quiz-slides", deck) || deck;

      slides.forEach(function (slide) {
        $all(".quiz-lo, .quiz-lq, .quiz-also", slide).forEach(function (el) { el.parentNode.removeChild(el); });
        if (slide.id.indexOf("dse-lq-") === 0) return;
        if ($(".quiz-choices", slide)) return;
        var row = document.createElement("div");
        row.className = "quiz-choices";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", "Your answer: A, B, C or D");
        ["A", "B", "C", "D"].forEach(function (letter) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "quiz-letter";
          b.setAttribute("data-quiz-choice", letter);
          b.textContent = letter;
          row.appendChild(b);
        });
        slide.appendChild(row);
        var pct = document.createElement("p");
        pct.className = "quiz-pct";
        pct.setAttribute("aria-live", "polite");
        pct.hidden = true;
        slide.appendChild(pct);
      });

      if (!isLq && !$("[data-quiz-export]", deck)) {
        var exp = document.createElement("button");
        exp.type = "button";
        exp.className = "quiz-export";
        exp.setAttribute("data-quiz-export", "true");
        exp.textContent = "Export PDF";
        exp.addEventListener("click", exportSectionPapers);
        var head = $("header", deck);
        if (head) head.appendChild(exp);
        else deck.insertBefore(exp, deck.firstChild);
      }

      var loLabel = $(".quiz-lo", deck);
      if (!loLabel) {
        loLabel = document.createElement("p");
        loLabel.className = "quiz-lo";
        slidesBox.insertBefore(loLabel, slidesBox.firstChild);
      }
      var loNum = document.createElement("b");
      loNum.className = "quiz-lo-num";
      var loText = document.createElement("span");
      loText.className = "quiz-lo-text";
      var paperId = document.createElement("span");
      paperId.className = "quiz-paper-id";
      paperId.setAttribute("aria-hidden", "true");
      loLabel.textContent = "";
      loLabel.appendChild(loNum);
      loLabel.appendChild(document.createTextNode(" "));
      loLabel.appendChild(loText);
      loLabel.appendChild(paperId);

      var dots = null;
      if (status && status.parentNode) {
        var wrap = document.createElement("div");
        wrap.className = "quiz-progress";
        status.parentNode.insertBefore(wrap, status);
        wrap.appendChild(status);
        dots = document.createElement("div");
        dots.className = "quiz-dots";
        dots.setAttribute("aria-hidden", "true");
        wrap.appendChild(dots);
      }

      function paintDots(current) {
        if (!dots) return;
        dots.textContent = "";
        dots.hidden = playlist.length < 2;
        playlist.forEach(function (item) {
          var dot = document.createElement("span");
          var result = item.slide.getAttribute("data-quiz-result");
          dot.className = "quiz-dot" +
            (item === current ? " is-current" : "") +
            (result ? " is-" + result : "");
          dots.appendChild(dot);
        });
      }

      function show() {
        if (!playlist.length) return;
        if (index < 0) index = playlist.length - 1;
        if (index >= playlist.length) index = 0;
        var current = playlist[index];
        slides.forEach(function (slide) {
          var on = slide === current.slide;
          slide.hidden = !on;
          if (on) slide.classList.add("is-current");
          else slide.classList.remove("is-current");
        });
        var desc = loTexts[current.primary - 1] || "";
        loNum.textContent = "LO " + current.primary;
        loText.textContent = desc;
        var cap = $("figcaption", current.slide);
        paperId.textContent = cap ? cap.textContent.trim() : "";
        if (status) status.textContent = (index + 1) + " of " + playlist.length;
        paintDots(current);
      }

      function markChoice(letterBtn) {
        var slide = letterBtn.closest(".quiz-slide");
        if (!slide || slide.getAttribute("data-quiz-marked")) return;
        var key = QUIZ_KEYS[slide.id];
        if (!key || !key.option) {
          $all("[data-quiz-choice]", slide).forEach(function (b) {
            b.classList.toggle("is-picked", b === letterBtn);
          });
          return;
        }
        slide.setAttribute("data-quiz-marked", "true");
        var right = letterBtn.getAttribute("data-quiz-choice") === key.option;
        slide.setAttribute("data-quiz-result", right ? "right" : "wrong");
        $all("[data-quiz-choice]", slide).forEach(function (b) {
          var choice = b.getAttribute("data-quiz-choice");
          b.disabled = true;
          b.classList.remove("is-picked", "correct", "wrong");
          if (choice === key.option) b.classList.add("correct");
          else if (b === letterBtn) b.classList.add("wrong");
        });
        var out = $(".quiz-pct", slide);
        if (out) {
          out.hidden = false;
          out.className = "quiz-pct " + (right ? "is-right" : "is-wrong");
          out.textContent = "";
          var verdict = document.createElement("b");
          verdict.className = "quiz-verdict";
          verdict.textContent = right ? "Correct" : ("Not quite. The answer is " + key.option + ".");
          out.appendChild(verdict);
          if (key.pct != null) {
            out.appendChild(document.createTextNode(" "));
            var stat = document.createElement("span");
            stat.className = "quiz-stat";
            stat.textContent = "Correct percentage: " + key.pct + "%";
            out.appendChild(stat);
          }
        }
        paintDots(playlist[index]);
      }

      deck.addEventListener("click", function (ev) {
        var prev = ev.target.closest("[data-quiz-prev]");
        var next = ev.target.closest("[data-quiz-next]");
        var letter = ev.target.closest("[data-quiz-choice]");
        if (prev) {
          ev.preventDefault();
          index -= 1;
          show();
          return;
        }
        if (next) {
          ev.preventDefault();
          index += 1;
          show();
          return;
        }
        if (letter && deck.contains(letter)) markChoice(letter);
      });
      show();
    });
  }

  function bootChecks() {
    numberChecks();
    initMc();
    initTf();
    initSa();
    initQuizDecks();
  }

  window.NotesQuiz = { sectionPapersHtml: sectionPapersHtml };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootChecks);
  } else {
    bootChecks();
  }
})();
