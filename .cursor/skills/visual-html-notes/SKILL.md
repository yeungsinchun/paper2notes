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

An EM wave is the combination of the E field and the B field. In three.js that is a traveling train of arrows: E along y, B along z, both `sin(kx − ωt)`, Poynting along +x. That full E+B animation belongs only here. The electron beam is a moving KE particle stream beside it, not a conversion of the wave. Labels sit on the objects with `placeHud`.

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

Every other EM-wave callout (X-rays from a target, γ from a nucleus, UV hitting a sample) is a small glyph: a few wavy arrows that say "EM wave produced here", not another cramped E+B train.

Local three.js: `js/lib/three.min.js`. No CDN requirement. `stage()` makes the scene orbitable: drag to rotate, scroll to zoom; `placeHud` keeps labels on the objects as the camera moves.

```javascript
gfx.orbit.nudge(40, 6); // same motion a student drag would make
placeHud(hudE, canvas, gfx.camera, eFieldAnchor);
```

## Worked title (Fig. 25.5)

Name the physics, not a private nickname. Bad: "where the EM cut sits". Good: "Non-ionizing and ionizing EM waves". The ionizing barrier sits far on the low-frequency side of UV: about one-tenth of UV is non-ionizing, most of UV plus X-rays and γ are ionizing. No frequency slider or mark.

## Worked concept check

Pull stem and options from the textbook figure, `problems.md`, QB, or DSE. Every distractor must be a real mix-up from this section.

Worked item after Fig. 25.3 (QB PHY15011101 idea): "What does ionizing radiation do to an atom?"

| A | It is made of ions. |
| B | It knocks electrons out of atoms or molecules, turning them into ions. |
| C | It turns a light beam into an electron beam. |
| D | It has too little energy to knock electrons out. |

Answer B. A is "radiation made of ions". C keeps EM wave and electron beam as two types. D is non-ionizing. None of those is off-topic filler.

## Worked procedure (α / β / γ)

Teach identification as a steppable directed graph (paper / Al / Pb, then E or B, then cloud tracks), not a wall of prose. Example 25.6 numbers stay on the edges: air 700 → paper 700 (no α) → Al 315 (β) → Pb 190 (γ halved).

## Worked constraints

| Do this | Not this |
| --- | --- |
| Knockout: the same bound electron leaves the shell | An electron that fades in beside the atom |
| X-rays leave the electron impact on the angled target face as a wide fan | Tight gold stubs plus a cramped E+B train on one axis |
| Imaging: X-rays down onto bone beside flesh; film white under bone, dark under flesh | Sideways beams or toggles that hide the textbook layout |
| Spectrum: static barrier in UV (~1/10 of UV still non-ionizing) | A frequency mark, slider, or "cut after all UV" |
| Follow `outline.md`; flag gaps | Invent Ch.26 half-life / sievert / dating |
| Concept check after each idea (`problems.md`) | Dumping the whole HKDSE/QB set, or nonsense options |
| Redraw from `_source/.../images/` in SVG/CSS/canvas/three.js | Embedding crop PNGs as final art |
