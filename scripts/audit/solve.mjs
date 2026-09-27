#!/usr/bin/env node
/**
 * solve.mjs — Notes-only solver (plan §4.5)
 *
 * One item = one stateless pi -p --no-tools process.
 * The solver sees ONLY the NOTES bundle (notes.md + fig-*.png) plus the
 * numbered PRIOR allowlist and the item crop/image. It never sees the
 * answer crop or key.
 *
 * Sampling: K=3 independent samples at thinking high; judge runs at max.
 * No-notes baseline: K=1 with empty NOTES file (for prior-leak calibration).
 *
 * Empty cwd + --no-* flags enforce "only the notes" by construction.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function sha256Hex(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function extractJsonBlock(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  try { return JSON.parse(text); } catch {}
  return null;
}
function readPrompt(name) { return fs.readFileSync(path.join(__dirname, "prompts", name), "utf8"); }

function parseArgs(argv) {
  const out = { item: null, bundle: null, out: null, sample: 0, noNotes: false, model: "meta/muse-spark-1.2-contributor", thinking: "high", k: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--item" && argv[i+1]) out.item = path.resolve(argv[++i]);
    else if (a === "--bundle" && argv[i+1]) out.bundle = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i+1]) out.out = path.resolve(argv[++i]);
    else if (a === "--sample" && argv[i+1]) out.sample = parseInt(argv[++i], 10);
    else if (a === "--no-notes") out.noNotes = true;
    else if (a === "--model" && argv[i+1]) out.model = argv[++i];
    else if (a === "--thinking" && argv[i+1]) out.thinking = argv[++i];
    else if (a === "--k" && argv[i+1]) out.k = parseInt(argv[++i], 10);
  }
  return out;
}

function renderUserPrompt(item) {
  let tmpl = readPrompt("solver.user.md");
  // Simple mustache: replace {{item.id}} etc. For complex nested we do minimal
  tmpl = tmpl.replace(/\{\{item\.id\}\}/g, item.id || "");
  tmpl = tmpl.replace(/\{\{item\.bank\}\}/g, item.bank || "");
  tmpl = tmpl.replace(/\{\{item\.book\}\}/g, item.book || "");
  tmpl = tmpl.replace(/\{\{item\.chapter\}\}/g, item.chapter || "");
  tmpl = tmpl.replace(/\{\{item\.type\}\}/g, item.type || "");
  tmpl = tmpl.replace(/\{\{item\.marks\}\}/g, String(item.marks || ""));
  tmpl = tmpl.replace(/\{\{item\.stem\.text\}\}/g, (item.stem && item.stem.text) ? item.stem.text.slice(0, 4000) : "");
  // options and subparts
  let optionsStr = "";
  if (item.options && item.options.length) {
    optionsStr = item.options.map(o => `${o.label}: ${o.text}`).join("\n");
  }
  tmpl = tmpl.replace(/\{\{#item\.options\}\}[\s\S]*?\{\{\/item\.options\}\}/g, optionsStr ? `Options:\n${optionsStr}` : "");
  let subpartsStr = "";
  if (item.subparts && item.subparts.length) {
    subpartsStr = item.subparts.map(s => `${s.label}: ${s.text} (${s.marks || "?"} marks)`).join("\n");
  }
  tmpl = tmpl.replace(/\{\{#item\.subparts\}\}[\s\S]*?\{\{\/item\.subparts\}\}/g, subpartsStr ? `Subparts:\n${subpartsStr}` : "");
  // images
  const img = item.images && item.images.stem && item.images.stem[0] ? item.images.stem[0] : "(no image)";
  tmpl = tmpl.replace(/\{\{item\.images\.stem\.0\}\}/g, img);
  return tmpl;
}

function callPiSolve(item, bundleDir, opts) {
  const piBin = process.env.PI_BIN || "pi";
  const systemPrompt = readPrompt("solver.system.md");
  const priorMd = readPrompt("prior.md");
  const userPrompt = renderUserPrompt(item);

  // Prepare temp dir with empty cwd enforcement: we chdir to mkdtemp and pass absolute @ paths
  const tmp = fs.mkdtempSync(path.join("/tmp", "solve-"));
  const priorPath = path.join(tmp, "prior.md");
  fs.writeFileSync(priorPath, priorMd, "utf8");
  const systemPath = path.join(tmp, "system.md");
  fs.writeFileSync(systemPath, systemPrompt, "utf8");
  const userPath = path.join(tmp, "user.md");
  fs.writeFileSync(userPath, userPrompt, "utf8");

  const bundleNotes = opts.noNotes ? path.join(tmp, "empty.md") : path.join(bundleDir || tmp, "notes.md");
  if (opts.noNotes) fs.writeFileSync(bundleNotes, "# (no notes baseline – empty)\n", "utf8");

  const figPatterns = opts.noNotes ? [] : fs.existsSync(bundleDir || "") ? fs.readdirSync(bundleDir).filter(f => f.startsWith("fig-") && f.endsWith(".png")).map(f => path.join(bundleDir, f)) : [];

  // Collect attachments: bundle notes, figs, prior, item crop
  const attachments = [];
  if (fs.existsSync(bundleNotes)) attachments.push("@" + bundleNotes);
  for (const f of figPatterns.slice(0, 12)) attachments.push("@" + f); // cap per plan tier B
  attachments.push("@" + priorPath);
  const itemImg = item.images && item.images.stem && item.images.stem[0] ? path.resolve(repoRoot, item.images.stem[0]) : null;
  if (itemImg && fs.existsSync(itemImg)) attachments.push("@" + itemImg);

  // Build pi args: note empty cwd + --no-* flags
  const args = [
    "-p",
    "--model", opts.model,
    "--thinking", opts.thinking,
    "--no-tools", "--no-extensions", "--no-skills",
    "--no-context-files", "--no-prompt-templates", "--no-themes", "--no-session",
    "--system-prompt", systemPath,
    "--mode", "text",
    ...attachments,
    fs.readFileSync(userPath, "utf8"),
  ];

  // Execute with empty cwd
  const emptyDir = fs.mkdtempSync(path.join("/tmp", "pi-empty-"));
  const result = spawnSync(piBin, args, { cwd: emptyDir, encoding: "utf8", timeout: 180000, maxBuffer: 20 * 1024 * 1024 });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(emptyDir, { recursive: true, force: true });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const combined = stdout + "\n" + stderr;
  const parsed = extractJsonBlock(combined);

  // Also record pi version and prompt sha
  let piVersion = "unknown";
  try {
    const v = spawnSync(piBin, ["--version"], { encoding: "utf8" });
    piVersion = (v.stdout || "").trim() || "unknown";
  } catch {}

  const promptSha = sha256Hex(systemPrompt + userPrompt + priorMd);
  const itemSha = sha256Hex(JSON.stringify(item));
  const bundleSha = (() => {
    try {
      const manifest = path.join(bundleDir || "", "manifest.json");
      if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, "utf8")).bundle_sha || sha256Hex(fs.readFileSync(bundleNotes, "utf8"));
      if (fs.existsSync(bundleNotes)) return sha256Hex(fs.readFileSync(bundleNotes, "utf8"));
    } catch {}
    return "no-bundle";
  })();

  if (parsed) {
    parsed._meta = { pi: piVersion, model: opts.model, prompt_sha: promptSha, item_sha: itemSha, bundle_sha: bundleSha, raw_len: combined.length, sample: opts.sample };
    return { parsed, raw: combined, piVersion, promptSha, itemSha, bundleSha, error: null };
  }
  // Fallback: return blocked with raw
  return {
    parsed: {
      id: item.id,
      answer: null,
      steps: [],
      missing: [{ part: "all", concept: "pi did not return valid JSON", why_needed: "solve" }],
      self_verdict: "blocked",
      confidence: 0,
      _raw: combined.slice(0, 2000),
      _fallback: true,
    },
    raw: combined,
    piVersion, promptSha, itemSha, bundleSha,
    error: result.error ? String(result.error) : `no json block, exit ${result.status}`,
  };
}

async function main() {
  const { item: itemPath, bundle, out, sample, noNotes, model, thinking } = parseArgs(process.argv.slice(2));
  if (!itemPath || !bundle) {
    console.error("Usage: solve.mjs --item <item.json> --bundle <bundleDir> --out <out.json> [--sample N] [--no-notes]");
    process.exit(1);
  }
  let item;
  if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
    console.error("item must be a file");
    process.exit(1);
  }
  // itemPath may be a file containing single item JSON or an envelope
  const rawItem = JSON.parse(fs.readFileSync(itemPath, "utf8"));
  item = rawItem.items ? rawItem.items[0] : rawItem.id ? rawItem : rawItem;

  const bundleDir = fs.existsSync(bundle) ? bundle : path.dirname(bundle);

  const outPath = out || path.join(bundleDir, `${item.id}.solve.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const res = callPiSolve(item, bundleDir, { sample, noNotes, model, thinking });
  const output = {
    id: item.id,
    bank: item.bank,
    sample,
    no_notes: !!noNotes,
    solver: res.parsed,
    raw: res.raw.slice(0, 8000),
    run: { pi: res.piVersion, model, thinking, prompt_sha: res.promptSha, item_sha: res.itemSha, bundle_sha: res.bundleSha, at: new Date().toISOString() },
    error: res.error,
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Solve ${item.id} sample ${sample} -> ${outPath} verdict ${res.parsed.self_verdict}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // called directly
  main().catch(e => { console.error(e); process.exit(1); });
}
// Also allow import
export { callPiSolve };
