/**
 * Four-parameter logistic (4PL) dose-response fitting.
 *
 * Model, with X on a log10 dose axis — the same parameterisation as the
 * "log(agonist) vs response, variable slope" fit labs run in Prism:
 *
 *   f(X) = bottom + (top - bottom) / (1 + 10^((logEC50 - X) · hill))
 *
 * Fitted by Levenberg-Marquardt. The implementation is deterministic: fixed
 * iteration caps, no random restarts, and a fixed damping schedule, so the same
 * data always yields the same parameters.
 */

import { tCritical } from './stats'

export interface DosePoint {
  /** Dose in linear units — E:T ratio, concentration, whatever the axis is. */
  dose: number
  response: number
}

export interface FitParams {
  bottom: number
  top: number
  /** log10 of the EC50, which is where the fit is actually parameterised. */
  logEC50: number
  hill: number
}

export interface ParamEstimate {
  value: number
  standardError: number
  lower: number
  upper: number
}

export interface DoseResponseFit {
  params: FitParams
  /** EC50 in the same linear units as the input doses. */
  ec50: number
  ec50Lower: number
  ec50Upper: number
  estimates: Record<keyof FitParams, ParamEstimate>
  r2: number
  residualSE: number
  n: number
  df: number
  iterations: number
  converged: boolean
}

const LN10 = Math.LN10
const PARAM_ORDER: (keyof FitParams)[] = ['bottom', 'top', 'logEC50', 'hill']

export function predict(p: FitParams, logDose: number): number {
  const u = 10 ** ((p.logEC50 - logDose) * p.hill)
  return p.bottom + (p.top - p.bottom) / (1 + u)
}

/** Partial derivatives of the model with respect to each parameter, in PARAM_ORDER. */
function gradient(p: FitParams, logDose: number): number[] {
  const k = (p.logEC50 - logDose) * p.hill
  const u = 10 ** k
  const denom = (1 + u) ** 2
  const span = p.top - p.bottom
  return [
    u / (1 + u),                                   // d/d bottom
    1 / (1 + u),                                   // d/d top
    (-span * u * LN10 * p.hill) / denom,           // d/d logEC50
    (-span * u * LN10 * (p.logEC50 - logDose)) / denom, // d/d hill
  ]
}

/** Solve A·x = b for small dense A by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < 1e-14) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/** Invert a small dense matrix via Gauss-Jordan; used for the covariance matrix. */
function invert(A: number[][]): number[][] | null {
  const n = A.length
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < 1e-14) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    const d = M[col][col]
    for (let c = 0; c < 2 * n; c++) M[col][c] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col]
      for (let c = 0; c < 2 * n; c++) M[r][c] -= factor * M[col][c]
    }
  }
  return M.map((row) => row.slice(n))
}

function toArray(p: FitParams): number[] {
  return [p.bottom, p.top, p.logEC50, p.hill]
}
function toParams(a: number[]): FitParams {
  return { bottom: a[0], top: a[1], logEC50: a[2], hill: a[3] }
}

function sse(points: { x: number; y: number }[], p: FitParams): number {
  let s = 0
  for (const { x, y } of points) s += (y - predict(p, x)) ** 2
  return s
}

/**
 * Initial estimates. A poor start is the usual cause of a 4PL failing to
 * converge, so these are derived from the data rather than fixed constants.
 */
function initialGuess(points: { x: number; y: number }[]): FitParams {
  const ys = points.map((p) => p.y)
  const xs = points.map((p) => p.x)
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)

  // Orient the curve: compare mean response in the lower and upper dose halves.
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2
  const lower = points.filter((p) => p.x <= midX)
  const upper = points.filter((p) => p.x > midX)
  const mean = (arr: { y: number }[]) =>
    arr.length ? arr.reduce((s, p) => s + p.y, 0) / arr.length : 0
  const ascending = mean(upper) >= mean(lower)

  const half = (lo + hi) / 2
  let closest = points[0]
  for (const p of points) {
    if (Math.abs(p.y - half) < Math.abs(closest.y - half)) closest = p
  }

  return {
    bottom: ascending ? lo : hi,
    top: ascending ? hi : lo,
    logEC50: closest.x,
    hill: 1,
  }
}

export function fitDoseResponse(
  data: DosePoint[],
  confidenceLevel = 0.95,
): DoseResponseFit | { error: string } {
  const points = data
    .filter((d) => Number.isFinite(d.dose) && d.dose > 0 && Number.isFinite(d.response))
    .map((d) => ({ x: Math.log10(d.dose), y: d.response }))

  if (points.length < 5) {
    return { error: `A 4PL fit needs at least 5 points with a positive dose; have ${points.length}.` }
  }
  if (new Set(points.map((p) => p.x)).size < 4) {
    return { error: 'Need at least 4 distinct dose levels to identify four parameters.' }
  }

  // Gradient tolerance scales with the response magnitude so the criterion
  // behaves the same for a 0-100 percent-lysis axis and a raw-count axis.
  const yScale = Math.max(1, ...points.map((p) => Math.abs(p.y)))

  let params = initialGuess(points)
  let lambda = 1e-3
  let current = sse(points, params)
  let iterations = 0
  let converged = false

  for (let iter = 0; iter < 200; iter++) {
    iterations = iter + 1
    const n = PARAM_ORDER.length
    const JtJ = Array.from({ length: n }, () => new Array(n).fill(0))
    const Jtr = new Array(n).fill(0)

    for (const { x, y } of points) {
      const g = gradient(params, x)
      const r = y - predict(params, x)
      for (let i = 0; i < n; i++) {
        Jtr[i] += g[i] * r
        for (let j = 0; j < n; j++) JtJ[i][j] += g[i] * g[j]
      }
    }

    // At a minimum the residuals are orthogonal to the Jacobian, so J'r goes to
    // zero. This is the criterion that holds whether the fit is exact or noisy;
    // testing the residual instead fails on noiseless data, where no step can
    // improve on a sum of squares already at floating-point zero and lambda
    // simply escalates until the loop gives up.
    if (Math.max(...Jtr.map(Math.abs)) <= 1e-10 * yScale) {
      converged = true
      break
    }

    const damped = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)))
    const delta = solve(damped, Jtr)
    if (!delta) {
      lambda *= 10
      if (lambda > 1e12) break
      continue
    }

    const candidate = toParams(toArray(params).map((v, i) => v + delta[i]))
    const candidateSse = sse(points, candidate)

    if (Number.isFinite(candidateSse) && candidateSse < current) {
      const previous = toArray(params)
      const improvement = current - candidateSse
      params = candidate
      current = candidateSse
      lambda = Math.max(lambda / 10, 1e-12)

      // Stop on the parameter step rather than on the residual: scaling the
      // tolerance by the SSE collapses to nothing when the data are noiseless
      // and the fit is essentially exact. The step size is scale-free.
      const relativeStep = Math.max(
        ...delta.map((d, i) => Math.abs(d) / (Math.abs(previous[i]) + 1e-12)),
      )
      if (relativeStep < 1e-10 || improvement <= 1e-14 * current) {
        converged = true
        break
      }
    } else {
      lambda *= 10
      if (lambda > 1e12) break
    }
  }

  // The 4PL is exactly degenerate: (bottom, top, hill) and (top, bottom, -hill)
  // describe the same curve. Collapse to the canonical branch with hill > 0, so
  // that `top` always names the high-dose plateau and two fits are comparable.
  if (params.hill < 0) {
    params = { ...params, bottom: params.top, top: params.bottom, hill: -params.hill }
  }

  const n = points.length
  const df = n - PARAM_ORDER.length
  if (df <= 0) return { error: 'Not enough points to estimate uncertainty for four parameters.' }

  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  const sst = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0)
  const residualSE = Math.sqrt(current / df)

  // Covariance = s^2 (J'J)^-1, evaluated at the solution.
  const JtJ = Array.from({ length: 4 }, () => new Array(4).fill(0))
  for (const { x } of points) {
    const g = gradient(params, x)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) JtJ[i][j] += g[i] * g[j]
  }
  const inv = invert(JtJ)
  const t = tCritical(confidenceLevel, df)

  const estimates = {} as Record<keyof FitParams, ParamEstimate>
  PARAM_ORDER.forEach((name, i) => {
    const value = toArray(params)[i]
    const se = inv ? Math.sqrt(Math.max(inv[i][i], 0) * residualSE ** 2) : NaN
    estimates[name] = {
      value,
      standardError: se,
      lower: value - t * se,
      upper: value + t * se,
    }
  })

  return {
    params,
    ec50: 10 ** params.logEC50,
    // The EC50 interval is asymmetric in linear space: it is symmetric in log.
    ec50Lower: 10 ** estimates.logEC50.lower,
    ec50Upper: 10 ** estimates.logEC50.upper,
    estimates,
    r2: sst === 0 ? 1 : 1 - current / sst,
    residualSE,
    n,
    df,
    iterations,
    converged,
  }
}
