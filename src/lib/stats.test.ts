import { describe, it, expect } from 'vitest'
import { linearRegression, meanResponseInterval, studentTCdf, tCritical } from './stats'

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
