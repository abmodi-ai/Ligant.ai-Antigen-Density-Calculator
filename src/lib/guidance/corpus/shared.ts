import type { GuidanceEntry } from '../types'

/** Concepts that mean the same thing in every tool. */
export const SHARED_GUIDANCE: GuidanceEntry[] = [
  {
    id: 'shared.confidence',
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
    id: 'shared.privacy',
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
