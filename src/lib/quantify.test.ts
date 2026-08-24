import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPTIONS,
  bandFor,
  captureCompatibilityFlags,
  confidenceLabel,
  fitStandardCurve,
  resultStatus,
  formatNumber,
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
  ])('%i ABC falls in the %s band', (abc, id) => {
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

describe('formatNumber', () => {
  it('renders ordinary magnitudes plainly', () => {
    expect(formatNumber(35_636)).toBe('35,636')
    expect(formatNumber(632)).toBe('632')
    expect(formatNumber(1.5)).toBe('1.50')
  })

  it('switches to scientific notation rather than printing hundreds of digits', () => {
    // A misplaced exponent used to render 306 digits and burst the result card.
    const absurd = formatNumber(5.7e302)
    expect(absurd.length).toBeLessThan(12)
    expect(absurd).toMatch(/e\+?302/)
  })

  it('reports a non-finite value rather than NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('n/a')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('n/a')
  })
})

describe('plausibility ceiling', () => {
  it('flags a density no cell surface could carry', () => {
    const beads: BeadStandard[] = [
      { id: 'a', label: '1', mfi: 100, assigned: 1_000, included: true },
      { id: 'b', label: '2', mfi: 1_000, assigned: 10_000, included: true },
      { id: 'c', label: '3', mfi: 10_000, assigned: 100_000, included: true },
      { id: 'd', label: '4', mfi: 50_000, assigned: 500_000, included: true },
    ]
    const fitted = fitStandardCurve(beads)
    if ('error' in fitted) throw new Error(fitted.error)
    const r = quantifySample(
      { id: 's', label: 'S', mfi: 1e300, controlMfi: null },
      fitted,
      DEFAULT_OPTIONS,
    )
    expect(r.flags.some((f) => /physically plausible/.test(f.message))).toBe(true)
    expect(r.flags.every((f) => f.remedy)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The shipped worked example, which is also the regression fixture. None of the
// disclosure work below is permitted to move a computed value.
// ---------------------------------------------------------------------------

const DEMO_BEADS: BeadStandard[] = [
  { id: 'd0', label: 'Blank', mfi: 210, assigned: null, included: false },
  { id: 'd1', label: 'Population 1', mfi: 2_050, assigned: 8_300, included: true },
  { id: 'd2', label: 'Population 2', mfi: 12_900, assigned: 51_000, included: true },
  { id: 'd3', label: 'Population 3', mfi: 39_500, assigned: 175_000, included: true },
  { id: 'd4', label: 'Population 4', mfi: 121_000, assigned: 512_000, included: true },
]

const DEMO_OPTIONS: QuantifyOptions = {
  ...DEFAULT_OPTIONS,
  antibodyHost: 'mouse',
  saturationConfirmed: true,
}

const DEMO_SAMPLES = {
  cd19: { id: 's1', label: 'CD19 (NALM-6)', mfi: 8_900, controlMfi: 240 },
  her2: { id: 's2', label: 'HER2 (SK-BR-3)', mfi: 62_000, controlMfi: 310 },
  keratinocyte: { id: 's3', label: 'HER2 (primary keratinocyte)', mfi: 420, controlMfi: 260 },
}

describe('worked example regression', () => {
  const c = curve(DEMO_BEADS)

  it('reproduces the published fit', () => {
    expect(c.fit.slope).toBeCloseTo(1.017382, 6)
    expect(c.fit.intercept).toBeCloseTo(0.544992, 6)
    expect(c.fit.r2).toBeCloseTo(0.999485, 6)
    expect(c.fit.n).toBe(4)
  })

  it('reproduces every reported density', () => {
    const abc = (s: typeof DEMO_SAMPLES.cd19) =>
      Math.round(quantifySample(s, c, DEMO_OPTIONS).netAbc as number)
    expect(abc(DEMO_SAMPLES.cd19)).toBe(35_636)
    expect(abc(DEMO_SAMPLES.her2)).toBe(262_241)
    expect(abc(DEMO_SAMPLES.keratinocyte)).toBe(632)
  })
})

describe('background as a fraction of gross', () => {
  const c = curve(DEMO_BEADS)

  it('is reported on every sample, flagged or not', () => {
    const cd19 = quantifySample(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS)
    const kera = quantifySample(DEMO_SAMPLES.keratinocyte, c, DEMO_OPTIONS)
    expect(cd19.backgroundFraction).toBeCloseTo(0.0253, 3)
    expect(kera.backgroundFraction).toBeCloseTo(0.614, 3)
  })

  it('records that the control is extrapolated even where it does not matter', () => {
    // Unstained cells are dimmer than the dimmest bead in essentially every
    // real run, so this is the normal case rather than the exceptional one.
    for (const s of Object.values(DEMO_SAMPLES)) {
      expect(quantifySample(s, c, DEMO_OPTIONS).controlInRange).toBe(false)
    }
  })

  it('flags only where the extrapolated background is material', () => {
    const cd19 = quantifySample(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS)
    const kera = quantifySample(DEMO_SAMPLES.keratinocyte, c, DEMO_OPTIONS)
    const mentionsBackground = (r: typeof cd19) =>
      r.flags.some((f) => f.message.includes('of gross density'))
    // 2.5% of gross, extrapolated but immaterial: silent.
    expect(mentionsBackground(cd19)).toBe(false)
    // 61.4% of gross and extrapolated: the escalated flag.
    expect(mentionsBackground(kera)).toBe(true)
    expect(kera.flags.some((f) => f.level === 'critical')).toBe(true)
  })

  it('warns without escalating when a material background is inside the range', () => {
    // Control at 3,000 is inside the calibrated bracket, so the arithmetic is
    // sound even though the background dominates.
    const r = quantifySample({ id: 'x', label: 'x', mfi: 5_000, controlMfi: 3_000 }, c, DEMO_OPTIONS)
    const flag = r.flags.find((f) => f.message.includes('of gross density'))
    expect(flag?.level).toBe('warning')
  })
})

describe('below detection', () => {
  const c = curve(DEMO_BEADS)

  it('reports a control at or above the sample as below detection, never as a number', () => {
    const r = quantifySample({ id: 'x', label: 'x', mfi: 250, controlMfi: 260 }, c, DEMO_OPTIONS)
    expect(r.netAbc).toBeNull()
    expect(r.flags.some((f) => f.level === 'critical')).toBe(true)
    // The diagnostic quantities survive so the user can see why.
    expect(r.grossAbc).toBeGreaterThan(0)
    expect(r.controlAbc).toBeGreaterThan(0)
  })

  it('suppresses a net that is only the residue of a dominant background', () => {
    // Positive, but 95% of gross is background: not a measurement of anything.
    const r = quantifySample({ id: 'x', label: 'x', mfi: 5_200, controlMfi: 5_000 }, c, DEMO_OPTIONS)
    expect(r.backgroundFraction).toBeGreaterThan(0.9)
    expect(r.netAbc).toBeNull()
  })

  it('does not suppress the deliberately under-range demo sample', () => {
    expect(quantifySample(DEMO_SAMPLES.keratinocyte, c, DEMO_OPTIONS).netAbc).not.toBeNull()
  })
})

describe('subtraction mode divergence', () => {
  const c = curve(DEMO_BEADS)

  it('is computed wherever a control is supplied', () => {
    expect(quantifySample(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS).modeDivergence).not.toBeNull()
  })

  it('is null with no control to subtract', () => {
    const r = quantifySample({ id: 'x', label: 'x', mfi: 8_900, controlMfi: null }, c, DEMO_OPTIONS)
    expect(r.modeDivergence).toBeNull()
  })

  it('stays quiet where the slope is near unity and the background is small', () => {
    const r = quantifySample(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS)
    expect(r.flags.some((f) => f.message.includes('differ by'))).toBe(false)
  })
})

describe('curve diagnostics', () => {
  it('reports a residual per population, summing to zero as least squares requires', () => {
    const c = curve(DEMO_BEADS)
    expect(c.residuals).toHaveLength(4)
    expect(c.residuals.map((r) => r.label)).toEqual([
      'Population 1', 'Population 2', 'Population 3', 'Population 4',
    ])
    expect(c.residuals.reduce((a, r) => a + r.logResidual, 0)).toBeCloseTo(0, 12)
    // The point R squared alone conceals: 5% off the line at R squared 0.9995.
    expect(Math.max(...c.residuals.map((r) => Math.abs(r.percent)))).toBeGreaterThan(4)
  })

  it('warns that three populations leave one degree of freedom', () => {
    const c = curve(EXACT_BEADS.slice(0, 3))
    expect(c.flags.some((f) => f.message.includes('one degree of freedom'))).toBe(true)
  })

  it('does not warn at four', () => {
    expect(curve().flags.some((f) => f.message.includes('degree of freedom'))).toBe(false)
  })

  it('refuses a standard set whose assigned values do not rise with MFI', () => {
    const transposed: BeadStandard[] = [
      { id: 'a', label: 'Low', mfi: 1_000, assigned: 100_000, included: true },
      { id: 'b', label: 'Mid', mfi: 10_000, assigned: 10_000, included: true },
      { id: 'c', label: 'High', mfi: 50_000, assigned: 500_000, included: true },
    ]
    const c = curve(transposed)
    const flag = c.flags.find((f) => f.message.includes('not increasing with MFI'))
    expect(flag?.level).toBe('critical')
  })

  it('accepts a monotonic set silently', () => {
    expect(curve().flags.some((f) => f.message.includes('not increasing'))).toBe(false)
  })
})

describe('captureCompatibilityFlags', () => {
  it('rejects a detection antibody the beads cannot capture', () => {
    const flags = captureCompatibilityFlags('mouse', 'rat')
    expect(flags).toHaveLength(1)
    expect(flags[0].level).toBe('critical')
    expect(flags[0].message).toContain('mouse')
    expect(flags[0].message).toContain('rat')
  })

  it('passes a matching host', () => {
    expect(captureCompatibilityFlags('mouse', 'mouse')).toHaveLength(0)
  })

  it('says nothing when the host is not stated', () => {
    expect(captureCompatibilityFlags('mouse', 'unstated')).toHaveLength(0)
  })

  it('does not apply to a pre-conjugated standard, which captures nothing', () => {
    expect(captureCompatibilityFlags(null, 'rat')).toHaveLength(0)
  })

  it('asks the user to check when the host is recorded as other', () => {
    const flags = captureCompatibilityFlags('human', 'other')
    expect(flags[0].level).toBe('warning')
  })
})

describe('resultStatus', () => {
  it('maps a critical flag to do_not_report', () => {
    expect(resultStatus([{ level: 'critical', message: 'x' }])).toBe('do_not_report')
  })

  it('maps a warning to caution', () => {
    expect(resultStatus([{ level: 'warning', message: 'x' }])).toBe('caution')
  })

  it('maps no flags to ok', () => {
    expect(resultStatus([])).toBe('ok')
  })
})
