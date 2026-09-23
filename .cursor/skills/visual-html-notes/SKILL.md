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

An EM wave is the combination of the E field and the B field. In three.js that is a traveling train of arrows: E along y, B along z, both `sin(kx - ωt)`, Poynting along +x. That full E+B animation belongs only here, on its own canvas. The electron beam is a moving KE particle stream on a second canvas beside it. The HTML heading already names the class ("Two types of radiation"). Do not glue the two types with a divider, floor, rail, 3D title plane, or class HUD. Each pane has its own `stage()` and `placeHud`, with a fixed camera (no drag-rotate). Student pages teach that physics; they do not recant earlier diagram mistakes.

```javascript
var train = emTrain(scene, {
  origin: new THREE.Vector3(-2.2, 0, 0),
  dir: new THREE.Vector3(1, 0, 0),
  eHat: new THREE.Vector3(0, 1, 0),
  bHat: new THREE.Vector3(0, 0, 1),
  length: 4.4, n: 20, eAmp: 1.22, bAmp: 0.92, k: 2.55, omega: 3.1
});
placeHud(hudE, canvas, camera, eTip);
placeHud(hudB, canvas, camera, bTip);
```

Every other EM-wave callout (X-rays from a target, γ from a nucleus, UV hitting a sample) is a small glyph: a few wavy arrows that say "EM wave produced here", not another cramped E+B train.

Local three.js: `js/lib/three.min.js`. No CDN requirement. Figure boxes are plain white. `stage()` drag-rotates only where the third dimension carries meaning (hand over film, X-ray tube, nucleus); which scenes that is lives on `ORBIT_SCENES` in that chapter's `diagrams3d.js`. Flat scenes such as the Fig. 25.2 EM wave and electron beam keep a fixed camera. No wheel zoom, pinch zoom, `camera.zoom` dolly, `sph.radius` scaling, or per-box + / −. The Fig. 25.11 atom nucleus range slider is a teaching control, not orbit zoom. The sticky top bar has no page-wide scale. Default framing fills the canvas: Fig. 25.7 is the example (hand, film, and HUD). `placeHud` keeps labels on the objects as the camera moves. Replay, when the clip is finite, is a button inside that same `.stage` box.

```javascript
placeHud(hudE, canvas, gfx.camera, eFieldAnchor);
```

## Worked title (Fig. 25.5)

Name the physics, not a private nickname. Bad: "where the EM cut sits". Good: "Non-ionizing and ionizing EM waves". Draw Fig. 25.5 as a static 2D SVG, not a 3D scene. The ionizing barrier sits far on the low-frequency side of UV: about one-tenth of UV is non-ionizing, most of UV plus X-rays and gamma rays are ionizing. Label that last band **gamma ray**, not γ (the symbol belongs in the nuclear-radiation section). Band widths follow the drawn spectrum. Paint the whole ultraviolet band one colour; the ~1/10 split is the dashed threshold on the bar plus the caption, not a second UV fill. No frequency slider, mark, or table under the bar.

## Worked concept check

Pull stem and options from the textbook figure, `problems.md`, QB, or DSE. Every distractor must be a real mix-up from this section. Classified paper scans belong in the end-of-section quizzes (see AGENTS.md), not in these in-flow checks.

Worked item after Fig. 25.2: "Which of the following is correct about radiation?"

(1) It always requires a medium to travel in. (2) Mass is taken from one place to another. (3) All EM waves are a form of radiation.

Answer (3) only. (1) is false: radiation need not travel in a medium. (2) is false as a general claim: EM radiation transfers energy, not mass.

Worked item after Fig. 25.3 (QB PHY15011101 idea): "What does ionizing radiation do to an atom?"

| A | It raises a bound electron to a higher shell, but the electron stays in the atom. |
| B | It knocks electrons out of atoms or molecules, turning them into ions. |
| C | It knocks protons out of the nucleus. |
| D | It has too little energy to knock electrons out. |

Answer B. A is excitation without knockout. C confuses ionization with a nuclear change. D is non-ionizing. Do not use "it is made of ions" or "it is made of atoms".

## Worked replay

A Replay button is only for a clip with a beginning and an end a student would watch again. It lives inside the `.stage` box (bottom-right), never outside the frame. Worked keep: knockout ejection (`#knock-vis`), ion-pair capture (`#pair-vis`), Fig. 25.7 film blackening (`#imaging-vis`). Worked drop: Fig. 25.2 Two types of radiation (both panes loop), the X-ray tube (electrons and X-rays keep coming). Do not leave an empty button row.

## Worked procedure (α / β / γ)

Teach identification as a steppable directed graph (paper / Al / Pb, then E or B, then cloud tracks), not a wall of prose. Example 25.6 numbers stay on the edges: air 700 → paper 700 (no α) → Al 315 (β) → Pb 190 (γ halved).

## Worked constraints

| Do this | Not this |
| --- | --- |
| Fig 25.2: two canvases (E+B wave and electron stream); the heading names the class; fixed camera | One scene with floor, rail, divider, or class HUD; drag-rotate on those panes |
| Replay only on finite clips (knockout, ion-pair, film blackening); button inside the `.stage` | Replay on a continuous loop such as Fig 25.2 or the X-ray tube; Replay outside the frame |
| Knockout: the same bound electron leaves the shell | An electron that fades in beside the atom |
| X-rays leave the electron impact on the angled target face as three fanned glyphs | Tight gold stubs, five-plus rays, or a cramped E+B train on one axis |
| Imaging: model X-rays down through one hand (flesh cylinders around bones, truncated wrist) without drawing ray glyphs or landing rings; transmit through metacarpal/finger flesh, not air gaps; film starts white; only reached spots blacken, and that exposure sweep is the animation | Side-by-side bone/flesh boxes, visible ray glyphs, rays in finger gaps, a palm disc or wrist sphere, a pre-dark film, or growing-arrow slabs |
| Orbit only where depth matters; Fig. 25.11 atom nucleus slider stays | Wheel / pinch / radius zoom; orbit on flat diagrams such as Fig. 25.2 |
| Default framing fills the canvas (Fig. 25.7); figure boxes plain white | Page-wide `--view-scale`, per-box + / −, cream/yellow panel fill, tiny apparatus, clipped film, or orbit dolly for size |
| Tables: columns sized to content; pair tables give the long prose column more width | Equal-width 100% slabs that squash short headers or stretch empty columns |
| Spectrum: static 2D SVG; whole UV band one colour; dashed ionizing threshold in UV (~1/10 still non-ionizing); last band labelled "gamma ray"; band widths follow the spectrum | A 3D demo, frequency mark or slider, γ as the Fig. 25.5 label, a split-colour UV band, equal-width slabs, or a table under the bar |
| Follow that chapter's `outline.md`; flag gaps | Invent another chapter's topics |
| Concept check after each idea (`problems.md`) | Dumping classified paper scans into the flow (those belong in the section quizzes), or nonsense options |
| Redraw from `_source/.../images/` in SVG/CSS/canvas/three.js | Embedding crop PNGs as final art |
