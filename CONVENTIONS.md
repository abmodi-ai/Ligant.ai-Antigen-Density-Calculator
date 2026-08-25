# Project conventions

## Scope

Every tool in the suite is a **cell therapy** tool: CAR-T, CAR-NK, TCR-T, TIL and
other adoptive cell products. Gene therapy is out of scope, and so is anything
that is not a cell product: soluble antibodies, T cell engagers, antibody drug
conjugates, small molecules. A tool that would sit equally well in another
modality does not belong here.

Designed for the modality, not merely usable within it. Concretely:

- Defaults, units and controls are the ones the modality actually uses. A dose
  axis defaults to an effector to target ratio, never a molar concentration.
- Quality checks encode the failure modes of this modality's assays rather than
  generic curve-fitting hygiene.
- Worked examples use real cell therapy targets and constructs.
- Examples in documentation, comments and guidance name cell therapy quantities.
  An antibody concentration or a vector genome dose is the wrong example even
  where the arithmetic would accept it.

This rules out tools that were otherwise attractive, including vector titre from
qPCR, whose regression and inverse prediction the antigen calibration core would
have supplied almost directly. Reusable maths is not a reason to widen the
modality.

The rule is deliberately not machine checked. Gene transfer vocabulary is not a
reliable signal, because a CAR-T process legitimately discusses lentiviral
transduction and multiplicity of infection. Scope is a review judgement at design
time, not a keyword gate.

## Writing

**Never use an em dash.** Not in UI copy, code comments, commit messages,
documentation, or PR descriptions. Use a full stop, a colon, a semicolon, or
parentheses instead. This is enforced by `npm run check:style`, which runs in CI
and fails the build on any occurrence.

An en dash is permitted only as a range or compound separator, where numerals or
words sit on both sides: `100–1,000`, `log10–log10`. Never as sentence
punctuation.

## Register

Product copy is written for a working scientist and reads closer to a methods
section than to marketing. Concretely:

- Declarative and impersonal. "Cytotoxicity is frequently achievable", not
  "you'll usually get killing".
- Name the quantity precisely. "Median fluorescence intensity", not "signal".
  "Antibody binding capacity", not "how much antibody sticks".
- State limitations plainly and in the same voice as the results. Uncertainty is
  reported, never softened or editorialised.
- No hype, no superlatives, no exclamations. Specific over emphatic.
- British spelling for prose (`normalise`, `tumour`, `colour`). Identifiers in
  code follow their library's spelling.

Per the brand guidelines: defensible by source, not assertive by tone. Trade-offs
named explicitly.

## Colour and semantics

Colours come from Ligant Brand Guidelines v1.1 and are never re-stepped or
invented. Roles are fixed:

- Teal is evidence, confidence, and data-viz.
- Amber is the human decision moment, including quality flags.
- Red is system error only. It never marks a result as bad.
- Density and other magnitude scales are achromatic. A reading carries no
  verdict.

## Privacy

Privacy is the product, not a feature. Four invariants, all enforced by tests
rather than by policy:

1. **No user data leaves the browser.** No telemetry, no error reporting, no
   analytics, no model API.
2. **No third-party origin.** Every byte is served from our own origin.
   Typefaces are self-hosted, never loaded from a font network.
3. **Local storage is disclosed and erasable.** The user can see exactly which
   keys are written and clear them.
4. **The content security policy permits `'self'` only.** The single relaxation
   ever permitted is `'wasm-unsafe-eval'` in `script-src`, for on-device
   inference, which grants no network capability.

`npm run check:privacy` fails the build on an external origin in the CSP, an
external URL in `index.html` or the bundle, or a network primitive in `src/`.
`npm run check:network` then proves it at runtime: it serves the production
build with the real CSP applied, drives a full session in a browser, and fails
on any request to another origin. String analysis is the early gate; the runtime
assertion is the guarantee.

Model weights, when on-device inference is added, are served from our own origin
so no outside party ever observes a user. Weights must be Apache-2.0 or MIT. Not
Gemma: its terms restrict health-related professional content and reserve remote
enforcement.

## Determinism

No language model output ever reaches a computed value. All numbers come from
pure functions over user input, and a test asserts that repeated evaluation of
identical inputs produces identical results.

## Commands

```sh
npm run verify     # everything below, in order
npm test           # unit tests
npm run check:style
npm run check:privacy   # static: no external origin anywhere
npm run check:network   # runtime: nothing leaves the origin
npm run build      # static site to dist/
npm run build:single
```
