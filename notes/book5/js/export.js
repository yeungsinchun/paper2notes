(function () {
  "use strict";

  /* Export a chapter's notes as a PDF: open each section page in its own tab and let
     it print itself once ready (see autoPrintIfRequested in js/checks.js). A merged
     single document isn't reachable here: sibling notes pages opened over file://
     are separate origins, so an iframe's contentDocument (or this page reading a
     popup's document) comes back null and can't be measured or printed from here.
     Opening every page in the same click keeps each window.open a direct result of
     the click, so none of the tabs are blocked as unrequested popups. */

  function exportChapterNotes(link) {
    (link.getAttribute("data-export-pages") || "").split(/\s+/).filter(Boolean).forEach(function (page) {
      var url = new URL(page, location.href);
      url.searchParams.set("autoprint", "1");
      window.open(url.href, "_blank");
    });
  }

  function boot() {
    Array.prototype.slice.call(document.querySelectorAll("[data-export-pages]")).forEach(function (link) {
      link.addEventListener("click", function (ev) {
        ev.preventDefault();
        exportChapterNotes(link);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
