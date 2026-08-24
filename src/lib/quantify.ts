/**
 * Antigen density quantification: flow-cytometry MFI -> molecules per cell.
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

import { linearRegression, meanResponseInterval, type LinearFit } from './stats'

export type StandardKind = 'abc' | 'pe-molecules'
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
  confidenceLevel: number
}

export const DEFAULT_OPTIONS: QuantifyOptions = {
  standardKind: 'abc',
  fpRatio: 1,
  backgroundMode: 'abc',
  valency: 'bivalent',
  confidenceLevel: 0.95,
}

export type FlagLevel = 'warning' | 'critical'

export interface Flag {
  level: FlagLevel
  message: string
}

export interface CurveResult {
  fit: LinearFit
  /** Points actually used, in log10 space, for plotting the fitted line. */
  logMfi: number[]
  logAssigned: number[]
  mfiRange: [number, number]
  assignedRange: [number, number]
  flags: Flag[]
}

export interface SampleResult {
  id: string
  label: string
  /** ABC implied by the sample MFI, before background subtraction. */
  grossAbc: number | null
  /** ABC implied by the control MFI, if a control was supplied. */
  controlAbc: number | null
  /** Background-subtracted ABC. This is the reported density. */
  netAbc: number | null
  lower: number | null
  upper: number | null
  /** Lower and upper bound on antigen sites per cell, given binding valency. */
  sitesLow: number | null
  sitesHigh: number | null
  flags: Flag[]
}

/** log-log slope far from unity indicates detector or staining non-linearity. */
const SLOPE_TOLERANCE = 0.15
const MIN_R2 = 0.98

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
  if (fit.r2 < MIN_R2) {
    flags.push({
      level: 'critical',
      message: `Standard curve R² = ${fit.r2.toFixed(4)}, below the conventional acceptance threshold of ${MIN_R2}. Verify bead gating and check for a saturated or off-scale population.`,
    })
  }
  if (Math.abs(fit.slope - 1) > SLOPE_TOLERANCE) {
    flags.push({
      level: 'warning',
      message: `Log-log slope is ${fit.slope.toFixed(3)}. A well-behaved standard approximates 1.0; departures from unity indicate detector non-linearity or a compensation error.`,
    })
  }

  const mfis = usable.map((s) => s.mfi as number)
  const assigned = usable.map((s) => s.assigned as number)

  return {
    fit,
    logMfi,
    logAssigned,
    mfiRange: [Math.min(...mfis), Math.max(...mfis)],
    assignedRange: [Math.min(...assigned), Math.max(...assigned)],
    flags,
  }
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
    lower: null,
    upper: null,
    sitesLow: null,
    sitesHigh: null,
    flags,
  }

  if (sample.mfi === null || !(sample.mfi > 0)) return base

  const [minMfi, maxMfi] = curve.mfiRange
  if (sample.mfi < minMfi || sample.mfi > maxMfi) {
    flags.push({
      level: 'critical',
      message: `Sample MFI (${formatNumber(sample.mfi)}) lies outside the calibrated range (${formatNumber(minMfi)}–${formatNumber(maxMfi)}). The value is extrapolated beyond the standard and is not quantitative.`,
    })
  }

  const useMfiSubtraction =
    options.backgroundMode === 'mfi' && sample.controlMfi !== null && sample.controlMfi > 0

  // In 'mfi' mode the background is removed before conversion; in 'abc' mode
  // both channels are converted first and the densities subtracted.
  const effectiveMfi = useMfiSubtraction
    ? sample.mfi - (sample.controlMfi as number)
    : sample.mfi

  if (useMfiSubtraction && effectiveMfi <= 0) {
    flags.push({
      level: 'critical',
      message: 'Control MFI equals or exceeds sample MFI. No specific signal is detectable.',
    })
    return base
  }

  const grossAbc = mfiToAbc(effectiveMfi, curve, options)
  const controlAbc =
    options.backgroundMode === 'abc' && sample.controlMfi !== null && sample.controlMfi > 0
      ? mfiToAbc(sample.controlMfi, curve, options)
      : null

  if (grossAbc === null) return base

  let netAbc = grossAbc
  if (controlAbc !== null) netAbc = grossAbc - controlAbc

  if (netAbc <= 0) {
    flags.push({
      level: 'critical',
      message: 'Background exceeds sample signal after subtraction. No specific binding is detectable.',
    })
    return { ...base, grossAbc, controlAbc, flags }
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
      message: `Result (${formatNumber(netAbc)}) lies below the lowest bead standard (${formatNumber(minAbc)}). Interpret as an estimate near the limit of quantification.`,
    })
  }

  const sitesLow = netAbc
  const sitesHigh = options.valency === 'bivalent' ? netAbc * 2 : netAbc

  return {
    ...base,
    grossAbc,
    controlAbc,
    netAbc,
    lower: netAbc / factor,
    upper: netAbc * factor,
    sitesLow,
    sitesHigh,
    flags,
  }
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

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return 'n/a'
  if (v >= 10_000) return Math.round(v).toLocaleString('en-US')
  if (v >= 100) return v.toFixed(0)
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}
