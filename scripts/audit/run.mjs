#!/usr/bin/env node
/**
 * run.mjs — Global concurrency pool, resume, cache (plan §§4.3-4.7, 5 P2 detail)
 *
 * Features per plan:
 * - Global concurrency pool with configurable size and failure back-off
 * - Resume: reuse results only when the current input cache key matches
 * - Cache keyed by item, image, bundle, mapping, prompt, code, model, pi version, and sample count
 * - Prompts are versioned via sha256
 * - Supports --bank, --all, --regress, --fixture, --concurrency
 *
 * Never pastes QB stems into notes/ or PR (plan D3).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { pagesForBank, cumulativePagesForBank } from "./bank-pages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const execFileAsync = promisify(execFile);

function sha256Hex(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function readPromptSha(name) {
  try { return sha256Hex(fs.readFileSync(path.join(__dirname, "prompts", name), "utf8")); } catch { return "no-prompt"; }
}
function getPiVersion() {
  try { return spawnSync(process.env.PI_BIN || "pi", ["--version"], { encoding: "utf8" }).stdout.trim() || "unknown"; } catch { return "unknown"; }
}
function cacheKey(itemSha, bundleSha, promptSha, model, piVersion) {
  return sha256Hex([itemSha, bundleSha, promptSha, model, piVersion].join("|"));
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function parseArgs(argv) {
  const out = {
    all: false, bank: null, fixture: null, concurrency: 8, regress: false, outDir: path.join(repoRoot, ".audit/results"),
    bundleOut: path.join(repoRoot, ".audit/bundles"),
    cacheDir: path.join(repoRoot, ".audit/cache"),
    mappingDir: path.join(repoRoot, ".audit/mapping"),
    k: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--bank" && argv[i+1]) out.bank = argv[++i];
    else if (a === "--fixture" && argv[i+1]) out.fixture = path.resolve(argv[++i]);
    else if (a === "--concurrency" && argv[i+1]) out.concurrency = parseInt(argv[++i], 10);
    else if (a === "--regress") out.regress = true;
    else if (a === "--k" && argv[i+1]) out.k = parseInt(argv[++i], 10);
    else if (a === "--out" && argv[i+1]) out.outDir = path.resolve(argv[++i]);
    else if (a === "--cache-dir" && argv[i+1]) out.cacheDir = path.resolve(argv[++i]);
    else if (a === "--bundle-out" && argv[i+1]) out.bundleOut = path.resolve(argv[++i]);
  }
  return out;
}

// Simple p-limit
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (queue.length === 0 || active >= concurrency) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(
      (v) => { active--; resolve(v); next(); },
      (e) => { active--; reject(e); next(); }
    );
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

async function buildBundle(pages, outDir) {
  ensureDir(outDir);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await execFileAsync(process.execPath, [path.join(__dirname, "bundle.mjs"), ...pages, "--out", outDir], { encoding: "utf8", timeout: 390000 });
      return JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"));
    } catch (error) {
      if (attempt === 1) throw new Error(`Bundle failed: ${error.stderr || error.stdout || error}`);
    }
  }
}

async function buildBundleForBank(bank, bundleOut) {
  return buildBundle(cumulativePagesForBank(repoRoot, bank), path.join(bundleOut, bank));
}

function loadItemsForBank(bank, fixture) {
  const candidates = [];
  if (fixture) candidates.push(fixture);
  candidates.push(path.join(repoRoot, `paper2db/qb-pdf/items/${bank}.json`));
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      return { data, file: p };
    }
  }
  throw new Error(`No item file for ${bank}`);
}

function loadBundleSha(bundleDir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(bundleDir, "manifest.json"), "utf8"));
    return m.bundle_sha || m.notes_md?.sha256 || sha256Hex(fs.readFileSync(path.join(bundleDir, "notes.md"), "utf8"));
  } catch {
    return "no-bundle";
  }
}

async function processItem(item, bank, opts) {
  const { outDir, bundleDir, cacheDir, k, regress } = opts;
  const mappingFile = path.join(opts.mappingDir, `${bank}.json`);
  const mapping = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
  const mapped = mapping.mappings?.find(x => x.id === item.id);
  const pages = pagesForBank(repoRoot, bank);
  const sectionPages = pages.filter(p => path.basename(p) !== "summary.html");
  const sectionForTier = mapped?.section || "unknown";
  const chosen = sectionPages.find(p => path.basename(p, ".html") === sectionForTier);
  const sPages = mapped?.confidence >= 0.6 && chosen ? [chosen] : sectionPages;
  const summary = pages.filter(p => path.basename(p) === "summary.html");
  const sBundle = path.join(opts.bundleOut, bank, "S", mapped?.confidence >= 0.6 && chosen ? sectionForTier : "all");
  const sectionKey = JSON.stringify([sBundle, ...sPages, ...summary]);
  if (!opts.builtSections.has(sectionKey)) opts.builtSections.set(sectionKey, buildBundle([...sPages, ...summary], sBundle));
  await opts.builtSections.get(sectionKey);
  const bundleSha = [loadBundleSha(sBundle), loadBundleSha(bundleDir)].join(":");
  const itemSha = sha256Hex(JSON.stringify(item));
  const promptSha = sha256Hex(["solver.system.md", "solver.user.md", "judge.system.md", "prior.md", "map.system.md"].map(readPromptSha).join("|"));
  const piVersion = getPiVersion();
  const model = "meta/muse-spark-1.2-contributor";
  const imageSha = sha256Hex([...(item.images?.stem || []), ...(item.images?.answer || [])].map(image => sha256Hex(fs.readFileSync(path.resolve(repoRoot, image)))).join("|"));
  const mappingSha = sha256Hex(JSON.stringify(mapped || null));
  const codeSha = sha256Hex(["run.mjs", "bundle.mjs", "map.mjs", "solve.mjs", "judge.mjs", "bank-pages.mjs"].map(name => sha256Hex(fs.readFileSync(path.join(__dirname, name)))).join("|"));
  const key = cacheKey(itemSha, bundleSha, promptSha, model, [piVersion, mappingSha, imageSha, codeSha, k].join("|"));
  const cachePath = path.join(cacheDir, `${key}.json`);
  const resultPath = path.join(outDir, bank, `${item.id}.json`);
  if (!regress && fs.existsSync(resultPath)) {
    const existing = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    if (existing.verdict !== "error" && existing.cache_key === key) return { id: item.id, cached: "result", result: existing };
  }
  if (!regress && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (cached.verdict !== "error" && cached.cache_key === key) {
      ensureDir(path.dirname(resultPath));
      fs.writeFileSync(resultPath, JSON.stringify(cached, null, 2));
      return { id: item.id, cached: "cache", result: cached };
    }
  }

  // Call solve K times + judge each
  const solveScript = path.join(__dirname, "solve.mjs");
  const judgeScript = path.join(__dirname, "judge.mjs");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-item-"));
  const tiers = { S: { samples: [] }, B: { samples: [] } };
  try {
    const tmpItem = path.join(tmpDir, "item.json");
    fs.writeFileSync(tmpItem, JSON.stringify(item), "utf8");

    for (const tier of ["S", "B"]) {
      const tierBundle = tier === "S" ? sBundle : bundleDir;
      for (let sample = 0; sample < k; sample++) {
        // Solve
        const solveOut = path.join(tmpDir, `solve-${tier}-${sample}.json`);
        const solveArgs = ["node", solveScript, "--item", tmpItem, "--bundle", tierBundle, "--out", solveOut, "--sample", String(sample)];
        let sRes;
        try { await execFileAsync(process.execPath, solveArgs.slice(1), { cwd: repoRoot, encoding: "utf8", timeout: 180000, maxBuffer: 20 * 1024 * 1024, env: process.env }); sRes = { status: 0 }; }
        catch (error) { sRes = { status: error.code || 1, error, stderr: error.stderr }; }
        let solveData;
        try { solveData = JSON.parse(fs.readFileSync(solveOut, "utf8")); } catch {}
        if (sRes.status !== 0 || solveData?.error || solveData?.solver?._fallback || !solveData) {
          const error = [sRes.error && String(sRes.error), sRes.status !== 0 && `solve exited ${sRes.status}`, solveData?.error, solveData?.raw, sRes.stderr].filter(Boolean).join("; ").slice(0, 4000);
          tiers[tier].samples.push({ error: error || "solve produced no result", judge: { cause: "execution-error" } });
          try { fs.unlinkSync(solveOut); } catch {}
          continue;
        }
        // Judge
        const judgeOut = path.join(tmpDir, `judge-${tier}-${sample}.json`);
        const judgeArgs = ["node", judgeScript, "--solve", solveOut, "--item", tmpItem, "--bundle", tierBundle, "--out", judgeOut];
        let judgeError;
        try { await execFileAsync(process.execPath, judgeArgs.slice(1), { cwd: repoRoot, encoding: "utf8", timeout: 180000, maxBuffer: 20 * 1024 * 1024, env: process.env }); }
        catch (error) { judgeError = error; }
        try {
          const judgeData = JSON.parse(fs.readFileSync(judgeOut, "utf8"));
          if (judgeError || judgeData.error || judgeData.judge?.cause === "unjudged") throw new Error(String(judgeError?.stderr || judgeError || judgeData.error || "judge returned unjudged"));
          tiers[tier].samples.push({ answer: solveData.solver || solveData, judge: judgeData.judge || judgeData, quote_check: judgeData.quote_check, leakage: judgeData.leakage });
          // cleanup tmp solve/judge
          try { fs.unlinkSync(solveOut); } catch {}
          try { fs.unlinkSync(judgeOut); } catch {}
        } catch (e) {
          tiers[tier].samples.push({ error: String(e), judge: { cause: "execution-error" } });
        }
      }
      // Verdict per tier: need ≥2 of 3 samples satisfying condition (plan §4.7)
      // For K=3 need 2, for K=1 need 1, general ceil(K*2/3).
      const need = Math.max(1, Math.ceil(tiers[tier].samples.length * 2 / 3));
      const passCount = tiers[tier].samples.filter(s => {
        const j = s.judge || {};
        return j.cause === "ok" && s.quote_check?.passed === true && !j.step_judgements?.some(step => step.verdict !== "supported") && (item.type === "mc" ? j.mc_correct === true : Array.isArray(j.marking) && j.marking.length > 0 && j.marking.every(point => point.verdict === "earned"));
      }).length;
      tiers[tier].verdict = passCount >= need ? "pass" : (tiers[tier].samples.some(s => s.judge.cause === "execution-error") ? "error" : tiers[tier].samples.some(s => s.judge.cause === "knowledge-gap") ? "gap" : "fail");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Determine overall verdict per plan §4.7
  // pass / pass-leaked / cross-ref / gap / reasoning / defect
  let verdict = "gap";
  const leaked = tiers.S.samples.some(s => s.leakage?.leaked) || tiers.B.samples.some(s => s.leakage?.leaked);
  const isDefect = tiers.S.samples.some(s => s.judge.cause === "item-defect" || s.judge.cause === "key-defect");
  if (tiers.S.verdict === "error" || tiers.B.verdict === "error") verdict = "error";
  else if (isDefect) verdict = "defect";
  else if (tiers.S.verdict === "pass") verdict = leaked ? "pass-leaked" : "pass";
  else if (tiers.B.verdict === "pass" && tiers.S.verdict !== "pass") verdict = "cross-ref";
  else if (tiers.S.samples.some(s => s.judge.cause === "knowledge-gap") || tiers.B.samples.some(s => s.judge.cause === "knowledge-gap")) verdict = "gap";
  else verdict = "reasoning";

  const result = {
    id: item.id,
    bank,
    section: sectionForTier || "unknown",
    mapping_conf: mapped?.confidence ?? 0,
    notes_ref: { repo: "paper2notes", sha: (() => { try { return spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim(); } catch { return "unknown"; } })() },
    tier_bundle_sha: { S: loadBundleSha(sBundle), B: loadBundleSha(bundleDir) },
    run: { pi: piVersion, model, solver_thinking: "high", judge_thinking: "max", prompt_sha: promptSha, at: new Date().toISOString() },
    tiers,
    verdict,
    leaked,
    bundle_sha: bundleSha,
    prompt_sha: promptSha,
    pi_version: piVersion,
    cache_key: key,
  };
  // Write cache and result
  ensureDir(path.dirname(resultPath));
  ensureDir(cacheDir);
  if (verdict !== "error") fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), "utf8");
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
  return { id: item.id, cached: false, result };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.fixture && opts.all) throw new Error("--fixture requires one --bank");
  ensureDir(opts.outDir);
  ensureDir(opts.cacheDir);
  ensureDir(opts.bundleOut);

  const banks = [];
  if (opts.all) {
    // 21 banks per plan §3.2 table
    const allBanks = ["QB_201","QB_202","QB_203","QB_204","QB_205","QB_206","QB_207","QB_208","QB_209","QB_210","QB_401","QB_402","QB_403","QB_404","QB_405","QB_406","QB_407","QB_408","QB_501","QB_502","QB_503"];
    banks.push(...allBanks);
  } else if (opts.bank) {
    banks.push(opts.bank);
  } else {
    banks.push("QB_501");
  }

  console.log(`Run harness: banks=${banks.join(",")} concurrency=${opts.concurrency} k=${opts.k} regress=${opts.regress}`);
  console.log(`PI_BIN=${process.env.PI_BIN || "pi"} pi=${getPiVersion()} model=meta/muse-spark-1.2-contributor`);

  // Build bundles
  for (const bank of banks) {
    await buildBundleForBank(bank, opts.bundleOut);
  }

  // Build mappings (map.mjs)
  for (const bank of banks) {
      const mapScript = path.join(__dirname, "map.mjs");
      const bundleDir = path.join(opts.bundleOut, bank);
      const fixture = opts.fixture;
      const args = ["node", mapScript, "--bank", bank, "--out", opts.mappingDir, "--bundle", bundleDir];
      if (fixture) args.push("--fixture", fixture);
      if (opts.regress) args.push("--force");
      console.log(`Mapping ${bank}...`);
      const r = spawnSync(process.execPath, args.slice(1), { encoding: "utf8", env: process.env });
      if (r.status !== 0) throw new Error(`map ${bank} failed: ${r.stderr?.slice(0, 500)}`);
  }

  // Process items with global concurrency pool
  const limit = pLimit(opts.concurrency);
  let total = 0;
  let completed = 0;
  let failed = 0;
  opts.builtSections = new Map();
  const start = Date.now();
  const backoff = { failures: 0 };

  const pending = [];
  for (const bank of banks) {
    const { data: itemData } = loadItemsForBank(bank, opts.fixture);
    const items = itemData.items || [];
    total += items.length;
    const bundleDir = path.join(opts.bundleOut, bank);
    const promises = items.map(item => limit(async () => {
      // Back-off on 429 simulation: if failures >3, pause
      if (backoff.failures > 5) {
        console.log("Backing off due to failures...");
        await new Promise(r => setTimeout(r, 5000));
        backoff.failures = 0;
      }
      try {
        const res = await processItem(item, bank, { ...opts, bundleDir });
        completed++;
        if (res.result.verdict === "error") failed++;
        if (completed % 10 === 0 || completed === total) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          console.log(`Progress ${completed}/${total} (${((completed/total)*100).toFixed(1)}%) elapsed ${elapsed}s`);
        }
        return res;
      } catch (e) {
        failed++;
        backoff.failures++;
        console.error(`Item ${item.id} failed: ${e.message}`);
        const defectPath = path.join(opts.outDir, bank, `${item.id}.json`);
        ensureDir(path.dirname(defectPath));
        fs.writeFileSync(defectPath, JSON.stringify({ id: item.id, bank, verdict: "error", error: String(e) }, null, 2), "utf8");
        return null;
      }
    }));
    pending.push(...promises);
  }
  await Promise.all(pending);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done: ${completed}/${total} in ${elapsed}s, concurrency ${opts.concurrency}`);
  console.log(`Results: ${opts.outDir}`);
  console.log(`Cache: ${opts.cacheDir} (keyed by item sha + bundle sha + prompt sha + model + pi version)`);
  if (failed || completed !== total) process.exitCode = 1;

}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
