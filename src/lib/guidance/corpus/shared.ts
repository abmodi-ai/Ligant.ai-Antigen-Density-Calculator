import type { GuidanceEntry } from '../types'

/** Concepts that mean the same thing in every tool. */
export const SHARED_GUIDANCE: GuidanceEntry[] = [
  {
    id: 'shared.confidence',
    kind: 'definition',
    anchor: 'shared.confidence',
    title: 'What the confidence interval covers',
    body: [
      {
        kind: 'p',
        text: 'It describes uncertainty in the fitted curve, given the points you supplied. A wider interval means the data constrain the fit less well.',
      },
      {
        kind: 'p',
        text: 'It does not include measurement variability in the sample itself. Estimating that needs replicates, and reporting it from a single run would overstate precision.',
      },
      {
        kind: 'note',
        text: 'Raising the level from 95 to 99 percent widens the interval. It does not make the estimate better, only the claim more cautious.',
      },
    ],
  },
  {
    // No pin points here. A reader who does not yet know what an adoptive cell
    // product is has no card to ask it at, so this exists for the ask surface,
    // where the question actually arrives.
    id: 'shared.modality',
    kind: 'definition',
    anchor: 'shared.modality',
    title: 'What is an adoptive cell therapy?',
    body: [
      {
        kind: 'p',
        text: 'A therapy whose active substance is a living cell. Immune cells are taken from a patient or a donor, usually given a receptor that recognises a tumour antigen, expanded, and infused back. CAR T cells are the familiar case; TCR engineered T cells, CAR NK cells and tumour infiltrating lymphocytes are the same modality.',
      },
      {
        kind: 'p',
        text: 'Every tool in this suite is built for that modality, and the difference from a soluble drug reaches the arithmetic. A dose is an effector to target ratio rather than a concentration, because the killing agent is itself a cell that divides, migrates and exhausts. A target antigen is counted in molecules per cell rather than assumed to be present or absent, because the number sets whether the receptor fires.',
      },
      {
        kind: 'note',
        text: 'Gene therapy, antibodies, T cell engagers and antibody drug conjugates are outside what these tools are designed for. The defaults, the units and the quality checks here would be the wrong ones.',
      },
    ],
  },
  {
    // Neither tool has a card for this, and both report the figure. A reader
    // asking what it is has to be able to ask somewhere.
    id: 'shared.r2',
    kind: 'definition',
    anchor: 'shared.r2',
    title: 'What is R squared?',
    body: [
      {
        kind: 'p',
        text: 'The share of the variation in the response that the fitted curve accounts for. One means every point sits exactly on the curve; zero means the curve describes the points no better than their own average does.',
      },
      {
        kind: 'p',
        text: 'It measures closeness to the points, and nothing else. It does not say the model is the right shape, and it does not say the fit can be trusted where you are reading it: a standard curve with a gentle bend fits at 0.998 while its local slope runs from 1.16 at one end to 0.84 at the other, and a curve fitted through three populations fits whatever it is given.',
      },
      {
        kind: 'note',
        text: 'It is computed in the space the fit was performed in, which for the antigen density calibration is log10 against log10. A high value there says the points are close to a straight line on log axes, not that they are close in molecules per cell.',
      },
    ],
  },
  {
    // The thing being compared whenever two sets of results sit side by side,
    // and never defined anywhere.
    id: 'shared.construct',
    kind: 'definition',
    anchor: 'shared.construct',
    title: 'What is a construct?',
    body: [
      {
        kind: 'p',
        text: 'One receptor design, and the thing a column of results usually belongs to. A chimeric antigen receptor is assembled from parts that are varied independently: the binding domain, most often an scFv, the hinge and transmembrane region, one or more costimulatory domains, and the signalling tail.',
      },
      {
        kind: 'p',
        text: 'Constructs are compared because those choices change behaviour without changing the target. Binder affinity shifts the antigen density at which the receptor fires, and the costimulatory domain changes how quickly the product exhausts. Neither changes how much antigen the tumour carries, which is what this tool measures.',
      },
      {
        kind: 'note',
        text: 'A density measured on one target line says nothing about another, and a density measured with one antibody clone says nothing about a different clone against the same antigen.',
      },
    ],
  },
  {
    id: 'shared.privacy',
    kind: 'definition',
    anchor: 'shared.privacy',
    title: 'Where does my data go?',
    body: [
      {
        kind: 'p',
        text: 'Nowhere. Every calculation runs in this browser, nothing you enter is transmitted, and the page contacts no third party at all: the typefaces are served from this site and there is no analytics script.',
      },
      {
        kind: 'p',
        text: 'This is enforced rather than promised. The security policy permits connections to this origin only, and the build fails if a full session in a real browser produces a single request that leaves it.',
      },
    ],
  },
]
