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

  function initQuizDecks() {
    $all("[data-quiz]").forEach(function (deck) {
      var slides = $all(".quiz-slide", deck);
      if (!slides.length) return;
      var index = 0;
      var status = $(".quiz-status", deck);
      var prev = $("[data-quiz-prev]", deck);
      var next = $("[data-quiz-next]", deck);

      function show() {
        slides.forEach(function (slide, n) {
          var on = n === index;
          slide.hidden = !on;
          if (on) slide.classList.add("is-current");
          else slide.classList.remove("is-current");
        });
        if (status) {
          status.textContent = (index + 1) + " of " + slides.length;
        }
        if (prev) prev.disabled = index === 0;
        if (next) next.disabled = index === slides.length - 1;
      }

      if (prev) {
        prev.addEventListener("click", function () {
          if (index === 0) return;
          index -= 1;
          show();
        });
      }
      if (next) {
        next.addEventListener("click", function () {
          if (index >= slides.length - 1) return;
          index += 1;
          show();
        });
      }
      show();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    numberChecks();
    initMc();
    initTf();
    initSa();
    initQuizDecks();
  });
})();
