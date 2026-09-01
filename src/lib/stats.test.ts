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

describe('the quadratic term on a design that is not symmetric', () => {
  // Unevenly spaced in log space, which is what a shipped kit gives: dim
  // populations close together and the bright one far out. Even log spacing
  // would make the centred x symmetric and s3 zero, which is exactly the
  // property every fixture here used to share and real data never has.
  //
  // With s3 zero the coupling between the linear and quadratic coefficients
  // vanishes, so nothing caught a linear coefficient taken as t1 / s2. The
  // reference values below come from solving the three by three normal
  // equations independently rather than from this implementation.
  const MFI = [1_800, 3_100, 5_400, 9_800, 28_000, 240_000]
  const ABC = [7_200, 12_800, 22_500, 41_000, 122_000, 980_000]
  const xs = MFI.map((v) => Math.log10(v))
  const ys = ABC.map((v) => Math.log10(v))

  it('matches an independent solve of the normal equations', () => {
    const c = quadraticCurvature(xs, ys)
    expect(c).not.toBeNull()
    // The uncorrected form returned -0.012472741623 here, out by 45 percent.
    expect(c?.quadratic).toBeCloseTo(-0.022659962718, 11)
  })

  it('reports the local slopes the corrected coefficient implies', () => {
    const c = quadraticCurvature(xs, ys)
    expect(c?.slopeAtLow).toBeCloseTo(1.053141700883, 10)
    expect(c?.slopeAtHigh).toBeCloseTo(0.956839635784, 10)
    expect(c?.slopeDrift).toBeCloseTo(-0.096302065099, 10)
  })

  it('recovers a quadratic it was given exactly, skew and all', () => {
    // The strongest statement available: fit a curve with no noise in it and
    // the coefficients must come back as they went in, which a biased estimator
    // cannot do on a skewed design at any sample size.
    const skewed = [0, 0.4, 0.9, 1.6, 3.1, 7.4]
    const exact = skewed.map((x) => 2.5 - 1.25 * x + 0.375 * x * x)
    const c = quadraticCurvature(skewed, exact)
    expect(c?.quadratic).toBeCloseTo(0.375, 10)
  })
})

describe('what the correction does and does not change', () => {
  // The question a referee asks first: does fixing the estimator invalidate
  // anything already published? Only where s3 is non-zero. On an evenly
  // log-spaced design the two estimators are the same expression, so any result
  // computed on such a design stands unaltered.
  const evenlyLogSpaced = [3, 3.6, 4.2, 4.8, 5.4, 6.0]

  const s3Of = (xs: number[]) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    return xs.reduce((a, x) => a + (x - mean) ** 3, 0)
  }

  it('confirms an evenly log-spaced ladder is symmetric, which is the premise', () => {
    expect(s3Of(evenlyLogSpaced)).toBeCloseTo(0, 12)
  })

  it('agrees with the uncorrected estimator wherever s3 is zero', () => {
    const ys = evenlyLogSpaced.map((x) => 0.5 + 1.02 * x - 0.031 * x * x + (x > 4.5 ? 0.004 : -0.004))
    const c = quadraticCurvature(evenlyLogSpaced, ys)

    // The uncorrected estimator, written out, so the equivalence is visible
    // rather than argued.
    const n = evenlyLogSpaced.length
    const mean = evenlyLogSpaced.reduce((a, b) => a + b, 0) / n
    const z = evenlyLogSpaced.map((x) => x - mean)
    const s2 = z.reduce((a, v) => a + v * v, 0)
    const s3 = z.reduce((a, v) => a + v ** 3, 0)
    const s4 = z.reduce((a, v) => a + v ** 4, 0)
    const t0 = ys.reduce((a, y) => a + y, 0)
    const t1 = z.reduce((a, v, i) => a + v * ys[i], 0)
    const t2 = z.reduce((a, v, i) => a + v * v * ys[i], 0)
    const uncorrectedLinear = t1 / s2
    const uncorrected = (t2 - (s2 * t0) / n - s3 * uncorrectedLinear) / (s4 - (s2 * s2) / n)

    expect(c?.quadratic).toBeCloseTo(uncorrected, 12)
  })

  // The real standard this tool ships with. Four populations, so the curvature
  // test never runs on it, but its skew is worth recording: it is the number
  // that shows an even ladder is a construction rather than a description.
  it('records the skew of the shipped worked example', () => {
    const worked = [2050, 12900, 39500, 121000].map((v) => Math.log10(v))
    expect(s3Of(worked)).toBeCloseTo(-0.340045, 5)
    expect(quadraticCurvature(worked, worked.map((x) => x))).not.toBeNull()
  })
})

describe('the bounded iteration counts cannot bind in practice', () => {
  // studentTInv bisects a [0, 1e4] bracket. If a wanted quantile sat above the
  // upper end it would silently return the end itself, so the claim that this
  // is safe has to be shown rather than asserted.
  it.each([0.9, 0.95, 0.99])('leaves orders of magnitude of headroom at %s', (level) => {
    for (const df of [1, 2, 3, 4, 6, 10, 30, 100, 1000]) {
      const t = tCritical(level, df)
      expect(t).toBeGreaterThan(0)
      // The worst case in this table is df = 1 at 99 percent, near 64.
      expect(t).toBeLessThan(100)
    }
  })

  it('is still far inside the bracket at a level the interface does not offer', () => {
    // 99.9 percent on one degree of freedom, well beyond anything selectable.
    expect(tCritical(0.999, 1)).toBeLessThan(1_000)
  })
})

describe('the design skew reported with the fit', () => {
  const fitOf = (mfi: number[]) =>
    linearRegression(
      mfi.map((v) => Math.log10(v)),
      mfi.map((v, i) => Math.log10(v) * 1.02 + 0.5 + (i % 2 ? 0.01 : -0.01)),
    )

  it('is zero for an evenly spaced ladder, which no kit ships', () => {
    expect(fitOf([1e3, 1e4, 1e5, 1e6]).skew).toBeCloseTo(0, 12)
  })

  it('is the value the shipped worked example actually has', () => {
    expect(fitOf([2050, 12900, 39500, 121000]).skew).toBeCloseTo(-0.3039, 4)
  })

  it('leans positive where the bright population sits far out', () => {
    expect(fitOf([1800, 3100, 5400, 9800, 28000, 240000]).skew).toBeCloseTo(0.8169, 4)
  })

  it('is dimensionless, so scaling every intensity leaves it alone', () => {
    const base = fitOf([2050, 12900, 39500, 121000]).skew
    const scaled = fitOf([2050, 12900, 39500, 121000].map((v) => v * 1000)).skew
    expect(scaled).toBeCloseTo(base, 12)
  })
})
