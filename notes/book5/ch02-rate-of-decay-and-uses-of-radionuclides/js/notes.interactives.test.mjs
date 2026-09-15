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
const book5Dir = path.resolve(notesDir, "..");
const ch1Dir = path.resolve(book5Dir, "ch01-radiation-and-radioactivity");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const evidenceDir = process.env.EVIDENCE_DIR || "";

function pageUrl(name) {
  return pathToFileURL(path.join(notesDir, name)).href;
}

function book5Url(name) {
  return pathToFileURL(path.join(book5Dir, name)).href;
}

function ch1Url(name) {
  return pathToFileURL(path.join(ch1Dir, name)).href;
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
      awaitPromise: true
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
          "); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); } })()"
      );
      await this.evaluate("new Promise((r) => setTimeout(r, 180))");
    }
    const shot = await this.send("Page.captureScreenshot", { format: "png" });
    if (evidenceDir) fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
      "about:blank"
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
    mobile: false
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

function chromeTest(name, fn) {
  test(name, { timeout: evidenceDir ? 240000 : 180000 }, fn);
}

describe("Book 5 menu and Ch.2 notes", { concurrency: 1 }, () => {
chromeTest("Book 5 picker lists both textbook chapter titles", async () => {
  await cdp.goto(book5Url("index.html"));
  const menu = await cdp.evaluate(`({
    title: document.querySelector("h1") && document.querySelector("h1").textContent,
    hrefs: Array.from(document.querySelectorAll(".chapter-cards a")).map((a) => a.getAttribute("href")),
    text: document.body.innerText
  })`);
  assert.match(menu.title, /Radiation chapters/i);
  assert.equal(menu.hrefs.length, 2);
  assert.match(menu.hrefs[0], /ch01-radiation-and-radioactivity/);
  assert.match(menu.hrefs[1], /ch02-rate-of-decay-and-uses-of-radionuclides/);
  assert.match(menu.text, /Radiation and Radioactivity/);
  assert.match(menu.text, /Rate of Decay and Uses of Radionuclides/);
  assert.doesNotMatch(menu.text, /PHY150/);
  assert.doesNotMatch(menu.text, /printed p/);
  const cardLayout = await cdp.evaluate(`Array.from(document.querySelectorAll(".chapter-cards a")).map(function (card) {
    var number = card.querySelector(".num").getBoundingClientRect();
    var title = card.querySelector("strong").getBoundingClientRect();
    var detail = card.querySelector("span:not(.num)").getBoundingClientRect();
    return {
      numberRight: number.right,
      titleLeft: title.left,
      detailLeft: detail.left,
      titleWidth: title.width
    };
  })`);
  cardLayout.forEach(function (card) {
    assert.ok(card.numberRight < card.titleLeft, "chapter number should occupy the left column");
    assert.ok(Math.abs(card.detailLeft - card.titleLeft) < 2, "chapter detail should align with its title");
    assert.ok(card.titleWidth > 300, "chapter title must not be constrained to the number column");
  });
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "book5-chapter-picker.png"));
  }
  await cdp.evaluate(`document.querySelector('.chapter-cards a[href*="ch02"]').click()`);
  await waitFor(async () => {
    const href = await cdp.evaluate("location.href");
    if (!/ch02-rate-of-decay-and-uses-of-radionuclides/.test(href)) throw new Error(href);
    return true;
  }, 8000, "picker to Ch.2");
  const landed = await cdp.evaluate(`({
    title: document.querySelector("h1") && document.querySelector("h1").textContent,
    hrefs: Array.from(document.querySelectorAll(".toc a")).map((a) => a.getAttribute("href"))
  })`);
  assert.match(landed.title, /Rate of Decay and Uses of Radionuclides/);
  assert.deepEqual(landed.hrefs, ["26-1.html", "26-2.html", "26-3.html", "summary.html"]);
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "ch02-chapter-map.png"));
  }
});

chromeTest("Ch.1 and Ch.2 top bars link back to the Book 5 menu", async () => {
  await cdp.goto(ch1Url("25-1.html"));
  const ch1 = await cdp.evaluate(`document.querySelector(".brand").getAttribute("href")`);
  assert.equal(ch1, "../index.html");
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "ch01-25-1-from-book5-menu.png"));
  }
  await cdp.goto(pageUrl("26-1.html"));
  const ch2 = await cdp.evaluate(`document.querySelector(".brand").getAttribute("href")`);
  assert.equal(ch2, "../index.html");
  if (evidenceDir) {
    await cdp.evaluate(`document.querySelector(".brand").click()`);
    await waitFor(async () => {
      const title = await cdp.evaluate("document.querySelector('h1') && document.querySelector('h1').textContent");
      if (!/Radiation chapters/i.test(title || "")) throw new Error(title || "no h1");
      return true;
    }, 8000, "Ch.2 brand back to picker");
    await cdp.screenshot(path.join(evidenceDir, "ch02-brand-back-to-picker.png"));
  }
});

chromeTest("26.1 dice remaining falls and N+decayed stays 40 billion", async () => {
  await cdp.goto(pageUrl("26-1.html"));
  await waitFor(async () => {
    const ok = await cdp.evaluate("!!(window.NotesScenes && window.NotesScenes.dice && window.NotesScenes.halfN)");
    if (!ok) throw new Error("scenes missing");
    return true;
  }, 8000, "ch2 scenes");
  const replayLabel = await cdp.evaluate(`document.querySelector('[data-replay="decay-vis"]').textContent.trim()`);
  assert.equal(replayLabel, "Replay");
  await cdp.evaluate("window.NotesScenes.dice.replay()");
  const start = await cdp.evaluate("window.NotesScenes.dice.snapshot()");
  assert.equal(start.nTotal, 100);
  assert.equal(start.remaining, 100);
  const later = await waitFor(async () => {
    const snap = await cdp.evaluate("window.NotesScenes.dice.snapshot()");
    if (snap.remaining >= 100) throw new Error("still 100");
    return snap;
  }, 8000, "dice decay");
  assert.ok(later.remaining < 100);
  assert.ok(later.remaining >= 0);
  const n = await cdp.evaluate(`(function () {
    window.NotesScenes.halfN.setT(0);
    return window.NotesScenes.halfN.snapshot();
  })()`);
  assert.equal(n.total, 40);
  assert.equal(n.tDays, 0);
  assert.equal(n.remaining, 40);
  assert.equal(n.decayed, 0);
  assert.equal(n.conserved, true);
  assert.equal(n.deadVisible, false);
  assert.equal(n.deadHeight, 0);
  assert.ok(Math.abs(n.remaining + n.decayed - 40) < 1e-6);
  if (evidenceDir) {
    await cdp.evaluate("window.NotesScenes.halfN.setT(0)");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 200))");
    await cdp.screenshot(path.join(evidenceDir, "26-1-halfn-t0-no-grey-stack.png"), "#halfn-vis");
    await cdp.evaluate("window.NotesScenes.halfN.setT(8)");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 200))");
    await cdp.screenshot(path.join(evidenceDir, "26-1-halfn-one-half-life.png"), "#halfn-vis");
    await cdp.screenshot(path.join(evidenceDir, "26-1-dice-replay.png"), "#decay-vis");
  }
});

chromeTest("student pages hide intake chrome and keep per-box scale", async () => {
  for (const page of ["index.html", "26-1.html", "26-2.html", "26-3.html", "summary.html"]) {
    await cdp.goto(pageUrl(page));
    const info = await cdp.evaluate(`(function () {
      var text = document.body.innerText;
      var stages = Array.from(document.querySelectorAll(".visual.play.stage"));
      var boxes = stages.map(function (stage) {
        var plus = stage.querySelector("[data-box-scale='up']");
        var minus = stage.querySelector("[data-box-scale='down']");
        return { ok: !!(plus && minus), plus: plus && plus.textContent.trim(), minus: minus && minus.textContent.trim() };
      });
      return {
        text: text,
        scripts: Array.from(document.querySelectorAll("script[src]")).map(function (s) { return s.getAttribute("src"); }),
        stageCount: stages.length,
        boxes: boxes,
        brand: document.querySelector(".brand") && document.querySelector(".brand").getAttribute("href")
      };
    })()`);
    assert.doesNotMatch(info.text, /PHY150/);
    assert.doesNotMatch(info.text, /QB_502/);
    assert.doesNotMatch(info.text, /printed p/);
    assert.doesNotMatch(info.text, /textbook order/i);
    assert.doesNotMatch(info.text, /\bOCR\b/);
    assert.ok(info.scripts.every((src) => src && !/https?:\/\//.test(src)), "no remote scripts on " + page);
    assert.equal(info.brand, "../index.html");
    if (page === "index.html" || page === "summary.html") continue;
    assert.ok(info.stageCount > 0, "expected stages on " + page);
    info.boxes.forEach(function (box) {
      assert.equal(box.ok, true, "scale buttons missing on " + page);
      assert.equal(box.plus, "+");
      assert.equal(box.minus, "−");
    });
  }
});

chromeTest("26.1 concept check marks the random-decay answer", async () => {
  await cdp.goto(pageUrl("26-1.html"));
  const result = await cdp.evaluate(`(function () {
    var box = document.querySelector('[data-check="mc"]');
    var btn = box.querySelector('[data-choice="D"]');
    var explain = box.querySelector(".explain");
    var hiddenBefore = explain.hidden;
    btn.click();
    return {
      ok: btn.classList.contains("correct"),
      feedback: box.querySelector(".feedback").textContent,
      hiddenBefore: hiddenBefore,
      explainShown: !explain.hidden,
      stem: box.querySelector("p").textContent
    };
  })()`);
  assert.equal(result.ok, true);
  assert.match(result.feedback, /Correct/);
  assert.match(result.stem, /random/);
  assert.equal(result.hiddenBefore, true);
  assert.equal(result.explainShown, true, "reasoning shown after answering");
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "26-1-concept-check.png"), "[data-check='mc']");
  }
});

chromeTest("26.2 leak, smoke, and C-14 alive equals just-dead", async () => {
  await cdp.goto(pageUrl("26-2.html"));
  await waitFor(async () => {
    const ok = await cdp.evaluate("!!(window.NotesScenes && window.NotesScenes.pipeline && window.NotesScenes.smoke && window.NotesScenes.dating)");
    if (!ok) throw new Error("26.2 scenes missing");
    return true;
  }, 8000, "26.2 scenes");
  const uses = await cdp.evaluate(`(function () {
    var table = document.querySelector('#chooser table.notes');
    return {
      useButtons: document.querySelectorAll('[data-use], .use-grid').length,
      headers: table ? Array.from(table.querySelectorAll('thead th')).map(function (th) { return th.textContent.trim(); }) : [],
      rows: table ? table.querySelectorAll('tbody tr').length : 0,
      text: table ? table.innerText : ""
    };
  })()`);
  assert.equal(uses.useButtons, 0, "row-highlight buttons above the uses table were removed");
  assert.deepEqual(uses.headers, ["Use", "Radiation, and why", "Half-life, and why"]);
  assert.ok(uses.rows >= 8, "uses table lists every application, rows=" + uses.rows);
  assert.match(uses.text, /γ for steel or lead/, "gauge row gives the γ-for-dense-material rule");
  assert.match(uses.text, /14\.3 d/, "P-32 half-life follows the DSE value");
  await cdp.evaluate("window.NotesScenes.pipeline.setLeak(true)");
  const leakOn = await cdp.evaluate("window.NotesScenes.pipeline.snapshot()");
  assert.equal(leakOn.leak, true);
  assert.equal(leakOn.kind, "gamma");
  assert.ok(leakOn.count > 100);
  await cdp.evaluate("window.NotesScenes.pipeline.setLeak(false)");
  const leakOff = await cdp.evaluate("window.NotesScenes.pipeline.snapshot()");
  assert.ok(leakOff.count < leakOn.count);
  await cdp.evaluate("window.NotesScenes.smoke.setFire(true)");
  const fire = await cdp.evaluate("window.NotesScenes.smoke.snapshot()");
  assert.equal(fire.alarm, true);
  assert.equal(fire.currentOn, false);
  assert.equal(fire.source, "alpha");
  const age = await cdp.evaluate("window.NotesScenes.dating.snapshot()");
  assert.equal(age.aliveEqualsJustDead, true);
  await cdp.evaluate("window.NotesScenes.dating.setAge(2)");
  const half = await cdp.evaluate("window.NotesScenes.dating.snapshot()");
  assert.equal(half.frac, 0.5);
  if (evidenceDir) {
    await cdp.evaluate("window.NotesScenes.pipeline.setLeak(true)");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 250))");
    await cdp.screenshot(path.join(evidenceDir, "26-2-pipeline-leak.png"), "#pipeline-vis");
    await cdp.evaluate("window.NotesScenes.smoke.setFire(true)");
    await cdp.evaluate("new Promise((r) => setTimeout(r, 250))");
    await cdp.screenshot(path.join(evidenceDir, "26-2-smoke-alarm.png"), "#smoke-vis");
    await cdp.screenshot(path.join(evidenceDir, "26-2-c14-dating.png"), "#dating-vis");
  }
});

chromeTest("26.3 sievert check and activity vs dose labels", async () => {
  await cdp.goto(pageUrl("26-3.html"));
  await waitFor(async () => {
    const ok = await cdp.evaluate("!!(window.NotesScenes && window.NotesScenes.dose)");
    if (!ok) throw new Error("dose scene missing");
    return true;
  }, 8000, "dose scene");
  const dose = await cdp.evaluate("window.NotesScenes.dose.snapshot()");
  assert.match(dose.activityLabel, /activity/i);
  assert.match(dose.activityLabel, /Bq/);
  assert.match(dose.doseLabel, /dose/i);
  assert.match(dose.doseLabel, /Sv/);
  const pick = await cdp.evaluate(`(function () {
    var box = Array.from(document.querySelectorAll('[data-check="mc"]')).find(function (el) {
      return /equivalent dose/.test(el.textContent);
    });
    box.querySelector('[data-choice="A"]').click();
    return {
      ok: box.querySelector('[data-choice="A"]').classList.contains("correct"),
      choice: box.querySelector('[data-choice="A"]').textContent.trim(),
      doseTable: /Radiation weighting factor/.test(document.body.innerText),
      mechanism: /DNA/.test(document.body.innerText)
    };
  })()`);
  assert.equal(pick.ok, true);
  assert.match(pick.choice, /sievert/);
  assert.equal(pick.doseTable, true, "weighting factors are on the page");
  assert.equal(pick.mechanism, true, "the harm mechanism is stated");
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "26-3-activity-vs-dose.png"), "#dose-vis");
  }
});

chromeTest("Ch.2 pages show syllabus LOs without DSE chips; papers live in section quizzes", async () => {
  for (const page of ["26-1.html", "26-2.html", "26-3.html", "summary.html"]) {
    await cdp.goto(pageUrl(page));
    const info = await cdp.evaluate(`(function () {
      var lo = document.querySelector(".lo-block");
      var scripts = Array.from(document.querySelectorAll("script[src]")).map(function (s) {
        return s.getAttribute("src") || "";
      });
      return {
        heading: lo && lo.querySelector("h2") && lo.querySelector("h2").textContent,
        stem: lo && lo.innerText,
        remote: scripts.some(function (src) { return /^https?:\\/\\//.test(src); }),
        katexJs: scripts.some(function (src) { return /vendor\\/katex\\/katex\\.min\\.js$/.test(src); })
      };
    })()`);
    assert.match(info.heading, /Learning objectives/i);
    assert.match(info.stem, /Students should be able to/);
    assert.equal(info.remote, false, "no remote scripts on " + page);
    assert.equal(info.katexJs, true, "local KaTeX missing on " + page);
  }

  await cdp.goto(pageUrl("26-1.html"));
  const decay = await waitFor(async () => {
    const info = await cdp.evaluate(`(function () {
      var lo = document.querySelector(".lo-block");
      return {
        katex: !!document.querySelector(".katex"),
        exp: lo && lo.innerText
      };
    })()`);
    if (!info.katex) throw new Error("katex not rendered");
    return info;
  }, 8000, "KaTeX on 26.1");
  assert.match(decay.exp, /exponential law of decay/);
  assert.match(decay.exp, /N\s*=\s*N/);

  await cdp.goto(pageUrl("summary.html"));
  const bank = await cdp.evaluate(`(function () {
    return {
      n: document.querySelectorAll(".dse-paper").length,
      hasBank: !!document.querySelector(".dse-bank"),
      hasLabels: !!document.querySelector(".dse-labels")
    };
  })()`);
  assert.equal(bank.hasBank, false, "summary must not dump the classified set");
  assert.equal(bank.n, 0, "DSE papers belong in section quizzes, n=" + bank.n);
  assert.equal(bank.hasLabels, false);
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "ch02-summary-lo-block.png"), ".lo-block");
  }

  await cdp.goto(pageUrl("26-1.html"));
  await waitFor(async () => {
    const ok = await cdp.evaluate("!!document.querySelector('.lo-block .katex')");
    if (!ok) throw new Error("KaTeX missing in 26.1 LO");
    return true;
  }, 8000, "26.1 LO KaTeX");
  assert.equal(await cdp.evaluate("!!document.querySelector('.lo-block .dse-labels')"), false);
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "ch02-26-1-lo-katex.png"), ".lo-block");
  }

  await cdp.goto(pageUrl("26-2.html"));
  const quiz2021 = await waitFor(async () => {
    const info = await cdp.evaluate(`(function () {
      var next = document.querySelector("[data-quiz-next]");
      var fig = document.getElementById("dse-mc-2021-33");
      if (fig && !fig.classList.contains("is-current") && next && !next.disabled) next.click();
      fig = document.getElementById("dse-mc-2021-33");
      var img = fig && fig.querySelector("img");
      var cap = fig && fig.querySelector("figcaption");
      return {
        href: location.href,
        caption: cap && cap.textContent,
        loaded: !!(img && img.complete && img.naturalWidth > 0),
        hidden: !!(fig && !fig.classList.contains("is-current")),
        src: img && img.getAttribute("src"),
        loChip: !!document.querySelector('.lo-block a[href*="dse-mc-2021-33"]')
      };
    })()`);
    if (info.loChip) throw new Error("LO chip still present");
    if (!info.loaded || info.hidden) throw new Error("2021/33 not shown in 26.2 quiz");
    return info;
  }, 10000, "26.2 quiz 2021/33");
  assert.match(quiz2021.href, /26-2\.html/);
  assert.match(quiz2021.caption || "", /2021\/33 MC/);
  assert.match(quiz2021.src || "", /mc\/25\/2021_q33\.png$/);
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "ch02-26-2-quiz-2021-33.png"), "#dse-mc-2021-33");
  }

  await cdp.goto(ch1Url("25-2.html"));
  const ch1 = await waitFor(async () => {
    const info = await cdp.evaluate(`(function () {
      var next = document.querySelector("[data-quiz-next]");
      var fig = document.getElementById("dse-mc-2021-33");
      if (fig && !fig.classList.contains("is-current") && next && !next.disabled) next.click();
      fig = document.getElementById("dse-mc-2021-33");
      var img = fig && fig.querySelector("img");
      return {
        src: img && img.getAttribute("src"),
        loaded: !!(img && img.complete && img.naturalWidth > 0),
        hidden: !!(fig && !fig.classList.contains("is-current")),
        caption: fig && fig.querySelector("figcaption") && fig.querySelector("figcaption").textContent
      };
    })()`);
    if (!info.loaded || info.hidden) throw new Error("Ch.1 2021/33 not shown");
    return info;
  }, 8000, "Ch.1 2021/33 still embedded");
  assert.match(ch1.src || "", /mc\/25\/2021_q33\.png$/);
  assert.match(ch1.caption || "", /2021\/33 MC/);
  if (evidenceDir) {
    await cdp.screenshot(path.join(evidenceDir, "ch01-25-2-dse-mc-2021-33.png"), "#dse-mc-2021-33");
  }
});

chromeTest("Book 5 hub and chapter maps keep objectives on subsection pages", async () => {
  await cdp.goto(book5Url("index.html"));
  const menu = await cdp.evaluate(`(function () {
    var cards = Array.from(document.querySelectorAll(".chapter-cards a"));
    return {
      nCards: cards.length,
      title: document.querySelector("h1") && document.querySelector("h1").textContent,
      hasLo: !!document.querySelector(".lo-block"),
      hasDseBank: !!document.querySelector(".dse-bank"),
      nPapers: document.querySelectorAll(".dse-paper").length,
      hasNuclearLink: !!document.querySelector('a[href="#nuclear-energy"]'),
      remote: Array.from(document.querySelectorAll("script[src]")).some(function (s) {
        return /^https?:\\/\\//.test(s.getAttribute("src") || "");
      })
    };
  })()`);
  assert.equal(menu.nCards, 2);
  assert.match(menu.title, /Radiation chapters/i);
  assert.equal(menu.hasLo, false, "the hub must not contain Chapter 3 learning objectives");
  assert.equal(menu.hasDseBank, false, "DSE banks belong on chapter pages, not the hub");
  assert.equal(menu.nPapers, 0, "the hub must not embed DSE papers");
  assert.equal(menu.hasNuclearLink, false, "the hub must not link to an absent Chapter 3 section");
  assert.equal(menu.remote, false);

  for (const [label, url] of [
    ["Ch.1 map", ch1Url("index.html")],
    ["Ch.2 map", pageUrl("index.html")]
  ]) {
    await cdp.goto(url);
    const map = await cdp.evaluate(`({
      hasLo: !!document.querySelector(".lo-block"),
      hasDseBank: !!document.querySelector(".dse-bank"),
      nPapers: document.querySelectorAll(".dse-paper").length
    })`);
    assert.equal(map.hasLo, false, label + " must leave learning objectives to its subsection pages");
    assert.equal(map.hasDseBank, false, label + " must not become a DSE bank");
    assert.equal(map.nPapers, 0, label + " must not embed DSE papers");
  }
});

chromeTest("each Ch.2 subsection quizzes its DSE papers one at a time", async () => {
  const expected = {
    "26-1.html": ["dse-mc-2020-30", "dse-mc-2012-35", "dse-mc-2023-31", "dse-mc-2024-32", "dse-mc-2019-32", "dse-mc-2025-31", "dse-mc-sap-35", "dse-mc-2020-32", "dse-mc-2016-33", "dse-lq-2021-9"],
    "26-2.html": ["dse-mc-2024-33", "dse-mc-2015-33", "dse-lq-2014-10", "dse-lq-2017-10", "dse-lq-2018-10", "dse-lq-2026-12"],
    "26-3.html": ["dse-mc-2026-32", "dse-lq-2021-9"]
  };

  for (const [page, expectedIds] of Object.entries(expected)) {
    let practice;
    try {
      await cdp.goto(pageUrl(page));
    } catch (err) {
      throw new Error(page + " navigation: " + err.message);
    }
    try {
      practice = await cdp.evaluate(`(function () {
        var section = document.querySelector(".section-dse");
        var slides = [];
        if (section) {
          var items = section.querySelectorAll(".quiz-slide");
          for (var i = 0; i < items.length; i += 1) {
            slides.push(items[i].id);
          }
        }
        var visible = section ? Array.prototype.filter.call(section.querySelectorAll(".quiz-slide"), function (s) { return s.classList.contains("is-current"); }) : [];
        var firstImg = visible[0] && visible[0].querySelector("img");
        return {
          heading: section && section.querySelector("h2") && section.querySelector("h2").textContent,
          slides: slides,
          visible: visible.length,
          paper: !!(firstImg && firstImg.complete && firstImg.naturalWidth > 0),
          hasPrev: !!(section && section.querySelector("[data-quiz-prev]")),
          hasNext: !!(section && section.querySelector("[data-quiz-next]"))
        };
      })()`);
    } catch (err) {
      throw new Error(page + " practice panel: " + err.message);
    }
    assert.match(practice.heading || "", /check the learning objectives/i);
    assert.equal(practice.hasPrev, true, page + " needs Prev");
    assert.equal(practice.hasNext, true, page + " needs Next");
    assert.equal(practice.visible, 1, page + " must show one quiz item");
    assert.ok(practice.paper, page + " should include a topic-matched DSE paper");
    for (const id of expectedIds) {
      assert.ok(practice.slides.includes(id), page + " missing " + id);
    }
  }

  await cdp.goto(pageUrl("26-2.html"));
  const target = await waitFor(async () => {
    const found = await cdp.evaluate(`(function () {
      var paper = document.getElementById("dse-mc-2024-33");
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
  assert.match(target.href, /26-2\.html/);
});
});
