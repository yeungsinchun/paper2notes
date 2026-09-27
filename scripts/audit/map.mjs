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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function readPrompt(p) {
  return fs.readFileSync(path.join(__dirname, "prompts", p), "utf8");
}
function parseArgs(argv) {
  const out = { items: null, bank: null, outDir: path.join(repoRoot, ".audit/mapping"), bundleDir: null, fixture: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--items" && argv[i + 1]) out.items = path.resolve(argv[++i]);
    else if (a === "--bank" && argv[i + 1]) out.bank = argv[++i];
    else if (a === "--out" && argv[i + 1]) out.outDir = path.resolve(argv[++i]);
    else if (a === "--bundle" && argv[i + 1]) out.bundleDir = path.resolve(argv[++i]);
    else if (a === "--fixture" && argv[i + 1]) out.fixture = path.resolve(argv[++i]);
    else if (a === "--all") out.all = true;
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

  const prior = (() => {
    try { return readPrompt("prior.md").slice(0, 4000); } catch { return ""; }
  })();

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

  // Fallback heuristic if pi failed (fake pi or timeout)
  if (result.error) {
    // fallback
  }
  // Heuristic: pick first section with matching book/chapter hint, else first
  // For Book 2 trivial mapping already handled outside
  let fallbackSection = sectionInfos[0]?.section || "unknown";
  // Try keyword overlap: count LO words overlap with item text
  if (item.stem && item.stem.text) {
    let best = { score: -1, sec: fallbackSection };
    for (const s of sectionInfos) {
      const hay = (s.los.join(" ") + " " + s.ideas.join(" ") + " " + s.title).toLowerCase();
      const needle = (item.stem.text || "").toLowerCase().slice(0, 500);
      let score = 0;
      for (const w of needle.split(/\W+/).slice(0, 30)) {
        if (w.length > 3 && hay.includes(w)) score++;
      }
      if (score > best.score) { best = { score, sec: s.section }; }
    }
    if (best.score >= 0) fallbackSection = best.sec;
  }
  return { section: fallbackSection, confidence: 0.55, secondary: sectionInfos.filter(s => s.section !== fallbackSection).map(s => s.section).slice(0, 2), _fallback: true, _raw: out.slice(0, 500) };
}

function isBook2Item(item) {
  return item.book === "2" || (item.bank && item.bank.startsWith("QB_2")) || (item.id && item.id.startsWith("PHY12"));
}

async function main() {
  const { items, bank, outDir, bundleDir, fixture } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(outDir, { recursive: true });

  let itemFiles = [];
  if (items) {
    itemFiles = [items];
  } else if (bank) {
    // Try paper2db location and fixture
    const candidates = [
      path.join(repoRoot, `../paper2db/qb-pdf/items/${bank}.json`),
      path.join(repoRoot, `paper2db/qb-pdf/items/${bank}.json`),
      path.join(repoRoot, `.audit/fixtures/${bank}.json`),
      path.join(repoRoot, `scripts/audit/fixtures/${bank}.json`),
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

  // If no items, create a 3-item fixture for P2 smoke (plan: P2 can run against 3-item fixture)
  if (!itemFiles.length) {
    console.log("No item files found – using 3-item synthetic fixture for P2 harness smoke.");
    const fixtureDir = path.join(repoRoot, ".audit/fixtures");
    fs.mkdirSync(fixtureDir, { recursive: true });
    const fixturePath = path.join(fixtureDir, "QB_501.json");
    if (!fs.existsSync(fixturePath)) {
      const synthetic = {
        bank: "QB_501",
        generated_at: new Date().toISOString(),
        items: [
          { id: "PHY15011101", bank: "QB_501", book: "5", chapter: "01", type: "mc", marks: 2, level: "easy", part: "core", stem: { text: "Which statements about ionizing radiation is/are correct? (1) energy high enough to strike electrons out (2) radiation in form of ions (3) X-rays are ionizing", ocr: "", equations: 0, has_figure: false }, options: [{ label: "A", text: "(1) only" }, { label: "B", text: "(2) only" }, { label: "C", text: "(1) and (3) only" }, { label: "D", text: "(2) and (3) only" }], answer: { status: "present", key: "C" }, images: { stem: [], answer: [] }, sources: [] },
          { id: "PHY15011201", bank: "QB_501", book: "5", chapter: "01", type: "sq", marks: 3, level: "easy", part: "core", stem: { text: "Describe how X-rays are produced in an X-ray tube.", ocr: "" }, answer: { status: "present" }, images: { stem: [], answer: [] } },
          { id: "PHY15011301", bank: "QB_501", book: "5", chapter: "01", type: "lq", marks: 6, level: "avg", part: "core", stem: { text: "Compare alpha, beta and gamma in penetrating power and ionizing power.", ocr: "" }, answer: { status: "present" }, images: { stem: [], answer: [] } },
        ],
      };
      fs.writeFileSync(fixturePath, JSON.stringify(synthetic, null, 2), "utf8");
    }
    itemFiles = [path.join(repoRoot, ".audit/fixtures/QB_501.json")];
  }

  for (const file of itemFiles) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const itemsList = data.items || data || [];
    const bankName = data.bank || path.basename(file, ".json");
    // Discover section pages for this bank
    let sectionPages = [];
    // Map bank to notes pages per plan table §3.2
    const bankToPages = {
      QB_501: ["notes/book5/ch01-radiation-and-radioactivity/25-1.html", "notes/book5/ch01-radiation-and-radioactivity/25-2.html", "notes/book5/ch01-radiation-and-radioactivity/25-3.html"],
      QB_502: ["notes/book5/ch02-rate-of-decay-and-uses-of-radionuclides/26-1.html", "notes/book5/ch02-rate-of-decay-and-uses-of-radionuclides/26-2.html", "notes/book5/ch02-rate-of-decay-and-uses-of-radionuclides/26-3.html"],
    };
    const candidatePages = bankToPages[bankName] || [];
    sectionPages = candidatePages.map((p) => path.join(repoRoot, p)).filter((p) => fs.existsSync(p));
    // Fallback: find any book5 pages
    if (!sectionPages.length) {
      const book5Dir = path.join(repoRoot, "notes/book5");
      if (fs.existsSync(book5Dir)) {
        // find all html under book5 ch01/ch02
        const walk = (dir) => {
          const out = [];
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) out.push(...walk(full));
            else if (e.name.endsWith(".html") && !e.name.includes("index")) out.push(full);
          }
          return out;
        };
        sectionPages = walk(book5Dir).slice(0, 6);
      }
    }
    const sectionInfos = sectionPages.length ? collectSectionInfo(sectionPages) : [{ section: bankName, title: bankName, los: [], ideas: [] }];

    // Bundle notes for context (if bundleDir given, read notes.md)
    let bundleNotes = "";
    if (bundleDir && fs.existsSync(path.join(bundleDir, "notes.md"))) {
      bundleNotes = fs.readFileSync(path.join(bundleDir, "notes.md"), "utf8");
    } else if (sectionPages.length) {
      // Try default bundle location
      const possibleBundle = path.join(repoRoot, `.audit/bundles/${bankName}/notes.md`);
      if (fs.existsSync(possibleBundle)) bundleNotes = fs.readFileSync(possibleBundle, "utf8");
    }

    const mappings = [];
    for (const item of itemsList) {
      // Book 2 trivial mapping
      if (isBook2Item(item)) {
        const chap = item.chapter ? `ch${item.chapter}` : bankName;
        mappings.push({ id: item.id, section: `book2/${chap}`, confidence: 1.0, secondary: [], method: "book2-trivial" });
        continue;
      }
      const res = await callPi(item, sectionInfos, bundleNotes);
      // Enforce confidence <0.6 handling later by run.mjs (tier S = all sections)
      mappings.push({ id: item.id, section: res.section, confidence: res.confidence ?? 0.7, secondary: res.secondary || [], raw: res._raw ? res._raw.slice(0, 200) : undefined, method: res._fallback ? "heuristic-fallback" : "pi" });
      // slight delay to avoid hammering
      await new Promise((r) => setTimeout(r, 10));
    }

    const outFile = path.join(outDir, `${bankName}.json`);
    const payload = {
      bank: bankName,
      generated_at: new Date().toISOString(),
      tool_versions: { pi: (() => { try { return spawnSync(process.env.PI_BIN || "pi", ["--version"], { encoding: "utf8" }).stdout.trim(); } catch { return "unknown"; } })() },
      section_pages: sectionPages.map((p) => path.relative(repoRoot, p)),
      mappings,
    };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Mapping written ${outFile} (${mappings.length} items)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
