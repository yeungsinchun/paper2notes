#!/usr/bin/env node
/**
 * report.mjs — Coverage JSON + Lavish board (plan §4.8, §5 P5)
 *
 * Inputs: .audit/results/<bank>/<id>.json
 * Outputs:
 * - .audit/coverage.json (per-bank and per-section coverage)
 * - .audit/lavish/qb-audit/index.html (local coverage board with item ids)
 *
 * Never pastes QB stems or crops into notes/ or PR (plan D3): board lives under .audit/ (gitignored)
 * and is not copied into notes/. The coverage JSON contains ids, counts, and verdicts.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const out = { resultsDir: path.join(repoRoot, ".audit/results"), outCoverage: path.join(repoRoot, ".audit/coverage.json"), lavishDir: path.join(repoRoot, ".audit/lavish/qb-audit"), coverageOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--results" && argv[i+1]) out.resultsDir = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i+1]) out.outCoverage = path.resolve(argv[++i]);
    else if (a === "--lavish" && argv[i+1]) out.lavishDir = path.resolve(argv[++i]);
    else if (a === "--coverage-only") out.coverageOnly = true;
  }
  return out;
}

function completenessFor(items) {
  // Plan §4.7
  const total = items.length;
  const core = items.filter(x => x.part === "core");
  const byVerdict = {};
  for (const x of items) {
    const v = x.verdict || "unknown";
    byVerdict[v] = (byVerdict[v] || 0) + 1;
  }
  const passed = (byVerdict.pass || 0) + (byVerdict["pass-leaked"] || 0) + (byVerdict["cross-ref"] || 0);
  const corePassed = core.filter(x => ["pass", "pass-leaked", "cross-ref"].includes(x.verdict)).length;
  const coreRate = core.length ? corePassed / core.length : 0;
  const failures = core.filter(x => !["pass", "pass-leaked", "cross-ref"].includes(x.verdict));
  const concepts = new Map();
  for (const x of failures) for (const concept of new Set(x.missing_concepts || [])) concepts.set(concept, (concepts.get(concept) || 0) + 1);
  const mustFix = failures.filter(x => (x.marks >= 4 && x.section && x.section !== "unknown") || (x.missing_concepts || []).some(c => concepts.get(c) >= 2));
  const complete = total > 0 && items.every(x => x.inventory_present && x.result_present && x.part) && coreRate >= 0.95 && mustFix.length === 0;
  return { total, core: core.length, byVerdict, passed, corePassed, coreRate, mustFix: mustFix.map(x => x.id), complete };
}

function main() {
  const { resultsDir, outCoverage, lavishDir, coverageOnly } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(resultsDir)) {
    console.log(`No results dir ${resultsDir}, creating empty coverage.`);
    fs.mkdirSync(path.dirname(outCoverage), { recursive: true });
    fs.writeFileSync(outCoverage, JSON.stringify({ generated_at: new Date().toISOString(), banks: {}, overall: completenessFor([]) }, null, 2), "utf8");
    return;
  }

  const banks = fs.readdirSync(resultsDir).filter(f => fs.statSync(path.join(resultsDir, f)).isDirectory());
  const coverage = { generated_at: new Date().toISOString(), banks: {}, overall: null };
  const allItems = [];
  for (const bank of banks) {
    const bankDir = path.join(resultsDir, bank);
    const inventories = [path.join(repoRoot, `paper2db/qb-pdf/items/${bank}.json`), path.join(repoRoot, `.audit/fixtures/${bank}.json`), path.join(repoRoot, `scripts/audit/fixtures/${bank}.json`)];
    const inventoryPath = inventories.find(p => fs.existsSync(p));
    const inventory = inventoryPath ? JSON.parse(fs.readFileSync(inventoryPath, "utf8")).items || [] : [];
    const results = new Map();
    for (const f of fs.readdirSync(bankDir).filter(f => f.endsWith(".json"))) {
      const data = JSON.parse(fs.readFileSync(path.join(bankDir, f), "utf8"));
      results.set(data.id || path.basename(f, ".json"), data);
    }
    const items = inventory.map(item => {
      const result = results.get(item.id);
      const missing_concepts = result ? [...new Set(Object.values(result.tiers || {}).flatMap(t => (t.samples || []).flatMap(sample => [...(sample.answer?.missing || []).map(m => m.concept), ...(sample.judge?.marking || []).filter(m => m.verdict === "lost-knowledge").map(m => m.concept)].filter(Boolean))))] : [];
      return { ...result, id: item.id, bank, part: item.part, marks: item.marks, inventory_present: true, result_present: !!result, verdict: result?.verdict || "missing", missing_concepts };
    });
    for (const [id, result] of results) if (!inventory.some(item => item.id === id)) items.push({ ...result, id, bank, inventory_present: false, result_present: true, verdict: "unmatched" });
    const stats = completenessFor(items);
    const bySection = {};
    for (const it of items) (bySection[it.section || "unknown"] ||= []).push(it);
    const sections = Object.fromEntries(Object.entries(bySection).map(([sec, list]) => [sec, completenessFor(list)]));
    coverage.banks[bank] = { ...stats, inventory_found: !!inventoryPath, sections, items: items.map(x => ({ id: x.id, verdict: x.verdict, leaked: x.leaked, section: x.section })) };
    allItems.push(...items);
  }
  coverage.overall = completenessFor(allItems);
  coverage.overall.complete = coverage.overall.complete && Object.values(coverage.banks).every(b => b.complete);

  fs.mkdirSync(path.dirname(outCoverage), { recursive: true });
  fs.writeFileSync(outCoverage, JSON.stringify(coverage, null, 2), "utf8");
  console.log(`Coverage written ${outCoverage}: ${Object.keys(coverage.banks).length} banks, ${allItems.length} items, overall pass ${(coverage.overall.coreRate * 100).toFixed(1)}%`);

  if (coverageOnly) return;

  // Lavish board
  fs.mkdirSync(lavishDir, { recursive: true });
  const boardPath = path.join(lavishDir, "index.html");
  const rows = Object.entries(coverage.banks).map(([bank, stats]) => {
    const rate = (stats.coreRate * 100).toFixed(1);
    const cls = stats.complete ? "complete" : "gap";
    const byV = Object.entries(stats.byVerdict).map(([k, v]) => `${k}:${v}`).join(" ");
    return `<tr class="${cls}"><td>${bank}</td><td>${stats.core}/${stats.total} core</td><td>${rate}%</td><td>${stats.complete ? "✓ Complete" : "✗ Gaps"}</td><td>${byV}</td></tr>`;
  }).join("\n");

  const heatmap = banks.map(bank => {
    const stats = coverage.banks[bank];
    const sections = stats.sections || {};
    const secCells = Object.entries(sections).map(([sec, s]) => {
      const r = (s.coreRate * 100).toFixed(0);
      const bg = s.complete ? "#d4edda" : s.coreRate > 0.8 ? "#fff3cd" : "#f8d7da";
      return `<span style="background:${bg};padding:4px 8px;margin:2px;border-radius:4px;display:inline-block">${sec}: ${r}% (${s.corePassed}/${s.core})</span>`;
    }).join(" ");
    return `<div class="bank-heatmap"><h3>${bank}</h3><div>${secCells || "(no section mapping)"}</div></div>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QB → notes audit — Coverage board</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#1b2129}
  h1{font-size:22px;margin:0 0 8px}
  .lede{color:#5d6673;margin:0 0 16px}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th,td{border:1px solid #cfd9e6;padding:8px 10px;text-align:left;font-size:13px}
  th{background:#f1f4f8}
  tr.complete{background:#eef7ee}
  tr.gap{background:#fef5f5}
  .bank-heatmap{border:1px solid #e6e9ee;border-radius:8px;padding:12px;margin:10px 0}
  .bank-heatmap h3{margin:0 0 8px;font-size:15px}
  .warn{background:#fff3cd;border:1px solid #ffe69c;padding:10px;border-radius:8px;margin:12px 0;font-size:13px}
  .small{font-size:12px;color:#6b7280}
  a{color:#1d4f91}
</style>
</head>
<body>
<h1>QB → notes usability audit — Coverage</h1>
<p class="lede">Question: can every question-bank item for Books 2, 4 and 5 be solved using only what the paper2notes pages teach? (force-and-motion prior only)</p>
<div class="warn"><b>Local only:</b> this board may contain QB item crops under <code>.audit/</code> (gitignored). Do not copy crops or verbatim stems into <code>notes/</code> or into any PR (plan D3). Item ids are safe to cite.</div>
<p class="small">Generated ${coverage.generated_at} · Overall core pass rate ${(coverage.overall.coreRate * 100).toFixed(1)}% (${coverage.overall.corePassed}/${coverage.overall.core}) · ${allItems.length} items</p>
<table>
<thead><tr><th>Bank</th><th>Core/Total</th><th>Pass rate</th><th>Status</th><th>By verdict</th></tr></thead>
<tbody>
${rows || '<tr><td colspan=5>(no results yet — run <code>node scripts/audit/run.mjs --all</code>)</td></tr>'}
</tbody>
</table>
<h2>Section heatmap (pass rate per mapped section)</h2>
${heatmap || '<p class="small">(no data)</p>'}
<h2>Item detail (first 50)</h2>
<table>
<thead><tr><th>ID</th><th>Bank</th><th>Section</th><th>Verdict</th><th>Leaked</th></tr></thead>
<tbody>
${allItems.slice(0,50).map(it => `<tr><td>${it.id}</td><td>${it.bank}</td><td>${it.section || ""}</td><td>${it.verdict}</td><td>${it.leaked ? "yes" : ""}</td></tr>`).join("\n") || '<tr><td colspan=5>(none)</td></tr>'}
</tbody>
</table>
<p class="small">Full results: <code>.audit/results/&lt;bank&gt;/&lt;id&gt;.json</code> · Coverage: <code>.audit/coverage.json</code> · Bundles: <code>.audit/bundles/&lt;bank&gt;/</code></p>
<p class="small">Completeness per plan §4.7: Complete = ≥95% of core items are pass/pass-leaked/cross-ref, and no must-fix concept remains. Must-fix = concept cited by ≥2 core items or any ≥4-mark item that maps to a syllabus LO.</p>
</body>
</html>
`;
  fs.writeFileSync(boardPath, html, "utf8");
  console.log(`Lavish board written ${boardPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
