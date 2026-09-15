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
    this.lifecycleWaiters = [];
    this.recentLifecycle = [];
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method === "Page.lifecycleEvent") {
        this.recentLifecycle.push(msg.params || {});
        if (this.recentLifecycle.length > 30) this.recentLifecycle.shift();
        this.flushLifecycleWaiters();
      }
    });
  }

  send(method, params, timeoutMs) {
    const id = this.nextId++;
    const ms = timeoutMs == null ? 20000 : timeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(method + " timed out after " + ms + "ms"));
      }, ms);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  lifecycleMatches(waiter, params) {
    if (waiter.name !== params.name) return false;
    if (!waiter.loaderId) return false;
    return waiter.loaderId === params.loaderId;
  }

  flushLifecycleWaiters() {
    for (let i = 0; i < this.lifecycleWaiters.length; i += 1) {
      const waiter = this.lifecycleWaiters[i];
      const hit = this.recentLifecycle.find((params) => this.lifecycleMatches(waiter, params));
      if (!hit) continue;
      this.lifecycleWaiters.splice(i, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(hit);
      i -= 1;
    }
  }

  waitLifecycle(name, loaderId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = { name, loaderId, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.lifecycleWaiters = this.lifecycleWaiters.filter((w) => w !== waiter);
        reject(new Error("Page.lifecycleEvent " + name + " timed out"));
      }, timeoutMs);
      this.lifecycleWaiters.push(waiter);
      this.flushLifecycleWaiters();
    });
  }

  async evaluate(expression, timeoutMs) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, timeoutMs);
    if (result.exceptionDetails) {
      const desc = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
      throw new Error(desc || result.exceptionDetails.text || "evaluate failed");
    }
    return result.result.value;
  }

  async navigateOnce(url, timeoutMs) {
    const nav = await this.send("Page.navigate", { url });
    if (nav && nav.errorText) throw new Error("navigate " + url + ": " + nav.errorText);
    if (!nav || !nav.loaderId) return;
    try {
      await this.waitLifecycle("load", nav.loaderId, timeoutMs);
    } catch (err) {
      const state = await this.evaluate("document.readyState");
      if (state !== "complete" && state !== "interactive") throw err;
    }
  }

  async goto(url) {
    const dest = new URL(url);
    dest.searchParams.set("_cdp", String(Date.now()));
    await this.navigateOnce("about:blank", 8000);
    await this.navigateOnce(dest.href, 15000);
    try { await this.send("Page.bringToFront"); } catch (_) { /* headless */ }
    try {
      await this.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)))", 8000);
    } catch (_) {
      // Multi-canvas notes pages can starve rAF while WebGL boots; tests wait on scenes.
    }
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
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
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
  await cdp.send("Page.setLifecycleEventsEnabled", { enabled: true });
  await cdp.send("Runtime.enable");
  try {
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  } catch (_) { /* older Chrome */ }
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

function chromeTest(name, fn) {
  test(name, { timeout: evidenceDir ? 240000 : 180000 }, fn);
}

describe("Book 5 Ch.1 notes interactives", { concurrency: 1 }, () => {
chromeTest("25.1 spectrum is static with the ionizing barrier in UV", async () => {
  await cdp.goto(pageUrl("25-1.html"));
  await cdp.evaluate("new Promise((r) => setTimeout(r, 250))");
  const spec = await cdp.evaluate(`(function () {
    var spec = document.getElementById("spectrum");
    var snap = window.NotesScenes && window.NotesScenes.spectrum && window.NotesScenes.spectrum.snapshot();
    return {
      slider: !!document.querySelector("#spectrum-slider"),
      mark: !!document.querySelector("#spectrum-mark"),
      pointer: !!document.querySelector("#spectrum-pointer"),
      snap: snap,
      title: spec ? spec.querySelector("h2").textContent : "",
      body: spec ? spec.textContent : "",
      nonion: spec && spec.querySelector('[data-hud="nonion"]') && spec.querySelector('[data-hud="nonion"]').textContent,
      ion: spec && spec.querySelector('[data-hud="ion"]') && spec.querySelector('[data-hud="ion"]').textContent,
      gammaHud: spec && spec.querySelector('#spectrum-vis [data-hud="gamma"]') && spec.querySelector('#spectrum-vis [data-hud="gamma"]').textContent,
      headers: spec ? Array.from(spec.querySelectorAll("table.spectrum-bands thead th")).map(function (th) { return th.textContent.trim(); }) : [],
      headerWidths: spec ? Array.from(spec.querySelectorAll("table.spectrum-bands thead th")).map(function (th) { return th.getBoundingClientRect().width; }) : [],
      uvCell: spec && spec.querySelector("table.spectrum-bands tbody tr td:nth-child(2)") && spec.querySelector("table.spectrum-bands tbody tr td:nth-child(2)").textContent.trim()
    };
  })()`);
  assert.equal(spec.slider, false);
  assert.equal(spec.mark, false);
  assert.equal(spec.pointer, false);
  assert.equal(spec.snap.cutInUV, true);
  assert.equal(spec.snap.cutAfterUV, false);
  assert.ok(spec.snap.nonIonizingUVFrac > 0.05 && spec.snap.nonIonizingUVFrac < 0.18);
  assert.equal(spec.snap.mostUVionizing, true);
  assert.equal(spec.snap.xrayAfterCut, true);
  assert.match(spec.title, /spectrum becomes ionizing/i);
  assert.match(spec.nonion, /non-ionizing/);
  assert.match(spec.ion, /ionizing/);
  assert.match(spec.body, /X-rays/);
  assert.match(spec.body, /boundary lies inside the ultraviolet/i);
  assert.doesNotMatch(spec.body, /one-tenth|1\/10 of UV/i);
  assert.doesNotMatch(spec.title, /where the EM cut sits/i);
  assert.doesNotMatch(spec.body, /book cut/i);
  assert.deepEqual(spec.headers, ["radio", "micro", "IR", "vis", "UV", "X-rays", "Gamma ray"]);
  assert.equal(spec.gammaHud.trim(), "Gamma ray");
  assert.equal(spec.snap.gammaHud, "Gamma ray");
  assert.doesNotMatch(spec.headers.join(" "), /γ/);
  assert.ok(spec.uvCell.length < 12, "UV band cell should stay short, got " + spec.uvCell);
  assert.doesNotMatch(spec.uvCell, /1\/10|one-tenth|most ionizing/i);
  const visW = spec.headerWidths[3];
  const radioW = spec.headerWidths[0];
  const gammaW = spec.headerWidths[6];
  assert.ok(visW < radioW * 0.6, "vis column should be narrower than radio, vis=" + visW + " radio=" + radioW);
  assert.ok(gammaW > visW * 1.8, "Gamma ray column should be wider than vis, gamma=" + gammaW + " vis=" + visW);

  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-1-knockout-animation.png"), "#knockout");
    await cdp.screenshot(path.join(evidenceDir, "25-1-spectrum-static-cut.png"), "#spectrum");
  }
});

chromeTest("25.1 imaging is X-rays down through a hand onto film that starts white", async () => {
  await cdp.goto(pageUrl("25-1.html"));
  const start = await cdp.evaluate(`(function () {
    window.NotesScenes.imaging.replay();
    return window.NotesScenes.imaging.snapshot();
  })()`);
  assert.equal(start.oneHand, true);
  assert.equal(start.twoSlabs, false);
  assert.equal(start.filmCount, 1);
  assert.ok(start.nBone >= 5, "hand should contain several bones, n=" + start.nBone);
  assert.ok(start.nFlesh >= 5, "hand should contain flesh, n=" + start.nFlesh);
  assert.ok(start.boneLum > 180, "film under bone starts white");
  assert.ok(start.fleshLum > 180, "whole film starts white, fleshLum=" + start.fleshLum);
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-1-xray-imaging-start-white.png"), "#imaging");
  }
  await cdp.evaluate("new Promise((r) => setTimeout(r, 1500))");
  const img = await cdp.evaluate(`(function () {
    var snap = window.NotesScenes.imaging.snapshot();
    var host = document.getElementById("imaging-vis");
    snap.toggles = document.querySelectorAll("[data-tissue]").length;
    snap.labels = Array.from(host.querySelectorAll(".hud-label")).map(function (t) { return t.textContent.trim(); });
    snap.replay = !!document.querySelector('#imaging [data-replay="imaging-vis"]');
    return snap;
  })()`);
  assert.equal(img.toggles, 0);
  assert.equal(img.oneHand, true);
  assert.equal(img.twoSlabs, false);
  assert.equal(img.filmUnder, true, "film should sit under the hand");
  assert.ok(img.boneLum > 180, "film under bone should stay white");
  assert.ok(img.fleshLum < 90, "film under flesh should blacken, lum=" + img.fleshLum);
  assert.ok(img.rayCount >= 8, "several X-rays should pass through the hand, n=" + img.rayCount);
  assert.equal(img.stopInFlesh, 0, "flesh must transmit, not absorb, an X-ray");
  assert.ok(img.stopInBone >= 3, "some X-rays should stop in bone");
  assert.ok(img.throughFlesh >= 3, "transmitting X-rays should go through flesh, n=" + img.throughFlesh);
  assert.ok(img.reachFilm >= 3, "some X-rays should reach the film");
  assert.ok(img.fillY > 0.48, "hand and film should fill the canvas, fillY=" + img.fillY);
  assert.ok(img.fillY < 0.96, "hand and film should not be clipped, fillY=" + img.fillY);
  assert.equal(img.clipped, false, "Fig 25.7 should stay inside the canvas, ndc x=" + img.fillMinX + ".." + img.fillMaxX + " y=" + img.fillMinY + ".." + img.fillMaxY);
  assert.equal(img.raysDown, true);
  assert.equal(img.replay, true);
  assert.ok(img.labels.includes("X-rays"));
  assert.ok(img.labels.includes("photographic film"));

  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "25-1-xray-imaging.png"), "#imaging");
  }
});

chromeTest("25.2 pie wedge is 20% and Pu-239 bookkeeping is static n_α=8", async () => {
  await cdp.goto(pageUrl("25-2.html"));
  await cdp.evaluate("new Promise((r) => setTimeout(r, 200))");
  const pie = await cdp.evaluate(`(function () {
    var snap = window.NotesScenes.pie.snapshot();
    snap.puRanges = document.querySelectorAll("#pu239 input[type=range]").length;
    snap.puText = document.querySelector("#pu239").innerText;
    return snap;
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

chromeTest("25.2 decay labels sit on the parent and outgoing particle", async () => {
  await cdp.goto(pageUrl("25-2.html"));
  await waitFor(async () => {
    const ready = await cdp.evaluate("!!(window.NotesScenes && window.NotesScenes['decay-a'] && window.NotesScenes['decay-b'] && window.NotesScenes['decay-g'])");
    if (!ready) throw new Error("decay scenes not booted");
    return true;
  }, 8000, "decay scenes");
  await cdp.evaluate("window.NotesScenes['decay-a'].replay()");
  const alpha = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes['decay-a'].snapshot()");
    if (!(snap.parentHud < snap.ejectileHud)) throw new Error("α ejectile not yet to the right of parent");
    return snap;
  }, 4000, "alpha decay hud");
  near(alpha.parentHud, alpha.parentProj, 10);
  near(alpha.ejectileHud, alpha.ejectileProj, 10);
  near(alpha.parentHudTop, alpha.parentProjY, 10);
  near(alpha.ejectileHudTop, alpha.ejectileProjY, 10);
  assert.ok(alpha.parentHud < alpha.ejectileHud, "α parent label should sit left of the outgoing α");

  await cdp.evaluate("document.querySelector('[data-decay=\"b\"]').click()");
  const beta = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes['decay-b'].snapshot()");
    if (!(snap.parentHud < snap.ejectileHud)) throw new Error("β ejectile not yet to the right of parent");
    return snap;
  }, 4000, "beta decay hud");
  near(beta.parentHud, beta.parentProj, 10);
  near(beta.ejectileHud, beta.ejectileProj, 10);
  near(beta.parentHudTop, beta.parentProjY, 10);
  near(beta.ejectileHudTop, beta.ejectileProjY, 10);
  assert.ok(beta.parentHud < beta.ejectileHud, "β parent label should sit left of the outgoing electron");

  await cdp.evaluate("document.querySelector('[data-decay=\"g\"]').click()");
  const gamma = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes['decay-g'].snapshot()");
    if (!(snap.parentHud < snap.ejectileHud)) throw new Error("γ ejectile not yet to the right of parent");
    return snap;
  }, 4000, "gamma decay hud");
  near(gamma.parentHud, gamma.parentProj, 10);
  near(gamma.ejectileHud, gamma.ejectileProj, 10);
  near(gamma.parentHudTop, gamma.parentProjY, 10);
  near(gamma.ejectileHudTop, gamma.ejectileProjY, 10);
  assert.ok(gamma.parentHud < gamma.ejectileHud, "γ parent label should sit left of the outgoing γ");
});

chromeTest("25.3 absorber presets follow paper/Al/Pb contribution rules", async () => {
  await cdp.goto(pageUrl("25-3.html"));

  async function setAbs(src, paper, al, pb) {
    return cdp.evaluate(`(function () {
      document.querySelector('[data-abs-src="${src}"]').click();
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
  assert.match(abgAir.note, /Case 3/);
  assert.doesNotMatch(abgAir.note, /α \+ β \+ γ/, "the case selector must not reveal the diagnosis");
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

chromeTest("25.3 GM extra recomputes when the plastic grid toggles", async () => {
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

chromeTest("25.3 identification graph keeps taken yes/no edges", async () => {
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

  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"1\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
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
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"alpha\"]').dispatchEvent(new Event('click'))");
  await cdp.evaluate("document.querySelector('#flow-next').click()");
  state = await flowState();
  assert.equal(state.al.active, true);
  assert.equal(state.beta.active, false);
  assert.ok(state.betaEdges.every((lit) => !lit));
  assert.match(state.talk, /α already found|test for β/);
  assert.doesNotMatch(state.talk, /β present/);
  assert.doesNotMatch(state.talk, /700 → 315/);

  await cdp.evaluate("document.querySelector('#flow-next').click()");
  state = await flowState();
  assert.equal(state.al.active, false);
  assert.equal(state.pb.active, true);
  assert.equal(state.beta.active, false);
  assert.ok(state.betaEdges.every((lit) => !lit));
  assert.match(state.talk, /25 mm Pb|test for γ/);
  assert.doesNotMatch(state.talk, /β present/);
  assert.doesNotMatch(state.talk, /700 → 315/);

  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"2\"]').dispatchEvent(new Event('click'))");
  await cdp.evaluate("document.querySelector('#flow-next').click()");
  state = await flowState();
  assert.equal(state.pb.active, true);
  assert.equal(state.beta.active, false);
  assert.ok(state.betaEdges.every((lit) => !lit));
  assert.doesNotMatch(state.talk, /β present/);

  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"3\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
  assert.equal(state.beta.active, true);
  assert.ok(state.betaEdges[0]);
  assert.match(state.talk, /β present/);

  await cdp.evaluate("document.querySelector('#flow-reset').click()");
  await cdp.evaluate("document.querySelector('#flow-next').click()");
  await cdp.evaluate("document.querySelector('#flow-next').click()");
  await cdp.evaluate("document.querySelector('#flow-next').click()");
  state = await flowState();
  assert.equal(state.beta.active, true);
  assert.ok(state.betaEdges[0]);
  assert.ok(state.noAlpha.every(Boolean));
  assert.match(state.talk, /β present/);

  await cdp.evaluate("document.querySelector('#flow-reset').click()");
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"2\"]').dispatchEvent(new Event('click'))");
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"4\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
  assert.ok(state.noBeta.every(Boolean));
  assert.ok(state.betaEdges.every((lit) => !lit));
  assert.match(state.talk, /No drop at Al → no β/);

  await cdp.evaluate("document.querySelector('#flow-reset').click()");
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"alpha\"]').dispatchEvent(new Event('click'))");
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"4\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
  assert.equal(state.pb.active, true);
  assert.ok(state.alphaEdges.every(Boolean));
  assert.ok(state.noBeta.every((lit) => !lit));
  assert.ok(state.betaEdges.every((lit) => !lit));
  assert.match(state.talk, /test for γ/);
  assert.doesNotMatch(state.talk, /no β/);
  assert.doesNotMatch(state.talk, /315 → 190/);

  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"3\"]').dispatchEvent(new Event('click'))");
  await cdp.evaluate("document.querySelector('#id-flow .node[data-step=\"4\"]').dispatchEvent(new Event('click'))");
  state = await flowState();
  assert.equal(state.pb.active, true);
  assert.ok(state.alphaEdges.every(Boolean));
  assert.ok(state.betaEdges[0]);
  assert.ok(state.noBeta.every((lit) => !lit));
  assert.match(state.talk, /test for γ/);
  assert.doesNotMatch(state.talk, /315 → 190/);

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

chromeTest("25.1 knockout ejects the bound electron already on the atom", async () => {
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

chromeTest("25.3 ion-pair capture, Flip B marks, and β/γ check", async () => {
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
    var snap = window.NotesScenes.bfield.snapshot();
    return {
      caption: document.querySelector("[data-b-mark]").textContent,
      into: snap.into
    };
  })()`);
  assert.match(flipped.caption, /out of the page/);
  assert.equal(flipped.into, false);

  const restored = await cdp.evaluate(`(function () {
    document.querySelector("#b-flip").click();
    return window.NotesScenes.bfield.snapshot().into;
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

chromeTest("chapter map, summary, and concept-check scoring are the public notes surface", async () => {
  await cdp.goto(pageUrl("index.html"));
  const map = await cdp.evaluate(`({
    title: document.querySelector('h1').textContent,
    brand: document.querySelector('.brand') && document.querySelector('.brand').textContent,
    lede: document.querySelector('.lede') && document.querySelector('.lede').textContent,
    links: Array.from(document.querySelectorAll('.toc a')).map((a) => a.getAttribute('href')),
    hasLo: !!document.querySelector(".lo-block")
  })`);
  assert.equal(map.title, "Radiation and Radioactivity");
  assert.match(map.brand, /Book 5/);
  assert.doesNotMatch(map.brand, /syllabus/i);
  assert.match(map.lede, /Ionizing radiation/);
  assert.doesNotMatch(map.lede, /textbook order/i);
  assert.doesNotMatch(map.lede, /book cut/i);
  assert.deepEqual(map.links, ["25-1.html", "25-2.html", "25-3.html", "summary.html"]);
  assert.equal(map.hasLo, false, "learning objectives belong on the 25.x pages, not the chapter map");

  for (const page of ["index.html", "25-1.html", "25-2.html", "25-3.html", "summary.html"]) {
    await cdp.goto(pageUrl(page));
    const chrome = await cdp.evaluate(`(function () {
      var bar = document.querySelector(".topbar");
      var pageWide = document.querySelector(".view-scale, [data-view-scale], .topbar [data-box-scale]");
      var stages = Array.from(document.querySelectorAll(".visual.play.stage"));
      var boxes = stages.map(function (stage) {
        var plus = stage.querySelector("[data-box-scale='up']");
        var minus = stage.querySelector("[data-box-scale='down']");
        if (!plus || !minus) return { ok: false, id: stage.id };
        var hidden = stage.hasAttribute("hidden") || getComputedStyle(stage).display === "none";
        var sr = stage.getBoundingClientRect();
        var pr = plus.getBoundingClientRect();
        var mr = minus.getBoundingClientRect();
        return {
          ok: true,
          id: stage.id,
          hidden: hidden,
          plusText: plus.textContent.trim(),
          minusText: minus.textContent.trim(),
          plusAfterMinus: hidden ? true : pr.left > mr.left,
          rightGap: hidden ? 0 : sr.right - pr.right,
          inBox: hidden ? true : pr.top >= sr.top - 1 && pr.bottom <= sr.bottom + 1
        };
      });
      return {
        hasBar: !!bar,
        noPageWide: !pageWide,
        stageCount: stages.length,
        boxes: boxes
      };
    })()`);
    assert.equal(chrome.hasBar, true, "top bar missing on " + page);
    assert.equal(chrome.noPageWide, true, "page-wide scale chrome still on " + page);
    if (page === "index.html") {
      assert.equal(chrome.stageCount, 0);
    } else {
      assert.ok(chrome.stageCount > 0, "expected animation boxes on " + page);
    }
    chrome.boxes.forEach(function (box) {
      assert.equal(box.ok, true, "scale buttons missing on " + page + " #" + box.id);
      assert.equal(box.plusText, "+");
      assert.equal(box.minusText, "−");
      assert.equal(box.plusAfterMinus, true, "plus should sit to the right of minus on #" + box.id);
      assert.ok(box.rightGap < 48, "scale buttons should sit at the top right of #" + box.id);
      assert.equal(box.inBox, true, "scale buttons should stay on #" + box.id);
    });
  }

  await cdp.goto(pageUrl("summary.html"));
  const summary = await cdp.evaluate(`({
    isotopeItem: /which are isotopes/i.test(document.body.innerText),
    later: document.querySelector('.later') && document.querySelector('.later').textContent,
    compareControls: document.querySelectorAll('[data-compare]').length,
    compareRows: Array.from(document.querySelectorAll('table.compare tbody th')).map((th) => th.textContent.trim()),
    compareCols: document.querySelectorAll('table.compare thead th').length
  })`);
  assert.equal(summary.isotopeItem, false);
  assert.match(summary.later, /Chapter 26/);
  assert.equal(summary.compareControls, 0, "row-highlight buttons above Table 25.6 were removed");
  assert.ok(summary.compareRows.includes("Range in air"), "Table 25.6 keeps a plain Range row");
  assert.ok(summary.compareRows.includes("Ionizing power"));
  assert.equal(summary.compareCols, 4);

  await cdp.goto(pageUrl("25-1.html"));
  const check = await cdp.evaluate(`(function () {
    var box = document.querySelector('[data-check="mc"][data-answer="B"]');
    var explain = box.querySelector('.explain');
    var hiddenBefore = explain.hidden;
    box.querySelector('[data-choice="B"]').click();
    var wrongBox = document.querySelector('#radiation .check[data-check="mc"]');
    var wrongExplain = wrongBox.querySelector('.explain');
    wrongBox.querySelector('[data-choice="A"]').click();
    return {
      ok: box.querySelector('.feedback').classList.contains('ok'),
      text: box.querySelector('.feedback').textContent,
      hiddenBefore: hiddenBefore,
      explainShown: !explain.hidden && explain.textContent.trim().length > 40,
      locked: Array.from(box.querySelectorAll('[data-choice]')).every(function (b) { return b.disabled; }),
      wrong: wrongBox.querySelector('.feedback').textContent,
      wrongMarksRight: wrongBox.querySelector('[data-choice="C"]').classList.contains('correct'),
      wrongExplainShown: !wrongExplain.hidden
    };
  })()`);
  assert.equal(check.ok, true);
  assert.equal(check.text, "Correct.");
  assert.equal(check.hiddenBefore, true, "reasoning stays hidden until the student answers");
  assert.equal(check.explainShown, true, "reasoning is revealed after answering");
  assert.equal(check.locked, true, "one attempt per check");
  assert.match(check.wrong, /Not quite\. The answer is C\./);
  assert.equal(check.wrongMarksRight, true, "the correct option is shown after a wrong pick");
  assert.equal(check.wrongExplainShown, true);
  const radiationCopy = await cdp.evaluate("document.querySelector('#radiation').innerText");
  assert.doesNotMatch(radiationCopy, /does not become an electron beam/i);
  assert.doesNotMatch(radiationCopy, /Two carriers, one class/i);
  assert.doesNotMatch(radiationCopy, /becomes the electron beam/i);
  const radCheck = await cdp.evaluate(`(function () {
    var box = document.querySelector("#radiation .check");
    return { stem: box.innerText, answer: box.getAttribute("data-answer") };
  })()`);
  assert.match(radCheck.stem, /statements about radiation is\/are correct/i);
  assert.match(radCheck.stem, /medium to travel/i);
  assert.equal(radCheck.answer, "C");
  const knockoutCheck = await cdp.evaluate(`(function () {
    var box = document.querySelector("#knockout .check");
    var explain = box.querySelector(".explain");
    var hiddenBefore = explain.hidden;
    box.querySelector('[data-choice="C"]').click();
    return {
      copy: box.innerText,
      hiddenBefore: hiddenBefore,
      shown: !explain.hidden,
      correct: box.querySelector('[data-choice="C"]').classList.contains("correct")
    };
  })()`);
  assert.equal(knockoutCheck.hiddenBefore, true);
  assert.equal(knockoutCheck.shown, true);
  assert.equal(knockoutCheck.correct, true);
  assert.doesNotMatch(knockoutCheck.copy, /turns a light beam into an electron beam/i);
  assert.doesNotMatch(knockoutCheck.copy, /made of ions/i);
  assert.doesNotMatch(knockoutCheck.copy, /made of atoms/i);
  assert.match(knockoutCheck.copy, /strike electrons out of atoms or molecules/i);
  assert.match(knockoutCheck.copy, /what the radiation does to matter/i);

  const replay25_1 = await cdp.evaluate(`({
    all: Array.from(document.querySelectorAll("[data-replay]")).map(function (b) { return b.getAttribute("data-replay"); }),
    radiation: document.querySelectorAll("#radiation [data-replay]").length,
    knockout: document.querySelectorAll("#knockout [data-replay]").length,
    tube: document.querySelectorAll("#xray-tube [data-replay]").length,
    imaging: document.querySelectorAll("#imaging [data-replay]").length
  })`);
  assert.deepEqual(replay25_1.all, ["knock-vis", "imaging-vis"]);
  assert.equal(replay25_1.radiation, 0, "looping Fig 25.2 panes should not have Replay");
  assert.equal(replay25_1.knockout, 1, "knockout ejection should stay replayable");
  assert.equal(replay25_1.tube, 0, "X-ray tube loop should not have Replay");
  assert.equal(replay25_1.imaging, 1, "film blackening is a finite clip");

  const scaled = await cdp.evaluate(`(function () {
    var imaging = document.querySelector("#imaging-vis");
    var other = document.querySelector("#knock-vis");
    var canvas = imaging.querySelector("canvas");
    var otherCanvas = other.querySelector("canvas");
    var hud = imaging.querySelector("[data-hud='flesh']");
    var plus = imaging.querySelector("[data-box-scale='up']");
    var minus = imaging.querySelector("[data-box-scale='down']");
    var before = {
      scale: getComputedStyle(imaging).getPropertyValue("--box-scale").trim(),
      otherScale: getComputedStyle(other).getPropertyValue("--box-scale").trim(),
      canvasH: canvas.getBoundingClientRect().height,
      otherH: otherCanvas.getBoundingClientRect().height,
      hudH: hud.getBoundingClientRect().height
    };
    plus.click();
    var mid = {
      scale: getComputedStyle(imaging).getPropertyValue("--box-scale").trim(),
      otherScale: getComputedStyle(other).getPropertyValue("--box-scale").trim(),
      canvasH: canvas.getBoundingClientRect().height,
      otherH: otherCanvas.getBoundingClientRect().height,
      hudH: hud.getBoundingClientRect().height
    };
    minus.click();
    var after = {
      scale: getComputedStyle(imaging).getPropertyValue("--box-scale").trim(),
      canvasH: canvas.getBoundingClientRect().height
    };
    return { before: before, mid: mid, after: after };
  })()`);
  assert.equal(scaled.before.scale, "1");
  assert.equal(scaled.before.otherScale, "1");
  assert.equal(scaled.mid.scale, "1.15");
  assert.equal(scaled.mid.otherScale, "1", "plus on one box must not scale another");
  assert.ok(scaled.mid.canvasH > scaled.before.canvasH * 1.08, "plus should enlarge that diagram");
  near(scaled.mid.otherH, scaled.before.otherH, 1);
  near(scaled.mid.canvasH / scaled.before.canvasH, scaled.mid.hudH / scaled.before.hudH, 0.08);
  assert.equal(scaled.after.scale, "1");

  await cdp.goto(pageUrl("25-2.html"));
  const replay25_2 = await cdp.evaluate("document.querySelectorAll('[data-replay]').length");
  assert.equal(replay25_2, 0);

  await cdp.goto(pageUrl("25-3.html"));
  const replay25_3 = await cdp.evaluate(`({
    all: Array.from(document.querySelectorAll("[data-replay]")).map(function (b) { return b.getAttribute("data-replay"); }),
    ionPair: document.querySelectorAll("#ion-pair [data-replay]").length
  })`);
  assert.deepEqual(replay25_3.all, ["pair-vis"]);
  assert.equal(replay25_3.ionPair, 1, "ion-pair capture should stay replayable");

  await cdp.goto(pageUrl("summary.html"));
  const replaySum = await cdp.evaluate("document.querySelectorAll('[data-replay]').length");
  assert.equal(replaySum, 0);

  if (evidenceDir) {
    await cdp.goto(pageUrl("index.html"));
    await cdp.screenshot(path.join(evidenceDir, "index-chapter-map.png"));
    await cdp.goto(pageUrl("summary.html"));
    await cdp.screenshot(path.join(evidenceDir, "summary-table-25-6.png"), "table.compare");
    await cdp.goto(pageUrl("25-3.html"));
    await cdp.evaluate("document.querySelector('[data-track=\"alpha\"]').click()");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 200))");
    await cdp.screenshot(path.join(evidenceDir, "25-3-cloud-tracks-alpha.png"), "#tracks");
    await cdp.evaluate("document.querySelector('[data-badge=\"beta\"]').click()");
    await cdp.screenshot(path.join(evidenceDir, "25-3-film-badge-beta.png"), "#badge");
    await cdp.screenshot(path.join(evidenceDir, "25-3-eb-deflection.png"), "#fields");
  }
});

chromeTest("3d scenes magnify, label the tube, keep β drift, and pulse radially", async () => {
  await cdp.goto(pageUrl("25-2.html"));
  await cdp.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)))");
  const zoom1 = await cdp.evaluate("window.NotesScenes.atom.snapshot()");
  assert.ok(zoom1.nucleusPx > 2, "nucleus should be visible at zoom 1, px=" + zoom1.nucleusPx);
  near(zoom1.nucleusHud, zoom1.nucleusProjX, 8);

  await cdp.evaluate("document.getElementById('atom-zoom-slider').value = 8");
  await cdp.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)))");
  const zoom8 = await cdp.evaluate("window.NotesScenes.atom.snapshot()");
  assert.ok(
    zoom8.nucleusPx > zoom1.nucleusPx * 5,
    "zoom 8 should magnify the nucleus, " + zoom1.nucleusPx + " -> " + zoom8.nucleusPx
  );
  near(zoom8.zoom, 8, 0.05);
  assert.ok(Math.abs(zoom8.nucleusNdcY) < 1, "nucleus label should stay in the zoomed frustum, ndcY=" + zoom8.nucleusNdcY);
  assert.ok(
    zoom8.nucleusHudTop > 0 && zoom8.nucleusHudTop < zoom8.canvasH,
    "nucleus label should stay on canvas at zoom 8, top=" + zoom8.nucleusHudTop
  );

  await cdp.goto(pageUrl("25-1.html"));
  await cdp.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)))");
  await waitFor(async () => {
    const ready = await cdp.evaluate("!!(window.NotesScenes && window.NotesScenes['beams-em'] && window.NotesScenes['beams-e'])");
    if (!ready) throw new Error("pane scenes not booted");
    return true;
  }, 2500, "two pane scenes");
  const panes = await cdp.evaluate(`({
    nCanvas: document.querySelectorAll("#radiation canvas").length,
    nClassHud: document.querySelectorAll("#radiation [data-hud='class']").length,
    heading: document.querySelector("#radiation h2").textContent.trim()
  })`);
  assert.equal(panes.nCanvas, 2, "Fig 25.2 should be two canvases, n=" + panes.nCanvas);
  assert.equal(panes.nClassHud, 0, "class HUD belongs on the HTML heading, not in a scene");
  assert.match(panes.heading, /Two types of radiation/i);
  const beamA = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes['beams-em'].snapshot()");
    if (!(snap.eLen > 0.2 && snap.bLen > 0.12)) throw new Error("E and B not on screen yet");
    return snap;
  }, 2500, "traveling E+B wave");
  near(beamA.dotEB, 0, 0.05);
  near(beamA.eDotK, 0, 0.05);
  near(beamA.bDotK, 0, 0.05);
  near(beamA.eX, 0, 0.08);
  near(beamA.eZ, 0, 0.08);
  near(beamA.bX, 0, 0.08);
  near(beamA.bY, 0, 0.08);
  assert.ok(Math.abs(beamA.poyntingX) > 0.02, "E × B should point along the travel axis");
  near(beamA.waveHud, beamA.waveProj, 14);
  near(beamA.eHud, beamA.eProj, 16);
  near(beamA.bHud, beamA.bProj, 18);
  assert.match(beamA.waveLabel, /EM wave/);
  assert.equal(beamA.paneCount, 2);
  const beamB = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes['beams-em'].snapshot()");
    const moved = Math.abs(snap.crestX - beamA.crestX) > 0.15 || Math.abs(snap.eAtProbe - beamA.eAtProbe) > 0.15;
    if (!moved) throw new Error("E and B not yet traveled, E " + beamA.eAtProbe + " -> " + snap.eAtProbe);
    return snap;
  }, 2500, "traveling E+B crest");
  const electronsA = await cdp.evaluate("window.NotesScenes['beams-e'].snapshot()");
  assert.equal(electronsA.n, 8);
  assert.match(electronsA.label, /particles/);
  near(electronsA.hudX, electronsA.projX, 14);
  await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes['beams-e'].snapshot()");
    const moved = electronsA.xs.some((x, i) => Math.abs(x - snap.xs[i]) > 0.08);
    if (!moved) throw new Error("electron stream not yet moved, t=" + snap.t);
    return snap;
  }, 2500, "moving electron stream");
  const cam0 = await cdp.evaluate("window.NotesScenes['beams-em'].snapshot()");
  const eCam0 = await cdp.evaluate("window.NotesScenes['beams-e'].snapshot()");
  await cdp.evaluate(`(function () {
    var c = document.querySelector("#beam-em-vis canvas");
    c.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, bubbles: true, cancelable: true }));
  })()`);
  const camWheel = await cdp.evaluate("window.NotesScenes['beams-em'].snapshot()");
  near(camWheel.camZoom, cam0.camZoom, 0.01);
  near(camWheel.camR, cam0.camR, 0.02);
  near(camWheel.camX, cam0.camX, 0.02);
  near(camWheel.camZ, cam0.camZ, 0.02);
  await cdp.evaluate("window.NotesScenes['beams-em'].orbitBy(40, 6)");
  await cdp.evaluate("new Promise((r) => setTimeout(r, 250))");
  const cam1 = await cdp.evaluate("window.NotesScenes['beams-em'].snapshot()");
  const eCam1 = await cdp.evaluate("window.NotesScenes['beams-e'].snapshot()");
  assert.ok(
    Math.abs(cam1.camX - cam0.camX) > 0.12 || Math.abs(cam1.camZ - cam0.camZ) > 0.12,
    "drag-orbit should move the light-beam camera"
  );
  near(eCam1.camX, eCam0.camX, 0.02);
  near(eCam1.camZ, eCam0.camZ, 0.02);
  near(cam1.eHud, cam1.eProj, 18);
  near(cam1.bHud, cam1.bProj, 20);
  await cdp.evaluate("window.NotesScenes['beams-e'].orbitBy(40, 6)");
  await cdp.evaluate("new Promise((r) => setTimeout(r, 250))");
  const eCam2 = await cdp.evaluate("window.NotesScenes['beams-e'].snapshot()");
  assert.ok(
    Math.abs(eCam2.camX - eCam1.camX) > 0.12 || Math.abs(eCam2.camZ - eCam1.camZ) > 0.12,
    "drag-orbit should move the electron-beam camera"
  );
  near(eCam2.hudX, eCam2.projX, 16);

  const tube = await cdp.evaluate("window.NotesScenes.tube.snapshot()");
  near(tube.gunHud, tube.gunProj, 10);
  near(tube.electronsHud, tube.electronsProj, 10);
  near(tube.targetHud, tube.targetProj, 10);
  near(tube.xraysHud, tube.xraysProj, 10);
  assert.ok(tube.gunHud < tube.electronsHud, "gun label should sit left of electrons");
  assert.ok(tube.electronsHud < tube.targetHud, "electrons label should sit left of the target");
  assert.ok(tube.faceNx < -0.4 && tube.faceNy > 0.4, "target face still points toward the gun and up");
  assert.equal(tube.hasEmTrain, false);
  assert.equal(tube.nRays, 3, "X-rays should leave as three glyphs, n=" + tube.nRays);
  assert.ok(tube.fanSpreadDeg > 55, "X-ray fan should be wide, spread=" + tube.fanSpreadDeg);
  assert.equal(tube.originAtHit, true);
  assert.equal(tube.xrayAboveHit, true);

  await cdp.goto(pageUrl("25-3.html"));
  await cdp.evaluate("window.NotesScenes.current.setKind('alpha')");
  const alphaIons = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes.current.snapshot()");
    if (Math.abs(snap.ionY - snap.ionEndY) > 0.12) throw new Error("alpha ion y " + snap.ionY);
    if (Math.abs(snap.electronY - snap.electronEndY) > 0.12) throw new Error("alpha electron y " + snap.electronY);
    return snap;
  }, 4000, "alpha ions at plates");
  near(alphaIons.ionY, alphaIons.ionEndY, 0.12);
  near(alphaIons.electronY, alphaIons.electronEndY, 0.12);
  near(alphaIons.needleDeg, -38, 1);
  assert.match(alphaIons.sourceLabel, /α source/);
  near(alphaIons.minusHud, alphaIons.minusProj, 10);
  near(alphaIons.plusHud, alphaIons.plusProj, 10);
  near(alphaIons.minusHudTop, alphaIons.minusProjY, 10);
  near(alphaIons.plusHudTop, alphaIons.plusProjY, 10);
  const hudPad = await cdp.evaluate(`(function () {
    var canvas = document.querySelector("#current-vis canvas");
    var minus = document.querySelector('#current-vis [data-hud="minus"]');
    var canvasRect = canvas.getBoundingClientRect();
    var minusRect = minus.getBoundingClientRect();
    var snap = window.NotesScenes.current.snapshot();
    var localX = (snap.minusNdcX * 0.5 + 0.5) * canvas.clientWidth;
    var localY = (-snap.minusNdcY * 0.5 + 0.5) * canvas.clientHeight;
    return {
      offsetLeft: canvas.offsetLeft,
      offsetTop: canvas.offsetTop,
      centerX: minusRect.left + minusRect.width / 2,
      top: minusRect.top,
      expectX: canvasRect.left + localX,
      expectY: canvasRect.top + localY
    };
  })()`);
  assert.ok(hudPad.offsetLeft > 4, "stage padding should inset the canvas, offsetLeft=" + hudPad.offsetLeft);
  near(hudPad.centerX, hudPad.expectX, 10);
  near(hudPad.top, hudPad.expectY, 10);
  assert.ok(
    alphaIons.minusHudTop < alphaIons.plusHudTop,
    "− plate label should sit on the upper plate"
  );

  await cdp.evaluate("document.querySelector('[data-current=\"beta\"]').click()");
  const betaIons = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes.current.snapshot()");
    if (snap.kind !== "beta") throw new Error("kind " + snap.kind);
    if (Math.abs(snap.needleDeg - (-14)) > 1) throw new Error("beta needle " + snap.needleDeg);
    if (Math.abs(snap.ionY - snap.ionEndY) > 0.12) throw new Error("beta ion y " + snap.ionY);
    if (Math.abs(snap.electronY - snap.electronEndY) > 0.12) throw new Error("beta electron y " + snap.electronY);
    return snap;
  }, 4000, "beta ions at plates");
  assert.equal(betaIons.kind, "beta");
  assert.match(betaIons.sourceLabel, /β source/);
  near(betaIons.ionY, alphaIons.ionEndY, 0.12);
  near(betaIons.electronY, alphaIons.electronEndY, 0.12);
  near(betaIons.ionEndY, alphaIons.ionEndY, 0.001);
  near(betaIons.needleDeg, -14, 1);
  assert.ok(Math.abs(betaIons.needleDeg) < Math.abs(alphaIons.needleDeg), "β needle must show a smaller current");

  const pulseStart = await cdp.evaluate(`(function () {
    window.NotesScenes.gm.replay();
    return window.NotesScenes.gm.snapshot();
  })()`);
  assert.ok(
    pulseStart.electronY > 0.45,
    "electron should start away from the anode wire, y=" + pulseStart.electronY
  );
  const pulse = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes.gm.snapshot()");
    if (Math.abs(snap.electronY - 0.08) > 0.08) throw new Error("GM electron y " + snap.electronY);
    if (pulseStart.electronY - snap.electronY <= 0.35) throw new Error("GM radial travel " + pulseStart.electronY + " -> " + snap.electronY);
    return snap;
  }, 4000, "GM radial pulse");
  near(pulse.electronX, pulse.homeX, 0.08);
  near(pulse.argonX, pulse.homeX, 0.08);
  near(pulse.electronY, 0.08, 0.08);
  assert.ok(pulse.argonY > 0.5, "positive ion should move out toward the case, y=" + pulse.argonY);
  assert.ok(Math.abs(pulse.electronX) > 1, "electron must not slide down the tube axis, x=" + pulse.electronX);
  assert.ok(
    pulseStart.electronY - pulse.electronY > 0.35,
    "electron should travel radially onto the wire, " + pulseStart.electronY + " -> " + pulse.electronY
  );

  await cdp.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)))");
  const tracksA = await cdp.evaluate(`(function () {
    var snap = window.NotesScenes.tracks.snapshot();
    snap.pressed = Array.from(document.querySelectorAll("[data-track]")).map(function (btn) {
      return { kind: btn.getAttribute("data-track"), pressed: btn.getAttribute("aria-pressed") };
    });
    return snap;
  })()`);
  assert.equal(tracksA.kind, "alpha");
  assert.match(tracksA.label, /α/);
  assert.equal(tracksA.visible, true);
  assert.equal(tracksA.hiddenOthers, true);
  near(tracksA.hudX, tracksA.projX, 10);
  near(tracksA.hudY, tracksA.projY, 10);
  assert.ok(tracksA.canvasOffsetLeft > 4, "track labels should include canvas inset");
  assert.deepEqual(tracksA.pressed, [
    { kind: "alpha", pressed: "true" },
    { kind: "beta", pressed: "false" },
    { kind: "gamma", pressed: "false" }
  ]);

  await cdp.evaluate("document.querySelector('[data-track=\"gamma\"]').click()");
  await cdp.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)))");
  const tracksG = await cdp.evaluate(`(function () {
    var snap = window.NotesScenes.tracks.snapshot();
    snap.pressed = Array.from(document.querySelectorAll("[data-track]")).map(function (btn) {
      return { kind: btn.getAttribute("data-track"), pressed: btn.getAttribute("aria-pressed") };
    });
    return snap;
  })()`);
  assert.equal(tracksG.kind, "gamma");
  assert.match(tracksG.label, /γ/);
  assert.equal(tracksG.visible, true);
  assert.equal(tracksG.hiddenOthers, true);
  near(tracksG.hudX, tracksG.projX, 10);
  near(tracksG.hudY, tracksG.projY, 10);
  assert.deepEqual(tracksG.pressed, [
    { kind: "alpha", pressed: "false" },
    { kind: "beta", pressed: "false" },
    { kind: "gamma", pressed: "true" }
  ]);

  if (evidenceDir) {
    await cdp.goto(pageUrl("25-2.html"));
    await cdp.evaluate("document.getElementById('atom-zoom-slider').value = 8");
    await cdp.evaluate("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)))");
    await cdp.screenshot(path.join(evidenceDir, "25-2-atom-zoom-nucleus.png"), "#atom");
    await cdp.screenshot(path.join(evidenceDir, "25-2-sealed-source.png"), "#lab");
    await cdp.goto(pageUrl("25-1.html"));
    await cdp.evaluate("new Promise((r) => setTimeout(r, 400))");
    await cdp.screenshot(path.join(evidenceDir, "25-1-radiation-beams.png"), "#radiation");
    await cdp.screenshot(path.join(evidenceDir, "25-1-knockout-labels.png"), "#knockout");
    await cdp.screenshot(path.join(evidenceDir, "25-1-xray-tube-hud.png"), "#xray-tube");
    await cdp.screenshot(path.join(evidenceDir, "25-1-xray-imaging.png"), "#imaging");
    await cdp.goto(pageUrl("summary.html"));
    await cdp.evaluate("new Promise((r) => setTimeout(r, 400))");
    await cdp.screenshot(path.join(evidenceDir, "summary-xray-tube.png"), "#sum-tube");
    await cdp.goto(pageUrl("25-3.html"));
    await cdp.evaluate("document.querySelector('[data-current=\"beta\"]').click()");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 1600))");
    await cdp.screenshot(path.join(evidenceDir, "25-3-current-beta-needle.png"), "#current");
    await cdp.evaluate("window.NotesScenes.gm.replay()");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 1100))");
    await cdp.screenshot(path.join(evidenceDir, "25-3-gm-radial-pulse.png"), "#gm");
    await cdp.screenshot(path.join(evidenceDir, "25-3-ion-pair.png"), "#ion-pair");
    await cdp.screenshot(path.join(evidenceDir, "25-3-absorbers.png"), "#range");
    await cdp.screenshot(path.join(evidenceDir, "25-3-eb-deflection.png"), "#fields");
  }
});

chromeTest("every Ch.1 section page shows syllabus LOs and keeps DSE papers in the section quiz", async () => {
  for (const page of ["25-1.html", "25-2.html", "25-3.html", "summary.html"]) {
    await cdp.goto(pageUrl(page));
    const info = await cdp.evaluate(`(function () {
      var lo = document.querySelector(".lo-block");
      var scripts = Array.from(document.querySelectorAll("script[src]")).map(function (s) {
        return s.getAttribute("src") || "";
      });
      return {
        heading: lo && lo.querySelector("h2") && lo.querySelector("h2").textContent,
        stem: lo && lo.innerText,
        firstAfterTitle: (function () {
          // Subsection pages open with their LOs. The chapter map puts the section list
          // first so navigation stays above the fold, then the full LO list.
          var h1 = document.querySelector("h1");
          var n = h1 && h1.nextElementSibling;
          while (n && n.tagName === "P" && n.classList.contains("lede")) n = n.nextElementSibling;
          if (n && n.classList.contains("toc")) n = n.nextElementSibling;
          return !!(n && n.classList.contains("lo-block"));
        })(),
        remote: scripts.some(function (src) { return /^https?:\\/\\//.test(src); }),
        katex: scripts.some(function (src) { return /vendor\\/katex\\/katex\\.min\\.js$/.test(src); })
      };
    })()`);
    assert.match(info.heading, /Learning objectives/i);
    assert.match(info.stem, /Students should be able to/);
    assert.equal(info.firstAfterTitle, true, "LO block should sit after the title on " + page);
    assert.equal(info.remote, false, "no remote scripts on " + page);
    assert.equal(info.katex, true, "local KaTeX missing on " + page);
  }

  await cdp.goto(pageUrl("25-1.html"));
  const xray = await cdp.evaluate("document.querySelector('.lo-block').innerText");
  assert.match(xray, /realise X-rays as ionizing electromagnetic radiations of short wavelengths with high penetrating power/);
  assert.equal(await cdp.evaluate("!!document.querySelector('.lo-block .dse-labels')"), false);
  assert.doesNotMatch(xray, /2022\/31 MC/);

  await cdp.goto(pageUrl("summary.html"));
  const bank = await cdp.evaluate(`(function () {
    return {
      n: document.querySelectorAll(".dse-paper").length,
      hasBank: !!document.querySelector(".dse-bank"),
      hasLabels: !!document.querySelector(".dse-labels"),
      katex: !!document.querySelector(".katex")
    };
  })()`);
  assert.equal(bank.hasBank, false, "summary must not dump the classified set");
  assert.equal(bank.n, 0, "DSE papers belong in section quizzes, n=" + bank.n);
  assert.equal(bank.hasLabels, false);
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "ch01-summary-lo-block.png"), ".lo-block");
  }
});

chromeTest("each Ch.1 subsection quizzes its DSE papers one at a time", async () => {
  const expected = {
    "25-1.html": ["dse-mc-2022-31", "dse-mc-2015-31"],
    "25-2.html": ["dse-mc-2012-36", "dse-mc-2013-34", "dse-mc-2014-31", "dse-lq-2026-12", "dse-mc-2021-31", "dse-mc-2025-32", "dse-mc-2021-33"],
    "25-3.html": ["dse-mc-2016-32", "dse-mc-2017-32", "dse-mc-pp-34", "dse-mc-2014-32", "dse-mc-2019-31", "dse-mc-sap-36", "dse-mc-2017-31", "dse-mc-pp-35"]
  };

  for (const [page, expectedIds] of Object.entries(expected)) {
    await cdp.goto(pageUrl(page));
    const practice = await cdp.evaluate(`(function () {
      var section = document.querySelector(".section-dse");
      var slides = section ? Array.from(section.querySelectorAll(".quiz-slide")) : [];
        var visible = slides.filter(function (s) { return s.classList.contains("is-current"); });
      var firstImg = visible[0] && visible[0].querySelector("img");
      return {
        heading: section && section.querySelector("h2") && section.querySelector("h2").textContent,
        slides: slides.map(function (s) { return s.id; }),
        visible: visible.length,
        paper: !!(firstImg && firstImg.complete && firstImg.naturalWidth > 0),
        hasPrev: !!(section && section.querySelector("[data-quiz-prev]")),
        hasNext: !!(section && section.querySelector("[data-quiz-next]")),
        letters: section ? section.querySelectorAll("[data-quiz-choice]").length : 0,
        exportHref: section && section.querySelector("[data-quiz-export]") && section.querySelector("[data-quiz-export]").getAttribute("href"),
        status: section && section.querySelector(".quiz-status") && section.querySelector(".quiz-status").textContent
      };
    })()`);
    assert.match(practice.heading || "", /check the learning objectives/i);
    assert.equal(practice.hasPrev, true, page + " needs Prev");
    assert.equal(practice.hasNext, true, page + " needs Next");
    assert.ok(practice.letters >= 4, page + " needs A B C D options");
    assert.match(practice.exportHref || "", /combined\.pdf$/);
    assert.equal(practice.visible, 1, page + " must show one quiz item");
    assert.ok(practice.paper, page + " should include a topic-matched DSE paper");
    for (const id of expectedIds) {
      assert.ok(practice.slides.includes(id), page + " missing " + id);
    }
  }

  await cdp.goto(pageUrl("25-1.html"));
  const rotated = await cdp.evaluate(`(function () {
    var first = document.querySelector(".quiz-slide.is-current");
    var before = first && first.id;
    document.querySelector("[data-quiz-next]").click();
    var after = document.querySelector(".quiz-slide.is-current");
    document.querySelector("[data-quiz-prev]").click();
    var back = document.querySelector(".quiz-slide.is-current");
    var letter = document.querySelector("[data-quiz-choice='B']");
    if (letter) letter.click();
    return {
      before: before,
      after: after && after.id,
      back: back && back.id,
      picked: !!(letter && letter.classList.contains("is-picked")),
      visible: document.querySelectorAll(".quiz-slide.is-current").length
    };
  })()`);
  assert.notEqual(rotated.after, rotated.before);
  assert.equal(rotated.back, rotated.before);
  assert.equal(rotated.picked, true);
  assert.equal(rotated.visible, 1);

  await cdp.goto(pageUrl("25-3.html"));
  const target = await waitFor(async () => {
    const found = await cdp.evaluate(`(function () {
      var next = document.querySelector("[data-quiz-next]");
      var paper = document.getElementById("dse-mc-2019-31");
      if (paper && !paper.classList.contains("is-current") && next) next.click();
      paper = document.getElementById("dse-mc-2019-31");
      var img = paper && paper.querySelector("img");
      return {
        href: location.href,
        hidden: !!(paper && !paper.classList.contains("is-current")),
        paper: !!paper,
        image: !!(img && img.complete && img.naturalWidth > 0)
      };
    })()`);
    if (!found.paper || found.hidden || !found.image) throw new Error("DSE target not ready");
    return found;
  }, 10000, "topic-matched DSE paper");
  assert.match(target.href, /25-3\.html/);
  assert.equal(target.paper, true);
});
});
