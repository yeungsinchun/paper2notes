#!/usr/bin/env node
// Minimal CI check for paper2notes.
//
// When `notes/` does not exist yet (bare `main`), this is a no-op skip.
// When `notes/book5/` exists, it asserts that the book5 index and both
// chapter indexes exist and are non-empty, and it fails on broken
// in-repo relative links (href/src) that it can resolve on disk without
// a browser.

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const notesDir = join(repoRoot, "notes");
const book5Dir = join(notesDir, "book5");

const errors = [];

function fail(message) {
  errors.push(message);
}

function isNonEmptyFile(path) {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
}

function findChapterDir(prefix) {
  if (!existsSync(book5Dir)) return null;
  const entries = readdirSync(book5Dir, { withFileTypes: true });
  const match = entries.find((e) => e.isDirectory() && e.name.startsWith(prefix));
  return match ? join(book5Dir, match.name) : null;
}

function checkBook5Structure() {
  const bookIndex = join(book5Dir, "index.html");
  if (!isNonEmptyFile(bookIndex)) {
    fail(`Missing or empty book5 index: ${relative(repoRoot, bookIndex)}`);
  }

  for (const prefix of ["ch01-", "ch02-"]) {
    const chapterDir = findChapterDir(prefix);
    if (!chapterDir) {
      fail(`Missing chapter directory matching "${prefix}*" under ${relative(repoRoot, book5Dir)}`);
      continue;
    }
    const chapterIndex = join(chapterDir, "index.html");
    if (!isNonEmptyFile(chapterIndex)) {
      fail(`Missing or empty chapter index: ${relative(repoRoot, chapterIndex)}`);
    }
  }
}

function walkHtmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

// Matches href="..." / src="..." (single or double quoted), but not
// lookalike attributes like data-src or data-gm-src.
const LINK_ATTR_RE = /(?<![\w-])(?:href|src)\s*=\s*("([^"]*)"|'([^']*)')/g;

function isSkippableLink(url) {
  if (!url) return true;
  if (url.startsWith("#")) return true; // in-page anchor
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return true; // scheme e.g. http:, mailto:, data:, tel:, javascript:
  if (url.startsWith("//")) return true; // protocol-relative
  return false;
}

// `notes/**/_local/` holds reference images (e.g. DSE past-paper crops)
// that are intentionally kept out of git (see .gitignore). Links into a
// `_local/` directory can never resolve in-repo, so they are not
// treated as broken links here.
function isKnownLocalOnly(withoutFragment) {
  return withoutFragment.split("/").includes("_local");
}

function checkRelativeLinks() {
  if (!existsSync(notesDir)) return;
  const htmlFiles = walkHtmlFiles(notesDir);

  for (const file of htmlFiles) {
    const contents = readFileSync(file, "utf8");
    let match;
    while ((match = LINK_ATTR_RE.exec(contents)) !== null) {
      const raw = match[2] !== undefined ? match[2] : match[3];
      if (isSkippableLink(raw)) continue;

      // Strip query string and fragment before resolving to a filesystem path.
      const withoutFragment = raw.split("#")[0].split("?")[0];
      if (!withoutFragment) continue; // pure fragment/query link on this attribute value
      if (isKnownLocalOnly(withoutFragment)) continue;

      const target = resolve(dirname(file), decodeURIComponent(withoutFragment));
      if (!existsSync(target)) {
        fail(`Broken relative link in ${relative(repoRoot, file)}: "${raw}"`);
      }
    }
  }
}

if (!existsSync(notesDir)) {
  console.log("ci-check: notes/ not found on this branch, skipping (nothing to check).");
  process.exit(0);
}

if (existsSync(book5Dir)) {
  checkBook5Structure();
}

checkRelativeLinks();

if (errors.length > 0) {
  console.error(`ci-check: ${errors.length} problem(s) found:\n`);
  for (const message of errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log("ci-check: OK");
process.exit(0);
