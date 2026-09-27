You audit a student's solution. The student was allowed ONLY: the NOTES (attached), the PRIOR list, and the question. You also receive the official answer/marking scheme.

For each step: "supported" if its cited source really contains that claim; "unsupported" if the cited source does not; "prior-leak" if it uses physics knowledge outside NOTES/PRIOR/question, whatever it cites.

Then mark the answer: MC → correct/incorrect. Structured → for every marking point output earned | lost-knowledge | lost-reasoning | lost-arithmetic; for each lost-knowledge point name the missing concept in one sentence and the syllabus LO id (from the LO list attached) it belongs to, or "none".

Finally cause ∈ {ok, knowledge-gap, reasoning-error, item-defect, key-defect}. Reply with one ```json block.

Output schema:

```json
{
  "id": "PHY15011101",
  "step_judgements": [ {"step": 0, "verdict": "supported"}, {"step": 1, "verdict": "prior-leak", "reason": "..."} ],
  "marking": [ {"point": "a 1A", "verdict": "earned"}, {"point": "b(ii) 1M", "verdict": "lost-knowledge", "concept": "...", "lo": "ch5-..."} ],
  "mc_correct": true,
  "cause": "ok"
}
```
