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
});

chromeTest("Ch.1 and Ch.2 top bars link back to the Book 5 menu", async () => {
  await cdp.goto(ch1Url("25-1.html"));
  const ch1 = await cdp.evaluate(`document.querySelector(".brand").getAttribute("href")`);
  assert.equal(ch1, "../index.html");
  await cdp.goto(pageUrl("26-1.html"));
  const ch2 = await cdp.evaluate(`document.querySelector(".brand").getAttribute("href")`);
  assert.equal(ch2, "../index.html");
});

chromeTest("26.1 dice remaining falls and N+decayed stays 40 billion", async () => {
  await cdp.goto(pageUrl("26-1.html"));
  await waitFor(async () => {
    const ok = await cdp.evaluate("!!(window.NotesScenes && window.NotesScenes.dice && window.NotesScenes.halfN)");
    if (!ok) throw new Error("scenes missing");
    return true;
  }, 8000, "ch2 scenes");
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
  const n = await cdp.evaluate("window.NotesScenes.halfN.snapshot()");
  assert.equal(n.total, 40);
  assert.equal(n.conserved, true);
  assert.ok(Math.abs(n.remaining + n.decayed - 40) < 1e-6);
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
    btn.click();
    return {
      ok: btn.classList.contains("correct"),
      feedback: box.querySelector(".feedback").textContent
    };
  })()`);
  assert.equal(result.ok, true);
  assert.match(result.feedback, /Yes/);
});

chromeTest("26.2 leak, smoke, and C-14 alive equals just-dead", async () => {
  await cdp.goto(pageUrl("26-2.html"));
  await waitFor(async () => {
    const ok = await cdp.evaluate("!!(window.NotesScenes && window.NotesScenes.pipeline && window.NotesScenes.smoke && window.NotesScenes.dating)");
    if (!ok) throw new Error("26.2 scenes missing");
    return true;
  }, 8000, "26.2 scenes");
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
    var box = document.querySelector('[data-check="mc"][data-answer="A"]');
    box.querySelector('[data-choice="A"]').click();
    return box.querySelector('[data-choice="A"]').classList.contains("correct");
  })()`);
  assert.equal(pick, true);
});
});
