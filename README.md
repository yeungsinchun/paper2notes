# paper2notes

Convert HKDSE Physics source material into HTML notes that prioritize interactive and non-interactive visual diagrams, keep prose minimal, and include concept checks.

## Sources (local, not committed)

| Path | Role |
|------|------|
| `active-physics/` | Active Physics textbooks (PDF) |
| `ch1.pdf`-`ch5.pdf` | HKDSE Physics Compulsory Part syllabus PDFs |
| `dse-classified/` | Classified HKDSE MC/LQ banks by syllabus section |
| `QB_501/` | Active Physics Book 5 Chapter 1 question bank |
| `QB_502/` | Active Physics Book 5 Chapter 2 question bank |
| `QB_503/` | Active Physics Book 5 Chapter 3 question bank |

## Notes

HTML notes live under `notes/`. Follow textbook order; prefer visual animation over text.

## Question-bank usability audit

The local audit harness in `scripts/audit/` checks question-bank items against the notes pages, including in-page DSE decks when their local scans are available. It needs Node.js, `pi`, Google Chrome for figure capture, chapter pages under `notes/book2/`, `notes/book4/`, or `notes/book5/`, and item JSON at `paper2db/qb-pdf/items/QB_*.json`. Item images referenced by the JSON must be available at their paths. The repository contains a small `QB_501` fixture for a local harness run; it is not a substitute for the real bank.

```sh
node scripts/audit/run.mjs --bank QB_501 --fixture scripts/audit/fixtures/QB_501.json
node scripts/audit/report.mjs
```

Use `--bank QB_501` with the real item file, or `--all` when every bank's pages and item files are present. Results, bundles, mappings, and the HTML coverage board are written under gitignored `.audit/`. Keep those local: they can contain question-bank material and cropped images.

## Hosting

Merges to `main` deploy `notes/` to Cloud Run via `.github/workflows/deploy.yml`. Live site: https://paper2notes-152505675251.asia-east2.run.app/. Project, service, access model, and cost are in `deploy/cloudrun/README.md`.

## CI

Pull requests and pushes to `main` run a GitHub Actions check (`.github/workflows/ci.yml`) that executes `node scripts/ci-check.mjs`. It skips with a message when `notes/` doesn't exist yet, and otherwise verifies each book's index and chapter indexes exist and are non-empty, in-repo relative links (`href`/`src`) resolve on disk, and map-card description selectors do not style nested spans. It does not run the local Chrome/Puppeteer interactive tests, since those hardcode macOS Chrome paths.
