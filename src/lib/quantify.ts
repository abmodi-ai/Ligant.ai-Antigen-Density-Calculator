/**
 * Antigen density quantification: flow-cytometry MFI -> antibody binding capacity.
 *
 * Two calibration chemistries are supported, and they differ in what the bead
 * standard actually certifies:
 *
 *   'abc'          Beads carry a certified antibody-binding capacity and are
 *                  stained with the SAME antibody as the sample (Quantum Simply
 *                  Cellular and equivalents). The curve reads out ABC directly
 *                  and is independent of the fluorophore.
 *
 *   'pe-molecules' Beads carry a certified number of PE molecules per bead
 *                  (QuantiBRITE PE and equivalents). The curve reads out PE
 *                  molecules bound, which becomes ABC only after dividing by
 *                  the conjugate's fluorophore:protein (F/P) ratio.
 *
 * Every function here is pure and deterministic.
 */

import {
  linearRegression,
  meanResponseInterval,
  quadraticCurvature,
  type CurvatureTest,
  type LinearFit,
} from './stats'
import type { Flag, FlagLevel } from './flags'

export type { Flag, FlagLevel }

export type StandardKind = 'abc' | 'pe-molecules'
/** Host species of the detection antibody, as declared by the user. */
export type HostSpecies = 'unstated' | 'mouse' | 'human' | 'rat' | 'rabbit' | 'other'
export type BackgroundMode = 'abc' | 'mfi' | 'none'
export type Valency = 'monovalent' | 'bivalent'

export interface BeadStandard {
  id: string
  label: string
  /** Measured median fluorescence intensity of this bead population. */
  mfi: number | null
  /** Certified value: ABC, or PE molecules per bead, per `standardKind`. */
  assigned: number | null
  included: boolean
}

export interface Sample {
  id: string
  label: string
  mfi: number | null
  /** Isotype control, FMO, or unstained background. */
  controlMfi: number | null
}

export interface QuantifyOptions {
  standardKind: StandardKind
  /** Fluorophore:protein ratio of the conjugate. Only used for 'pe-molecules'. */
  fpRatio: number
  backgroundMode: BackgroundMode
  /** Binding mode of the detection antibody, used for the antigen-site range. */
  valency: Valency
  /**
   * Declared host species of the detection antibody. Capture beads bind one
   * host's immunoglobulin, so a mismatch invalidates the calibration. This is a
   * declaration rather than a measurement: nothing in the numbers reveals it.
   */
  antibodyHost: HostSpecies
  /**
   * Whether the user attests the detection antibody was titrated to saturation
   * on beads and on cells. Sub-saturating stain undercounts, and it does so in
   * one direction, so an unconfirmed titration makes every ABC a lower bound.
   */
  saturationConfirmed: boolean
  confidenceLevel: number
}

export const DEFAULT_OPTIONS: QuantifyOptions = {
  standardKind: 'abc',
  fpRatio: 1,
  backgroundMode: 'abc',
  valency: 'bivalent',
  antibodyHost: 'unstated',
  saturationConfirmed: false,
  confidenceLevel: 0.95,
}

export interface CurveResult {
  fit: LinearFit
  /** Points actually used, in log10 space, for plotting the fitted line. */
  logMfi: number[]
  logAssigned: number[]
  mfiRange: [number, number]
  assignedRange: [number, number]
  /** Per-population departure from the fitted line. */
  residuals: CurveResidual[]
  /**
   * Test of a quadratic term against the straight line, where the standard has
   * enough populations to support one. Null below that, and null is the absence
   * of a test rather than the absence of curvature.
   */
  curvature: CurvatureTest | null
  flags: Flag[]
}

/**
 * How far one bead population sits from the fitted line.
 *
 * R squared over four points conceals a single mis-transcribed assigned value:
 * a population can sit 5% off the line while the summary statistic still reads
 * 0.9995. The per-population residual is what identifies which vial entry to
 * check, so it is computed here rather than left to the reader.
 *
 * Deliberately no runs test on the residual signs. A runs test detects too FEW
 * runs, and the exact null distribution gives it almost no power at the sizes a
 * bead kit supplies: the textbook curvature signature, one positive residual at
 * each end and negatives between, scores p = 0.40 at six populations and
 * p = 0.29 at eight, and does not reach 0.05 until ten. Curvature is tested
 * instead by the significance of a quadratic term, which uses how far each
 * point sits from the line rather than discarding that for its sign.
 */
export interface CurveResidual {
  label: string
  /** Residual in log10 space, the space the fit is performed in. */
  logResidual: number
  /** The same departure as a percentage of the fitted value, which reads faster. */
  percent: number
}

export interface SampleResult {
  id: string
  label: string
  /** ABC implied by the raw sample MFI, before any background subtraction. */
  grossAbc: number | null
  /** ABC implied by the control MFI, if a control was supplied. */
  controlAbc: number | null
  /** Background-subtracted ABC. This is the reported density. */
  netAbc: number | null
  /**
   * Background density as a fraction of gross density.
   *
   * The single most useful diagnostic on a result card. The control is almost
   * always dimmer than the dimmest bead, so its conversion is almost always an
   * extrapolation; what decides whether that matters is how much of the gross
   * signal it accounts for.
   */
  backgroundFraction: number | null
  /** Whether the sample MFI falls inside the calibrated bead range. */
  sampleInRange: boolean | null
  /** Whether the control MFI falls inside it. Null when no control was given. */
  controlInRange: boolean | null
  /**
   * Relative difference between density-space and MFI-space subtraction for
   * this sample. How much the choice of mode actually matters here.
   */
  modeDivergence: number | null
  lower: number | null
  upper: number | null
  /** Lower and upper bound on antigen sites per cell, given binding valency. */
  sitesLow: number | null
  sitesHigh: number | null
  flags: Flag[]
  /**
   * Calibration-level conditions that invalidate this value.
   *
   * A curve that cannot calibrate anything invalidates every sample derived
   * from it, so these travel with each result rather than staying beside the
   * chart. Kept separate from the sample's own flags so the interface can put
   * them above the figure, where they are read before it, and so the export can
   * mark the row without the reader having to correlate two panels.
   */
  calibrationFlags: Flag[]
}

/** log-log slope far from unity indicates detector or staining non-linearity. */
const SLOPE_TOLERANCE = 0.15
const MIN_R2 = 0.98

/**
 * Populations required before the curvature test is run at all.
 *
 * Six leaves three residual degrees of freedom, where the smallest detectable
 * drift in local slope across a typical calibrated range is about 0.31. Five
 * leaves two, where it is 0.44, and four leaves one, where it is 1.38: a bend
 * no calibration could survive and no user would need telling about. Running
 * the test there would report "no curvature detected" on curves it has no
 * ability to detect curvature in.
 */
const MIN_CURVATURE_POPULATIONS = 6

/** Two-sided level for the quadratic term. */
const CURVATURE_ALPHA = 0.05

/** Fit the calibration curve in log10-log10 space, in the beads' own certified units. */
export function fitStandardCurve(standards: BeadStandard[]): CurveResult | { error: string } {
  const usable = standards.filter(
    (s) =>
      s.included &&
      s.mfi !== null &&
      s.assigned !== null &&
      s.mfi > 0 &&
      s.assigned > 0,
  )

  if (usable.length < 3) {
    return {
      error: `Need at least 3 bead populations with positive MFI and assigned value; have ${usable.length}.`,
    }
  }

  const logMfi = usable.map((s) => Math.log10(s.mfi as number))
  const logAssigned = usable.map((s) => Math.log10(s.assigned as number))

  let fit: LinearFit
  try {
    fit = linearRegression(logMfi, logAssigned)
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  const flags: Flag[] = []

  // Four parameters of confidence come from two degrees of freedom at n = 4.
  // At n = 3 there is one, and the interval is barely determined by the data.
  if (usable.length === 3) {
    flags.push({
      level: 'warning',
      message:
        'The fit rests on three populations, leaving one degree of freedom. The confidence band is weakly determined and an error in any single population is unidentifiable.',
      remedy:
        'Include a fourth bead population wherever the kit provides one. Three is the minimum that permits a fit, not a sufficient number for a quantitative one.',
    })
  }

  // A downward slope is a different kind of failure from a slope merely away
  // from unity, and it deserves its own sentence. A curve that falls means a
  // brighter sample reports fewer molecules: not imprecise, inverted.
  if (fit.slope <= 0) {
    flags.push({
      level: 'critical',
      message: `The standard curve slopes downward (slope ${fit.slope.toFixed(2)}). Brighter populations are carrying lower certified values, which no calibration can do.`,
      remedy:
        'Every result from this curve would be inverted, reporting fewer molecules for a brighter sample. Check the certified values against the certificate of analysis before reading any result.',
    })
  } else if (Math.abs(fit.slope - 1) > SLOPE_TOLERANCE) {
    flags.push({
      level: 'warning',
      message: `Log-log slope is ${fit.slope.toFixed(3)}. A well-behaved standard approximates 1.0.`,
      remedy:
        'Departures from unity indicate detector non-linearity or a compensation error. Lower the detector voltage if the brightest population is saturating, and confirm compensation was applied to beads and cells alike.',
    })
  }

  if (fit.r2 < MIN_R2) {
    flags.push({
      level: 'critical',
      message: `Standard curve R² = ${fit.r2.toFixed(4)}, below the conventional acceptance threshold of ${MIN_R2}.`,
      remedy:
        'Check that each bead population is gated on the correct peak and that none are transposed, then look for a saturated or off-scale population.',
    })
  }
  // Assigned value must rise with intensity. A set that does not is a
  // transcription or row-order error, and it produces a confident wrong answer
  // rather than an obvious failure.
  const byMfi = usable
    .map((s2) => ({ label: s2.label, mfi: s2.mfi as number, assigned: s2.assigned as number }))
    .sort((a, b) => a.mfi - b.mfi)
  const inversion = byMfi.findIndex((p2, i) => i > 0 && p2.assigned <= byMfi[i - 1].assigned)
  if (inversion > 0) {
    flags.push({
      level: 'critical',
      message: `Assigned values are not increasing with MFI: ${byMfi[inversion - 1].label} (${formatNumber(byMfi[inversion - 1].assigned)}) is at or above ${byMfi[inversion].label} (${formatNumber(byMfi[inversion].assigned)}) despite lower fluorescence.`,
      remedy:
        'A brighter population must carry a higher assigned value. This almost always means two rows were transposed or a value was transcribed against the wrong population. Check the entries against the certificate of analysis before reading any result.',
    })
  }

  const mfis = usable.map((s) => s.mfi as number)
  const assigned = usable.map((s) => s.assigned as number)

  const residuals: CurveResidual[] = usable.map((s2, i) => {
    const logResidual = logAssigned[i] - (fit.slope * logMfi[i] + fit.intercept)
    return {
      label: s2.label,
      logResidual,
      percent: (10 ** logResidual - 1) * 100,
    }
  })

  // Curvature last, because it is the check the other two are blind to: a
  // symmetric bend leaves the overall slope at unity and R squared high, so a
  // curve can clear both and still convert every value with a bias that changes
  // sign across the range.
  const curvature =
    usable.length >= MIN_CURVATURE_POPULATIONS ? quadraticCurvature(logMfi, logAssigned) : null

  if (curvature && curvature.p < CURVATURE_ALPHA) {
    flags.push({
      level: 'warning',
      message: `The standard is not straight in log-log space. Its local slope runs from ${curvature.slopeAtLow.toFixed(2)} at the low end to ${curvature.slopeAtHigh.toFixed(2)} at the high end, a drift of ${Math.abs(curvature.slopeDrift).toFixed(2)} across the calibrated range (quadratic term p = ${curvature.p < 0.001 ? '< 0.001' : curvature.p.toFixed(3)}).`,
      remedy:
        'A curved standard biases every value converted through it, and the bias changes sign across the range. Neither the slope nor R² reveals it, because a symmetric bend leaves the overall slope at unity and most of a parabola over this range is line. Look for detector non-linearity: lower the voltage if the brightest population approaches the top of the scale, confirm compensation was applied identically to beads and cells, and check that no population is off-scale at either end.',
    })
  }

  return {
    fit,
    logMfi,
    logAssigned,
    mfiRange: [Math.min(...mfis), Math.max(...mfis)],
    assignedRange: [Math.min(...assigned), Math.max(...assigned)],
    residuals,
    curvature,
    flags,
  }
}

/**
 * How far one population's certified value may sit from the pattern of the rest
 * before it is called out by name.
 *
 * Where the log-log slope is near unity, the ratio of certified value to
 * intensity is roughly constant across populations, so a row that disagrees
 * with the others disagrees on a quantity computable per row, before any
 * regression exists. That is what R squared cannot do: it says the table is
 * wrong without saying which row.
 *
 * Measured rather than chosen. Across well behaved curves the widest spread
 * from the median ratio is 1.36 at the edge of the slope tolerance this tool
 * already enforces, and 1.70 even over a three decade range. The smallest real
 * error is a transposed pair at 3.28, and an order of magnitude slip on one row
 * reaches 9.98. The threshold sits in the gap:
 *
 *     slope 0.85 to 1.15, any range      1.36 to 1.70    never flagged
 *     two populations transposed         3.28            flagged
 *     one row out by a factor of ten     9.98 to 10.47   flagged
 *     a blank given a certified value    1141            flagged
 *
 * A review proposed a factor of ten here. That would have missed the
 * transposition it listed as an acceptance criterion, and missed a tenfold slip
 * on the highest population by 0.02, which is the error the check exists for.
 *
 * Curves sloped far enough to spread the ratios past this threshold (0.5, or
 * 1.5) are already carrying a slope warning, and flag most of their rows, which
 * the whole-table rule below turns into one message rather than a column of
 * them.
 */
const RATIO_TOLERANCE = 2.5

/** Populations needed before a median ratio means anything. */
const MIN_RATIO_ROWS = 3

/** One population's disagreement with the rest of the table. */
export interface RatioOutlier {
  id: string
  label: string
  /** Certified value divided by intensity for this population. */
  ratio: number
  /** How many times it differs from the median, in whichever direction. */
  factor: number
  message: string
  remedy: string
}

export interface StandardConsistency {
  /** Median ratio across usable populations, or null where too few to judge. */
  median: number | null
  outliers: RatioOutlier[]
  /**
   * True where so many populations disagree that the table is the problem
   * rather than any row in it. A column of identical warnings is noise, and it
   * points at nothing.
   */
  wholeTable: boolean
}

/**
 * Find the population whose certified value does not belong with the others.
 *
 * Runs on the entered rows alone, with no fit and no ordering assumption, so it
 * reports at the point of entry rather than after a chart. Rows excluded from
 * the fit are excluded here too: a population the reader has already set aside
 * is not something to warn them about.
 */
export function checkStandardConsistency(
  standards: readonly BeadStandard[],
): StandardConsistency {
  const usable = standards.filter(
    (s) => s.included && s.mfi !== null && s.assigned !== null && s.mfi > 0 && s.assigned > 0,
  )
  if (usable.length < MIN_RATIO_ROWS) return { median: null, outliers: [], wholeTable: false }

  const ratios = usable.map((s) => (s.assigned as number) / (s.mfi as number))
  const sorted = [...ratios].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  if (!(median > 0)) return { median: null, outliers: [], wholeTable: false }

  const outliers: RatioOutlier[] = []
  usable.forEach((s, i) => {
    const ratio = ratios[i]
    const factor = Math.max(ratio / median, median / ratio)
    if (factor <= RATIO_TOLERANCE) return
    outliers.push({
      id: s.id,
      label: s.label,
      ratio,
      factor,
      message: `${s.label || 'This population'} does not agree with the other standards. Its certified value is ${formatRatio(ratio)} times its intensity, where the others sit near ${formatRatio(median)}, a difference of about ${formatFactor(factor)} times.`,
      remedy:
        'Check this row against the certificate of analysis. A value entered against the wrong population, or transposed with the row beside it, is the usual cause.',
    })
  })

  return {
    median,
    outliers,
    wholeTable: outliers.length * 2 > usable.length,
  }
}

/** Ratios span orders of magnitude, so they are read at two significant figures. */
function formatRatio(v: number): string {
  if (!Number.isFinite(v)) return 'n/a'
  if (v >= 1000) return v.toExponential(1)
  if (v >= 100) return v.toFixed(0)
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

/**
 * How many times two quantities differ, to two significant figures.
 *
 * The sentence reads "a difference of about", so the number after it must not
 * be more precise than that: 9.98 claims a precision the word "about" denies.
 */
function formatFactor(v: number): string {
  if (!Number.isFinite(v)) return 'n/a'
  const rounded = Number(v.toPrecision(2))
  if (rounded >= 1000) return rounded.toExponential(1)
  return String(rounded)
}

/**
 * Whether the declared detection antibody can be captured by the selected beads.
 *
 * This is the one invalidating condition that is invisible in the numbers, and
 * the reason it is invisible is not that a mismatched stain gives no signal. It
 * is that anti-immunoglobulin capture reagents cross-react across related
 * hosts to an uncertified degree, so the beads still produce an ordered,
 * well-fitting series while binding a fraction of what their certificate
 * assumes. The curve looks healthy and every value derived from it is wrong.
 *
 * Both sides are declarations rather than measurements, so this compares what
 * the user selected against what the user typed. That is worth doing anyway:
 * the mistake it catches is one nothing else in the tool can see.
 */
export function captureCompatibilityFlags(
  kitHost: HostSpecies | null,
  declared: HostSpecies,
): Flag[] {
  if (kitHost === null || declared === 'unstated') return []
  if (declared === 'other') {
    return [
      {
        level: 'warning',
        message: `The selected beads capture ${kitHost} immunoglobulin. The detection antibody host is recorded as other.`,
        remedy:
          'Confirm from the antibody datasheet that these beads capture this host. If they do not, the calibration does not apply, however well the curve fits.',
      },
    ]
  }
  if (declared === kitHost) return []
  return [
    {
      level: 'critical',
      message: `The selected beads capture ${kitHost} immunoglobulin, but the detection antibody is declared as ${declared}. These beads cannot calibrate this stain.`,
      remedy:
        'Capture reagents cross-react across related hosts to an uncertified degree, so the curve can fit well while the beads bind a fraction of the antibody their assigned values assume. Select a kit whose capture species matches the detection antibody. Do not report values from this calibration.',
    },
  ]
}

/** Convert one MFI to ABC using the fitted curve. Returns null for non-positive MFI. */
function mfiToAbc(mfi: number, curve: CurveResult, options: QuantifyOptions): number | null {
  if (!(mfi > 0)) return null
  const logValue = curve.fit.slope * Math.log10(mfi) + curve.fit.intercept
  const value = 10 ** logValue
  // For PE-molecule standards the curve yields PE molecules bound; converting
  // to antibodies bound requires the conjugate's F/P ratio.
  return options.standardKind === 'pe-molecules' ? value / options.fpRatio : value
}

/**
 * Fraction of gross density above which the background is doing enough of the
 * work that its own reliability decides the result's. A convention, not a
 * standard: it is set where a reader would want to be told rather than at any
 * published threshold.
 */
const MATERIAL_BACKGROUND = 0.25

/**
 * Above this fraction the specific signal is what is left over after almost all
 * of the gross has been subtracted away, and the reported value rests entirely
 * on the difference between two numbers of similar size. Reported as below
 * detection rather than as a small measurement.
 */
const DETECTION_FLOOR = 0.9

/** Relative difference between subtraction modes worth telling the user about. */
const MODE_DIVERGENCE = 0.1

export function quantifySample(
  sample: Sample,
  curve: CurveResult,
  options: QuantifyOptions,
): SampleResult {
  const flags: Flag[] = []
  const base: SampleResult = {
    id: sample.id,
    label: sample.label,
    grossAbc: null,
    controlAbc: null,
    netAbc: null,
    backgroundFraction: null,
    sampleInRange: null,
    controlInRange: null,
    modeDivergence: null,
    lower: null,
    upper: null,
    sitesLow: null,
    sitesHigh: null,
    flags,
    calibrationFlags: [],
  }

  if (sample.mfi === null || !(sample.mfi > 0)) return base

  const [minMfi, maxMfi] = curve.mfiRange
  const controlMfi = sample.controlMfi
  const hasControl = controlMfi !== null && controlMfi > 0 && options.backgroundMode !== 'none'

  const sampleInRange = sample.mfi >= minMfi && sample.mfi <= maxMfi
  const controlInRange = hasControl
    ? (controlMfi as number) >= minMfi && (controlMfi as number) <= maxMfi
    : null

  if (!sampleInRange) {
    flags.push({
      level: 'critical',
      message: `Sample MFI (${formatNumber(sample.mfi)}) lies outside the calibrated range (${formatNumber(minMfi)}–${formatNumber(maxMfi)}).`,
      remedy:
        'The value is extrapolated beyond the standard and is not quantitative. Add a bead population that brackets this signal, or restain at a dilution that brings the sample inside the range. Do not report this figure.',
    })
  }

  // Densities implied by the raw channels, computed the same way whichever
  // subtraction mode is selected. They feed the reported value in density mode
  // and diagnose it in every mode, which is why they are not conditional.
  const grossAbc = mfiToAbc(sample.mfi, curve, options)
  const controlAbc = hasControl ? mfiToAbc(controlMfi as number, curve, options) : null
  if (grossAbc === null) return base

  const backgroundFraction =
    controlAbc !== null && grossAbc > 0 ? controlAbc / grossAbc : null

  const measured: SampleResult = {
    ...base,
    grossAbc,
    controlAbc,
    backgroundFraction,
    sampleInRange,
    controlInRange,
  }

  const useMfiSubtraction = options.backgroundMode === 'mfi' && hasControl
  const effectiveMfi = useMfiSubtraction ? sample.mfi - (controlMfi as number) : sample.mfi

  let netAbc: number | null
  if (useMfiSubtraction) {
    netAbc = effectiveMfi > 0 ? mfiToAbc(effectiveMfi, curve, options) : null
  } else if (options.backgroundMode === 'abc' && controlAbc !== null) {
    netAbc = grossAbc - controlAbc
  } else {
    netAbc = grossAbc
  }

  if (netAbc === null || netAbc <= 0) {
    flags.push({
      level: 'critical',
      message: useMfiSubtraction
        ? 'Control MFI equals or exceeds sample MFI. No specific signal is detectable.'
        : 'Background density equals or exceeds sample density. No specific binding is detectable.',
      remedy:
        'Confirm the correct control was used and that the stained and control tubes were not transposed. A genuinely negative result is a valid finding and should be reported as below detection rather than as a density.',
    })
    return { ...measured, flags }
  }

  // A net that survives subtraction can still be the small difference between
  // two much larger numbers, which is not a measurement of anything.
  if (backgroundFraction !== null && backgroundFraction >= DETECTION_FLOOR) {
    flags.push({
      level: 'critical',
      message: `Background accounts for ${(backgroundFraction * 100).toFixed(1)}% of gross density. The sample is not meaningfully above its control.`,
      remedy:
        'Report this as below detection under these staining conditions. Improving it means raising specific signal rather than refining the arithmetic: check the antibody concentration, the fluorophore brightness, and whether the target is expressed on this population at all.',
    })
    return { ...measured, flags }
  }

  // The control is almost always dimmer than the dimmest bead, so extrapolating
  // it is the normal case rather than the exceptional one. What decides whether
  // that matters is how much of the gross signal it accounts for, so the flag
  // is on the combination rather than on the extrapolation alone.
  if (backgroundFraction !== null && backgroundFraction >= MATERIAL_BACKGROUND) {
    if (controlInRange === false) {
      flags.push({
        level: 'critical',
        message: `Background is ${(backgroundFraction * 100).toFixed(1)}% of gross density, and the control MFI (${formatNumber(controlMfi as number)}) lies below the calibrated range (${formatNumber(minMfi)}–${formatNumber(maxMfi)}).`,
        remedy:
          'Most of this result is an extrapolated quantity subtracted from a measured one. Add a bead population dim enough to bracket the control, or acquire the control under conditions that bring it into range. Do not report this figure.',
      })
    } else {
      flags.push({
        level: 'warning',
        message: `Background accounts for ${(backgroundFraction * 100).toFixed(1)}% of gross density.`,
        remedy:
          'The reported value is a small difference between larger numbers, so it carries the uncertainty of both. Consider whether an FMO rather than an isotype is the appropriate control for this panel.',
      })
    }
  }

  // How much the choice of subtraction mode actually matters for this sample.
  // Where the two modes agree the choice is immaterial; where they diverge, the
  // divergence is itself information about the dataset.
  let modeDivergence: number | null = null
  if (hasControl && controlAbc !== null) {
    const densityNet = grossAbc - controlAbc
    const mfiNet =
      sample.mfi - (controlMfi as number) > 0
        ? mfiToAbc(sample.mfi - (controlMfi as number), curve, options)
        : null
    if (densityNet > 0 && mfiNet !== null && mfiNet > 0) {
      modeDivergence = Math.abs(densityNet - mfiNet) / Math.max(densityNet, mfiNet)
      if (modeDivergence > MODE_DIVERGENCE) {
        flags.push({
          level: 'warning',
          message: `Density-space and MFI-space subtraction differ by ${(modeDivergence * 100).toFixed(0)}% for this sample (${formatNumber(densityNet)} against ${formatNumber(mfiNet)}).`,
          remedy:
            'The two modes agree only where the log-log slope is near unity and the background is small. Neither is a correction of the other, so state which mode was used when reporting this value.',
        })
      }
    }
  }

  // Curve-fit uncertainty is symmetric in log10 space, so it applies as a
  // multiplicative factor to the background-subtracted value.
  const interval = meanResponseInterval(
    curve.fit,
    Math.log10(effectiveMfi),
    options.confidenceLevel,
  )
  const factor = 10 ** interval.halfWidth

  const [minAssigned] = curve.assignedRange
  const minAbc =
    options.standardKind === 'pe-molecules' ? minAssigned / options.fpRatio : minAssigned
  if (netAbc < minAbc) {
    flags.push({
      level: 'warning',
      message: `Result (${formatNumber(netAbc)}) lies below the lowest bead standard (${formatNumber(minAbc)}).`,
      remedy:
        'Treat it as an estimate near the limit of quantification rather than a measurement, and report it with that caveat.',
    })
  }

  if (netAbc > MAX_PLAUSIBLE_DENSITY) {
    flags.push({
      level: 'critical',
      message: `Result (${formatNumber(netAbc)}) exceeds any physically plausible antigen density. A cell surface accommodates on the order of 10⁷ antibody footprints.`,
      remedy:
        'Check the entered MFI for a transcription error, particularly a misplaced decimal point or an exponent. This figure is not a measurement.',
    })
  }

  const sitesLow = netAbc
  const sitesHigh = options.valency === 'bivalent' ? netAbc * 2 : netAbc

  return {
    ...measured,
    netAbc,
    modeDivergence,
    lower: netAbc / factor,
    upper: netAbc * factor,
    sitesLow,
    sitesHigh,
    flags,
  }
}

/**
 * A sample result carrying the calibration conditions that invalidate it.
 *
 * The curve panel and the results panel are separate, and a reader who scrolls
 * to their number never passes the alarm sitting above the chart. Attaching the
 * invalidating conditions to the result is what makes that impossible, in the
 * interface and in the export alike.
 */
export function quantifyWithCalibration(
  sample: Sample,
  curve: CurveResult,
  options: QuantifyOptions,
  extraCalibrationFlags: readonly Flag[] = [],
): SampleResult {
  const invalidating = [...extraCalibrationFlags, ...curve.flags].filter(
    (f) => f.level === 'critical',
  )
  return { ...quantifySample(sample, curve, options), calibrationFlags: invalidating }
}

/** Whether the calibration behind a result can support any figure at all. */
export function calibrationValid(result: SampleResult): boolean {
  return result.calibrationFlags.length === 0
}

/**
 * Overall reportability of a result, derived from its flags.
 *
 * Exported so a CSV row can carry a machine-readable status rather than only
 * prose a reader has to parse: a flag that survives only on screen stops doing
 * its work at exactly the moment the value enters a notebook or a figure.
 */
export function resultStatus(flags: readonly Flag[]): 'ok' | 'caution' | 'do_not_report' {
  if (flags.some((f) => f.level === 'critical')) return 'do_not_report'
  if (flags.length > 0) return 'caution'
  return 'ok'
}

export interface DensityBand {
  id: string
  min: number
  max: number
  label: string
  note: string
}

/**
 * Order-of-magnitude interpretation bands for CAR-T antigen density.
 *
 * These are reading aids drawn from the published density-threshold literature
 * (e.g. Majzner et al., Cancer Discovery 2020), NOT validated cutoffs. The real
 * threshold is a property of a specific construct (scFv affinity, hinge,
 * costimulatory domain) and of the effector function under consideration:
 * cytotoxicity is triggered at lower density than cytokine release and
 * proliferation. Always establish the threshold for your own construct.
 */
export const DENSITY_BANDS: DensityBand[] = [
  {
    id: 'subthreshold',
    min: 0,
    max: 100,
    label: 'Sub-threshold',
    note: 'Commonly below the activation threshold of conventional CARs; associated with antigen-low escape.',
  },
  {
    id: 'low',
    min: 100,
    max: 1_000,
    label: 'Low',
    note: 'Cytotoxicity is frequently achievable; cytokine release and proliferation are commonly limited.',
  },
  {
    id: 'intermediate',
    min: 1_000,
    max: 10_000,
    label: 'Intermediate',
    note: 'Robust cytotoxicity is typical for conventional constructs.',
  },
  {
    id: 'high',
    min: 10_000,
    max: Infinity,
    label: 'High',
    note: 'Full effector response is expected. On normal tissue, this density represents a substantial on-target off-tumour risk.',
  },
]

export function bandFor(abc: number): DensityBand {
  return DENSITY_BANDS.find((b) => abc >= b.min && abc < b.max) ?? DENSITY_BANDS[0]
}

/**
 * Label for a reported interval, e.g. "95% CI".
 *
 * The confidence level is user-selectable, so the label must be derived from it
 * rather than written out at each call site.
 */
export function confidenceLabel(level: number): string {
  const percent = level * 100
  const rounded = Number.isInteger(percent) ? String(percent) : percent.toFixed(1)
  return `${rounded}% CI`
}

/**
 * A cell surface can accommodate roughly ten million antibody footprints. Above
 * that a figure is arithmetic rather than measurement, and almost always a
 * transcription error in the entered MFI.
 */
export const MAX_PLAUSIBLE_DENSITY = 2e7

/** Beyond this a value is shown in scientific notation instead of in full. */
const SCIENTIFIC_ABOVE = 1e9

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return 'n/a'
  // Rendering an absurd value in full breaks the layout it sits in.
  if (Math.abs(v) >= SCIENTIFIC_ABOVE) return v.toExponential(2)
  if (v >= 10_000) return Math.round(v).toLocaleString('en-US')
  if (v >= 100) return v.toFixed(0)
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}
