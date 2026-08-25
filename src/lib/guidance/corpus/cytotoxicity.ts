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
    id: 'cy.assay.what',
    anchor: 'cy.response',
    kind: 'definition',
    title: 'What is a cytotoxicity assay?',
    body: [
      {
        kind: 'p',
        text: 'The bench experiment that produces the numbers entered here. Effector cells and target cells are co-cultured at a set ratio for a set time, and a readout reports how many targets died.',
      },
      {
        kind: 'list',
        items: [
          'Chromium 51 release. Targets are loaded with the isotope and release it when lysed. Short, conventionally four hours, and the method most older figures were measured by.',
          'Luciferase or luminescence. Targets carry the enzyme and lose signal as they die. Usually read after overnight co-culture, and the common choice where radioactivity is not wanted.',
          'Flow cytometry with counting beads. Surviving targets are counted against a fixed number of beads, which allows a viability dye and a phenotype in the same tube.',
          'Live cell imaging or impedance. Killing is followed continuously over days rather than read once, which is what makes serial killing and target outgrowth visible.',
        ],
      },
      {
        kind: 'note',
        text: 'The formats do not return the same number. A four hour chromium release and a 72 hour imaging run measure different amounts of the same biology, so a potency figure travels only with the format and duration that produced it.',
      },
    ],
  },
  {
    id: 'cy.controls.what',
    anchor: 'cy.response',
    kind: 'definition',
    title: 'What are the controls in a killing assay?',
    body: [
      {
        kind: 'p',
        text: 'Four conditions. The first two set the scale specific lysis is computed on, and the last is what separates a receptor from a T cell.',
      },
      {
        kind: 'list',
          items: [
          'Targets alone. The spontaneous floor: targets that die in culture with no effector present.',
          'Targets fully lysed, by detergent or by the kit maximum. The ceiling the readout can reach.',
          'Effectors alone. What the effectors contribute to the readout themselves, which matters wherever the signal is not target specific.',
          'Untransduced or mock transduced effectors, from the same donor, across the same ratios. This is the specificity control, and killing seen here is killing the receptor did not do.',
        ],
      },
      {
        kind: 'note',
        text: 'An antigen negative target line does the same work from the other direction, and is the stronger control where one is available: it holds the effector fixed and removes the antigen, rather than holding the antigen fixed and removing the receptor.',
      },
    ],
  },
  {
    id: 'cy.potency.plateau.what',
    anchor: 'cy.potency',
    kind: 'definition',
    title: 'What is the upper plateau?',
    body: [
      {
        kind: 'p',
        text: 'The response the fitted curve approaches at saturating dose. It is the height of the curve, where potency is its position along the dose axis, and the two are independent of one another.',
      },
      {
        kind: 'p',
        text: 'The distinction decides what a comparison means. A construct that reaches half its killing at a lower ratio is the more potent; a construct that reaches a higher final killing is the more efficacious. One can be both the more potent and the less efficacious, and a single potency figure will not say so.',
      },
      {
        kind: 'note',
        text: 'It is sometimes written Emax. The tool reports it as the fitted upper plateau, and flags it where the data never reach it, because an unreached plateau leaves both figures resting on the model.',
      },
    ],
  },
  {
    id: 'cy.curve.poor.what',
    anchor: 'cy.curve',
    kind: 'definition',
    title: 'What does a poor fit look like?',
    body: [
      {
        kind: 'p',
        text: 'Not a low R squared on its own. A four parameter logistic has enough freedom to pass close to most sets of points, so a fit can look excellent and still rest on parameters the data do not support.',
      },
      {
        kind: 'list',
        items: [
          'Residuals with a pattern rather than scatter. Points above the curve at both ends and below it in the middle mean the shape is wrong, whatever R squared says.',
          'A plateau the doses never reach, which leaves that parameter set by the model rather than measured.',
          'A Hill slope far from one estimated across few levels. A steep transition sampled by two points is a line drawn through two points.',
          'A response that rises and then falls. That is not one saturating transition and this model cannot describe it. Loss of effector viability, and target outgrowth at long timepoints, both produce it.',
        ],
      },
      {
        kind: 'note',
        text: 'The tool fits and reports rather than refusing to fit. Whether a curve is reportable is the reader\u2019s judgement, made with the flags in view.',
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
    id: 'cy.duration.why',
    anchor: 'cy.response',
    title: 'How long the co-culture runs',
    body: [
      {
        kind: 'p',
        text: 'The duration is set by the assay format, and it is not independent of the dose axis. A lower effector to target ratio given longer reaches killing that a higher ratio reaches sooner, so the two trade against one another and the curve describes one pairing of them.',
      },
      {
        kind: 'list',
        items: [
          'Four hours for chromium release, which is short enough that only rapid killing is counted.',
          'Sixteen to twenty four hours for a luminescence readout.',
          'Two to four days for imaging or impedance, long enough for serial killing and for target outgrowth to compete with it.',
        ],
      },
      {
        kind: 'note',
        text: 'Potency shifts left as the co-culture runs longer. Constructs are therefore comparable only at the same duration, alongside the same target line and effector donor.',
      },
    ],
  },
  {
    id: 'cy.potency.interval',
    anchor: 'cy.potency',
    title: 'Why the interval on potency is wide',
    body: [
      {
        kind: 'p',
        text: 'The interval describes how firmly the dose series pins the midpoint down. It widens for reasons that have little to do with how closely the curve passes through the points.',
      },
      {
        kind: 'list',
        items: [
          'Few dose levels. Four parameters from five points leaves almost no residual degrees of freedom, and the interval reports that rather than hiding it.',
          'No upper plateau. The midpoint is defined relative to the ceiling, so an unconstrained ceiling lets it slide.',
          'Doses clustered on one side of the transition, which leaves the midpoint to be reached by extrapolation from whichever side was sampled.',
          'Scatter between replicates at one ratio, which propagates into all four parameters at once.',
        ],
      },
      {
        kind: 'note',
        text: 'Extending the dose range upward usually narrows the interval more than adding replicates at ratios already tested.',
      },
    ],
  },
  {
    id: 'cy.scale.over100',
    anchor: 'cy.scale',
    title: 'Specific lysis above 100 percent',
    body: [
      {
        kind: 'p',
        text: 'Arithmetic rather than biology: more signal was lost than the maximum release control reported was available. The usual causes are a maximum release that under-reports, and a spontaneous release drifting upward through a long incubation.',
      },
      {
        kind: 'p',
        text: 'A few points a little over 100 are ordinary noise against the ceiling. A whole series above it means the controls want rechecking before the curve is read at all.',
      },
      {
        kind: 'note',
        text: 'Enter the values as measured. Truncating them at 100 pulls the fitted upper plateau down, which moves the midpoint the potency figure is taken from.',
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
