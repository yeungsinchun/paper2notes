# Task

Solve the question-bank item below using ONLY the NOTES and PRIOR.

## Item

- ID: {{item.id}}
- Bank: {{item.bank}} ({{item.book}}/{{item.chapter}})
- Type: {{item.type}}  Marks: {{item.marks}}
- Text (may have garbled symbols, see image for authoritative version):
```
{{item.stem.text}}
```
{{#item.options}}
Options:
{{item.options}}
{{/item.options}}
{{#item.subparts}}
Subparts:
{{item.subparts}}
{{/item.subparts}}

The authoritative stem is the attached image crop: {{item.images.stem.0}}

## NOTES bundle

The NOTES are attached as `notes.md` plus `fig-*.png` screenshots. Each block has an anchor like `[§25-1.B #knockout]`. Cite that anchor and quote verbatim (≤25 words).

## PRIOR allowlist

See attached `prior.md`. Cite as `prior:P-FM-nn` or `math:P-MA-nn`.

## Output

Reply with exactly one fenced ```json block:

```json
{
  "id": "{{item.id}}",
  "answer": "C",
  "steps": [ {"part": "a", "text": "...", "source": "notes:25-1.B#knockout", "quote": "..."} ],
  "missing": [ {"part": "b(ii)", "concept": "...", "why_needed": "..."} ],
  "self_verdict": "solved",
  "confidence": 0.85
}
```

- `answer`: MC letter or {"a": "...", "b(i)": "..."} for structured
- `self_verdict`: solved | partial | blocked
