(function () {
  "use strict";

  /* Export a chapter's notes as a PDF: the chapter's HTML pages (one per section,
     then the summary) laid out in a single print document, which the browser's
     print dialog saves as a PDF. Each page loads in its own same-origin frame so
     its figures, maths and quiz card render exactly as on screen; frames are
     grown to their content before printing so nothing is clipped. */

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function chapterNotesHtml(title, pages) {
    return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<title>" + escapeHtml(title) + " – notes</title>" +
      "<style>" +
      "body{margin:0;font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b2129;background:#fff}" +
      "h1{font-size:20px;margin:24px 24px 4px}" +
      ".lead{margin:0 24px 16px;color:#5d6673}" +
      ".page{break-before:page;page-break-before:always}" +
      ".page:first-of-type{break-before:auto;page-break-before:auto}" +
      ".page iframe{display:block;width:100%;height:100vh;border:0}" +
      "@media print{h1,.lead{display:none}}" +
      "</style></head><body>" +
      "<h1>" + escapeHtml(title) + "</h1>" +
      '<p class="lead">' + pages.length + " page" + (pages.length === 1 ? "" : "s") +
      " of notes. Use Save as PDF in the print dialog.</p>" +
      pages.map(function (href) {
        return '<section class="page"><iframe src="' + escapeHtml(href) + '" title="' +
          escapeHtml(href) + '"></iframe></section>';
      }).join("") + "</body></html>";
  }

  function fitFrame(frame) {
    var doc = frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    var h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
    if (h) frame.style.height = h + "px";
  }

  function exportChapterNotes(link) {
    var pages = (link.getAttribute("data-export-pages") || "").split(/\s+/).filter(Boolean)
      .map(function (p) { return new URL(p, location.href).href; });
    var title = link.getAttribute("data-export-title") || link.textContent.trim();
    var win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(chapterNotesHtml(title, pages));
    win.document.close();
    var frames = Array.prototype.slice.call(win.document.querySelectorAll("iframe"));
    var pending = frames.length;
    var subscribed = false;
    var printed = false;
    function go() {
      if (!subscribed || pending !== 0 || printed) return;
      printed = true;
      frames.forEach(fitFrame);
      /* One more pass after the frames settle at their final width, so figures
         that resize to their box are measured at print size. */
      win.setTimeout(function () {
        frames.forEach(fitFrame);
        win.focus();
        win.print();
      }, 300);
    }
    frames.forEach(function (frame) {
      var settled = false;
      function done() {
        if (settled) return;
        settled = true;
        pending -= 1;
        go();
      }
      frame.addEventListener("load", done);
      frame.addEventListener("error", done);
      var doc = frame.contentDocument;
      if (doc && doc.readyState === "complete" && doc.location && doc.location.href !== "about:blank") done();
    });
    subscribed = true;
    go();
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
