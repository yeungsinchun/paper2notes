import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const notesDir = path.resolve(here, "..");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const evidenceDir = process.env.EVIDENCE_DIR || "";

function pageUrl(name) {
  return pathToFileURL(path.join(notesDir, name)).href;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  throw new Error((label || "waitFor") + " timed out: " + (last && last.message));
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const desc = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
      throw new Error(desc || result.exceptionDetails.text || "evaluate failed");
    }
    return result.result.value;
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await this.evaluate(
      "new Promise((resolve) => { if (document.readyState === 'complete') resolve(); else window.addEventListener('load', () => resolve(), { once: true }); })"
    );
    await this.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)))");
  }

  async screenshot(filePath, selector) {
    if (selector) {
      await this.evaluate(
        "(function () { var el = document.querySelector(" +
          JSON.stringify(selector) +
          "); el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); })()"
      );
      await this.evaluate("new Promise((r) => setTimeout(r, 120))");
    }
    const shot = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(filePath, Buffer.from(shot.data, "base64"));
  }
}

let chromeProc;
let cdp;
let profileDir;

before(async () => {
  if (!fs.existsSync(chromePath)) {
    throw new Error("Google Chrome is required to exercise the notes pages");
  }
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "notes-chrome-"));
  const port = await freePort();
  chromeProc = spawn(
    chromePath,
    [
      "--headless=new",
      "--use-angle=swiftshader",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--allow-file-access-from-files",
      "--remote-debugging-port=" + port,
      "--user-data-dir=" + profileDir,
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const target = await waitFor(async () => {
    const res = await fetch("http://127.0.0.1:" + port + "/json/list");
    if (!res.ok) throw new Error("cdp not ready");
    const list = await res.json();
    const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (!page) throw new Error("no page target");
    return page;
  }, 15000, "chrome page target");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
});

after(async () => {
  if (cdp && cdp.ws) {
    try { cdp.ws.close(); } catch (_) { /* already closed */ }
  }
  if (chromeProc) {
    chromeProc.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 200));
  }
  if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
});

function near(actual, expected, tol) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    "expected " + actual + " within " + tol + " of " + expected
  );
}

describe("Book 5 Ch.1 notes interactives", { concurrency: 1 }, () => {
test("25.1 spectrum is static with the ionizing cut after UV", async () => {
  await cdp.goto(pageUrl("25-1.html"));
  const spec = await cdp.evaluate(`(function () {
    var svg = document.querySelector("#spectrum svg");
    var texts = Array.from(svg.querySelectorAll("text")).map(function (t) { return t.textContent.trim(); });
    var xrays = Array.from(svg.querySelectorAll("rect")).find(function (r) {
      var n = r.nextElementSibling;
      return n && n.textContent.trim() === "X-rays";
    });
    return {
      slider: !!document.querySelector("#spectrum-slider"),
      mark: !!document.querySelector("#spectrum-mark"),
      pointer: !!document.querySelector("#spectrum-pointer"),
      cut: !!document.querySelector("#ionizing-cut"),
      texts: texts,
      xrayX: xrays && xrays.getAttribute("x"),
      body: document.querySelector("#spectrum .one-liners").innerText
    };
  })()`);
  assert.equal(spec.slider, false);
  assert.equal(spec.mark, false);
  assert.equal(spec.pointer, false);
  assert.equal(spec.cut, true);
  assert.ok(spec.texts.includes("non-ionizing"));
  assert.ok(spec.texts.includes("ionizing"));
  assert.equal(spec.xrayX, "390");
  assert.match(spec.body, /X-rays and gamma/);
  assert.doesNotMatch(spec.body, /book cut/i);

  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-1-knockout-animation.png"), "#knockout");
    await cdp.screenshot(path.join(evidenceDir, "25-1-spectrum-static-cut.png"), "#spectrum");
  }
});

test("25.2 pie wedge is 20% and Pu-239 bookkeeping is static n_α=8", async () => {
  await cdp.goto(pageUrl("25-2.html"));
  const pie = await cdp.evaluate(`(function () {
    var paths = Array.from(document.querySelectorAll('.pie path'));
    var path = paths[paths.length - 1];
    var label = Array.from(document.querySelectorAll('.pie text')).find(function (t) {
      return t.textContent.trim() === "20%";
    });
    var d = path.getAttribute("d");
    var m = /M\\s*([\\d.]+)\\s+([\\d.]+)\\s+L\\s*([\\d.]+)\\s+([\\d.]+)\\s+A\\s*([\\d.]+)\\s+[\\d.]+\\s+0\\s+0\\s+1\\s+([\\d.]+)\\s+([\\d.]+)/.exec(d);
    var cx = Number(m[1]);
    var cy = Number(m[2]);
    var endX = Number(m[6]);
    var endY = Number(m[7]);
    var startAngle = Math.atan2(Number(m[3]) - cx, cy - Number(m[4]));
    var endAngle = Math.atan2(endX - cx, cy - endY);
    var sweepDeg = (endAngle - startAngle) * 180 / Math.PI;
    if (sweepDeg < 0) sweepDeg += 360;
    var lx = Number(label.getAttribute("x"));
    var ly = Number(label.getAttribute("y"));
    var labelDeg = Math.atan2(lx - cx, cy - ly) * 180 / Math.PI;
    if (labelDeg < 0) labelDeg += 360;
    var startDeg = startAngle * 180 / Math.PI;
    if (startDeg < 0) startDeg += 360;
    var labelFromStart = (labelDeg - startDeg + 360) % 360;
    return {
      sweepDeg: sweepDeg,
      label: label.textContent,
      labelInside: labelFromStart >= 0 && labelFromStart <= sweepDeg,
      puRanges: document.querySelectorAll("#pu239 input[type=range]").length,
      puText: document.querySelector("#pu239").innerText
    };
  })()`);
  near(pie.sweepDeg, 72, 2);
  assert.equal(pie.label, "20%");
  assert.equal(pie.labelInside, true);
  assert.equal(pie.puRanges, 0);
  assert.match(pie.puText, /nα = 32 \/ 4 = 8|n_α = 32 \/ 4 = 8|nα = 8|32 \/ 4 = 8/);
  assert.match(pie.puText, /nβ = 82 − 78 = 4|n_β = 82 − 78 = 4|nβ = 4/);
  assert.equal(await cdp.evaluate("!!document.getElementById('example-25-1') || /Example 25\\.1/.test(document.body.innerText)"), false);

  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-2-decay-equations.png"), "#decay-anim");
    await cdp.screenshot(path.join(evidenceDir, "25-2-background-pie-80-20.png"), "#background");
    await cdp.screenshot(path.join(evidenceDir, "25-2-pu239-static-bookkeeping.png"), "#pu239");
  }
});

test("25.3 absorber presets follow paper/Al/Pb contribution rules", async () => {
  await cdp.goto(pageUrl("25-3.html"));

  async function setAbs(src, paper, al, pb) {
    return cdp.evaluate(`(function () {
      document.querySelector('[data-src="${src}"]').click();
      var paperBtn = document.querySelector('#abs-paper');
      var alBtn = document.querySelector('#abs-al');
      var pbBtn = document.querySelector('#abs-pb');
      if ((paperBtn.getAttribute('aria-pressed') === 'true') !== ${paper}) paperBtn.click();
      if ((alBtn.getAttribute('aria-pressed') === 'true') !== ${al}) alBtn.click();
      if ((pbBtn.getAttribute('aria-pressed') === 'true') !== ${pb}) pbBtn.click();
      return {
        rate: parseInt(document.querySelector('#abs-rate').textContent, 10),
        note: document.querySelector('#abs-note').textContent
      };
    })()`);
  }

  const mixAir = await setAbs("bg", false, false, false);
  assert.match(mixAir.note, /Example 25\.6/);
  assert.match(mixAir.note, /air only/);
  near(mixAir.rate, 700, 8);

  const mixPaper = await setAbs("bg", true, false, false);
  near(mixPaper.rate, 700, 8);

  const mixAl = await setAbs("bg", true, true, false);
  near(mixAl.rate, 315, 8);

  const mixPb = await setAbs("bg", true, true, true);
  near(mixPb.rate, 188, 8);

  const abgAir = await setAbs("abg", false, false, false);
  assert.match(abgAir.note, /α \+ β \+ γ/);
  near(abgAir.rate, 900, 8);

  const abgPaper = await setAbs("abg", true, false, false);
  near(abgPaper.rate, 700, 8);

  const abgAl = await setAbs("abg", true, true, false);
  near(abgAl.rate, 315, 8);
  assert.ok(abgPaper.rate - abgAl.rate > 200, "Al after paper must drop β for α+β+γ");

  const agAir = await setAbs("ag", false, false, false);
  near(agAir.rate, 465, 8);

  const agPbOnly = await setAbs("ag", false, false, true);
  near(agPbOnly.rate, 188, 8);
  assert.ok(Math.abs(agPbOnly.rate - 250) > 20, "Pb-only α+γ must not fall through to 250");

  if (evidenceDir) {
    await setAbs("abg", true, true, false);
    await cdp.screenshot(path.join(evidenceDir, "25-3-absorbers-abg-paper-al.png"), "#range");
  }
});

test("25.3 GM extra recomputes when the plastic grid toggles", async () => {
  await cdp.goto(pageUrl("25-3.html"));
  await cdp.evaluate(`document.querySelector('[data-need-grid="off"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  const blocked = await cdp.evaluate("parseInt(document.querySelector('#gm-rate').textContent, 10)");
  near(blocked, 1, 8);

  await cdp.evaluate(`document.querySelector('#gm-grid').click()`);
  const gridOff = await cdp.evaluate("document.querySelector('#gm-grid').textContent");
  assert.match(gridOff, /grid off/);
  await new Promise((r) => setTimeout(r, 800));
  const admitted = await cdp.evaluate("parseInt(document.querySelector('#gm-rate').textContent, 10)");
  near(admitted, 21, 8);

  await cdp.evaluate(`document.querySelector('#gm-grid').click()`);
  await new Promise((r) => setTimeout(r, 800));
  const blockedAgain = await cdp.evaluate("parseInt(document.querySelector('#gm-rate').textContent, 10)");
  near(blockedAgain, 1, 8);

  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-3-gm-grid-blocks-alpha.png"), "#gm");
  }
});

test("25.3 identification graph keeps taken yes/no edges", async () => {
  await cdp.goto(pageUrl("25-3.html"));

  async function flowState() {
    return cdp.evaluate(`(function () {
      function node(step) {
        var n = document.querySelector('#id-flow .node[data-step="' + step + '"]');
        return { active: n.classList.contains('active'), done: n.classList.contains('done') };
      }
      function edge(side) {
        return Array.from(document.querySelectorAll('#id-flow .edge[data-side="' + side + '"]')).map(function (e) {
          return e.classList.contains('lit');
        });
      }
      return {
        talk: document.querySelector('#flow-talk').textContent,
        unknown: node('0'),
        paper: node('1'),
        alpha: node('alpha'),
        al: node('2'),
        beta: node('3'),
        pb: node('4'),
        alphaEdges: edge('alpha'),
        noAlpha: edge('no-alpha'),
        betaEdges: edge('beta'),
        noBeta: edge('no-beta')
      };
    })()`);
  }

  await cdp.evaluate("document.querySelector('#flow-reset').click()");
  await cdp.evaluate("document.querySelector('#flow-next').click()");
  let state = await flowState();
  assert.equal(state.paper.active, true);
  assert.equal(state.alpha.active, false);
  assert.match(state.talk, /no α|Insert paper/);

  await cdp.evaluate("document.querySelector('#flow-next').click()");
  state = await flowState();
  assert.equal(state.alpha.active, false);
  assert.equal(state.al.active, true);
  assert.ok(state.noAlpha.every(Boolean));
  assert.ok(state.alphaEdges.every((lit) => !lit));
  assert.match(state.talk, /5 mm Al/);
  assert.doesNotMatch(state.talk, /α is present/);

  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"alpha\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
  assert.equal(state.alpha.active, true);
  assert.equal(state.paper.active, false);
  assert.equal(state.paper.done, true);
  assert.ok(state.alphaEdges.every(Boolean));
  assert.ok(state.noAlpha.every((lit) => !lit));
  assert.match(state.talk, /α is present/);
  assert.doesNotMatch(state.talk, /700 → 700/);

  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"2\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
  assert.equal(state.al.active, true);
  assert.equal(state.alpha.done, true);
  assert.ok(state.alphaEdges.every(Boolean));
  assert.ok(state.noAlpha.every((lit) => !lit));
  assert.match(state.talk, /α already found/);
  assert.doesNotMatch(state.talk, /no α/);

  await cdp.evaluate("document.querySelector('#flow-reset').click()");
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"2\"]').dispatchEvent(new Event('click'))");
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"4\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
  assert.ok(state.noBeta.every(Boolean));
  assert.ok(state.betaEdges.every((lit) => !lit));
  assert.match(state.talk, /No drop at Al → no β/);

  if (evidenceDir) {
    await cdp.evaluate("document.querySelector('#flow-reset').click()");
    await cdp.evaluate("document.querySelector('#flow-next').click()");
    await cdp.evaluate("document.querySelector('#flow-next').click()");
    await cdp.screenshot(path.join(evidenceDir, "25-3-flow-example-25-6-no-alpha.png"), "#identify");
    await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"alpha\"]').dispatchEvent(new Event('click'))");
    await cdp.screenshot(path.join(evidenceDir, "25-3-flow-alpha-present-branch.png"), "#identify");
    await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"2\"]').dispatchEvent(new Event('click'))");
    await cdp.screenshot(path.join(evidenceDir, "25-3-flow-alpha-then-al.png"), "#identify");
    await cdp.evaluate("document.querySelector('#flow-reset').click()");
    await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"2\"]').dispatchEvent(new Event('click'))");
    await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"4\"]').dispatchEvent(new Event('click'))");
    await cdp.screenshot(path.join(evidenceDir, "25-3-flow-no-beta-to-pb.png"), "#identify");
  }
});

test("25.1 knockout ejects the bound electron already on the atom", async () => {
  await cdp.goto(pageUrl("25-1.html"));
  await cdp.evaluate("new Promise((r) => setTimeout(r, 200))");
  const bound = await cdp.evaluate(`(function () {
    var scene = window.NotesScenes && window.NotesScenes.knockout;
    if (!scene) return { missing: true };
    scene.replay();
    return scene.snapshot();
  })()`);
  assert.equal(bound.missing, undefined);
  assert.equal(bound.electronOpacity, 1);
  assert.ok(bound.distToNucleus < bound.shellRadius + 0.2, "electron should start on the shell, dist=" + bound.distToNucleus);
  assert.equal(bound.atomLabel, "atom");

  await cdp.evaluate("new Promise((r) => setTimeout(r, 400))");
  const mid = await cdp.evaluate("window.NotesScenes.knockout.snapshot()");
  assert.equal(mid.electronOpacity, 1);
  assert.ok(mid.distToNucleus < mid.shellRadius + 0.25, "electron must stay on the atom until the ray hits, dist=" + mid.distToNucleus);

  await cdp.evaluate("new Promise((r) => setTimeout(r, 1800))");
  const end = await cdp.evaluate("window.NotesScenes.knockout.snapshot()");
  assert.equal(end.electronOpacity, 1);
  assert.ok(end.distToNucleus > end.shellRadius * 1.8, "same electron should be far from the nucleus after knockout, dist=" + end.distToNucleus);
  assert.equal(end.atomLabel, "positive ion");
  assert.match(end.nucleusHex, /c0392b/i);

  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-1-knockout-labels.png"), "#knockout");
  }
});

test("25.3 ion-pair capture, Flip B marks, and β/γ check", async () => {
  await cdp.goto(pageUrl("25-3.html"));
  await cdp.evaluate("new Promise((r) => setTimeout(r, 1800))");
  const pair = await cdp.evaluate(`(function () {
    var scene = window.NotesScenes && window.NotesScenes.ionpair;
    if (!scene) return { missing: true };
    scene.replay();
    return true;
  })()`);
  assert.equal(pair, true);
  await cdp.evaluate("new Promise((r) => setTimeout(r, 2200))");
  const pairEnd = await cdp.evaluate("window.NotesScenes.ionpair.snapshot()");
  assert.equal(pairEnd.electronOpacity, 1);
  assert.ok(pairEnd.distToB < pairEnd.shellRadius + 0.5, "captured electron should sit on the − ion, dist=" + pairEnd.distToB);
  assert.match(pairEnd.minusHex, /2a62a8/i);
  assert.match(pairEnd.plusHex, /c0392b/i);
  assert.equal(pairEnd.labelA, "+ ion");
  assert.equal(pairEnd.labelB, "− ion");

  const flipped = await cdp.evaluate(`(function () {
    document.querySelector("#b-flip").click();
    var marks = Array.from(document.querySelectorAll("[data-b-dots] text")).map(function (t) {
      return t.textContent;
    });
    return {
      caption: document.querySelector("[data-b-mark]").textContent,
      allDots: marks.length === 16 && marks.every(function (m) { return m === "·"; })
    };
  })()`);
  assert.match(flipped.caption, /out of the page/);
  assert.equal(flipped.allDots, true);

  const restored = await cdp.evaluate(`(function () {
    document.querySelector("#b-flip").click();
    var marks = Array.from(document.querySelectorAll("[data-b-dots] text")).map(function (t) {
      return t.textContent;
    });
    return marks.length === 16 && marks.every(function (m) { return m === "×"; });
  })()`);
  assert.equal(restored, true);

  const mc = await cdp.evaluate(`(function () {
    var page = document.body.innerText;
    var box = Array.from(document.querySelectorAll("#fields .check")).find(function (el) {
      return el.getAttribute("data-answer") === "C";
    });
    var stem = box.querySelector("p").textContent;
    box.querySelector('[data-choice="C"]').click();
    return {
      hasQ35: /101 cpm/.test(page) || /400 cpm/.test(page),
      stem: stem,
      ok: box.querySelector(".feedback").classList.contains("ok")
    };
  })()`);
  assert.equal(mc.hasQ35, false);
  assert.match(mc.stem, /β and γ/);
  assert.equal(mc.ok, true);

  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-3-ion-pair-capture.png"), "#ion-pair");
    await cdp.evaluate("document.querySelector('#b-flip').click()");
    await cdp.screenshot(path.join(evidenceDir, "25-3-b-field-out.png"), "#fields");
  }
});

test("chapter map, summary, and concept-check scoring are the public notes surface", async () => {
  await cdp.goto(pageUrl("index.html"));
  const map = await cdp.evaluate(`({
    title: document.querySelector('h1').textContent,
    lede: document.querySelector('.lede') && document.querySelector('.lede').textContent,
    links: Array.from(document.querySelectorAll('.toc a')).map((a) => a.getAttribute('href'))
  })`);
  assert.equal(map.title, "Radiation and Radioactivity");
  assert.match(map.lede, /Ionizing radiation/);
  assert.doesNotMatch(map.lede, /textbook order/i);
  assert.doesNotMatch(map.lede, /book cut/i);
  assert.deepEqual(map.links, ["25-1.html", "25-2.html", "25-3.html", "summary.html"]);

  await cdp.goto(pageUrl("summary.html"));
  const summary = await cdp.evaluate(`({
    isotopeItem: /which are isotopes/i.test(document.body.innerText),
    later: document.querySelector('.later') && document.querySelector('.later').textContent,
    highlight: (function () {
      document.querySelector('[data-compare="range"]').click();
      return Array.from(document.querySelectorAll('tr[data-row="range"]')).every((tr) => tr.classList.contains('on'));
    })()
  })`);
  assert.equal(summary.isotopeItem, false);
  assert.match(summary.later, /Chapter 26/);
  assert.equal(summary.highlight, true);

  await cdp.goto(pageUrl("25-1.html"));
  const check = await cdp.evaluate(`(function () {
    var box = document.querySelector('[data-check="mc"][data-answer="B"]');
    box.querySelector('[data-choice="B"]').click();
    return {
      ok: box.querySelector('.feedback').classList.contains('ok'),
      text: box.querySelector('.feedback').textContent
    };
  })()`);
  assert.equal(check.ok, true);
  assert.equal(check.text, "Yes.");

  if (evidenceDir) {
    await cdp.goto(pageUrl("index.html"));
    await cdp.screenshot(path.join(evidenceDir, "index-chapter-map.png"));
    await cdp.goto(pageUrl("summary.html"));
    await cdp.evaluate("document.querySelector('[data-compare=\"range\"]').click()");
    await cdp.screenshot(path.join(evidenceDir, "summary-table-25-6-range.png"), "table.compare");
    await cdp.goto(pageUrl("25-3.html"));
    await cdp.evaluate("document.querySelector('[data-track=\"alpha\"]').click()");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 200))");
    await cdp.screenshot(path.join(evidenceDir, "25-3-cloud-tracks-alpha.png"), "#tracks");
    await cdp.evaluate("document.querySelector('[data-badge=\"beta\"]').click()");
    await cdp.screenshot(path.join(evidenceDir, "25-3-film-badge-beta.png"), "#badge");
    await cdp.screenshot(path.join(evidenceDir, "25-3-eb-deflection.png"), "#fields");
  }
});
});
