import { boolFact, numberFact, type GuidanceEntry, type ToolContext } from '../types'

/**
 * Facts published by the cytotoxicity tool:
 *   seriesCount, pointCount, r2Worst, hillWorst, responseIsPercent,
 *   confidenceLevel, hasCriticalFlag, plateauUnreached
 */
export const CYTOTOXICITY_GUIDANCE: GuidanceEntry[] = [
  // Definitions first, for the same reason as the other tool: a reader asks
  // what a thing is before asking which option to pick.
  {
    id: 'cy.dose.what.is',
    anchor: 'cy.dose',
    kind: 'definition',
    title: 'What is an effector to target ratio?',
    body: [
      {
        kind: 'p',
        text: 'The number of effector cells supplied per target cell in the co-culture. An E:T of 10:1 means ten CAR T cells for every tumour cell in the well, and it is entered here as 10.',
      },
      {
        kind: 'p',
        text: 'It is the dose axis of a cell therapy because the killing agent is itself a cell. A soluble drug is dosed by concentration; an adoptive cell product is dosed by how many effectors meet how many targets, which is why the axis defaults to a ratio rather than a molarity.',
      },
      {
        kind: 'note',
        text: 'A ratio is not a count. Ten to one in a well of 1,000 targets is a different experiment from ten to one in a well of 100,000, and the two can give different killing.',
      },
    ],
  },
  {
    id: 'cy.response.what.is',
    anchor: 'cy.response',
    kind: 'definition',
    title: 'What is specific lysis?',
    body: [
      {
        kind: 'p',
        text: 'The share of target cells killed that is attributable to the effectors, after allowing for the targets that die on their own. Some targets always die in culture without any effector present, and counting those as killing would credit the construct with them.',
      },
      {
        kind: 'p',
        text: 'It is computed outside this tool, from your own controls: targets alone give the spontaneous floor, and a maximum-release or fully-lysed condition gives the ceiling. What is entered here is the corrected percentage those controls produce.',
      },
    ],
  },
  {
    id: 'cy.potency.what.is',
    anchor: 'cy.potency',
    kind: 'definition',
    title: 'What is an EC50?',
    body: [
      {
        kind: 'p',
        text: 'The dose at which the response reaches halfway between the fitted lower and upper plateaus. It is the position of the curve along the dose axis, and it is the usual single number for comparing one construct with another.',
      },
      {
        kind: 'p',
        text: 'It is read from the *fitted curve*, not from any measured point, which is why it can be reported at a dose you never tested and why the fit has to be trustworthy before the figure is. Where the response falls with dose rather than rising, the same quantity is called an IC50.',
      },
      {
        kind: 'note',
        text: 'A potency estimate needs both plateaus to be supported by data. Without an upper plateau the curve has no defined midpoint, and the number reported is an extrapolation however good R squared looks.',
      },
    ],
  },
  {
    id: 'cy.curve.what.is',
    anchor: 'cy.curve',
    kind: 'definition',
    title: 'What is a four parameter logistic curve?',
    body: [
      {
        kind: 'p',
        text: 'The S-shaped curve fitted through dose and response, described by four numbers: the response at low dose, the response at high dose, how steeply it rises between them, and the dose at the midpoint.',
      },
      {
        kind: 'p',
        text: 'It is used because killing behaves that way. There is a floor below which more effectors do nothing measurable, a ceiling where every target reachable has been killed, and a transition in between. A straight line through the same points would describe none of that.',
      },
      {
        kind: 'note',
        text: 'The four parameters are what the fit reports and what the flags examine, so a curve with too few dose levels is fitting four unknowns from very little.',
      },
    ],
  },

  {
    id: 'cy.dose.what',
    anchor: 'cy.dose',
    title: 'What goes in the dose column?',
    body: [
      {
        kind: 'p',
        text: 'Whatever quantity you varied: an effector to target ratio, a number of effector cells, a number of CAR positive cells. Name it in the dose axis field so the plot and the export carry the right label.',
      },
      {
        kind: 'list',
        items: [
          'Space the doses logarithmically, usually two-fold or three-fold steps. Even spacing on a linear scale wastes most of the points on one end of the curve.',
          'A dose of zero cannot be plotted on a log axis and is ignored. Keep the untreated control for your own baseline calculation.',
          'Six or more levels give the two plateaus and the slope enough to work with. Four parameters from five points is arithmetic rather than measurement.',
        ],
      },
    ],
  },
  {
    id: 'cy.response.what',
    anchor: 'cy.response',
    title: 'What goes in the response columns?',
    body: [
      {
        kind: 'p',
        text: 'One column per construct or condition, sharing the dose series down the left. Specific lysis as a percentage is the usual readout, but raw luminescence or counts fit equally well.',
      },
      {
        kind: 'p',
        text: 'Specific lysis is conventionally computed as the experimental release minus spontaneous release, divided by maximum release minus spontaneous release. Do that arithmetic before entering values here.',
      },
      {
        kind: 'note',
        text: 'Paste a whole block from a spreadsheet into any cell and it will fill down and across.',
      },
    ],
  },
  {
    id: 'cy.scale.which',
    anchor: 'cy.scale',
    title: 'Percentage or unbounded?',
    body: [
      {
        kind: 'p',
        text: 'Choosing percentage turns on a check that the fitted plateaus stay inside a plausible range. A fit that puts the top plateau at 180 percent lysis is telling you the plateau is unconstrained by data.',
      },
      {
        kind: 'p',
        text: 'Choose unbounded for raw counts, luminescence, or any readout without a natural ceiling. The check is then meaningless and is skipped.',
      },
    ],
  },
  {
    id: 'cy.potency.meaning',
    anchor: 'cy.potency',
    title: 'What the potency figure means',
    body: [
      {
        kind: 'p',
        text: 'It is the dose at which the response sits midway between the fitted plateaus. The tool calls it an EC50 where the response rises with dose and an IC50 where it falls.',
      },
      {
        kind: 'p',
        text: 'It is a property of the fitted curve, not a measured point. That is why it is only meaningful when the data bracket the transition and reach both plateaus, and why the flags here check exactly that.',
      },
      {
        kind: 'note',
        text: 'Comparing potency between constructs is only fair when the assays shared a target line, an effector donor and a duration.',
      },
    ],
  },
  {
    id: 'cy.potency.hill',
    anchor: 'cy.potency',
    title: 'What the Hill slope tells you',
    body: [
      {
        kind: 'p',
        text: 'It describes how sharply the response turns on. A slope near one is the ordinary case.',
      },
      {
        kind: 'list',
        items: [
          'Much steeper than one means the transition happens across a narrow dose range. Across few points it more often means the transition is under-sampled than that the biology is cooperative.',
          'Much shallower than one can indicate a mixed population, or two processes with different sensitivities being averaged together.',
        ],
      },
    ],
  },
  {
    id: 'cy.plateau.why',
    anchor: 'cy.potency',
    priority: 10,
    when: (c: ToolContext) => boolFact(c, 'plateauUnreached'),
    title: 'Why an unreached plateau matters here',
    body: [
      {
        kind: 'p',
        text: 'The midpoint is defined relative to the two plateaus. If the data never level off, the model has invented the upper plateau, and the potency estimate inherits that invention.',
      },
      {
        kind: 'p',
        text: 'The fit will still converge and R squared can still look excellent, because the curve passes through your points perfectly well. The problem is not the fit quality, it is that a parameter is unsupported.',
      },
      {
        kind: 'note',
        text: 'Extend the dose range upward until the response stops increasing, then refit. Until then the figure is model-dependent and should be reported as such.',
      },
    ],
  },
  {
    id: 'cy.curve.read',
    anchor: 'cy.curve',
    title: 'Reading the plot',
    body: [
      {
        kind: 'p',
        text: 'Dose runs along a log axis, so a shift left means a more potent construct at equal maximum killing.',
      },
      {
        kind: 'list',
        items: [
          'Each construct has its own marker shape, line pattern and label. Nothing is distinguished by colour alone, so the figure survives greyscale printing and colour vision deficiency.',
          'The vertical dashed line marks the fitted potency for each curve.',
          'A curve that is still climbing at the right edge has not reached its plateau, whatever its R squared says.',
        ],
      },
    ],
  },
  {
    id: 'cy.curve.fit-poor',
    anchor: 'cy.curve',
    priority: 10,
    when: (c: ToolContext) => {
      const r2 = numberFact(c, 'r2Worst')
      return r2 !== null && r2 < 0.9
    },
    title: 'One of these fits is poor',
    body: [
      {
        kind: 'p',
        text: 'A dose response fit below about 0.9 usually points at the data rather than the model.',
      },
      {
        kind: 'list',
        items: [
          'Check for a transposed row, or a response entered against the wrong dose.',
          'Look for a single outlying replicate. One bad well distorts a four parameter fit more than it distorts a mean.',
          'Confirm the response is monotonic in dose. A curve that rises then falls is not a single saturating transition and this model will not describe it.',
        ],
      },
    ],
  },
]
