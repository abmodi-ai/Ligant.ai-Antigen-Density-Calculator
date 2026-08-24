import { describe, it, expect } from 'vitest'
import { linearRegression, meanResponseInterval, quadraticCurvature, studentTCdf, tCritical } from './stats'

describe('linearRegression', () => {
  it('recovers an exact line', () => {
    const xs = [1, 2, 3, 4, 5]
    const ys = xs.map((x) => 3 * x - 7)
    const fit = linearRegression(xs, ys)
    expect(fit.slope).toBeCloseTo(3, 12)
    expect(fit.intercept).toBeCloseTo(-7, 12)
    expect(fit.r2).toBeCloseTo(1, 12)
    expect(fit.residualSE).toBeCloseTo(0, 12)
    expect(fit.df).toBe(3)
  })

  it('matches a hand-computed noisy fit', () => {
    // Textbook example: slope and intercept verified independently.
    const xs = [1, 2, 3, 4]
    const ys = [2, 4, 5, 8]
    const fit = linearRegression(xs, ys)
    expect(fit.slope).toBeCloseTo(1.9, 10)
    expect(fit.intercept).toBeCloseTo(0.0, 10)
  })

  it('rejects degenerate input', () => {
    expect(() => linearRegression([1, 2], [1, 2])).toThrow(/at least 3/)
    expect(() => linearRegression([1, 1, 1], [1, 2, 3])).toThrow(/identical/)
    expect(() => linearRegression([1, 2, 3], [1, 2])).toThrow(/mismatch/)
  })
})

describe('student t distribution', () => {
  it('CDF is symmetric about zero', () => {
    for (const df of [1, 5, 30]) {
      expect(studentTCdf(0, df)).toBeCloseTo(0.5, 10)
      expect(studentTCdf(1.5, df) + studentTCdf(-1.5, df)).toBeCloseTo(1, 10)
    }
  })

  // Published two-sided 95% critical values.
  it.each([
    [1, 12.706],
    [2, 4.303],
    [5, 2.571],
    [10, 2.228],
    [30, 2.042],
    [120, 1.980],
  ])('t(0.975, df=%i) = %f', (df, expected) => {
    expect(tCritical(0.95, df)).toBeCloseTo(expected, 3)
  })

  it('99% critical values match published tables', () => {
    expect(tCritical(0.99, 10)).toBeCloseTo(3.169, 3)
    expect(tCritical(0.99, 30)).toBeCloseTo(2.75, 2)
  })
})

describe('meanResponseInterval', () => {
  it('has zero width for a perfect fit', () => {
    const xs = [1, 2, 3, 4]
    const ys = xs.map((x) => 2 * x)
    const fit = linearRegression(xs, ys)
    const ci = meanResponseInterval(fit, 2.5)
    expect(ci.fitted).toBeCloseTo(5, 10)
    expect(ci.halfWidth).toBeCloseTo(0, 10)
  })

  it('is narrowest at the mean of x and widens outward', () => {
    const xs = [1, 2, 3, 4, 5]
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1]
    const fit = linearRegression(xs, ys)
    const atMean = meanResponseInterval(fit, 3).halfWidth
    const nearEdge = meanResponseInterval(fit, 5).halfWidth
    const beyond = meanResponseInterval(fit, 8).halfWidth
    expect(atMean).toBeLessThan(nearEdge)
    expect(nearEdge).toBeLessThan(beyond)
  })
})

describe('quadraticCurvature', () => {
  /** Log-spaced populations over the range a Quantum Simply Cellular kit covers. */
  function design(n: number): number[] {
    const lo = Math.log10(2_050)
    const hi = Math.log10(121_000)
    return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1))
  }

  /** A curve bent symmetrically about the middle of its range. */
  function bent(xs: number[], quadratic: number): number[] {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    return xs.map((x) => 0.545 + x + quadratic * (x - mean) ** 2)
  }

  it('recovers a known quadratic coefficient exactly', () => {
    const xs = design(8)
    const result = quadraticCurvature(xs, bent(xs, -0.09))
    expect(result?.quadratic).toBeCloseTo(-0.09, 10)
  })

  it('reports zero curvature for a straight line', () => {
    const xs = design(8)
    const result = quadraticCurvature(
      xs,
      xs.map((x) => 0.545 + 1.017 * x),
    )
    expect(result?.quadratic).toBeCloseTo(0, 10)
  })

  it('has no test to offer below four points', () => {
    expect(quadraticCurvature(design(3), [1, 2, 3])).toBeNull()
  })

  it('has no test to offer where x does not vary', () => {
    expect(quadraticCurvature([2, 2, 2, 2], [1, 2, 3, 4])).toBeNull()
  })

  it('reports the drift in local slope across the range, not only the coefficient', () => {
    const xs = design(8)
    const result = quadraticCurvature(xs, bent(xs, -0.09))
    // 1.16 at the low end to 0.84 at the high end.
    expect(result?.slopeAtLow).toBeCloseTo(1.159, 2)
    expect(result?.slopeAtHigh).toBeCloseTo(0.841, 2)
    expect(Math.abs(result?.slopeDrift ?? 0)).toBeCloseTo(0.319, 3)
  })

  it('detects a bend the slope and R squared checks both clear', () => {
    const xs = design(8)
    const ys = bent(xs, -0.09).map((y, i) => y + (i % 2 ? 0.01 : -0.01))

    // What the calibration checks see: both healthy.
    const line = linearRegression(xs, ys)
    expect(line.slope).toBeCloseTo(1.0, 2)
    expect(line.r2).toBeGreaterThan(0.98)

    // What the quadratic term sees.
    const result = quadraticCurvature(xs, ys)
    expect(result?.p).toBeLessThan(0.01)
  })

  it('does not cry curvature over ordinary scatter', () => {
    const xs = design(8)
    // Alternating residuals of about 2%, which is transcription and gating
    // noise rather than a bend.
    const ys = xs.map((x, i) => 0.545 + 1.017 * x + (i % 2 ? 0.01 : -0.01))
    expect(quadraticCurvature(xs, ys)?.p).toBeGreaterThan(0.05)
  })

  it('carries the degrees of freedom the design actually leaves', () => {
    for (const n of [4, 6, 8]) {
      expect(quadraticCurvature(design(n), bent(design(n), -0.05))?.df).toBe(n - 3)
    }
  })
})
