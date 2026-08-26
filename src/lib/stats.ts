/**
 * Deterministic statistics primitives.
 *
 * No randomness, no iteration limits that depend on wall-clock time: the same
 * inputs always produce bit-identical outputs. Everything here is pure.
 */

/** Lanczos approximation to log Γ(x), x > 0. */
function logGamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) {
    // Reflection formula.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  }
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Continued-fraction expansion for the incomplete beta function (Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const FPMIN = 1e-300
  const EPS = 3e-16
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  )
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a
  }
  return 1 - (Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + b * Math.log(1 - x) + a * Math.log(x),
  ) * betaContinuedFraction(b, a, 1 - x)) / b
}

/** CDF of Student's t with `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const p = 0.5 * regularizedIncompleteBeta(df / 2, 0.5, x)
  return t > 0 ? 1 - p : p
}

/**
 * Inverse CDF of Student's t, by bisection on the CDF.
 *
 * Fixed iteration count keeps this deterministic; 200 halvings of a [0, 1e4]
 * bracket resolves far below double precision.
 */
export function studentTInv(p: number, df: number): number {
  if (p <= 0 || p >= 1) throw new Error('studentTInv: p must be in (0, 1)')
  if (df <= 0) throw new Error('studentTInv: df must be positive')
  if (p === 0.5) return 0
  let lo = 0
  let hi = 1e4
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (studentTCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Two-sided critical t value for confidence level `level` (e.g. 0.95). */
export function tCritical(level: number, df: number): number {
  return studentTInv(1 - (1 - level) / 2, df)
}

export interface LinearFit {
  slope: number
  intercept: number
  /** Coefficient of determination. */
  r2: number
  /** Residual standard error, sqrt(SSE / (n - 2)). */
  residualSE: number
  /** Degrees of freedom, n - 2. */
  df: number
  n: number
  meanX: number
  /** Sum of squared deviations of x about its mean. */
  sxx: number
}

/** Ordinary least squares fit of y = slope·x + intercept. Requires n >= 3. */
export function linearRegression(xs: number[], ys: number[]): LinearFit {
  if (xs.length !== ys.length) throw new Error('linearRegression: length mismatch')
  const n = xs.length
  if (n < 3) throw new Error('linearRegression: need at least 3 points')

  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
  }
  if (sxx === 0) throw new Error('linearRegression: all x values identical')

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX

  let sse = 0
  let sst = 0
  for (let i = 0; i < n; i++) {
    sse += (ys[i] - (slope * xs[i] + intercept)) ** 2
    sst += (ys[i] - meanY) ** 2
  }

  const df = n - 2
  return {
    slope,
    intercept,
    r2: sst === 0 ? 1 : 1 - sse / sst,
    residualSE: Math.sqrt(sse / df),
    df,
    n,
    meanX,
    sxx,
  }
}

/**
 * Confidence interval on the fitted mean response at x0.
 *
 * This is the uncertainty in *where the calibration curve sits*, which is the
 * quantity we can defend from the standard alone. It deliberately excludes
 * measurement variability in the unknown sample, which would need replicates.
 * Claiming it here would understate the true interval.
 */
export function meanResponseInterval(
  fit: LinearFit,
  x0: number,
  level = 0.95,
): { fitted: number; lower: number; upper: number; halfWidth: number } {
  const fitted = fit.slope * x0 + fit.intercept
  const se = fit.residualSE * Math.sqrt(1 / fit.n + (x0 - fit.meanX) ** 2 / fit.sxx)
  const halfWidth = tCritical(level, fit.df) * se
  return { fitted, lower: fitted - halfWidth, upper: fitted + halfWidth, halfWidth }
}

/**
 * Significance of a quadratic term, for testing whether a calibration is
 * straight in the space it is fitted in.
 *
 * A curved standard biases every value converted through it, and neither of the
 * checks that look like they would catch it does. Symmetric curvature leaves
 * the overall slope at unity, because the departures at the two ends cancel,
 * and leaves R squared high, because a parabola over a short range is mostly
 * line. A curve whose local slope runs from 1.16 at the low end to 0.84 at the
 * high end fits with slope 1.0000 and R squared 0.998.
 *
 * Magnitude is what makes this test worth running where a runs test on the
 * residual signs is not: a sign test discards how far each point sits from the
 * line, which is the whole of the evidence at these sample sizes.
 *
 * Fitted on x centred about its mean. Centring makes the sum of x zero, which
 * eliminates the constant term from the other two normal equations and leaves a
 * two by two system with a closed-form solution, so no general solver is needed.
 *
 * That elimination is the whole of the arithmetic, and it has to be done
 * completely. An earlier version took the linear coefficient as t1 / s2, which
 * is the simple regression slope and omits the coupling to the quadratic term
 * through s3, the third moment of the centred x. On a symmetric design s3 is
 * zero and the omission costs nothing, which is why the tests written on
 * symmetric fixtures all passed. A bead standard is log-spaced and therefore
 * skewed, so s3 is never zero for the data this actually runs on: across four
 * thousand simulated six to eight population standards the omitted term moved
 * the quadratic coefficient by up to 99 percent and changed the flag decision
 * at alpha = 0.05 in about one run in eighteen.
 */
export interface CurvatureTest {
  /** Quadratic coefficient. Its sign is the direction of the bend. */
  quadratic: number
  standardError: number
  t: number
  df: number
  /** Two-sided p-value for the quadratic coefficient being zero. */
  p: number
  /** Local slope at the low and high ends of the fitted range. */
  slopeAtLow: number
  slopeAtHigh: number
  /** Change in local slope across the range: the readable form of `quadratic`. */
  slopeDrift: number
}

/**
 * Test a quadratic term against a straight line. Null where the design cannot
 * support one: fewer than four points leaves no residual degrees of freedom,
 * and a degenerate spread of x has no quadratic to estimate.
 */
export function quadraticCurvature(xs: number[], ys: number[]): CurvatureTest | null {
  const n = xs.length
  if (n !== ys.length || n < 4) return null

  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const centred = xs.map((x) => x - meanX)

  const s2 = centred.reduce((a, x) => a + x * x, 0)
  const s3 = centred.reduce((a, x) => a + x * x * x, 0)
  const s4 = centred.reduce((a, x) => a + x * x * x * x, 0)

  const t0 = ys.reduce((a, y) => a + y, 0)
  const t1 = centred.reduce((a, x, i) => a + x * ys[i], 0)
  const t2 = centred.reduce((a, x, i) => a + x * x * ys[i], 0)

  // With the constant eliminated, the remaining system is
  //     s2·linear + s3·quadratic = t1
  //     s3·linear + s4c·quadratic = t2c
  // where s4c and t2c carry the correction for the eliminated term.
  const s4c = s4 - (s2 * s2) / n
  const t2c = t2 - (s2 * t0) / n
  const determinant = s2 * s4c - s3 * s3
  if (!(s2 > 0) || !(Math.abs(determinant) > 0)) return null

  const linear = (t1 * s4c - s3 * t2c) / determinant
  const quadratic = (s2 * t2c - s3 * t1) / determinant
  const constant = (t0 - s2 * quadratic) / n

  const df = n - 3
  const sse = centred.reduce((acc, x, i) => {
    const residual = ys[i] - (constant + linear * x + quadratic * x * x)
    return acc + residual * residual
  }, 0)

  // (X'X)^-1 at the quadratic term, for the standard error of its coefficient.
  // det(X'X) is n times the determinant above, and the cofactor there is n·s2,
  // so the two factors of n cancel.
  const variance = ((sse / df) * s2) / determinant
  if (!(variance > 0)) {
    // An exactly quadratic fit leaves no residual, so the term is certain.
    return {
      quadratic,
      standardError: 0,
      t: quadratic === 0 ? 0 : Infinity,
      df,
      p: quadratic === 0 ? 1 : 0,
      slopeAtLow: linear + 2 * quadratic * (Math.min(...centred)),
      slopeAtHigh: linear + 2 * quadratic * (Math.max(...centred)),
      slopeDrift: 2 * quadratic * (Math.max(...xs) - Math.min(...xs)),
    }
  }

  const standardError = Math.sqrt(variance)
  const t = quadratic / standardError

  return {
    quadratic,
    standardError,
    t,
    df,
    p: 2 * (1 - studentTCdf(Math.abs(t), df)),
    slopeAtLow: linear + 2 * quadratic * Math.min(...centred),
    slopeAtHigh: linear + 2 * quadratic * Math.max(...centred),
    slopeDrift: 2 * quadratic * (Math.max(...xs) - Math.min(...xs)),
  }
}
