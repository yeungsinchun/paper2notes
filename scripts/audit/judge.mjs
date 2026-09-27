#!/usr/bin/env node
/**
 * judge.mjs — Judge + deterministic quote check (plan §4.6)
 *
 * Each solver sample goes through three checks:
 * 1. Deterministic quote check (no LLM): every notes: step's quote must
 *    fuzzy-match notes.md under the cited anchor (token-set ratio ≥0.9),
 *    every prior id must exist, steps failing are marked unsupported.
 * 2. Judge call: separate pi -p --no-tools call that DOES receive the key,
 *    worked answer, marking scheme and answer crop, plus same bundle and
 *    solver output. Returns cause ∈ {ok, knowledge-gap, reasoning-error, item-defect, key-defect}
 *    and per-point marking.
 * 3. Leakage/overlap check: 8-gram overlap and number-tuple overlap between
 *    item stem and every notes block. Tagged leaked → pass-leaked.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function sha256Hex(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function readPrompt(n) { return fs.readFileSync(path.join(__dirname, "prompts", n), "utf8"); }
function extractJsonBlock(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  try { return JSON.parse(text); } catch {}
  return null;
}
function normalizeTokens(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}
function tokenSetRatio(quote, block) {
  const sq = new Set(normalizeTokens(quote));
  const sb = new Set(normalizeTokens(block));
  if (!sq.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sq) if (sb.has(t)) inter++;
  // quote coverage: how many quote tokens appear in block
  return inter / sq.size;
}

function deterministicQuoteCheck(solverOutput, notesMd) {
  const issues = [];
  const steps = solverOutput.steps || [];
  // Build anchor -> block map from notes.md (rough: split by headings)
  const blockMap = new Map();
  // headings like ### [§25-1.B #knockout] or #### [Fig ...]
  const headingRe = /^#{2,4}\s+\[([^\]]+)\]/gm;
  let lastIdx = 0;
  let lastAnchor = "preamble";
  // simple split
  const lines = notesMd.split("\n");
  let currentAnchor = "preamble";
  let currentBlock = [];
  const blocks = new Map();
  blocks.set(currentAnchor, []);
  for (const line of lines) {
    const h = line.match(/^#{2,4}\s+\[([^\]]+)\]/);
    if (h) {
      blocks.set(currentAnchor, currentBlock.join("\n"));
      currentAnchor = h[1].trim();
      // normalize anchor: extract #id part
      const hashM = currentAnchor.match(/#([^\]]+)/);
      if (hashM) currentAnchor = hashM[1].trim();
      else currentAnchor = currentAnchor.replace(/[^a-z0-9_-]/gi, "-");
      currentBlock = [];
      blocks.set(currentAnchor, "");
    } else {
      currentBlock.push(line);
    }
  }
  blocks.set(currentAnchor, currentBlock.join("\n"));

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const src = st.source || "";
    if (src.startsWith("notes:")) {
      const anchorPart = src.split(":")[1] || "";
      // anchor may be like 25-1.B#knockout or notes:25-1.B#knockout
      let anchor = anchorPart;
      if (anchor.includes("#")) anchor = anchor.split("#").pop();
      anchor = anchor.trim();
      const quote = st.quote || "";
      if (!quote) {
        issues.push({ step: i, verdict: "unsupported", reason: "missing quote for notes source" });
        continue;
      }
      // Find block text for anchor
      let blockText = "";
      // try exact, then fallback to contains
      if (blocks.has(anchor)) blockText = blocks.get(anchor);
      else {
        for (const [k, v] of blocks.entries()) {
          if (k.includes(anchor) || anchor.includes(k)) { blockText = v; break; }
        }
        if (!blockText) blockText = notesMd;
      }
      const ratio = tokenSetRatio(quote, blockText);
      if (ratio < 0.9) {
        issues.push({ step: i, verdict: "unsupported", reason: `quote fuzzy ratio ${ratio.toFixed(2)} < 0.9`, anchor, quote: quote.slice(0, 80) });
      }
    } else if (src.startsWith("prior:")) {
      // check prior id exists
      const priorMd = (() => { try { return readPrompt("prior.md"); } catch { return ""; } })();
      const id = src.split(":")[1] || "";
      if (!priorMd.includes(id)) {
        issues.push({ step: i, verdict: "unsupported", reason: `prior id ${id} not in allowlist` });
      }
    } else if (src === "given" || src.startsWith("math:")) {
      // ok
    } else if (!src) {
      issues.push({ step: i, verdict: "unsupported", reason: "empty source" });
    }
  }
  return issues;
}

function overlapCheck(item, notesMd) {
  // 8-gram overlap + number-tuple overlap (plan §4.6.3)
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const stemText = item.stem ? item.stem.text : JSON.stringify(item);
  const itemNorm = norm(stemText);
  const itemTokens = itemNorm.split(/\s+/).filter(Boolean);
  const itemGrams = new Set();
  for (let i = 0; i <= itemTokens.length - 8; i++) {
    itemGrams.add(itemTokens.slice(i, i + 8).join(" "));
  }
  // Extract numbers that are likely physics values (ignore single-digit option numbers 1-4 in isolation)
  const numRe = /[-+]?\d*\.?\d+/g;
  const rawNums = (stemText.match(numRe) || []);
  // Filter out trivial 1-4 that look like option enumerations when they are alone
  const itemNums = rawNums.filter(n => {
    const v = parseFloat(n);
    // Keep numbers with decimals or >4 or with units nearby – heuristic: keep all with >1 char or decimal
    return n.includes(".") || n.length > 1 || v > 4;
  });

  const blocks = notesMd.split(/^#{2,4}\s+\[/m);
  let maxOverlap = 0;
  let leaked = false;
  for (const block of blocks) {
    const blockNorm = norm(block);
    const blockTokens = blockNorm.split(/\s+/).filter(Boolean);
    let overlap = 0;
    for (let i = 0; i <= blockTokens.length - 8; i++) {
      const gram = blockTokens.slice(i, i + 8).join(" ");
      if (itemGrams.has(gram)) overlap++;
    }
    if (overlap > maxOverlap) maxOverlap = overlap;
    if (overlap >= 2) leaked = true;
    // Number-tuple: only if item has >=2 non-trivial numbers and block contains the same ordered tuple as a substring
    if (itemNums.length >= 2 && !leaked) {
      const blockNums = (block.match(numRe) || []).filter(n => n.includes(".") || n.length > 1 || parseFloat(n) > 4);
      const itemTuple = itemNums.slice(0, 3).join(",");
      const blockTupleStr = blockNums.join(",");
      if (blockTupleStr.includes(itemTuple) && itemTuple.length > 3) leaked = true;
    }
  }
  return { leaked, maxOverlap, itemNums: itemNums.slice(0, 5) };
}

function callPiJudge(solverOutput, item, bundleDir) {
  const piBin = process.env.PI_BIN || "pi";
  const systemPrompt = readPrompt("judge.system.md");
  const priorMd = (() => { try { return readPrompt("prior.md"); } catch { return ""; } })();
  let notesMd = "";
  try { notesMd = fs.readFileSync(path.join(bundleDir, "notes.md"), "utf8"); } catch {}

  const answerInfo = item.answer || {};
  const marking = answerInfo.marking || [];
  const key = answerInfo.key || answerInfo.worked || "";

  const userPayload = `Item ${item.id}:
Stem: ${(item.stem && item.stem.text ? item.stem.text : "").slice(0, 3000)}
Answer key: ${JSON.stringify(key).slice(0, 2000)}
Worked: ${(answerInfo.worked || "").slice(0, 3000)}
Marking: ${JSON.stringify(marking).slice(0, 3000)}
Solver output: ${JSON.stringify(solverOutput).slice(0, 8000)}
Notes excerpt (first 8000):
${notesMd.slice(0, 8000)}
Prior:
${priorMd.slice(0, 4000)}
`;

  const tmp = fs.mkdtempSync(path.join("/tmp", "judge-"));
  const systemPath = path.join(tmp, "system.md");
  fs.writeFileSync(systemPath, systemPrompt, "utf8");
  const priorPath = path.join(tmp, "prior.md");
  fs.writeFileSync(priorPath, priorMd, "utf8");

  const attachments = [];
  // Bundle notes
  const notesPath = path.join(bundleDir, "notes.md");
  if (fs.existsSync(notesPath)) attachments.push("@" + notesPath);
  // Fig attachments limited
  if (fs.existsSync(bundleDir)) {
    const figs = fs.readdirSync(bundleDir).filter(f => f.startsWith("fig-") && f.endsWith(".png")).slice(0, 8).map(f => path.join(bundleDir, f));
    for (const f of figs) attachments.push("@" + f);
  }
  // Answer crop if exists (never shown to solver, but judge does see it)
  const ansImg = item.images && item.images.answer && item.images.answer[0] ? path.resolve(repoRoot, item.images.answer[0]) : null;
  if (ansImg && fs.existsSync(ansImg)) attachments.push("@" + ansImg);
  attachments.push("@" + priorPath);

  const args = [
    "-p",
    "--model", "meta/muse-spark-1.2-contributor",
    "--thinking", "max",
    "--no-tools", "--no-extensions", "--no-skills",
    "--no-context-files", "--no-prompt-templates", "--no-themes", "--no-session",
    "--system-prompt", systemPath,
    "--mode", "text",
    ...attachments,
    userPayload,
  ];
  const emptyDir = fs.mkdtempSync(path.join("/tmp", "pi-empty-"));
  const result = spawnSync(piBin, args, { cwd: emptyDir, encoding: "utf8", timeout: 180000, maxBuffer: 20 * 1024 * 1024 });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(emptyDir, { recursive: true, force: true });
  const combined = (result.stdout || "") + "\n" + (result.stderr || "");
  const parsed = extractJsonBlock(combined);
  if (parsed && parsed.cause) return { parsed, raw: combined, error: null };
  // Fallback deterministic judge when pi not available or fake pi returns non-json
  // Heuristic: compare solver answer to key
  const solverAns = solverOutput.answer;
  let mc_correct = null;
  let cause = "ok";
  let markingRes = [];
  if (item.type === "mc" && answerInfo.key) {
    const gotRaw = typeof solverAns === "string" ? solverAns : (solverAns != null ? JSON.stringify(solverAns) : "");
    const got = String(gotRaw).trim().toUpperCase();
    const want = String(answerInfo.key).trim().toUpperCase();
    mc_correct = got.includes(want);
    if (!mc_correct) cause = "knowledge-gap";
  } else if (item.subparts || marking.length) {
    // For structured, if solver blocked -> knowledge-gap
    if (solverOutput.self_verdict === "blocked") cause = "knowledge-gap";
    else if (solverOutput.self_verdict === "partial") cause = "reasoning-error";
    else cause = "ok";
    markingRes = (marking || []).map(m => ({ point: m.point || m.part || "a", verdict: cause === "ok" ? "earned" : "lost-knowledge", concept: cause === "knowledge-gap" ? "missing concept from notes" : undefined }));
  } else {
    if (solverOutput.self_verdict === "blocked") cause = "knowledge-gap";
  }
  // If deterministic quote issues exist, mark prior-leak or unsupported
  const quoteIssues = deterministicQuoteCheck(solverOutput, notesMd);
  const hasUnsupported = quoteIssues.length > 0;
  if (hasUnsupported && cause === "ok") cause = "reasoning-error";

  return {
    parsed: {
      id: item.id,
      step_judgements: quoteIssues.map(q => ({ step: q.step, verdict: q.verdict, reason: q.reason })),
      marking: markingRes,
      mc_correct,
      cause,
      _fallback: true,
      _raw: combined.slice(0, 1000),
    },
    raw: combined,
    error: result.error ? String(result.error) : null,
  };
}

function parseArgs(argv) {
  const out = { solve: null, item: null, bundle: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--solve" && argv[i+1]) out.solve = path.resolve(argv[++i]);
    else if (a === "--item" && argv[i+1]) out.item = path.resolve(argv[++i]);
    else if (a === "--bundle" && argv[i+1]) out.bundle = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i+1]) out.out = path.resolve(argv[++i]);
  }
  return out;
}

async function main() {
  const { solve: solvePath, item: itemPath, bundle, out } = parseArgs(process.argv.slice(2));
  if (!solvePath || !itemPath || !bundle) {
    console.error("Usage: judge.mjs --solve <solve.json> --item <item.json> --bundle <bundleDir> --out <out.json>");
    process.exit(1);
  }
  const solverData = JSON.parse(fs.readFileSync(solvePath, "utf8"));
  const solverOutput = solverData.solver || solverData;
  let item;
  const itemRaw = JSON.parse(fs.readFileSync(itemPath, "utf8"));
  if (itemRaw.items) {
    const id = solverOutput.id || solverData.id;
    item = itemRaw.items.find(x => x.id === id) || itemRaw.items[0];
  } else if (itemRaw.id) {
    item = itemRaw;
  } else {
    item = itemRaw;
  }
  const bundleDir = fs.existsSync(bundle) ? bundle : path.dirname(bundle);
  let notesMd = "";
  try { notesMd = fs.readFileSync(path.join(bundleDir, "notes.md"), "utf8"); } catch {}

  const quoteIssues = deterministicQuoteCheck(solverOutput, notesMd);
  const overlap = overlapCheck(item, notesMd);
  const judgeRes = callPiJudge(solverOutput, item, bundleDir);

  // Merge deterministic issues into judge verdict if needed
  if (quoteIssues.length && judgeRes.parsed.cause === "ok") {
    // keep ok but mark unsupported steps
  }

  const output = {
    id: item.id,
    solver_verdict: solverOutput.self_verdict,
    quote_check: { issues: quoteIssues, passed: quoteIssues.length === 0 },
    leakage: overlap,
    judge: judgeRes.parsed,
    raw: judgeRes.raw.slice(0, 8000),
    run: { pi: (() => { try { return spawnSync(process.env.PI_BIN || "pi", ["--version"], { encoding: "utf8" }).stdout.trim(); } catch { return "unknown"; } })(), model: "meta/muse-spark-1.2-contributor", at: new Date().toISOString() },
  };
  const outPath = out || path.join(path.dirname(solvePath), `${item.id}.judge.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Judge ${item.id} -> ${outPath} cause ${judgeRes.parsed.cause} leaked ${overlap.leaked}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
export { deterministicQuoteCheck, overlapCheck, callPiJudge };
