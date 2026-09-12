(function () {
  "use strict";

  function renderMath() {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
    });
  }

  function bindPaperImages() {
    Array.from(document.querySelectorAll(".dse-paper")).forEach(function (fig) {
      var img = fig.querySelector("img");
      if (!img) return;
      function loaded() {
        fig.classList.add("is-loaded");
      }
      function missing() {
        fig.classList.remove("is-loaded");
        img.hidden = true;
      }
      img.addEventListener("load", loaded);
      img.addEventListener("error", missing);
      if (img.complete) {
        if (img.naturalWidth > 0) loaded();
        else missing();
      }
    });
  }

  renderMath();
  bindPaperImages();
})();
