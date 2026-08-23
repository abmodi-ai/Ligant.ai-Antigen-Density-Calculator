# Antigen Density Calculator

Converts flow cytometry MFI into **molecules per cell** against a calibrated bead
standard. First tool in a planned suite for CAR-T target selection and
characterisation.

The number a CAR actually responds to is surface antigen density, not relative
fluorescence. Labs convert MFI to molecules per cell in ad-hoc spreadsheets, which
is tedious and easy to get wrong. This does it correctly, shows its working, and
refuses to report a number it cannot defend.

## Method

Bead standards are fitted by ordinary least squares in log10–log10 space:

```
log10(assigned value) = slope · log10(MFI) + intercept
```

A sample MFI is then mapped through that fit. Two calibration chemistries are
supported, because they certify different quantities:

| Chemistry | Beads certify | Conversion |
|---|---|---|
| `abc` (Quantum Simply Cellular and equivalents) | Antibody binding capacity | Read directly; fluorophore-independent |
| `pe-molecules` (QuantiBRITE PE and equivalents) | PE molecules per bead | Divided by the conjugate's F/P ratio |

Corrections and reporting:

- **Background** subtracted either in density space (default) or in MFI space.
  These agree only when the log-log slope is exactly 1.
- **Binding valency** brackets antigen sites per cell: a whole IgG binding
  bivalently gives ABC to 2×ABC.
- **Confidence interval** is the interval on the fitted mean response at the
  sample's MFI — the uncertainty in where the calibration curve sits. It
  deliberately excludes measurement variability in the unknown sample, which
  would require replicates; claiming it here would overstate precision.

Assigned bead values are **lot-specific** and are never hard-coded. Kits supply
population structure and chemistry only.

### Quality flags

The tool refuses to be quietly wrong. It flags:

- sample MFI outside the bead range (extrapolated, not quantitative)
- R² below 0.98
- log-log slope more than 0.15 from unity (detector or compensation problem)
- results below the lowest standard
- background at or above sample signal

## Determinism

Every number comes from pure functions over the user's inputs. No model, no
network call, no language model anywhere in the compute path. Identical inputs
produce identical outputs, always — there is a test asserting exactly that.

The statistics core is verified against published Student's t critical values and
against closed-form regression results.

## Interpretation bands

Results are labelled against order-of-magnitude density bands drawn from the
published CAR density-threshold literature. **These are reading aids, not
validated cutoffs.** A CAR's activation threshold is a property of the specific
construct — scFv affinity, hinge, costimulatory domain — and of the effector
function in question: cytotoxicity triggers at lower density than cytokine
release and proliferation.

## Development

```sh
npm install
npm run dev            # local dev server
npm test               # 35 tests over the math core
npm run build          # static site -> dist/
npm run build:single   # one self-contained HTML file -> dist-single/
```

No backend. No accounts. No data leaves the browser. State persists to
`localStorage` and degrades cleanly when storage is unavailable.

## Brand

Implements **Ligant Brand Guidelines v1.1**. Every colour is taken from the
published palette — nothing re-stepped, nothing invented. Inter for UI text,
IBM Plex Mono for digits, identifiers, and aligned columns. The Council · Ringed
mark is drawn as inline SVG (ring = the table, six dots = the agents, amber
centre = the human), so it stays crisp at favicon sizes.

Two brand rules changed the design rather than just its colours:

- **Density bands are achromatic.** §04 states green is not good and red is not
  bad news, and §06.03 asks for epistemic neutrality. Density is a magnitude, so
  the bands run along a warm-neutral to navy ramp and assert no verdict. They
  previously used a green/amber/red status scale, which editorialised the result.
- **Quality flags wear amber, not red.** Amber is the human decision moment; red
  is reserved for system error. An extrapolation warning is a decision point,
  not a failure.

### Dark theme — documented variance

Light theme uses the published palette unchanged. Dark theme sits on the Navy
ground (approved, §03) and carries a variance: three colours fall under the 3:1
floor for a graphical object on Navy and needed dark-ground steps.

| Role | Published | Dark step | Contrast on Navy |
|---|---|---|---|
| Data-viz teal | `#0D7C66` | `#33A78D` | 2.77:1 → 4.78:1 |
| System error | `#C0392B` | `#D4786F` | 2.61:1 → 4.55:1 |
| Muted text | `#8B8678` | `#959184` | 3.91:1 → 4.51:1 |

Amber needed no step. `#B8860B` measures 4.37:1 on Navy and clears every palette
check unchanged, so the decision-moment colour is identical in both themes. Hues
are preserved; only lightness moves.

**This needs Design sign-off**, and the companion *Platform UI Design System*
referenced in §08 may already define these tokens — if so, they supersede the
values here.

Measured on Off-White: navy 13.3:1, slate 8.3:1, muted 5.5:1, teal 4.8:1 — all AA
or better for body text. Amber at 3.05:1 carries icons, rules, and marks, never
small text.

## Stack

React + TypeScript + Vite. The chart is hand-rolled SVG rather than a charting
library, so exports are true vector suitable for a manuscript figure, and there is
no dependency to rot.

## Deployment

`ci.yml` runs typecheck, tests, and both builds on every push, and uploads the
result as an artifact. It is independent of hosting.

`deploy.yml` publishes `dist/` to GitHub Pages. **Pages is unavailable for
private repositories on the GitHub Free plan**, so this workflow cannot succeed
while the repository is private on a Free account — it fails at `configure-pages`
regardless of the workflow definition. Either make the repository public, move
the account to Pro, or host elsewhere.

Any static host works: the build is plain files with relative asset paths, so it
runs from a repository sub-path, a custom domain, or a subdirectory unchanged.
Cloudflare Pages and Netlify both build private repositories on their free tiers
with `npm run build` and a `dist` output directory.

`npm run build:single` emits one self-contained HTML file that needs no server at
all — useful for a quick host, an offline demo, or emailing to a collaborator.

## Status

`v0.1.0` — first release. Research use only; not for clinical or diagnostic
decision-making.
