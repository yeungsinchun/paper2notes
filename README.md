# paper2notes

Convert HKDSE Physics source material into HTML notes that prioritize interactive and non-interactive visual diagrams, keep prose minimal, and include concept checks.

## Sources (local, not committed)

| Path | Role |
|------|------|
| `active-physics/` | Active Physics textbooks (PDF) |
| `dse-classified/` | Classified HKDSE MC/LQ banks by syllabus section |
| `QB_501/` | Active Physics Book 5 Chapter 1 question bank |

## Notes

HTML notes live under `notes/`. Follow textbook order; prefer visual animation over text.

## CI

Pull requests and pushes to `main` run a GitHub Actions check (`.github/workflows/ci.yml`) that executes `node scripts/ci-check.mjs`. It skips with a message when `notes/` doesn't exist yet, and otherwise verifies each book's index and chapter indexes exist and are non-empty, and that in-repo relative links (`href`/`src`) resolve on disk. It does not run the local Chrome/Puppeteer interactive tests, since those hardcode macOS Chrome paths.
