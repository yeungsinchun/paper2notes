#!/usr/bin/env node
/**
 * map.mjs — Item → section mapping (plan §4.4)
 *
 * One Muse call per item, --no-tools, thinking high.
 * Inputs: item crop + text, section titles + LO bullets, idea headings.
 * Returns {section, confidence, secondary[]}
 *
 * Book 2 maps trivially to its chapter page, but still records A-D sub-section.
 * Items with confidence < 0.6 get tier S = all sections of the chapter.
 *
 * Output: .audit/mapping/<bank>.json
 *
 * Uses PI_BIN env for pi binary (fake pi in tests).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pagesForBank } from "./bank-pages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readPrompt(p) {
  return fs.readFileSync(path.join(__dirname, "prompts", p), "utf8");
}
function parseArgs(argv) {
  const out = { items: null, bank: null, outDir: path.join(repoRoot, ".audit/mapping"), bundleDir: null, fixture: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--items" && argv[i + 1]) out.items = path.resolve(argv[++i]);
    else if (a === "--bank" && argv[i + 1]) out.bank = argv[++i];
    else if (a === "--out" && argv[i + 1]) out.outDir = path.resolve(argv[++i]);
    else if (a === "--bundle" && argv[i + 1]) out.bundleDir = path.resolve(argv[++i]);
    else if (a === "--fixture" && argv[i + 1]) out.fixture = path.resolve(argv[++i]);
    else if (a === "--force") out.force = true;
  }
  return out;
}

function extractJsonBlock(text) {
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1]); } catch {}
  }
  // try whole text
  try { return JSON.parse(text); } catch {}
  return null;
}

function collectSectionInfo(pages) {
  // pages: list of html paths for a chapter
  const infos = [];
  for (const p of pages) {
    const html = fs.readFileSync(p, "utf8");
    const titleM = html.match(/<title>([^<]+)<\/title>/i);
    const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const loM = html.match(/<section\s+class="lo-block"[\s\S]*?<ul class="lo-list">([\s\S]*?)<\/ul>/i);
    let los = [];
    if (loM) {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let m;
      while ((m = liRe.exec(loM[1])) !== null) los.push(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    }
    const ideaHeads = [];
    const ideaRe = /<section\s+class="idea"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    let im;
    while ((im = ideaRe.exec(html)) !== null) ideaHeads.push(im[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const base = path.basename(p, ".html");
    infos.push({ section: base, title: titleM ? titleM[1].trim() : base, h1: h1M ? h1M[1].replace(/<[^>]+>/g, " ").trim() : "", los, ideas: ideaHeads, path: p });
  }
  return infos;
}

async function callPi(item, sectionInfos, bundleNotes) {
  const piBin = process.env.PI_BIN || "pi";
  const model = "meta/muse-spark-1.2-contributor";
  const systemPrompt = readPrompt("map.system.md");

  const userContent = `Item ${item.id} (${item.bank} ${item.type} ${item.marks} marks):
Text: ${item.stem ? item.stem.text.slice(0, 3000) : JSON.stringify(item).slice(0, 3000)}

Section candidates for this chapter:
${sectionInfos.map((s) => `- ${s.section}: ${s.title} | LOs: ${s.los.join(" | ").slice(0, 800)} | Ideas: ${s.ideas.join(" | ").slice(0, 800)}`).join("\n")}

Bundle excerpt (first 8000 chars):
${bundleNotes ? bundleNotes.slice(0, 8000) : "(no bundle)"}
`;

  // Build temp prompt file to avoid shell quoting issues
  const tmpDir = fs.mkdtempSync(path.join("/tmp", "map-pi-"));
  const promptFile = path.join(tmpDir, "prompt.txt");
  fs.writeFileSync(promptFile, userContent, "utf8");
  const systemFile = path.join(tmpDir, "system.txt");
  fs.writeFileSync(systemFile, systemPrompt, "utf8");

  // Prepare attachments: item crop if exists
  const args = [
    "-p",
    "--model", model,
    "--thinking", "high",
    "--no-tools", "--no-extensions", "--no-skills",
    "--no-context-files", "--no-prompt-templates", "--no-themes", "--no-session",
    "--mode", "text",
    "--system-prompt", systemFile,
  ];
  // Attach bundle notes if exists
  // We pass the user prompt as positional arg with @file handling not needed; just inline
  // Use PI_BIN with prompt file content
  const itemImage = item.images && item.images.stem && item.images.stem[0] ? path.resolve(repoRoot, item.images.stem[0]) : null;
  if (itemImage && fs.existsSync(itemImage)) {
    args.push("@" + itemImage);
  }
  // We add prompt as last arg
  // To support both file and string, we pass the prompt content directly
  args.push(fs.readFileSync(promptFile, "utf8"));

  // Execute pi
  const result = spawnSync(piBin, args, { encoding: "utf8", timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const out = (result.stdout || "") + (result.stderr || "");
  const parsed = extractJsonBlock(out);
  if (parsed && parsed.section) return parsed;

  return { section: null, confidence: 0, secondary: [], _raw: out.slice(0, 500) };
}

async function main() {
  const { items, bank, outDir, bundleDir, fixture, force } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(outDir, { recursive: true });

  let itemFiles = [];
  if (items) {
    itemFiles = [items];
  } else if (bank) {
    // Try paper2db location and fixture
    const candidates = [
      path.join(repoRoot, `paper2db/qb-pdf/items/${bank}.json`),
    ];
    if (fixture) candidates.unshift(fixture);
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) itemFiles = [found];
    else {
      console.error(`No item file for bank ${bank}. Tried: ${candidates.join(", ")}`);
      // Allow empty mapping for fixture-less test: create 3-item fixture
      itemFiles = [];
    }
  } else if (fixture) {
    itemFiles = [fixture];
  } else {
    // Default: look for any fixture
    const maybe = path.join(repoRoot, "scripts/audit/fixtures");
    if (fs.existsSync(maybe)) {
      itemFiles = fs.readdirSync(maybe).filter((f) => f.endsWith(".json")).map((f) => path.join(maybe, f));
    }
  }

  if (!itemFiles.length) throw new Error("No item files found");

  for (const file of itemFiles) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const itemsList = data.items || data || [];
    const bankName = bank || data.bank || path.basename(file, ".json");
    if (data.bank && data.bank !== bankName) throw new Error(`Item bank ${data.bank} does not match ${bankName}`);
    const sectionPages = pagesForBank(repoRoot, bankName).filter(p => path.basename(p) !== "summary.html");
    const sectionInfos = collectSectionInfo(sectionPages);

    // Bundle notes for context (if bundleDir given, read notes.md)
    let bundleNotes = "";
    if (bundleDir && fs.existsSync(path.join(bundleDir, "notes.md"))) {
      bundleNotes = fs.readFileSync(path.join(bundleDir, "notes.md"), "utf8");
    } else if (sectionPages.length) {
      // Try default bundle location
      const possibleBundle = path.join(repoRoot, `.audit/bundles/${bankName}/notes.md`);
      if (fs.existsSync(possibleBundle)) bundleNotes = fs.readFileSync(possibleBundle, "utf8");
    }

    const outFile = path.join(outDir, `${bankName}.json`);
    const piVersion = (() => { try { return spawnSync(process.env.PI_BIN || "pi", ["--version"], { encoding: "utf8" }).stdout.trim(); } catch { return "unknown"; } })();
    const hash = crypto.createHash("sha256");
    for (const part of [fs.readFileSync(file), readPrompt("map.system.md"), fs.readFileSync(fileURLToPath(import.meta.url)), piVersion, bundleNotes.replace(/^Generated: .*$/m, ""), ...sectionPages.flatMap((p) => [path.relative(repoRoot, p), fs.readFileSync(p)])]) hash.update(part).update("\0");
    const inputsSha = hash.digest("hex");
    if (!force && fs.existsSync(outFile)) {
      try {
        if (JSON.parse(fs.readFileSync(outFile, "utf8")).inputs_sha === inputsSha) {
          console.log(`Mapping unchanged ${outFile}`);
          continue;
        }
      } catch {}
    }

    const mappings = [];
    for (const item of itemsList) {
      const res = await callPi(item, sectionInfos, bundleNotes);
      // Enforce confidence <0.6 handling later by run.mjs (tier S = all sections)
      const valid = sectionInfos.some(info => info.section === res.section);
      mappings.push({ id: item.id, section: valid ? res.section : null, confidence: valid ? (res.confidence ?? 0) : 0, secondary: res.secondary || [], raw: res._raw ? res._raw.slice(0, 200) : undefined, method: valid ? "pi" : "unmapped" });
      // slight delay to avoid hammering
      await new Promise((r) => setTimeout(r, 10));
    }

    const payload = {
      bank: bankName,
      generated_at: new Date().toISOString(),
      inputs_sha: inputsSha,
      tool_versions: { pi: piVersion },
      section_pages: sectionPages.map((p) => path.relative(repoRoot, p)),
      mappings,
    };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Mapping written ${outFile} (${mappings.length} items)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
