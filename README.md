# Antigen Density Calculator

Converts flow cytometry median fluorescence intensity into antibody binding
capacity against a calibrated bead standard, reports the uncertainty, and
refuses to report a number it cannot defend.

Free, open source, and built by [Ligant](https://ligant.ai) and
[A.B. Modi](https://www.linkedin.com/in/abmodi-ai/) for cell therapy
researchers. It runs entirely in the browser. Nothing you enter ever leaves
your computer.

Live at **[benchtools.ligant.ai](https://benchtools.ligant.ai)**. Source at
**[github.com/abmodi-ai/Ligant.ai-Antigen-Density-Calculator](https://github.com/abmodi-ai/Ligant.ai-Antigen-Density-Calculator)**,
linked from the footer of the tool itself so the licence on the page can be
checked by the reader it is addressed to.

## Why this exists

The quantity a chimeric antigen receptor actually responds to is surface
antigen density, not relative fluorescence. A CAR that clears a target line at
50,000 molecules per cell may do nothing at 500, and the same construct may kill
a normal tissue that expresses the antigen at an intermediate level. On-target
off-tumour toxicity is a question about numbers of molecules, and it cannot be
answered in arbitrary fluorescence units.

Laboratories do this conversion today in ad-hoc spreadsheets. The arithmetic is
short, the failure modes are not: a bead population entered against the wrong
certified value, a control brighter than its sample, a calibration curve bending
in a way that leaves both R² and the slope looking healthy. Every one of those
produces a number that looks like an answer.

This tool does the conversion, shows its working, and says plainly when the
answer should not be reported. It is open source because a measurement nobody
can inspect is not a measurement, and because the field is better served by one
implementation that is argued over in public than by fifty spreadsheets that are
not.

## Method

Bead standards are fitted by ordinary least squares in log10–log10 space:

```
log10(assigned value) = slope · log10(MFI) + intercept
```

A sample intensity is mapped through that fit and reported as **ABC**, the
number of antibody molecules bound per cell. ABC is not antigen copy number, so
the tool never labels it as such. Antigen sites are shown separately, as a range
inferred from binding valency and marked as inferred.

Two calibration chemistries are supported, because they certify different
quantities:

| Chemistry | Beads certify | Conversion |
|---|---|---|
| `abc` (Quantum Simply Cellular and equivalents) | Antibody binding capacity | Read directly; fluorophore-independent |
| `pe-molecules` (QuantiBRITE PE and equivalents) | PE molecules per bead | Divided by the conjugate's F/P ratio |

Corrections and reporting:

- **Background** is subtracted either in density space (the default) or in MFI
  space. The two agree only when the log-log slope is exactly 1, and the tool
  reports how far apart they are when they are not.
- **Binding valency** brackets antigen sites per cell. A whole IgG binding
  bivalently gives a range of ABC to 2×ABC.
- **The confidence interval** is the interval on the fitted mean response at the
  sample's intensity. It quantifies uncertainty in the position of the
  calibration curve, and deliberately excludes measurement variability in the
  unknown sample, which would need replicates. Claiming it here would overstate
  precision.

Assigned bead values are **lot-specific and are never hard-coded**. Kit
definitions supply population structure and calibration chemistry only; the
certified values are transcribed by the user from the vial or its certificate of
analysis.

### What it refuses to do

The tool computes and reports rather than blocking entry, but it withholds a
figure the calibration cannot support, and says which one and why. It flags:

- a sample intensity outside the bead range, which is extrapolation rather than
  quantification
- R² below 0.98
- a log-log slope more than 0.15 from unity, which usually means a detector or
  compensation problem
- a standard curve that is not straight in log-log space, tested by the
  significance of a quadratic term and reported as the drift in local slope
  across the range. A symmetric bend leaves the overall slope at unity and R²
  high, so neither of those catches it. The test needs six populations; below
  that it has no power and is not run
- a bead population whose intensity-to-certified-value ratio disagrees with the
  rest of the table, named at its own row
- assigned values that do not increase with intensity, which is a transposition
- a fit resting on three populations, which leaves one degree of freedom
- background at or above sample signal, reported as below detection
- background that is a material fraction of the gross signal, escalated when the
  control intensity is itself extrapolated below the standards
- density-space and MFI-space subtraction diverging by more than a tenth
- a declared antibody host that the selected capture beads cannot bind
- a value that cannot be used, named at the field it was typed into

### Interpretation bands

Results are labelled against order-of-magnitude bands drawn from the published
CAR density-threshold literature: sub-threshold below 100 ABC, low to 1,000,
intermediate to 10,000, high above that.

**These are reading aids, not validated cutoffs.** A CAR's activation threshold
is a property of the specific construct (binder affinity, hinge, costimulatory
domain) and of the effector function in question: cytotoxicity triggers at lower
density than cytokine release, which triggers lower than proliferation.

## The functions that do the work

The computation is a small, pure core with no framework in it. Every function
below takes values and returns values.

**`src/lib/stats.ts`** implements the statistics from scratch rather than
pulling in a library, so that every number can be traced and tested:

| Function | Does |
|---|---|
| `linearRegression(xs, ys)` | Ordinary least squares, returning slope, intercept, R², residual standard error and the sums the interval needs |
| `meanResponseInterval(fit, x, level)` | The confidence interval on the fitted mean response at a point |
| `quadraticCurvature(xs, ys)` | Fits a centred quadratic by closed-form normal equations and tests the second-order term, which is what detects a symmetric bend |
| `studentTCdf`, `studentTInv`, `tCritical` | Student's t, via a Lanczos log-gamma and the regularised incomplete beta |

**`src/lib/quantify.ts`** is the calibration core:

| Function | Does |
|---|---|
| `fitStandardCurve(standards)` | Fits the bead standards and raises the curve-level flags |
| `checkStandardConsistency(standards)` | Finds the population that disagrees with the others, before any fit is trusted |
| `captureCompatibilityFlags(kit, host)` | Checks the declared antibody host against the capture chemistry |
| `quantifySample(sample, curve, options)` | Maps one intensity through the fit, applies background and valency, returns the result and its flags |
| `quantifyWithCalibration(...)` | The same, with curve-level flags propagated onto the sample, so an invalid calibration reaches every figure it invalidates |
| `calibrationValid`, `resultStatus` | Whether a result may be reported, and at what confidence |
| `bandFor(abc)` | The interpretation band |

**`src/lib/validate.ts`** (`checkMfi`, `checkAssigned`, `checkControl`) says what
is wrong with a single value at the field it was typed into.
**`src/lib/paste.ts`** (`readPaste`) reads a block pasted from a spreadsheet and
reports what it assumed, rather than silently guessing.
**`src/lib/persist.ts`** (`persist`, `restoreOptions`) holds the rule that
storage mirrors work in progress, and nothing else.

## Reproducibility and determinism

A tool that produces a number a laboratory writes down has to produce the same
number tomorrow. That is a design constraint here, not an aspiration:

1. **Every reported number comes from a pure function over the user's inputs.**
   No network call and no model output ever reaches a computed value. A test
   asserts that repeated evaluation of identical inputs produces identical
   results, bit for bit.
2. **The statistics are verified against external references**, not against the
   implementation's own output: published Student's t critical values, and
   closed-form regression results computed independently.
3. **The methods text travels with the numbers.** The CSV export carries the
   fit, the options in force, the flags raised, and a machine-readable status
   per sample, so a result can be audited without the session that produced it.
4. **The whole thing is 313 tests and roughly 8,900 lines of TypeScript**, with
   no runtime dependency beyond React and two self-hosted typefaces.

Where a threshold appears in this tool, it was chosen from measurement rather
than from convention, and the reasoning is in the commit that introduced it. The
ratio-consistency tolerance is 2.5 rather than the 10 originally proposed,
because 10 would have missed both the transposition and the decimal slip the
check exists to catch, while real curves stay under 1.70.

## How AI is used, and how it is not

The tool ships a question-answering layer: a reader can ask a question at any
control and get an answer. It is worth being exact about what that is, because
"AI" covers two very different things and only one of them is here.

**No language model is involved, and nothing is generated.** Every answer is a
passage written by hand, held in the repository, and returned verbatim under its
own heading so the reader can see where it came from. The retrieval is BM25 over
that corpus, with title weighting, hand-written domain synonym groups, and a
conservative stemmer. It is scoped to the control the question was asked at,
which is what lets a small corpus behave like a large one.

This has consequences a generative system cannot offer:

- **It cannot invent an answer.** When nothing in the corpus clears the relevance
  gate, the tool says so rather than approximating. Silence is a truthful
  statement that the corpus does not cover a question yet.
- **It is deterministic.** The same question against the same state returns the
  same passages in the same order.
- **It is auditable.** The corpus is source code. You can read every answer the
  tool is capable of giving, and disagree with any of them in a pull request.
- **It runs entirely in the browser**, with no inference server, no API key and
  no request. There is nothing to send anywhere because there is nothing to ask.

Questions the reader types are held in memory for the session and are never
written to storage. A question can carry as much of someone's work as the data
does.

If on-device inference is added later, the constraints are already set: weights
must be Apache-2.0 or MIT licensed and served from this origin, so that no
outside party ever observes a user, and the single content-security-policy
relaxation it would need (`'wasm-unsafe-eval'`) grants no network capability. No
model output would reach a computed value in any case; determinism is not
negotiable.

## Privacy

Nothing you enter is transmitted, and the page contacts no third party at all.
Not "we do not sell your data", but "no origin other than this one is contacted,
ever":

- Typefaces are self-hosted, about 104 kB of Latin subsets, rather than loaded
  from a font network, so no third party sees a visitor.
- There is no analytics script, no error reporting and no telemetry of any kind.
- The content security policy permits connections to this origin only.
- What is stored in your browser is disclosed on the page, is only ever the
  values currently on screen, and is removed by a button. Enter nothing and
  nothing is written.

**This is enforced, not promised.** Two checks run on every commit:

- `npm run check:privacy` fails the build on any external origin in the policy,
  the entry document or the bundle, and on any network primitive in the source.
- `npm run check:network` serves the production build with the real policy
  applied as a header, drives a full session in a browser, and fails if a single
  request leaves the origin. It also asserts that every key written to browser
  storage is disclosed on the page and removed by the control that offers to
  remove it.

String analysis is the early gate. The runtime assertion against the build is
the guarantee about what was built. Neither can see what a host inserts into a
response after the build, which is a real failure mode: a reviewer once found an
analytics beacon on a served page that no source-level check could have caught.
Whoever deploys this is the only party positioned to check for that, and should.

**What this repository can and cannot give you.** It ships the policy it is
built to be served under, in `public/_headers`, and the two checks above that
hold the build to it. It does not ship a server, and it does not describe how
any particular instance is hosted. Response headers are applied by whatever host
serves the files, so if you deploy this yourself the policy is yours to apply
and yours to verify, in whatever form your host reads.

If you would rather not trust a website at all, `npm run build:single` emits one
self-contained HTML file with everything inlined. It works from a local disk
with no server and no network connection.

## Running it

```sh
npm install
npm run dev            # development server
npm run verify         # style, privacy, types, tests, build, runtime network check
npm run build          # static site to dist/
npm run build:single   # one self-contained HTML file
```

`npm run verify` is the gate. A change that breaks the privacy guarantee
fails the build rather than reaching review.

## Contributing

The most valuable contributions are corrections to the science. If a flag fires
when it should not, if a threshold is wrong, or if a guidance passage is
misleading, an issue with the numbers that show it is worth more than a patch.

Two conventions matter enough to state here. No language model output may reach
a computed value. And a new quality check must encode a real failure mode of
this assay, with the measurement that justifies its threshold, rather than
generic curve-fitting hygiene.

## Status and limitations

`v0.1.1`. **Research use only. Not for clinical or diagnostic decision-making.**

The confidence interval covers the calibration curve, not the sample. Assigned
bead values are lot-specific and must come from your own certificate of
analysis. The interpretation bands are reading aids and not validated cutoffs.
The tool cannot see your gating, your compensation or your titration, and says
so where those would change the answer.

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE), which is also served at
`/LICENSE` on the live site so the footer's reference resolves.

Apache-2.0 rather than MIT because it grants an express patent licence, which
matters for a measurement tool published by a company. Copyright 2026 Ligant AI
Incorporated.
