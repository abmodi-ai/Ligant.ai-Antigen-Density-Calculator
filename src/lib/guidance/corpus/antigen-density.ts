import { numberFact, type GuidanceEntry, type ToolContext } from '../types'

/**
 * Facts published by the antigen density tool:
 *   slope, intercept, r2, beadCount, minBeadMfi, maxBeadMfi,
 *   standardKind ('abc' | 'pe-molecules'), backgroundMode, valency,
 *   confidenceLevel, sampleCount, hasCriticalFlag
 */
export const ANTIGEN_DENSITY_GUIDANCE: GuidanceEntry[] = [
  {
    id: 'ad.kit.which',
    anchor: 'ad.bead-kit',
    title: 'Which kit do I have?',
    body: [
      {
        kind: 'p',
        text: 'The two chemistries certify different quantities, which is why the choice changes the arithmetic rather than just the label.',
      },
      {
        kind: 'list',
        items: [
          'Quantum Simply Cellular and equivalents certify an antibody binding capacity. You stain the beads with your own antibody, so the calibration is independent of the fluorophore and no F/P correction applies.',
          'QuantiBRITE PE and equivalents arrive pre-conjugated and certify PE molecules per bead. Converting to antibodies bound needs the fluorophore to protein ratio of your conjugate.',
        ],
      },
      {
        kind: 'note',
        text: 'If the vial says you must stain the beads yourself, it is an ABC kit.',
      },
    ],
  },
  {
    id: 'ad.assigned.where',
    anchor: 'ad.assigned',
    title: 'Where do I find the assigned values?',
    body: [
      {
        kind: 'p',
        text: 'On the vial label or the lot certificate of analysis that shipped with the kit. They are specific to the lot, not to the product, so a value copied from a paper or an old notebook will be wrong.',
      },
      {
        kind: 'p',
        text: 'Enter one value per bead population, in the same order as the peaks you gated. The blank population carries no certified value and is excluded from the fit.',
      },
      {
        kind: 'note',
        text: 'No assigned values are stored in this tool, precisely because they change between lots.',
      },
    ],
  },
  {
    id: 'ad.mfi.statistic',
    anchor: 'ad.mfi',
    title: 'Which fluorescence statistic should I use?',
    body: [
      {
        kind: 'p',
        text: 'This is the single most common source of error in the method. Cytometry software will offer mean, median and geometric mean, and they disagree on the skewed distributions flow data produces.',
      },
      {
        kind: 'list',
        items: [
          'Use the median, or the geometric mean if your laboratory has standardised on it. Both are robust to the long upper tail.',
          'Do not use the arithmetic mean. A handful of bright events drags it upward and inflates the density.',
          'Whichever you choose, use the same statistic for the beads, the sample and the control. Mixing them invalidates the calibration.',
        ],
      },
      {
        kind: 'note',
        text: 'Beads and cells must also be acquired in the same session at the same detector voltages. A voltage change between runs invalidates the curve.',
      },
    ],
  },
  {
    id: 'ad.control.which',
    anchor: 'ad.control',
    title: 'Isotype, FMO, or unstained?',
    body: [
      {
        kind: 'p',
        text: 'The control defines what counts as background, so the choice moves the result. State which you used when you report the number.',
      },
      {
        kind: 'list',
        items: [
          'Fluorescence minus one is the usual choice for density work. It captures spillover from the other detectors in the panel, which is what actually inflates a dim signal.',
          'An isotype control captures non-specific binding of the antibody class. It is informative but is not a substitute for an FMO in a multi-colour panel.',
          'Unstained cells capture autofluorescence only, and will under-correct in most panels.',
        ],
      },
    ],
  },
  {
    id: 'ad.background.mode',
    anchor: 'ad.background',
    title: 'Subtract in density or MFI space?',
    body: [
      {
        kind: 'p',
        text: 'The calibration is a power law, so subtracting before and after converting are not the same operation unless the log-log slope is exactly one.',
      },
      {
        kind: 'list',
        items: [
          'Density space converts the sample and the control separately, then subtracts. This is the safer default and is what to use when the slope departs from unity.',
          'MFI space subtracts first, then converts once. It matches older published protocols and agrees with density space only at a slope of exactly one.',
        ],
      },
    ],
  },
  {
    id: 'ad.valency.which',
    anchor: 'ad.valency',
    title: 'Is my detection antibody bivalent?',
    body: [
      {
        kind: 'p',
        text: 'A whole IgG has two binding arms. Where the antigen is dense enough for both to engage, one antibody occupies two epitopes, so the measured binding capacity understates the number of antigen sites.',
      },
      {
        kind: 'list',
        items: [
          'Whole IgG: antigen sites lie between the measured value and twice it. The tool reports that range rather than pretending to a single figure.',
          'A Fab, F(ab*)2 arm, or a monovalent scFv binds one epitope, so sites and binding capacity coincide.',
        ],
      },
      {
        kind: 'note',
        text: 'The reagent datasheet states the format. If it says IgG with no further qualification, it is bivalent.',
      },
    ],
  },
  {
    id: 'ad.curve.slope',
    anchor: 'ad.curve',
    title: 'Reading the standard curve',
    body: [
      {
        kind: 'p',
        text: 'The fit is a straight line in log-log space. Two numbers tell you whether it is trustworthy.',
      },
      {
        kind: 'list',
        items: [
          'The slope should sit near one. That is what a linear detector response looks like.',
          'R squared should exceed about 0.98. Below that, look for a saturated or off-scale bead population before doing anything else.',
        ],
      },
    ],
  },
  {
    id: 'ad.curve.slope-off',
    anchor: 'ad.curve',
    priority: 10,
    when: (c: ToolContext) => {
      const slope = numberFact(c, 'slope')
      return slope !== null && Math.abs(slope - 1) > 0.15
    },
    title: 'Your slope is some way from one',
    body: [
      {
        kind: 'p',
        text: 'A log-log slope well away from unity usually means the detector is not responding linearly across the range you used, rather than that the beads are wrong.',
      },
      {
        kind: 'list',
        items: [
          'Check whether the brightest bead population is saturating the detector. Lower the voltage and re-acquire if so.',
          'Confirm compensation was applied consistently to beads and cells.',
          'Check that each bead population was gated on the correct peak, and that none were transposed.',
        ],
      },
    ],
  },
  {
    id: 'ad.result.meaning',
    anchor: 'ad.result',
    title: 'What does this number mean?',
    body: [
      {
        kind: 'p',
        text: 'It is the number of antibody molecules bound per cell, which is the closest practical measure of how much antigen a CAR will encounter.',
      },
      {
        kind: 'p',
        text: 'It is not the antigen copy number. Epitope accessibility, binding valency, conjugate performance and antigen internalisation all sit between the two, and each of them loses you signal rather than gaining it.',
      },
      {
        kind: 'note',
        text: 'The density bands are order of magnitude reading aids drawn from the published threshold literature. They are not validated cutoffs, and the real threshold belongs to your construct.',
      },
    ],
  },
]
