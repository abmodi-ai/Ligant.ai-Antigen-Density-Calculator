/**
 * Cytotoxicity dose-response analysis.
 *
 * Wraps the 4PL fit in `doseresponse.ts` with the series model a killing assay
 * needs (several constructs compared on one plot) and the quality checks that
 * decide whether a fitted potency can be reported at all.
 *
 * The recurring failure in this assay is a curve fitted through data that never
 * reaches a plateau. The fit converges, R squared looks respectable, and the
 * reported EC50 is an extrapolation. Those cases are flagged rather than
 * silently returned.
 */

import { fitDoseResponse, type DosePoint, type DoseResponseFit } from './doseresponse'
import type { Flag } from './flags'

export interface SeriesPoint {
  id: string
  dose: number | null
  response: number | null
}

export interface Series {
  id: string
  label: string
  points: SeriesPoint[]
  included: boolean
}

export interface CytotoxOptions {
  /** Label for the dose axis, e.g. "E:T ratio" or "CAR+ cells per well". */
  doseLabel: string
  /** Label for the response axis, e.g. "Specific lysis (%)". */
  responseLabel: string
  /** Enables plateau plausibility checks against a 0 to 100 range. */
  responseIsPercent: boolean
  confidenceLevel: number
}

export const DEFAULT_CYTOTOX_OPTIONS: CytotoxOptions = {
  doseLabel: 'E:T ratio',
  responseLabel: 'Specific lysis (%)',
  responseIsPercent: true,
  confidenceLevel: 0.95,
}

export interface SeriesAnalysis {
  series: Series
  fit: DoseResponseFit | null
  error: string | null
  flags: Flag[]
  /** EC50 for a rising curve, IC50 for a falling one. */
  potencyLabel: 'EC50' | 'IC50'
  doseRange: [number, number] | null
}

/** Below this the fit is not describing the data. Killing assays are noisier
 *  than a bead calibration, so the bar is lower than the curve tool's 0.98. */
const MIN_R2 = 0.9
/** A slope this steep across few points is fitting noise, not biology. */
const MAX_ABS_HILL = 5
/** Fraction of the fitted span the data must actually reach at each end for
 *  that plateau to be considered supported rather than extrapolated. */
const PLATEAU_COVERAGE = 0.8

function usablePoints(series: Series): DosePoint[] {
  return series.points
    .filter(
      (p) =>
        p.dose !== null &&
        p.response !== null &&
        Number.isFinite(p.dose) &&
        Number.isFinite(p.response) &&
        p.dose > 0,
    )
    .map((p) => ({ dose: p.dose as number, response: p.response as number }))
}

export function analyseSeries(series: Series, options: CytotoxOptions): SeriesAnalysis {
  const points = usablePoints(series)
  const base: SeriesAnalysis = {
    series,
    fit: null,
    error: null,
    flags: [],
    potencyLabel: 'EC50',
    doseRange: null,
  }

  if (points.length === 0) return base

  const doses = points.map((p) => p.dose)
  const responses = points.map((p) => p.response)
  const doseRange: [number, number] = [Math.min(...doses), Math.max(...doses)]

  const result = fitDoseResponse(points, options.confidenceLevel)
  if ('error' in result) {
    return { ...base, doseRange, error: result.error }
  }

  const fit = result
  // The canonical branch keeps hill positive, so `top` is always the high-dose
  // plateau. A curve that falls with dose is an inhibition curve.
  const rising = fit.params.top >= fit.params.bottom
  const potencyLabel: 'EC50' | 'IC50' = rising ? 'EC50' : 'IC50'
  const flags: Flag[] = []

  if (!fit.converged) {
    flags.push({
      level: 'critical',
      message: 'The fit did not converge.',
      remedy:
        'Check for transcription errors, and confirm the doses span the transition. Do not report these parameters.',
    })
  }

  if (fit.ec50 < doseRange[0] || fit.ec50 > doseRange[1]) {
    flags.push({
      level: 'critical',
      message: `The fitted ${potencyLabel} (${formatDose(fit.ec50)}) lies outside the tested dose range (${formatDose(doseRange[0])} to ${formatDose(doseRange[1])}).`,
      remedy: `Extend the dose range past the transition. An extrapolated ${potencyLabel} is not quantitative and should not be reported.`,
    })
  }

  // A plateau the data never reaches is invented by the model, and the potency
  // estimate rests on it.
  const span = Math.abs(fit.params.top - fit.params.bottom)
  if (span > 0) {
    const observedHigh = Math.max(...responses)
    const observedLow = Math.min(...responses)
    const plateauHigh = Math.max(fit.params.top, fit.params.bottom)
    const plateauLow = Math.min(fit.params.top, fit.params.bottom)

    if (observedHigh < plateauLow + PLATEAU_COVERAGE * span) {
      flags.push({
        level: 'critical',
        message: 'The upper plateau is not reached by any measured point, so the fit extrapolates it.',
        remedy: `Add higher doses until the response levels off. Until then the ${potencyLabel} is model-dependent.`,
      })
    }
    if (observedLow > plateauHigh - PLATEAU_COVERAGE * span) {
      flags.push({
        level: 'warning',
        message: 'The lower plateau is not reached by any measured point.',
        remedy: 'Add lower doses, or an effector-free control, to anchor the baseline.',
      })
    }
  }

  if (fit.r2 < MIN_R2) {
    flags.push({
      level: 'warning',
      message: `R² = ${fit.r2.toFixed(3)}, below the usual acceptance threshold of ${MIN_R2} for a dose-response fit.`,
      remedy: 'Check for an outlying replicate, and confirm the response is monotonic in dose.',
    })
  }

  if (Math.abs(fit.params.hill) > MAX_ABS_HILL) {
    flags.push({
      level: 'warning',
      message: `The Hill slope is ${fit.params.hill.toFixed(2)}, which is unusually steep.`,
      remedy: 'Steep slopes across few points usually mean the transition is under-sampled. Add doses between the plateaus.',
    })
  }

  if (options.responseIsPercent) {
    const low = Math.min(fit.params.top, fit.params.bottom)
    const high = Math.max(fit.params.top, fit.params.bottom)
    if (low < -10 || high > 110) {
      flags.push({
        level: 'warning',
        message: `Fitted plateaus run from ${low.toFixed(1)} to ${high.toFixed(1)}, outside the plausible range for a percentage.`,
        remedy: 'The plateaus are unconstrained by the data. Extend the dose range, or fix the plateaus if the assay defines them.',
      })
    }
  }

  if (points.length < 6) {
    flags.push({
      level: 'warning',
      message: `Four parameters are being estimated from ${points.length} points.`,
      remedy: 'Six or more dose levels give the plateaus and the slope enough to work with.',
    })
  }

  return { series, fit, error: null, flags, potencyLabel, doseRange }
}

export function analyseAll(series: Series[], options: CytotoxOptions): SeriesAnalysis[] {
  return series.filter((s) => s.included).map((s) => analyseSeries(s, options))
}

export function formatDose(v: number): string {
  if (!Number.isFinite(v)) return 'n/a'
  // Rendering an absurd value in full breaks the layout it sits in.
  if (Math.abs(v) >= 1e9) return v.toExponential(2)
  if (v >= 1000) return Math.round(v).toLocaleString('en-US')
  if (v >= 10) return v.toFixed(1)
  if (v >= 1) return v.toFixed(2)
  return v.toPrecision(2)
}

export function formatResponse(v: number): string {
  return Number.isFinite(v) ? v.toFixed(1) : 'n/a'
}

// ---------------------------------------------------------------------------
// Matrix editing
//
// A killing assay runs one dose series across several constructs on one plate,
// so the natural entry surface is a matrix: doses down the left, one response
// column per construct. That also lets a whole block be pasted in one action.
// The analysis layer above stays general and takes independent series.
// ---------------------------------------------------------------------------

export interface DoseMatrix {
  doses: (number | null)[]
  seriesNames: string[]
  /** responses[row][column], aligned to `doses` and `seriesNames`. */
  responses: (number | null)[][]
}

export function emptyMatrix(rows = 8, columns = 2): DoseMatrix {
  return {
    doses: Array.from({ length: rows }, () => null),
    seriesNames: Array.from({ length: columns }, (_, i) => `Construct ${String.fromCharCode(65 + i)}`),
    responses: Array.from({ length: rows }, () => Array.from({ length: columns }, () => null)),
  }
}

export function seriesFromMatrix(matrix: DoseMatrix): Series[] {
  return matrix.seriesNames.map((label, column) => ({
    id: `series-${column}`,
    label,
    included: true,
    points: matrix.doses.map((dose, row) => ({
      id: `r${row}c${column}`,
      dose,
      response: matrix.responses[row]?.[column] ?? null,
    })),
  }))
}
