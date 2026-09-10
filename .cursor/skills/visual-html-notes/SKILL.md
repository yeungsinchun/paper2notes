---
name: visual-html-notes
description: Write visual-first HTML notes under notes/** as three.js diagrams, comparison tables, and example-driven decision flows. Use when creating or editing notes HTML/CSS/JS, chapter pages, concept checks, or figures in notes/.
---

# Visual HTML notes

Open a chapter `index.html` in a browser (no build). Intake is `notes/_source/<book-ch>/`. Student pages must not show intake, OCR, QB numbers, "book cut", textbook-order ledes, or other meta chrome; keep provenance in `_source` or HTML comments.

## Worked page (25.1 knockout)

The idea opens with a three.js scene: a bound electron already on the atom is knocked out. Prose after the figure is a table, not a list.

| | ionizing | non-ionizing |
| --- | --- | --- |
| Energy | enough to knock an electron out of an atom or molecule | not enough for knockout |
| Hazard | damaged tissue / DNA | not this ionizing hazard |

Same table style elsewhere: `What you see` / `Therefore`, for example "Both transfer energy from one place to another" => "Both of them are forms of radiation."

## Worked figure (Fig. 25.2 light beam)

An EM wave is the combination of the E field and the B field. In three.js that is a traveling train of arrows: E along y, B along z, both `sin(kx − ωt)`, Poynting along +x. Not a 2D sine path and not a scalar packet on one axis. The electron beam is a moving KE particle stream. Labels sit on the objects with `placeHud`.

```javascript
var train = emTrain(scene, {
  origin: new THREE.Vector3(-5.35, 0, 0),
  dir: new THREE.Vector3(1, 0, 0),
  eHat: new THREE.Vector3(0, 1, 0),
  bHat: new THREE.Vector3(0, 0, 1),
  length: 4.55, n: 20, eAmp: 1.22, bAmp: 0.92, k: 2.55, omega: 3.1
});
placeHud(hudE, canvas, camera, eTip);
placeHud(hudB, canvas, camera, bTip);
```

Local three.js: `js/lib/three.min.js`. No CDN requirement.

## Worked procedure (α / β / γ)

Teach identification as a steppable directed graph (paper / Al / Pb, then E or B, then cloud tracks), not a wall of prose. Example 25.6 numbers stay on the edges: air 700 → paper 700 (no α) → Al 315 (β) → Pb 190 (γ halved).

## Worked constraints

| Do this | Not this |
| --- | --- |
| Knockout: the same bound electron leaves the shell | An electron that fades in beside the atom |
| X-rays leave the electron impact on the angled target face | Rays from the gun or the stem |
| Imaging: X-rays down onto bone beside flesh; film white under bone, dark under flesh | Sideways beams or toggles that hide the textbook layout |
| Spectrum: static ionizing cut after UV | A frequency mark or slider |
| Follow `outline.md`; flag gaps | Invent Ch.26 half-life / sievert / dating |
| Concept check after each idea (`problems.md`) | Dumping the whole HKDSE/QB set |
| Redraw from `_source/.../images/` in SVG/CSS/canvas/three.js | Embedding crop PNGs as final art |
