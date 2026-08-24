# Project conventions

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

## Determinism

No language model output ever reaches a computed value. All numbers come from
pure functions over user input, and a test asserts that repeated evaluation of
identical inputs produces identical results.

## Commands

```sh
npm test           # unit tests
npm run check:style
npm run build      # static site to dist/
npm run build:single
```
