# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Notes

HTML notes live under `notes/`. Open a chapter `index.html` in a browser (no build). Book 5 entry is `notes/book5/index.html` (Ch.1 / Ch.2 picker). Intake for each chapter is `notes/_source/<book-ch>/`. Pedagogy: `.cursor/skills/visual-html-notes/SKILL.md` (rule `.cursor/rules/visual-html-notes.mdc` points there). Local textbooks, banks, and syllabus PDFs (`active-physics/`, `dse-classified/`, `QB_501/`, `QB_502/`, `QB_503/`, `ch1.pdf`-`ch5.pdf`) are gitignored. Student pages must not show intake/OCR/QB provenance; keep that in `_source` or HTML comments.

Book 5 drafts: `notes/book5/ch01-radiation-and-radioactivity/` and `notes/book5/ch02-rate-of-decay-and-uses-of-radionuclides/`. Motion figures use local three.js (`js/lib/three.min.js`, no build). Maths uses vendored KaTeX at `notes/book5/vendor/katex/` (no CDN). Syllabus "Students should be able to" bullets sit in a Learning objectives block at the top of each student page; wording comes from `ch5.pdf` (HKDSE Physics Compulsory Part: Radioactivity and Nuclear Energy). Related classified DSE items are labelled on those bullets. Chapter `summary.html` pages (and the Book 5 menu for nuclear energy, which has no student chapter yet) repeat the LOs and embed the papers from gitignored `notes/book5/_local/dse/`. Browser interactives are covered by each chapter's `js/notes.interactives.test.mjs` (needs Google Chrome).

Hosting: `notes/` is served by nginx on a GCP e2-micro (`deploy/gcp/README.md` has project, instance, and access model). `.github/workflows/deploy.yml` runs `deploy/gcp/deploy.sh` on push to `main`; `deploy/gcp/provision.sh` is the idempotent source of truth for the cloud resources. `notes/_source/` and `_local/` are never published.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
