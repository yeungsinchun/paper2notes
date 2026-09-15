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
      var src = h.getAttribute("data-src");
      var label = box.getAttribute("data-check") === "sa" ? "Write it out" : "Check";
      h.textContent = label + " " + n;
      if (src) {
        var s = document.createElement("span");
        s.className = "src";
        s.textContent = src;
        h.appendChild(s);
      }
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
      var meta = slides.map(function (slide) {
        var nums = loNumbersFor(slide.id, loTexts);
        return {
          slide: slide,
          los: nums,
          primary: nums.length ? nums[nums.length - 1] : 0,
          others: nums.slice(0, -1)
        };
      });
      var groups = {};
      var playlist = [];
      meta.forEach(function (item) {
        var key = String(item.primary);
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });
      Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (key) {
        groups[key].forEach(function (item) { playlist.push(item); });
      });
      var index = 0;

      meta.forEach(function (item) {
        var slide = item.slide;
        $all(".quiz-lo", slide).forEach(function (el) { el.parentNode.removeChild(el); });
        if (item.others.length && !$(".quiz-also", slide)) {
          var also = document.createElement("p");
          also.className = "quiz-also";
          also.textContent = "also LO " + item.others.join(", ");
          slide.insertBefore(also, slide.firstChild);
        }
        if (slide.id.indexOf("dse-lq-") === 0) {
          if (!$(".quiz-lq", slide)) {
            var tag = document.createElement("p");
            tag.className = "quiz-lq";
            tag.textContent = "LQ";
            slide.insertBefore(tag, slide.firstChild);
          }
          return;
        }
        if ($(".quiz-choices", slide)) return;
        var row = document.createElement("div");
        row.className = "quiz-choices";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", "Answer A B C D");
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
        pct.hidden = true;
        slide.appendChild(pct);
      });

      if (!$("[data-quiz-export]", deck)) {
        var exp = document.createElement("a");
        exp.className = "quiz-export";
        exp.setAttribute("data-quiz-export", "true");
        exp.href = /ch02-rate/.test(location.pathname)
          ? "../_local/dse/mc/26/combined.pdf"
          : "../_local/dse/mc/25/combined.pdf";
        exp.download = "combined.pdf";
        exp.textContent = "Export PDF";
        var head = $("header", deck);
        if (head) head.appendChild(exp);
        else deck.insertBefore(exp, deck.firstChild);
      }

      var loLabel = $(".quiz-lo", deck);
      if (!loLabel) {
        loLabel = document.createElement("p");
        loLabel.className = "quiz-lo";
        var nav = $(".quiz-nav", deck);
        if (nav) deck.insertBefore(loLabel, nav);
        else deck.insertBefore(loLabel, deck.firstChild);
      }
      var tabRow = $(".quiz-los", deck);
      if (!tabRow) {
        tabRow = document.createElement("div");
        tabRow.className = "quiz-los";
        tabRow.setAttribute("role", "tablist");
        tabRow.setAttribute("aria-label", "Learning objectives");
        loLabel.parentNode.insertBefore(tabRow, loLabel.nextSibling);
      }
      Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (key) {
        var tab = document.createElement("button");
        tab.type = "button";
        tab.className = "quiz-lo-tab";
        tab.setAttribute("data-quiz-lo", key);
        tab.setAttribute("role", "tab");
        tab.textContent = "LO " + key;
        tabRow.appendChild(tab);
      });

      function show() {
        if (!playlist.length) return;
        if (index < 0) index = playlist.length - 1;
        if (index >= playlist.length) index = 0;
        var current = playlist[index];
        var group = groups[String(current.primary)] || [current];
        var at = group.indexOf(current) + 1;
        slides.forEach(function (slide) {
          var on = slide === current.slide;
          slide.hidden = !on;
          if (on) slide.classList.add("is-current");
          else slide.classList.remove("is-current");
        });
        loLabel.textContent = "LO " + current.primary;
        $all("[data-quiz-lo]", tabRow).forEach(function (tab) {
          var on = tab.getAttribute("data-quiz-lo") === String(current.primary);
          tab.setAttribute("aria-selected", on ? "true" : "false");
          if (on) tab.classList.add("is-current");
          else tab.classList.remove("is-current");
        });
        if (status) status.textContent = at + " of " + group.length;
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
        $all("[data-quiz-choice]", slide).forEach(function (b) {
          var choice = b.getAttribute("data-quiz-choice");
          b.disabled = true;
          b.classList.remove("is-picked", "correct", "wrong");
          if (choice === key.option) b.classList.add("correct");
          else if (b === letterBtn) b.classList.add("wrong");
        });
        var out = $(".quiz-pct", slide);
        if (out && key.pct != null) {
          out.hidden = false;
          out.textContent = "Correct percentage: " + key.pct + "%";
        }
      }

      deck.addEventListener("click", function (ev) {
        var prev = ev.target.closest("[data-quiz-prev]");
        var next = ev.target.closest("[data-quiz-next]");
        var tab = ev.target.closest("[data-quiz-lo]");
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
        if (tab && deck.contains(tab)) {
          ev.preventDefault();
          var want = tab.getAttribute("data-quiz-lo");
          var n;
          for (n = 0; n < playlist.length; n += 1) {
            if (String(playlist[n].primary) === want) {
              index = n;
              break;
            }
          }
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootChecks);
  } else {
    bootChecks();
  }
})();
