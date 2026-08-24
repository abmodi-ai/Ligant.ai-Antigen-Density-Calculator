import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPTIONS,
  bandFor,
  confidenceLabel,
  fitStandardCurve,
  quantifySample,
  type BeadStandard,
  type CurveResult,
  type QuantifyOptions,
} from './quantify'

/** Beads on an exact power law: ABC = 10 * MFI, so log-log slope is exactly 1. */
const EXACT_BEADS: BeadStandard[] = [
  { id: 'a', label: 'Blank', mfi: 100, assigned: 1_000, included: true },
  { id: 'b', label: 'Low', mfi: 1_000, assigned: 10_000, included: true },
  { id: 'c', label: 'Mid', mfi: 10_000, assigned: 100_000, included: true },
  { id: 'd', label: 'High', mfi: 50_000, assigned: 500_000, included: true },
]

function curve(beads = EXACT_BEADS): CurveResult {
  const result = fitStandardCurve(beads)
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('fitStandardCurve', () => {
  it('recovers an exact power law', () => {
    const c = curve()
    expect(c.fit.slope).toBeCloseTo(1, 10)
    expect(c.fit.intercept).toBeCloseTo(1, 10) // log10(10)
    expect(c.fit.r2).toBeCloseTo(1, 10)
    expect(c.flags).toHaveLength(0)
    expect(c.mfiRange).toEqual([100, 50_000])
  })

  it('requires three usable populations', () => {
    const result = fitStandardCurve(EXACT_BEADS.slice(0, 2))
    expect(result).toHaveProperty('error')
  })

  it('ignores excluded and non-positive populations', () => {
    const beads = [
      ...EXACT_BEADS,
      { id: 'e', label: 'Excluded', mfi: 5, assigned: 999_999, included: false },
      { id: 'f', label: 'Zero', mfi: 0, assigned: 100, included: true },
    ]
    expect(curve(beads).fit.slope).toBeCloseTo(1, 10)
  })

  it('flags a poor fit and a non-unit slope', () => {
    const bent: BeadStandard[] = [
      { id: 'a', label: '1', mfi: 100, assigned: 1_000, included: true },
      { id: 'b', label: '2', mfi: 1_000, assigned: 3_000, included: true },
      { id: 'c', label: '3', mfi: 10_000, assigned: 200_000, included: true },
      { id: 'd', label: '4', mfi: 50_000, assigned: 250_000, included: true },
    ]
    const flags = curve(bent).flags
    expect(flags.some((f) => /R²/.test(f.message))).toBe(true)
  })
})

describe('quantifySample', () => {
  it('reproduces a standard exactly when the sample matches it', () => {
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: null },
      curve(),
      DEFAULT_OPTIONS,
    )
    expect(r.netAbc).toBeCloseTo(10_000, 6)
    expect(r.flags).toHaveLength(0)
  })

  it('interpolates on the power law', () => {
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 5_000, controlMfi: null },
      curve(),
      DEFAULT_OPTIONS,
    )
    expect(r.netAbc).toBeCloseTo(50_000, 6)
  })

  it('subtracts background in ABC space', () => {
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: 100 },
      curve(),
      { ...DEFAULT_OPTIONS, backgroundMode: 'abc' },
    )
    expect(r.grossAbc).toBeCloseTo(10_000, 6)
    expect(r.controlAbc).toBeCloseTo(1_000, 6)
    expect(r.netAbc).toBeCloseTo(9_000, 6)
  })

  it('subtracts background in MFI space', () => {
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: 100 },
      curve(),
      { ...DEFAULT_OPTIONS, backgroundMode: 'mfi' },
    )
    // (1000 - 100) * 10
    expect(r.netAbc).toBeCloseTo(9_000, 6)
  })

  it('ignores the control when background mode is none', () => {
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: 900 },
      curve(),
      { ...DEFAULT_OPTIONS, backgroundMode: 'none' },
    )
    expect(r.netAbc).toBeCloseTo(10_000, 6)
  })

  it('divides by the F/P ratio for PE-molecule standards', () => {
    const opts: QuantifyOptions = {
      ...DEFAULT_OPTIONS,
      standardKind: 'pe-molecules',
      fpRatio: 2,
    }
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: null },
      curve(EXACT_BEADS),
      opts,
    )
    expect(r.netAbc).toBeCloseTo(5_000, 6)
  })

  it('flags extrapolation beyond the bead range', () => {
    const high = quantifySample(
      { id: 's', label: 'S', mfi: 200_000, controlMfi: null },
      curve(),
      DEFAULT_OPTIONS,
    )
    expect(high.flags.some((f) => /outside the calibrated range/.test(f.message))).toBe(true)
    expect(high.flags[0].level).toBe('critical')
  })

  it('reports no specific signal when background exceeds sample', () => {
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: 1_000 },
      curve(),
      DEFAULT_OPTIONS,
    )
    expect(r.netAbc).toBeNull()
    expect(r.flags.some((f) => f.level === 'critical')).toBe(true)
  })

  it('brackets antigen sites by binding valency', () => {
    const bivalent = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: null },
      curve(),
      { ...DEFAULT_OPTIONS, valency: 'bivalent' },
    )
    expect(bivalent.sitesLow).toBeCloseTo(10_000, 6)
    expect(bivalent.sitesHigh).toBeCloseTo(20_000, 6)

    const monovalent = quantifySample(
      { id: 's', label: 'S', mfi: 1_000, controlMfi: null },
      curve(),
      { ...DEFAULT_OPTIONS, valency: 'monovalent' },
    )
    expect(monovalent.sitesHigh).toBeCloseTo(10_000, 6)
  })

  it('produces a confidence interval that brackets the estimate', () => {
    const noisy: BeadStandard[] = [
      { id: 'a', label: '1', mfi: 120, assigned: 1_000, included: true },
      { id: 'b', label: '2', mfi: 980, assigned: 10_000, included: true },
      { id: 'c', label: '3', mfi: 10_500, assigned: 100_000, included: true },
      { id: 'd', label: '4', mfi: 48_000, assigned: 500_000, included: true },
    ]
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 5_000, controlMfi: null },
      curve(noisy),
      DEFAULT_OPTIONS,
    )
    expect(r.lower).toBeLessThan(r.netAbc as number)
    expect(r.upper).toBeGreaterThan(r.netAbc as number)
  })

  it('is deterministic across repeated evaluation', () => {
    const sample = { id: 's', label: 'S', mfi: 3_333, controlMfi: 210 }
    const runs = Array.from({ length: 5 }, () =>
      JSON.stringify(quantifySample(sample, curve(), DEFAULT_OPTIONS)),
    )
    expect(new Set(runs).size).toBe(1)
  })
})

describe('bandFor', () => {
  it.each([
    [50, 'subthreshold'],
    [100, 'low'],
    [999, 'low'],
    [1_000, 'intermediate'],
    [9_999, 'intermediate'],
    [10_000, 'high'],
    [1_000_000, 'high'],
  ])('%i molecules/cell falls in the %s band', (abc, id) => {
    expect(bandFor(abc).id).toBe(id)
  })
})

describe('confidenceLabel', () => {
  it.each([
    [0.9, '90% CI'],
    [0.95, '95% CI'],
    [0.99, '99% CI'],
  ])('renders %f as %s', (level, expected) => {
    expect(confidenceLabel(level)).toBe(expected)
  })

  it('keeps a fractional level readable', () => {
    expect(confidenceLabel(0.975)).toBe('97.5% CI')
  })
})
