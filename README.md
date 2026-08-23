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

## Stack

React + TypeScript + Vite. The chart is hand-rolled SVG rather than a charting
library, so exports are true vector suitable for a manuscript figure, and there is
no dependency to rot.

## Deployment

Pushing to the default branch runs the tests and deploys `dist/` to GitHub Pages
via `.github/workflows/deploy.yml`. Enable it once under **Settings → Pages →
Build and deployment → Source: GitHub Actions**; after that every push ships.

The build uses relative asset paths, so it works from a repository sub-path or a
custom domain without reconfiguration. There is no server to run and no cost at
any traffic level.

## Status

`v0.1.0` — first release. Research use only; not for clinical or diagnostic
decision-making.
