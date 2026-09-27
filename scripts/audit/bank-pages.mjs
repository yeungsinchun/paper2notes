import fs from "node:fs";
import path from "node:path";

const banks = Object.fromEntries([
  ...Array.from({ length: 10 }, (_, i) => [`QB_${201 + i}`, "book2", `ch${String(i + 1).padStart(2, "0")}`]),
  ...Array.from({ length: 8 }, (_, i) => [`QB_${401 + i}`, "book4", `ch${String(i + 1).padStart(2, "0")}`]),
  ["QB_501", "book5", "ch01"],
  ["QB_502", "book5", "ch02"],
  ["QB_503", "book5", "ch03"],
].map(([bank, book, chapter]) => [bank, { book, chapter }]));

export function pagesForBank(repoRoot, bank) {
  const spec = banks[bank];
  if (!spec) throw new Error(`Unknown bank ${bank}`);
  const root = path.join(repoRoot, "notes", spec.book);
  if (!fs.existsSync(root)) throw new Error(`Missing notes root for ${bank}: ${root}`);
  const chapterDir = fs.readdirSync(root).find(name => name.startsWith(spec.chapter) && fs.statSync(path.join(root, name)).isDirectory());
  if (!chapterDir) throw new Error(`Missing notes chapter for ${bank}: ${spec.book}/${spec.chapter}`);
  const dir = path.join(root, chapterDir);
  const pages = fs.readdirSync(dir).filter(name => /^(?:\d+-\d+|summary)\.html$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(name => path.join(dir, name));
  if (!pages.some(p => path.basename(p) !== "summary.html")) throw new Error(`Missing section pages for ${bank}`);
  return pages;
}

export function cumulativePagesForBank(repoRoot, bank) {
  const spec = banks[bank];
  if (!spec) throw new Error(`Unknown bank ${bank}`);
  const peers = Object.entries(banks).filter(([, value]) => value.book === spec.book && value.chapter <= spec.chapter).sort((a, b) => a[1].chapter.localeCompare(b[1].chapter));
  return peers.flatMap(([peer]) => pagesForBank(repoRoot, peer));
}
