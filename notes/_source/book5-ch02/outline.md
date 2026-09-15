# Book 5 Ch.2 outline (syllabus Ch.26)

Textbook order from Active Physics Book 5 Chapter 2, *Rate of Decay and Uses of Radionuclides*. Visual-first: each idea lists **visual / animation**, **short text**, and **concept check**. Do not write the HTML chapter in this intake.

Source gap: this PDF starts at printed p.54 (26.1). Printed pp.52–53 (chapter opener) are missing.

Cross-reference: home set is the textbook + QB 502 + DSE 26. QB 501 / DSE 25 are prerequisites. QB 503 / DSE 27 are illumination only. Do not invent half-life / sievert / dating that these sources do not support. Do not build Chapter 3 pages.

---

## 26.1 Rate of radioactive decay (printed pp.54–67)

### A. Random nature

- **Visual:** Dice / nuclei tray (Fig. 26.1–26.2). Fig. 26.3 remaining-count graph. Animate a grid of nuclei: each step a fixed probability (~1/6) decays; remaining count halves every few throws. Do not photograph a person holding dice.
- **Text (minimal):** Decay of one nucleus is random. A large sample is still predictable because the probability per interval is fixed. Fewer undecayed nuclei → fewer decays in the next interval.
- **Check:** QB `PHY15021117`. HKDSE 2020/30 (filed under 25: fluctuating background, not a falling sequence).
- **Sources:** textbook 26.1 A; QB 502; DSE 25/30 as prereq parked here. Not in DSE 26 as a dedicated “random means” MC.

### B. Half-life

- **Visual:** Fig. 26.4 I-131: N against t with stacked remaining (orange) / decayed (grey). Total height of each stack stays 40 billion. Table 26.2 → N = N0 (1/2)^n. Table 26.3 characteristic T½ (Po-215 0.0018 s … U-238 4.47×10^9 y). Animate n = 0,1,2,3 on the same curve.
- **Text:** T½ is the time for N (and later A) to drop to half. Unique for each nuclide; heating / chemistry does not change it. Decayed nuclei become a daughter; they do not vanish (p.60 puzzle + summary mistake 1).
- **Check:** QB `PHY15021155`. HKDSE 2023/31 (Y does not double). HKDSE 2012/35 or 2013/35 (half of a half-life). HKDSE 2021/32 (three half-lives earlier).
- **Sources:** all textbook+exam. Gap: textbook Example 26.2 is integer n; DSE often uses n = 1/2.

### C. Activity

- **Visual:** Fig. 26.5 three clusters (8, 4, 2)×10^9 nuclei with A = 4, 2, 1×10^3 Bq. Fig. 26.6 A against t, same 8 d clock as Fig. 26.4. Example 26.1 recorded count rate flattening at background (~40 min−1); T½ from *corrected* counts (p.59, summary mistake 2).
- **Text:** A = number of nuclei decaying per unit time. 1 Bq = 1 s−1. A ∝ N so A = A0 (1/2)^n as well. Longer T½ is not automatically a weaker source (Amy & Bob p.60; summary mistake 3).
- **Check:** HKDSE 2025/31 (300 / 60 s = 5 Bq). sap/35 (A depends on N and T½, not α/β/γ). 2019/32 (Amy & Bob trap). 2024/32 (800→600 is not a half-life). Example 26.1 / Checkpoint 1 graph.
- **Sources:** textbook+exam. A = kN is introduced here as the proportionality; the exponential form is Extension.

### D. Decay constant (Extension)

- **Visual:** Fig. 26.7 twin exponential graphs. Keep the “Extension” stamp on the student page so core students can skip the ln algebra.
- **Text / equations (on-screen, not prose):**
  - A = kN
  - k = (nuclei decaying per unit time) / (undecayed nuclei) = probability of decay per unit time
  - N = N0 e^{−kt}, A = A0 e^{−kt}
  - T½ = ln 2 / k
  - k is characteristic (same claim as T½). Mole bridge: N = n NA (Example 26.5).
- **Check:** HKDSE 2020/32 (k characteristic). Example 26.3 Rn-220 or 26.5 Pu-239. LQ 2021/9 banana (moles → A).
- **Sources:** textbook Extension + heavy DSE/QB 502 use. Flag the core/extension split; still animate A = kN because sap/35 and 2025/31 need it.
- **Illumination:** QB `PHY15031115` (splitting Pu does not change T½). Example 27.1 table: fission rate can be controlled, α-decay rate cannot.

---

## 26.2 Uses of radionuclides (printed pp.68–79)

Chooser, used on every application: (1) radiation type / penetrating / ionizing, (2) half-life. Do not invent extra selection rules.

### A. Medical

- **Visual:** Fig. 26.8 Gamma Knife: γ from a long-lived source (Co-60, ~5.27 y) through a helmet. Fig. 26.10 tracer in blood → organ. Skip patient photos.
- **Text:**
  - External: γ, long T½ (years).
  - Internal therapy: β, days–weeks (Sr-89 ~50 d); α too ionizing; γ would dose the whole body.
  - Tracer: γ, hours (Tc-99m ~6 h). Example 26.6 blood volume: α forbidden; T½ too short → gone; too long → lingering dose.
- **Check:** Checkpoint 3 row (a). QB `PHY15021109` (γ, not years/seconds). Example 26.6 as a short worked item.
- **Gap:** QB 502 medical-tracer MC allows an 8-day γ; the book prefers hours. Teach the book band; mention that exams sometimes accept days if the type is γ.

### B. Industrial

- **Visual:** Fig. 26.11 leak under soil (γ, hours, e.g. Na-24 15 h). Fig. 26.12 thickness gauge (β, long T½, Kr-85). Fig. 26.14 smoke detector (α, long T½, Am-241): ion current on → smoke attaches → current drops → alarm. Example 26.7 milk cartons (β; empty carton, high count).
- **Text:** α always stopped by the sheet; γ ignores thickness. Smoke: short α range, strong ionizing.
- **Check:** HKDSE 2024/33 (pipe: γ, tens of hours). QB `PHY15022101` (β thickness, not γ). Example 26.7.
- **Sources:** textbook+exam. No DSE MC on smoke detectors in section 26; keep the animation from the book.

### C. Agricultural

- **Visual:** Fig. 26.15 P-32 plant tracer (β, 15 h). Fig. 26.16 packaged food under γ (Co-60); food does **not** become radioactive (Amy & Bob p.75).
- **Text:** Irradiation = sterilization with γ, not contamination.
- **Check:** Amy & Bob irradiated strawberries. Checkpoint 3 rows (c)(d).
- **Flag:** textbook-only as a T/F; no DSE 26 MC on irradiation.

### D. Archaeological (C-14)

- **Visual:** Fig. 26.18 three-panel: atmosphere constant, living constant, dead decreases. Fig. 26.19 activity A0 while alive and just dead, then ½ A0, ¼ A0. Equation on-screen: ¹⁴C → ¹⁴N + e. Range ~60–60 000 y.
- **Text:** Cannot date rock / metal / living people / objects outside that window. Example 26.8 living A0 ≈ 960 Bq per gram carbon (book numbers).
- **Check:** HKDSE 2015/33. Exercise Q2 (wooden chair, not rock/coin/knife).
- **Enrichment only (do not animate as core):** uranium-lead dating; bomb-test C-14 correction (points at Ch.27). No DSE 26 MC on U-Pb.

---

## 26.3 Radiation safety (printed pp.80–85)

### A–B. Hazard and effective dose

- **Visual:** Fig. 26.21 inhale/ingest (α inside). Fig. 26.22 activity = emitted, dose = absorbed. Fig. 26.23 radiation weighting (α 20, β/γ/X 1). Fig. 26.24 tissue factors. Fig. 26.25 log everyday mSv. Fig. 26.26 sickness scale.
- **Text:** External: γ most dangerous (penetrates). Internal: α worst. Effective dose (Sv) folds in amount, type, and tissue. HK background ~2.4 mSv/year (80% natural, from Ch.25). Public limit 1 mSv; workers 20 mSv (exclude natural + medical).
- **Check:** HKDSE 2026/32 (Sv, not Bq). Checkpoint 4 T/F. QB 501 `PHY15012102` if 2026/32 is not used.
- **Sources:** textbook+exam for Sv. Tissue-weighting numbers are textbook-only; DSE 26 asks the unit and qualitative factors, not the 0.20 gonad figure.

### C–D. Sickness and ALARA

- **Visual:** Time / distance / shielding (redraw Fig. 26.27–26.31 as three icons, not photos). Optional: Po-210 snapshot as the ingest story.
- **Text:** Time, distance, shielding. Film badges monitor *workers* (the badge physics is Ch.1).
- **Check:** Checkpoint 4 Q2. QB `PHY15024101` (a) only: α safe outside, deadly inside. Skip 2015/32 film-badge α (Ch.1).
- **Sources:** textbook+exam. Litvinenko is textbook snapshot + QB RQ.

---

## Summary, common mistakes, chapter exercise

- **Visual:** Rebuild: (1) N and A halve on the same T½ clock; (2) A = kN; (3) uses table (medical / industrial / agricultural / C-14); (4) Sv vs Bq. Three mistake panels from printed p.87.
- **Checks:** Chapter Exercise Q1 (two activity graphs, T½ ratio 4:1 when X halves in 60 s and Y quarters in 30 s); Q5 (not an application: transmitting signals); Q7 (brain imaging: γ, hours). Do not dump the whole exercise.
- **Gap:** Chapter-exercise numerical keys are not in the OCR. Do not score Q11–Q19 as auto-marked items without a source-backed key.

---

## Out of this chapter (do not preview as Ch.26 notes)

Nuclear fission, fusion, chain reaction, reactors, E = Δmc². Those start at PDF p.87 (Ch.27). Read only to confirm that T½ stays characteristic when a chain reaction is interrupted.

---

## Source-split flags (do not invent across the gap)

| Idea | Textbook 26 | QB 502 / DSE 26 | Notes decision |
| --- | --- | --- | --- |
| Random which nucleus | yes | QB 21117; DSE 2020/30 (filed 25) | teach |
| T½ definition; N and A halve | yes | many | teach |
| Decayed nuclei still exist as daughter | yes (puzzle + mistake) | 2023/31; 2013/35 | teach |
| Background floor on a count graph | yes (Ex 26.1) | QB 22103 | teach |
| Longer T½ ≠ weaker A | yes (Amy & Bob) | 2019/32 | teach |
| A in Bq = s−1 | yes | 2025/31 | teach |
| k characteristic; T½ = ln 2 / k | Extension | DSE 2020/32; many LQ | teach as extension, still needed |
| Mole → N0 → A | Extension Ex 26.5 | LQ 2021/9 | one worked example |
| Choose type + T½ for a use | yes | 2024/33; QB 21109; 22101 | teach |
| Food irradiation does not activate food | yes | no DSE 26 MC | keep Amy & Bob |
| C-14 dating window | yes | 2015/33 | teach |
| U-Pb dating | enrichment | none in DSE 26 | sidebar at most |
| Sv / effective dose | yes | 2026/32; QB 501 12102 | teach |
| α dangerous if ingested | yes | QB 24101 | teach |
| Film badge vs α | 26.3 lists badges | DSE 2015/32 | pointer to Ch.1 only |
| Smoke detector | yes | no DSE 26 MC | keep book animation |
| Fission vs T½ | Ch.27 | QB 503 31115 | one sentence, no Ch.3 page |
