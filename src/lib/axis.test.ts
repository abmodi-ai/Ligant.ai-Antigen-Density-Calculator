import { describe, it, expect } from 'vitest'
import { decadeTicks, formatDecade, minorTicks } from './axis'

describe('decadeTicks', () => {
  it('gives one tick per decade over an ordinary range', () => {
    expect(decadeTicks(2, 5)).toEqual([2, 3, 4, 5])
  })

  it('stays bounded however wide the domain gets', () => {
    // A transcription error such as 1e300 must not ask for 300 gridlines.
    for (const hi of [20, 50, 300, 3000]) {
      const ticks = decadeTicks(0, hi)
      expect(ticks.length, `span of ${hi} decades`).toBeLessThanOrEqual(14)
      expect(ticks.length).toBeGreaterThan(1)
    }
  })

  it('coarsens the step rather than dropping the axis', () => {
    const wide = decadeTicks(0, 100)
    expect(wide.length).toBeGreaterThan(2)
    expect(wide[1] - wide[0]).toBeGreaterThan(1)
  })

  it('returns nothing for a degenerate domain', () => {
    expect(decadeTicks(NaN, 3)).toEqual([])
    expect(decadeTicks(5, 2)).toEqual([])
  })
})

describe('minorTicks', () => {
  it('subdivides a narrow domain', () => {
    expect(minorTicks(0, 1).length).toBeGreaterThan(5)
  })

  it('gives none once the domain is wide', () => {
    expect(minorTicks(0, 300)).toEqual([])
  })
})

describe('formatDecade', () => {
  it('uses powers of ten for whole decades outside the readable range', () => {
    expect(formatDecade(3)).toBe('10³')
    expect(formatDecade(6)).toBe('10⁶')
    expect(formatDecade(-3)).toBe('10⁻³')
  })

  it('prints ordinary magnitudes plainly', () => {
    expect(formatDecade(0)).toBe('1')
    expect(formatDecade(2)).toBe('100')
  })

  it('does not claim a whole decade for a coarsened step', () => {
    expect(formatDecade(2.5)).toBe('316')
  })
})
