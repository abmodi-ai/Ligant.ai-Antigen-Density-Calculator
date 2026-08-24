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
  sample's MFI, quantifying uncertainty in the position of the calibration curve. It
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

## Privacy

Nothing you enter is transmitted, and the page contacts no third party. Not "we
do not sell your data" but "nothing outside this origin is contacted at all":

- Typefaces are self-hosted (about 104 kB, Latin subsets), not loaded from a
  font network, so no third party sees a visitor.
- No analytics script.
- The content security policy allows connections to this origin only.

This is checked, not asserted. `npm run check:privacy` fails the build on any
external origin in the policy, the entry document, or the bundle, and on any
network primitive in the source. `npm run check:network` then serves the
production build with that policy applied as a real header, drives a full user
session in a browser, and fails if a single request leaves the origin. Both run
in CI.

## Determinism

Every number comes from pure functions over the user's inputs. No model, no
network call, no language model anywhere in the compute path. Identical inputs
produce identical outputs, always. A test asserts exactly that.

The statistics core is verified against published Student's t critical values and
against closed-form regression results.

## Interpretation bands

Results are labelled against order-of-magnitude density bands drawn from the
published CAR density-threshold literature. **These are reading aids, not
validated cutoffs.** A CAR's activation threshold is a property of the specific
construct (scFv affinity, hinge, costimulatory domain) and of the effector
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
published palette, with nothing re-stepped or invented. Inter for UI text,
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

### Single theme, deliberately

The app is light-only, on the brand's Off-White ground, and every colour is a
published value, with nothing re-stepped, derived, or invented. The UI therefore
carries **no brand variance and needs no sign-off**.

Measured on Off-White: navy 13.3:1, slate body 8.3:1, muted 5.5:1, teal 4.8:1.
All are AA or better for body text. Amber is 3.05:1, so it carries icons, rules,
and marks, never small text.

Backgrounds are painted explicitly rather than left transparent, so the page
holds its own ground on any host, including a dark one.

## Stack

React + TypeScript + Vite. The chart is hand-rolled SVG rather than a charting
library, so exports are true vector suitable for a manuscript figure, and there is
no dependency to rot.

## Deployment

`ci.yml` runs typecheck, tests, and both builds on every push, and uploads the
result as an artifact. It is independent of hosting.

`deploy-cloudflare.yml` publishes `dist/` to Cloudflare Pages by direct upload.

**GitHub Pages is not an option here**: it is unavailable for private
repositories on the GitHub Free plan, so no workflow can enable it while the
repository is private on a Free account.

### Option A: deploy from CI (no dashboard Git connection)

`deploy-cloudflare.yml` builds and uploads on every push. It needs two
repository secrets, added under **Settings → Secrets and variables → Actions**:

| Secret | Where it comes from |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token, with the **Cloudflare Pages: Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account home, or the hex string in any dashboard URL |

The workflow creates the Pages project (`ligant-tools`) on first run and deploys
to it thereafter. Without the secrets it skips rather than failing red, so CI
stays green until they are set.

### Option B: connect the repository in the dashboard

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise GitHub and pick this repository
3. Build command `npm run build`, output directory `dist`; everything else default

Node comes from `.node-version` (22) either way. Use one option or the other,
not both, or the two will fight over the same project.

### After either option

**Custom domain**: Pages project → **Custom domains** → add e.g.
`tools.ligant.ai`. Cloudflare issues the certificate automatically when the
domain is on the same account. This also keeps the repository name out of the
public URL.

**Web Analytics** (optional): switch on for the project. It is cookieless and
collects no personal data; `public/_headers` already allows its script, so no
redeploy is needed.

`public/_headers` also sets a strict Content-Security-Policy, `nosniff`,
`X-Frame-Options`, a `Referrer-Policy`, and cache rules: hashed assets are
immutable for a year, while the entry document must revalidate so a deploy
reaches returning visitors. The policy has been verified against a production
build. The app renders, computes, and loads both typefaces with no violations.

### Anywhere else

The build is plain files with relative asset paths, so it runs from a repository
sub-path, a custom domain, or a subdirectory unchanged. Netlify and Vercel take
the same build command and output directory.

`npm run build:single` emits one self-contained HTML file that needs no server at
all, which suits a quick host, an offline demo, or sending to a collaborator.

## Status

`v0.1.0`, first release. Research use only; not for clinical or diagnostic
decision-making.
