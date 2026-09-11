# Problem shortlist: Book 5 Ch.2 / syllabus 26

Ordered to match textbook flow. Quality over coverage. Paths are in the primary checkout (`dse-classified/`, `QB_501/`, `QB_502/`, `QB_503/`), not this worktree.

**Home set:** textbook Ch.26 + `QB_502/` (`5_ch02_*`) + HKDSE classified section 26.
**Prerequisites (do not reteach as new theory):** `QB_501/` / DSE 25 items that already sit in Ch.1 notes, except the two that Ch.1 itself filed here.
**Illumination only (no Ch.3 pages):** `QB_503/` / DSE 27 items that reuse a Ch.26 idea.

**Role:** `concept-check` = short interactive item on a notes page. `worked-example` = one guided solution with a diagram, not a homework dump.

Answers for classified MC: `dse-classified/mc/.../26_Rate_of_Decay_and_Uses_of_Radionuclides/answer.pdf`. sap and 2026 have no % in that file.

Cross-reference flags:
- **textbook+exam** - appears in the chapter and in QB 502 and/or DSE 26.
- **exam-only** - bank item whose skill is in the chapter but the exact stem is not a textbook checkpoint.
- **textbook-only** - taught in Active Physics 26, thin or absent in the home exam set.
- **prereq** - Ch.25 / QB 501 / DSE 25.
- **ch27-illumination** - QB 503 / DSE 27 using a Ch.26 quantity as a given, not fission/fusion theory.

---

## 26.1 A Random nature

### QB PHY15021117
- **Source:** `QB_502/5_ch02_MC_e.pdf` (ans D)
- **Tag:** random decay
- **Why:** Matches the 26.1 A box: we cannot name which nucleus decays first. Distractors mix up activity ∝ N, temperature, and “unknown radiation type”.
- **Role:** concept-check
- **Flag:** textbook+exam

### HKDSE 2020/30 (filed under 25)
- **Source:** `dse-classified/mc/.../25_Radiation_and_Radioactivity/2020_q30.png` (ans D, 49%)
- **Tag:** fluctuating background counts
- **Why:** Ch.1 notes already flagged this as a Ch.26 skill. Most probable set is similar counts around a mean, not identical, not wildly split, not steadily falling.
- **Role:** concept-check (after dice / GM fluctuation)
- **Flag:** prereq bank, teach here

### Textbook Checkpoint 1 Q1 (count-rate graph)
- **Source:** printed p.61
- **Tag:** background floor + half-life from a graph
- **Why:** Same figure family as Example 26.1. Pair with the animation, do not dump Q2–Q4 as well.
- **Role:** concept-check
- **Flag:** textbook-only as a named checkpoint; the skill is textbook+exam (DSE graphs)

---

## 26.1 B Half-life

### QB PHY15021155
- **Source:** `QB_502/5_ch02_MC_e.pdf` (ans B)
- **Tag:** half-life definition
- **Why:** (1) activity halves and (3) N halves are both the book definition. (2) “time left to remain radioactive” is the usual false reading.
- **Role:** concept-check
- **Flag:** textbook+exam

### HKDSE 2023/31
- **Source:** `.../26_.../2023_q31.png` (ans C, 71%)
- **Tag:** after one half-life, X halves; Y does not double; A halves
- **Why:** Direct Fig. 26.4 trap: decayed nuclei become Y, they are not “twice X”. Total nucleon count is not in play; activity of a pure X → stable Y source follows N of X.
- **Role:** concept-check
- **Flag:** textbook+exam

### HKDSE 2012/35
- **Source:** `.../2012_q35.png` (ans C, 65%)
- **Tag:** remaining fraction after half a half-life
- **Why:** After 10 h with T½ = 20 h, remaining is between 1/2 and 1, closer to 1/√2. Textbook Example 26.2 is integer n; this is the non-integer cousin.
- **Role:** concept-check
- **Flag:** exam-only numbers; law is textbook Table 26.2

### HKDSE 2013/35
- **Source:** `.../2013_q35.png` (ans B, 56%)
- **Tag:** mass remaining after half a half-life; daughter is stable
- **Why:** 70 d / 140 d. Distractor 210 mg is “half the mass”, which would be one full half-life. 105 mg is two half-lives. Matches the “object still exists” puzzle on printed p.60: decayed mass is now lead, not gone.
- **Role:** concept-check
- **Flag:** textbook+exam (puzzle + DSE)

### HKDSE 2021/32
- **Source:** `.../2021_q32.png` (ans D, 76%)
- **Tag:** activity 3 half-lives earlier
- **Why:** Going backwards multiplies by 8, not 3. Easy check after Fig. 26.6.
- **Role:** concept-check
- **Flag:** textbook+exam

---

## 26.1 C Activity

### HKDSE 2025/31
- **Source:** `.../2025_q31.png` (ans B, 59%)
- **Tag:** Bq = decays per second
- **Why:** 300 nuclides in 1 min → 5 Bq, not 300 Bq. Textbook definition on printed p.57.
- **Role:** concept-check
- **Flag:** textbook+exam

### HKDSE sap/35
- **Source:** `.../sap_q35.png`
- **Tag:** A depends on T½ and N, not on α/β/γ type
- **Why:** A = kN with k = ln 2 / T½. Radiation type is a 25.3 property, not activity.
- **Role:** concept-check
- **Flag:** textbook+exam (Fig. 26.5 + A = kN)

### HKDSE 2019/32
- **Source:** `.../2019_q32.png` (ans B, 64%)
- **Tag:** short T½ is not “must have highest A”; k vs T½; 6 y of Na-22
- **Why:** (1) false without N; (2) k of P-32 is smaller than C-11; (3) 6 y > 2 × 2.60 y so A < 380 Bq. Best single item for the p.60 Amy & Bob trap (longer T½ is not automatically weaker).
- **Role:** worked-example
- **Flag:** textbook+exam

### HKDSE 2020/32
- **Source:** `.../2020_q32.png` (ans D, 49%)
- **Tag:** decay constant is characteristic
- **Why:** Printed p.63: k depends only on T½; heating / pressure / nucleon count do not set k. “Random” is the process, not k.
- **Role:** concept-check
- **Flag:** textbook+exam (core wording; formula is Extension)

---

## 26.1 graphs, two nuclides, background

### HKDSE 2016/33
- **Source:** `.../2016_q33.png` (ans C, 66%)
- **Tag:** two nuclides, N equal after 24 h
- **Why:** 24 h = 8 T½ of X and 6 T½ of Y → NX : NY = 2^8 : 2^6 = 4 : 1 after rearranging. Textbook exercise Q10 / Q13 family.
- **Role:** worked-example
- **Flag:** textbook+exam

### HKDSE 2022/32
- **Source:** `.../2022_q32.png` (ans A, 50%)
- **Tag:** two sources meet, then one more day
- **Why:** After they meet, X has known A the next day so T½ of X is 1 day from 100 → 80 is *not* a half-life; need the equal-activity condition. Hard; use only if the two-source page wants one DSE item.
- **Role:** worked-example (optional; prefer 2016/33)
- **Flag:** exam-only difficulty

### HKDSE 2024/32
- **Source:** `.../2024_q32.png` (ans D, 68%)
- **Tag:** 800→600 in 2 y is not a half-life; 600→300 is
- **Why:** Half-life is the time for a *halving*, not any 200 Bq drop. Textbook Example 26.2 integer-halving contrast.
- **Role:** concept-check
- **Flag:** exam-only numbers; idea is textbook

### HKDSE 2020/33
- **Source:** `.../2020_q33.png` (ans C, 38%)
- **Tag:** remaining fractions 1/16 and 1/64 → 4 vs 6 half-lives
- **Why:** Ratio of half-lives is 6:4 = 3:2. Skip if 2016/33 is already on the page.
- **Role:** worked-example (optional)
- **Flag:** exam-only

### Textbook Example 26.1
- **Source:** printed p.59
- **Tag:** subtract background, then read T½
- **Why:** Summary “common mistakes” panel 2. DSE graphs often omit this; still required by the book and by QB PHY15022103.
- **Role:** worked-example
- **Flag:** textbook+exam (QB SQ)

### QB PHY15022103
- **Source:** `QB_502/5_ch02_SQ_e.pdf`
- **Tag:** T½ from k; background from a two-half-life count
- **Why:** Same numbers pattern as Example 26.1. Prefer the textbook graph on the notes page; keep this as the bank twin.
- **Role:** worked-example (use textbook graph, cite this as the bank match)
- **Flag:** textbook+exam

---

## 26.1 D Decay constant (textbook Extension)

The book marks A = kN language in 26.1 C as core, but N = N0 e^{-kt}, A = A0 e^{-kt}, and T½ = ln 2 / k as **Extension**. DSE and QB 502 still examine them.

### Textbook Example 26.3 / 26.5
- **Source:** printed pp.63–65
- **Tag:** k = ln 2 / T½; A = kN; mole → N0
- **Why:** Rn-220 and Pu-239. One of these is enough as a worked example.
- **Role:** worked-example (mark as extension on the page, still exam-useful)
- **Flag:** textbook+exam

### HKDSE 2021 LQ 9
- **Source:** `dse-classified/lq/.../26_.../2021-q9.png`
- **Tag:** K-40 in a banana; moles → N → A = kN
- **Why:** Same mole chain as Example 26.5, everyday object. (a)(ii) also needs Ch.25 penetrating power (γ/β escape).
- **Role:** worked-example
- **Flag:** textbook+exam; (a)(ii) is prereq 25.3

### QB 501 PHY15012102
- **Source:** `QB_501/5_ch01_SQ_e.pdf`
- **Tag:** equivalent dose / sievert
- **Why:** Ch.1 problems.md already parked this in Ch.26. Teach with 26.3, not 26.1.
- **Role:** concept-check on the safety page
- **Flag:** prereq bank, teach in 26.3

---

## 26.2 Uses (choose type + half-life)

### Textbook Checkpoint 3 Q1 table
- **Source:** printed p.78
- **Tag:** medical tracer / pipeline / plant / sterilization / thickness
- **Why:** The book’s own selection table. Fill on the notes page rather than inventing a new grid.
- **Role:** concept-check
- **Flag:** textbook-only as a table; each row is textbook+exam

### HKDSE 2024/33
- **Source:** `.../2024_q33.png` (ans B, 51%)
- **Tag:** underground water-pipe leak
- **Why:** Need γ (to leave the soil) and T½ of hours (36 h), not α, not 45 min, not 66 h β. Fig. 26.11 + Example 26.7 logic.
- **Role:** concept-check
- **Flag:** textbook+exam

### QB PHY15021109
- **Source:** `QB_502/5_ch02_MC_e.pdf` (ans D)
- **Tag:** medical imaging tracer
- **Why:** γ, half-life of days not years/seconds. Textbook printed p.70 wants *hours* (Tc-99m ~6 h); this bank item is the nearest MC. Note the hours-vs-days gap in outline.
- **Role:** concept-check
- **Flag:** textbook+exam (type match; T½ band is looser than the book)

### QB PHY15022101
- **Source:** `QB_502/5_ch02_SQ_e.pdf`
- **Tag:** thickness gauge; β not γ
- **Why:** Fig. 26.12 / Kr-85. γ would ignore thickness.
- **Role:** worked-example
- **Flag:** textbook+exam

### Textbook Example 26.7 + Amy & Bob irradiated food
- **Source:** printed pp.73–75
- **Tag:** level monitor; food is not made radioactive
- **Why:** Irradiation uses γ (Co-60). DSE 26 has no dedicated “treated by irradiation” MC; keep the Amy & Bob item.
- **Role:** concept-check (food) + short worked-example (cartons)
- **Flag:** textbook-only for the food T/F; level monitor is textbook+exam (QB / exercise Q15)

### HKDSE 2015/33
- **Source:** `.../2015_q33.png` (ans D, 60%)
- **Tag:** C-14 dating from two corrected count rates
- **Why:** 11.0 / 15.6 ≈ 0.705 remaining → age < 5730 y, closest 2900 y. Fig. 26.19 + Example 26.8.
- **Role:** concept-check
- **Flag:** textbook+exam

### Textbook Example 26.8
- **Source:** printed p.77
- **Tag:** living A0 from N; age from A = A0 e^{-kt}; cannot date rock / too old / too young
- **Why:** Core archaeological use. Exercise Q2 (wooden chair vs rock/coin/knife) is the quick check.
- **Role:** worked-example
- **Flag:** textbook+exam

### HKDSE 2018/32
- **Source:** `.../2018_q32.png` (ans B, 40%)
- **Tag:** two nuclides, atomic-mass ratio and 4T
- **Why:** Counting N from mass, then (1/2)^{4} vs (1/2)^{2}. Strong but overlaps 2016/33. Skip if the half-life page is already full.
- **Role:** optional worked-example
- **Flag:** exam-only arithmetic

---

## 26.3 Radiation safety

### HKDSE 2026/32
- **Source:** `.../2026_q32.png` (ans A)
- **Tag:** sievert for equivalent / effective dose
- **Why:** Printed p.81: effective dose in Sv. Bq is activity; J is energy. Textbook+DSE unit item.
- **Role:** concept-check
- **Flag:** textbook+exam

### QB 501 PHY15012102
- **Source:** `QB_501/5_ch01_SQ_e.pdf`
- **Tag:** equivalent dose unit
- **Why:** Same unit as 2026/32; Ch.1 parked it here. Use one of these, not both, on the page.
- **Role:** concept-check
- **Flag:** prereq bank

### Textbook Checkpoint 4
- **Source:** printed p.85
- **Tag:** effect depends on type and tissue, not amount alone; annual ~2.4 mSv not 2 Sv; 1 Sv of α ≠ 1 Sv of γ is false because Sv already includes the biological weighting
- **Why:** Direct 26.3 B. Q2 time / distance / shielding is the safety-principles check.
- **Role:** concept-check (T/F)
- **Flag:** textbook-only as a named checkpoint; principles are textbook+exam (QB RQ)

### QB PHY15024101 (Litvinenko / Po-210)
- **Source:** `QB_502/5_ch02_RQ_e.pdf`
- **Tag:** α safe outside, deadly inside; A = kN; two half-lives
- **Why:** Textbook snapshot on printed p.83 plus Fig. 26.21. One RQ is enough; do not also dump RQ 24102 (radon) unless the inhale diagram needs a second stem.
- **Role:** worked-example
- **Flag:** textbook+exam

### HKDSE 2015/32
- **Source:** `.../26_.../2015_q32.png` (ans A, 35%)
- **Tag:** film badge cannot monitor α
- **Why:** Paper/plastic wrap (Ch.25 Fig. 25.29). Filed in DSE 26 because badges appear in 26.3 safety lists, but the physics is 25.3. Mention only as a pointer back to Ch.1, do not rebuild the badge.
- **Role:** skip on Ch.2 pages (prereq)
- **Flag:** exam-only for this chapter; teach in Ch.1

---

## Ch.27 / QB 503 illumination (no Ch.3 pages)

### QB PHY15031115
- **Source:** `QB_503/5_ch03_MC_e.pdf`
- **Tag:** cutting a Pu sphere stops a chain reaction; half-life does **not** change
- **Why:** Same “characteristic T½ / k” claim as 2020/32 and printed pp.57 and 63. Use as a one-line reminder on the half-life page, not a fission lesson.
- **Role:** concept-check distractor seed only
- **Flag:** ch27-illumination

### Textbook Example 27.1 table (read, do not build Ch.3)
- **Source:** PDF p.90 / printed p.97
- **Tag:** fission rate can be controlled; α-decay rate is set by T½
- **Why:** Contrasts 26.1 “cannot change T½ by heating”. Do not add a fission animation.
- **Flag:** ch27-illumination

---

## QB 502 items that are Ch.25 (do not use as Ch.2 checks)

PHY15021101–21105, 21110, 21111, 21118: nuclide notation, isotopes, α/β counting, decay series. They live in the Ch.02 *file* but the textbook taught them in Ch.25. Ch.1 notes already cover the skill.

---

## Not shortlisted

Remaining QB 502 MC clones of A = A0 (1/2)^n; extra two-nuclide ratio drills once 2016/33 is used; LQ 2013/2014/2016/2017/2018/2023/2025 (long mixed papers); 2024 LQ 12 (the classified PNG is a mixed paper page, not a clean Ch.26 stem); uranium-lead dating (textbook enrichment only; no DSE 26 MC); DSE 2015/32 film badge (Ch.1).
