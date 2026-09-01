import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPTIONS,
  bandFor,
  calibrationValid,
  captureCompatibilityFlags,
  checkStandardConsistency,
  confidenceLabel,
  fitStandardCurve,
  quantifyWithCalibration,
  resultStatus,
  formatNumber,
  quantifySample,
  type BeadStandard,
  type CurveResult,
  type QuantifyOptions,
} from './quantify'
import { BEAD_KITS } from './kits'
import { tCritical } from './stats'
import { MFI_IMPOSSIBLE } from './validate'

/**
 * Beads on an exact power law: ABC = 10 * MFI, so log-log slope is exactly 1.
 *
 * Deliberately synthetic, and the tool now says so: a standard with no residual
 * scatter at all is not a measurement, so this fixture carries that critical
 * flag. It stays exact because the tests below check the arithmetic recovers a
 * known answer, which is a different question from whether a reader should
 * trust such a table. Anything testing *validity* uses SCATTERED_BEADS.
 */
const EXACT_BEADS: BeadStandard[] = [
  { id: 'a', label: 'Blank', mfi: 100, assigned: 1_000, included: true },
  { id: 'b', label: 'Low', mfi: 1_000, assigned: 10_000, included: true },
  { id: 'c', label: 'Mid', mfi: 10_000, assigned: 100_000, included: true },
  { id: 'd', label: 'High', mfi: 50_000, assigned: 500_000, included: true },
]

/**
 * A standard with the scatter real bead data has: the shipped worked example.
 * Used wherever a test is about whether a calibration may be reported.
 */
const SCATTERED_BEADS: BeadStandard[] = [
  { id: 'a', label: 'Population 1', mfi: 2_050, assigned: 8_300, included: true },
  { id: 'b', label: 'Population 2', mfi: 12_900, assigned: 51_000, included: true },
  { id: 'c', label: 'Population 3', mfi: 39_500, assigned: 175_000, included: true },
  { id: 'd', label: 'Population 4', mfi: 121_000, assigned: 512_000, included: true },
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
    expect(c.mfiRange).toEqual([100, 50_000])
  })

  it('says a standard with no scatter at all is not a measurement', () => {
    // The same fixture, read as a reader would read it rather than as an
    // arithmetic check. Perfect collinearity is reachable by constructed
    // numbers and by nothing else, and it produces a zero width interval.
    const c = curve()
    expect(c.flags.filter((f) => f.level === 'critical')).toHaveLength(1)
    expect(c.flags[0].message).toMatch(/no residual scatter/i)
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
    // Control at 2,200 is inside the calibrated bracket, so the arithmetic is
    // sound, and at 43% of gross the background qualifies the figure without
    // being it. This case read 3,000 until the dominant-background tier landed,
    // at which point 59% of gross stopped being a caveat and became a critical.
    const r = quantifySample({ id: 'x', label: 'x', mfi: 5_000, controlMfi: 2_200 }, c, DEMO_OPTIONS)
    expect(r.backgroundFraction as number).toBeGreaterThan(0.25)
    expect(r.backgroundFraction as number).toBeLessThan(0.5)
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

describe('calibration flags reaching the result', () => {
  const c = curve(DEMO_BEADS)
  const mismatch = captureCompatibilityFlags('mouse', 'rat')

  it('attaches an invalidating calibration to every sample derived from it', () => {
    const r = quantifyWithCalibration(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS, mismatch)
    expect(r.calibrationFlags).toHaveLength(1)
    expect(calibrationValid(r)).toBe(false)
    // The value is still computed, so the user can see what their settings did.
    expect(r.netAbc).toBeCloseTo(35_636, 0)
  })

  it('leaves a sound calibration unmarked', () => {
    const r = quantifyWithCalibration(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS, [])
    expect(r.calibrationFlags).toHaveLength(0)
    expect(calibrationValid(r)).toBe(true)
  })

  it('carries a critical from the curve itself, not only a declared mismatch', () => {
    const transposed: BeadStandard[] = [
      { id: 'a', label: 'Low', mfi: 1_000, assigned: 100_000, included: true },
      { id: 'b', label: 'Mid', mfi: 10_000, assigned: 10_000, included: true },
      { id: 'c', label: 'High', mfi: 50_000, assigned: 500_000, included: true },
    ]
    const r = quantifyWithCalibration(
      { id: 'x', label: 'x', mfi: 5_000, controlMfi: null },
      curve(transposed),
      DEMO_OPTIONS,
    )
    expect(r.calibrationFlags.some((f) => f.message.includes('not increasing with MFI'))).toBe(true)
  })

  it('does not treat a calibration warning as invalidating', () => {
    // Three populations warn about one degree of freedom. That is a caveat on
    // the interval, not a reason to withhold the figure.
    const r = quantifyWithCalibration(
      { id: 'x', label: 'x', mfi: 5_000, controlMfi: null },
      curve(SCATTERED_BEADS.slice(0, 3)),
      DEMO_OPTIONS,
    )
    expect(r.calibrationFlags.every((f) => f.level === 'warning')).toBe(true)
    expect(calibrationValid(r)).toBe(true)
  })

  it('reports do_not_report once the calibration flags are counted', () => {
    const r = quantifyWithCalibration(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS, mismatch)
    // The sample's own flags are clean; only the calibration condemns it.
    expect(resultStatus(r.flags)).toBe('ok')
    expect(resultStatus([...r.calibrationFlags, ...r.flags])).toBe('do_not_report')
  })
})

describe('curvature in the standard', () => {
  /** Populations log-spaced over the range a real kit covers. */
  function beads(n: number, quadratic: number): BeadStandard[] {
    const lo = Math.log10(2_050)
    const hi = Math.log10(121_000)
    const xs = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1))
    const mean = xs.reduce((a, b) => a + b, 0) / n
    return xs.map((x, i) => ({
      id: `b${i}`,
      label: `Population ${i + 1}`,
      mfi: 10 ** x,
      // A symmetric bend, plus scatter so the fit is not exact.
      assigned: 10 ** (0.545 + x + quadratic * (x - mean) ** 2 + (i % 2 ? 0.01 : -0.01)),
      included: true,
    }))
  }

  const curvatureFlag = (c: CurveResult) => c.flags.find((f) => f.message.includes('not straight'))

  it('catches a bend that the slope and R squared checks both clear', () => {
    const c = curve(beads(8, -0.09))
    // The two checks that look like they would catch it, both satisfied.
    expect(Math.abs(c.fit.slope - 1)).toBeLessThan(0.15)
    expect(c.fit.r2).toBeGreaterThan(0.98)
    expect(c.flags.some((f) => f.message.includes('Log-log slope'))).toBe(false)
    expect(c.flags.some((f) => f.message.includes('R²'))).toBe(false)
    // The one that does.
    expect(curvatureFlag(c)).toBeDefined()
    expect(curvatureFlag(c)?.message).toContain('drift')
  })

  it('reports the bend as a slope drift a user can act on', () => {
    const message = curvatureFlag(curve(beads(8, -0.09)))?.message ?? ''
    expect(message).toMatch(/local slope runs from 1\.1\d at the low end to 0\.8\d at the high end/)
    expect(message).toMatch(/a drift of 0\.3\d across the calibrated range/)
  })

  it('leaves a straight standard alone', () => {
    const c = curve(beads(8, 0))
    expect(curvatureFlag(c)).toBeUndefined()
    expect(c.curvature).not.toBeNull()
    expect(c.curvature?.p).toBeGreaterThan(0.05)
  })

  it('does not run below six populations, where it has no power to run on', () => {
    for (const n of [4, 5]) {
      const c = curve(beads(n, -0.09))
      expect(c.curvature).toBeNull()
      expect(curvatureFlag(c)).toBeUndefined()
    }
  })

  it('is not tested on the shipped worked example, which has four populations', () => {
    expect(curve(DEMO_BEADS).curvature).toBeNull()
  })

  it('is a caveat on the calibration rather than an invalidation of it', () => {
    // A bend biases every value, but so does a slope of 1.2, which is also a
    // warning. Withholding the figure is reserved for a curve that cannot
    // calibrate anything at all.
    const c = curve(beads(8, -0.09))
    expect(curvatureFlag(c)?.level).toBe('warning')
    const r = quantifyWithCalibration({ id: 'x', label: 'x', mfi: 20_000, controlMfi: null }, c, DEMO_OPTIONS)
    expect(r.calibrationFlags).toHaveLength(0)
    expect(r.netAbc).not.toBeNull()
  })
})

describe('per-row consistency of the standards', () => {
  const rows = (pairs: [number, number][]): BeadStandard[] =>
    pairs.map(([mfi, assigned], i) => ({
      id: `p${i}`,
      label: `Population ${i + 1}`,
      mfi,
      assigned,
      included: true,
    }))

  const CLEAN: [number, number][] = [
    [2_050, 8_300],
    [12_900, 51_000],
    [39_500, 175_000],
    [121_000, 512_000],
  ]

  it('says nothing about the worked example', () => {
    const result = checkStandardConsistency(rows(CLEAN))
    expect(result.outliers).toEqual([])
    expect(result.median).toBeCloseTo(4.14, 2)
  })

  it('says nothing when every value is scaled by the same factor', () => {
    // A legitimate configuration: the ratios stay uniform, only the median moves.
    const scaled = CLEAN.map(([m, a]) => [m, a * 10] as [number, number])
    expect(checkStandardConsistency(rows(scaled)).outliers).toEqual([])
  })

  it('names both rows when two populations are transposed', () => {
    const transposed: [number, number][] = [
      [2_050, 8_300],
      [12_900, 175_000],
      [39_500, 51_000],
      [121_000, 512_000],
    ]
    const named = checkStandardConsistency(rows(transposed)).outliers.map((o) => o.label)
    expect(named).toEqual(['Population 2', 'Population 3'])
  })

  it('catches a tenfold slip that leaves the order intact', () => {
    // The error nothing else locates: monotonicity passes, R squared says the
    // table is wrong without saying where.
    const slipped: [number, number][] = [...CLEAN.slice(0, 3), [121_000, 5_120_000]]
    const outliers = checkStandardConsistency(rows(slipped)).outliers
    expect(outliers).toHaveLength(1)
    expect(outliers[0].label).toBe('Population 4')
    expect(outliers[0].factor).toBeGreaterThan(9)
    // "About 9.98 times" claims a precision the word "about" denies.
    expect(outliers[0].message).toContain('about 10 times')
  })

  it('names a blank population given a certified value', () => {
    const withBlank: [number, number][] = [[210, 1_014_135], ...CLEAN]
    const outliers = checkStandardConsistency(rows(withBlank)).outliers
    expect(outliers).toHaveLength(1)
    expect(outliers[0].label).toBe('Population 1')
  })

  it('leaves a well behaved curve alone across the slopes the tool accepts', () => {
    for (const slope of [0.85, 0.95, 1.05, 1.15]) {
      const pairs = CLEAN.map(([m]) => [m, 10 ** (0.545 + slope * Math.log10(m))] as [number, number])
      expect(checkStandardConsistency(rows(pairs)).outliers).toEqual([])
    }
  })

  it('reports the table rather than the rows once most of them disagree', () => {
    const scattered: [number, number][] = [
      [2_050, 8_300],
      [12_900, 200],
      [39_500, 9_000_000],
      [121_000, 300],
    ]
    const result = checkStandardConsistency(rows(scattered))
    expect(result.wholeTable).toBe(true)
  })

  it('needs three populations before a median means anything', () => {
    const two = checkStandardConsistency(rows(CLEAN.slice(0, 2)))
    expect(two.median).toBeNull()
    expect(two.outliers).toEqual([])
  })

  it('ignores a population the reader has already excluded', () => {
    const standards = rows(CLEAN)
    standards.push({ id: 'x', label: 'Blank', mfi: 210, assigned: 1_014_135, included: false })
    expect(checkStandardConsistency(standards).outliers).toEqual([])
  })

  it('ignores a row that is not filled in yet', () => {
    const standards = rows(CLEAN)
    standards.push({ id: 'y', label: 'Population 5', mfi: 200_000, assigned: null, included: true })
    expect(checkStandardConsistency(standards).outliers).toEqual([])
  })
})

describe('a curve that slopes downward', () => {
  const inverted: BeadStandard[] = [
    { id: 'a', label: 'Population 1', mfi: 2_050, assigned: 512_000, included: true },
    { id: 'b', label: 'Population 2', mfi: 12_900, assigned: 175_000, included: true },
    { id: 'c', label: 'Population 3', mfi: 39_500, assigned: 51_000, included: true },
    { id: 'd', label: 'Population 4', mfi: 121_000, assigned: 8_300, included: true },
  ]

  it('is critical, not a caveat', () => {
    const c = curve(inverted)
    expect(c.fit.slope).toBeLessThan(0)
    const flag = c.flags.find((f) => f.message.includes('slopes downward'))
    expect(flag?.level).toBe('critical')
  })

  it('says what a downward curve does to a result, not only that it is unusual', () => {
    const flag = curve(inverted).flags.find((f) => f.message.includes('slopes downward'))
    expect(flag?.remedy).toContain('inverted')
  })

  it('invalidates every result derived from it', () => {
    const c = curve(inverted)
    const r = quantifyWithCalibration({ id: 's', label: 's', mfi: 8_900, controlMfi: null }, c, DEMO_OPTIONS)
    expect(calibrationValid(r)).toBe(false)
  })

  it('does not also complain that the slope departs from unity', () => {
    // Two flags for one condition is noise. The downward case says everything
    // the distance-from-unity case would, and more.
    const c = curve(inverted)
    expect(c.flags.some((f) => f.message.includes('A well-behaved standard'))).toBe(false)
  })

  it('leaves the ordinary slope caveat in place for a curve that merely leans', () => {
    const leaning: BeadStandard[] = inverted.map((s, i) => ({
      ...s,
      assigned: 10 ** (0.545 + 1.4 * Math.log10(s.mfi as number)) * (i % 2 ? 1.02 : 0.98),
    }))
    const c = curve(leaning)
    expect(c.fit.slope).toBeGreaterThan(1)
    const flag = c.flags.find((f) => f.message.includes('A well-behaved standard'))
    expect(flag?.level).toBe('warning')
  })
})

describe('the order calibration problems are reported in', () => {
  it('leads with what is wrong with the curve, then where', () => {
    // The verdict line shows the first invalidating flag, and a reader wants
    // the consequence before the row number, especially now that the row is
    // also named inline in the table.
    const inverted: BeadStandard[] = [
      { id: 'a', label: 'Population 1', mfi: 2_050, assigned: 512_000, included: true },
      { id: 'b', label: 'Population 2', mfi: 12_900, assigned: 175_000, included: true },
      { id: 'c', label: 'Population 3', mfi: 39_500, assigned: 51_000, included: true },
      { id: 'd', label: 'Population 4', mfi: 121_000, assigned: 8_300, included: true },
    ]
    const critical = curve(inverted).flags.filter((f) => f.level === 'critical')
    expect(critical[0].message).toContain('slopes downward')
    expect(critical.some((f) => f.message.includes('not increasing with MFI'))).toBe(true)
  })
})

describe('a standard that is not a calibration', () => {
  const std = (label: string, mfi: number, assigned: number) => ({
    id: label,
    label,
    mfi,
    assigned,
    included: true,
  })

  // Found in a live pass. Pasting a two column block in which both columns are
  // intensities produced slope 1.00, R squared 1, every residual zero, and a
  // zero width confidence interval, while every reported value was the raw MFI.
  // Nothing downstream could detect it: arithmetically it is a perfect fit.
  it('names a table whose certified values are its own intensities', () => {
    const result = fitStandardCurve([
      std('P1', 2050, 2050),
      std('P2', 12900, 12900),
      std('P3', 39500, 39500),
      std('P4', 121000, 121000),
    ])
    expect('error' in result).toBe(false)
    if ('error' in result) return
    const critical = result.flags.filter((f) => f.level === 'critical')
    expect(critical.length).toBeGreaterThan(0)
    expect(critical[0].message).toMatch(/same number as its intensity/i)
    // And the arithmetic really is perfect, which is the whole problem.
    expect(result.fit.slope).toBeCloseTo(1, 10)
    expect(result.fit.r2).toBeCloseTo(1, 10)
  })

  it('catches constructed numbers that are not literally identical', () => {
    // Certified values computed as exactly 4x the intensity: not the identity
    // case, still collinear, still zero scatter, still not a measurement.
    const result = fitStandardCurve([
      std('P1', 2050, 8200),
      std('P2', 12900, 51600),
      std('P3', 39500, 158000),
      std('P4', 121000, 484000),
    ])
    expect('error' in result).toBe(false)
    if ('error' in result) return
    const critical = result.flags.filter((f) => f.level === 'critical')
    expect(critical.some((f) => /no residual scatter/i.test(f.message))).toBe(true)
  })

  it('leaves a real standard alone', () => {
    const result = fitStandardCurve([
      std('P1', 2050, 8300),
      std('P2', 12900, 51000),
      std('P3', 39500, 175000),
      std('P4', 121000, 512000),
    ])
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.flags.filter((f) => f.level === 'critical')).toEqual([])
    expect(result.fit.residualSE).toBeGreaterThan(1e-9)
  })
})

describe('numbers written into a sentence a reader says out loud', () => {
  const std = (label: string, mfi: number, assigned: number, included = true) => ({
    id: label, label, mfi, assigned, included,
  })

  // Found live. The ratio message read "its certified value is 0.00 times its
  // intensity ... a difference of about 1.2e+3 times". A small ratio collapsed
  // to zero, and an exponent landed in prose meant for a bench.
  it('does not collapse a small ratio to zero, or reach for an exponent', () => {
    const consistency = checkStandardConsistency([
      std('Population 1', 2_050, 8_300),
      std('Population 2', 12_900, 51_000),
      std('Population 3', 39_500, 175_000),
      // Certified value entered as 5: a ratio of 0.0034 against a median near 4.
      std('Population 4', 1_470, 5),
    ])
    const message = consistency.outliers.map((o) => o.message).join(' ')
    expect(message).not.toMatch(/0\.00\b/)
    expect(message).not.toMatch(/e[+-]\d/)
    expect(message).toMatch(/0\.0034/)
  })

  it('writes a large factor with a separator rather than an exponent', () => {
    const consistency = checkStandardConsistency([
      std('Population 1', 2_050, 8_300),
      std('Population 2', 12_900, 51_000),
      std('Population 3', 39_500, 175_000),
      std('Blank given a value', 210, 240_000),
    ])
    const message = consistency.outliers.map((o) => o.message).join(' ')
    expect(message).not.toMatch(/e[+-]\d/)
    expect(message).toMatch(/\d,\d{3}/)
  })

  it('writes the curvature probability with one operator, not two', () => {
    // "quadratic term p = < 0.001" carried both an equals and a less-than.
    const bent = [
      [2_050, 9_800], [6_100, 27_000], [12_900, 54_000],
      [24_000, 96_000], [39_500, 152_000], [121_000, 430_000],
    ].map(([mfi, assigned], i) => std(`Population ${i + 1}`, mfi, assigned))
    const result = fitStandardCurve(bent)
    if ('error' in result) throw new Error(result.error)
    const message = result.flags.map((f) => f.message).join(' ')
    if (/quadratic term/.test(message)) {
      expect(message).not.toMatch(/p = <|p = >/)
      expect(message).toMatch(/p [<=] /)
    }
  })
})

describe('a message that does not name what the caller already names', () => {
  const std = (label: string, mfi: number, assigned: number) => ({
    id: label, label, mfi, assigned, included: true,
  })

  // Found live. The note is rendered with the row name in front of it, and the
  // message opened with the row name too, so a reader saw "Population 1
  // Population 1 does not agree with the other standards".
  it('leaves the row name to whoever renders it', () => {
    const consistency = checkStandardConsistency([
      std('Population 1', 2_050, 8_300),
      std('Population 2', 12_900, 51_000),
      std('Population 3', 39_500, 175_000),
      std('Population 4', 1_470, 5),
    ])
    expect(consistency.outliers.length).toBeGreaterThan(0)
    for (const outlier of consistency.outliers) {
      expect(outlier.message.startsWith(outlier.label)).toBe(false)
      // The label is still carried, so a caller can name the row itself.
      expect(outlier.label).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Section 8 of the independent scientific review of 26 August 2026, in which
// the whole pipeline was reimplemented in Python/SciPy from the four bead pairs
// and compared against the rendered output. Every figure below was verified
// there before it was written here.
//
// These are pinned against the behaviour that was reviewed, deliberately ahead
// of the changes the same review asks for. A fixture written after the change
// it is meant to guard asserts nothing.
// ---------------------------------------------------------------------------

describe('independently reimplemented regression vectors', () => {
  const c = curve(DEMO_BEADS)

  it('recovers the fit from four populations, the blank excluded', () => {
    expect(c.fit.slope).toBeCloseTo(1.017382, 6)
    expect(c.fit.intercept).toBeCloseTo(0.544992, 6)
    expect(c.fit.r2).toBeCloseTo(0.999485, 6)
    expect(c.fit.n).toBe(4)
    expect(c.mfiRange).toEqual([2_050, 121_000])
  })

  it('places each population where the reimplementation placed it', () => {
    const percent = c.residuals.map((r) => Number(r.percent.toFixed(1)))
    expect(percent).toEqual([1.1, -4.4, 5.1, -1.6])
  })

  it.each([
    ['cd19', 36_562, 926, 35_636],
    ['her2', 263_442, 1_201, 262_241],
    ['keratinocyte', 1_636, 1_004, 632],
  ] as const)('resolves %s to gross, background and net', (key, gross, background, net) => {
    const r = quantifySample(DEMO_SAMPLES[key], c, DEMO_OPTIONS)
    expect(Math.round(r.grossAbc as number)).toBe(gross)
    expect(Math.round(r.controlAbc as number)).toBe(background)
    expect(Math.round(r.netAbc as number)).toBe(net)
  })

  // The interval is the one place a reviewer's arithmetic and ours could agree
  // on a density and still disagree on what is claimed about it, so both
  // selectable levels are pinned rather than only the default.
  it.each([
    ['cd19', 0.95, 31_662, 40_110],
    ['her2', 0.95, 229_145, 300_116],
    ['keratinocyte', 0.95, 474, 842],
    ['cd19', 0.99, 27_128, 46_812],
    ['her2', 0.99, 192_111, 357_970],
    ['keratinocyte', 0.99, 325, 1_226],
  ] as const)('brackets %s at %s with the reviewed interval', (key, level, lower, upper) => {
    const r = quantifySample(DEMO_SAMPLES[key], c, { ...DEMO_OPTIONS, confidenceLevel: level })
    expect(Math.round(r.lower as number)).toBe(lower)
    expect(Math.round(r.upper as number)).toBe(upper)
  })
})

describe('guard behaviour the review asked to be pinned as behaviour', () => {
  const c = curve(DEMO_BEADS)
  const sample = (mfi: number, controlMfi: number | null) => ({
    id: 'x',
    label: 'x',
    mfi,
    controlMfi,
  })

  it('reports no density for any sample when the beads cannot capture the antibody', () => {
    // The shipped kit's own capture host, rather than a literal, so the fixture
    // stays about the anti-Mouse beads the review actually loaded.
    const kit = BEAD_KITS.find((k) => k.id === 'qsc-mouse')
    expect(kit?.captureHost).toBe('mouse')
    const mismatch = captureCompatibilityFlags(kit?.captureHost ?? null, 'human')
    expect(mismatch.some((f) => f.level === 'critical')).toBe(true)
    for (const s of Object.values(DEMO_SAMPLES)) {
      const r = quantifyWithCalibration(s, c, DEMO_OPTIONS, mismatch)
      expect(calibrationValid(r)).toBe(false)
    }
  })

  it('refuses to fit two populations', () => {
    const two = fitStandardCurve(DEMO_BEADS.map((b, i) => ({ ...b, included: i === 1 || i === 2 })))
    expect('error' in two).toBe(true)
  })

  it('says below detection, with the transposition hint, when the columns are swapped', () => {
    const r = quantifySample(sample(8_900, 12_000), c, DEMO_OPTIONS)
    expect(r.netAbc).toBeNull()
    expect(r.flags.some((f) => f.remedy?.includes('transposed'))).toBe(true)
  })

  it('refuses to report a sample below the calibrated range', () => {
    const r = quantifySample(sample(420, 260), c, DEMO_OPTIONS)
    expect(r.sampleInRange).toBe(false)
    expect(resultStatus(r.flags)).toBe('do_not_report')
  })

  it('blocks at 90.3% background and reports at 89.8%', () => {
    const blocked = quantifySample(sample(100_000, 90_500), c, DEMO_OPTIONS)
    expect(blocked.backgroundFraction as number).toBeGreaterThan(0.9)
    expect(blocked.netAbc).toBeNull()

    const reported = quantifySample(sample(100_000, 90_000), c, DEMO_OPTIONS)
    expect(reported.backgroundFraction as number).toBeLessThan(0.9)
    expect(reported.netAbc).not.toBeNull()
  })

  it('is byte identical over ten runs of the same input', () => {
    const runs = Array.from({ length: 10 }, () =>
      JSON.stringify(Object.values(DEMO_SAMPLES).map((s) => quantifySample(s, c, DEMO_OPTIONS))),
    )
    expect(new Set(runs).size).toBe(1)
  })
})

describe('the 50 to 90 percent background band', () => {
  const c = curve(DEMO_BEADS)
  const at = (mfi: number, controlMfi: number) =>
    quantifySample({ id: 'x', label: 'x', mfi, controlMfi }, c, DEMO_OPTIONS)

  // Both cases were reported with a warning and a density band beside them
  // until the dominant-background tier landed. The number was never wrong: the
  // card asserted a biological verdict on it, which is what changed.
  it('is critical at 74.6%, and still reports the figure', () => {
    const r = at(20_000, 15_000)
    expect(r.backgroundFraction as number).toBeCloseTo(0.746, 3)
    expect(Math.round(r.netAbc as number)).toBe(21_143)
    expect(resultStatus(r.flags)).toBe('do_not_report')
  })

  it('is critical at 89.8%, one tenth below the detection floor', () => {
    const r = at(100_000, 90_000)
    expect(r.backgroundFraction as number).toBeCloseTo(0.898, 3)
    expect(Math.round(r.netAbc as number)).toBe(43_551)
    expect(resultStatus(r.flags)).toBe('do_not_report')
    // Distinct from the floor above it, which withholds the figure entirely.
    expect(r.netAbc).not.toBeNull()
  })

  it('says why no band is shown, in terms of the two numbers on screen', () => {
    const flag = at(20_000, 15_000).flags.find((f) => f.level === 'critical')
    expect(flag?.message).toContain('74.6% of gross density')
    expect(flag?.message).toContain('smaller than the background subtracted to obtain it')
    expect(flag?.remedy).toContain('No density band is shown')
  })

  // At b/g = 0.5 the net equals the background exactly, which is the whole
  // reason the threshold sits there. Bracketed either side rather than asserted
  // at a value no float lands on.
  it('turns over between 49% and 51% background', () => {
    const below = at(10_000, 4_800)
    const above = at(10_000, 5_200)
    expect(below.backgroundFraction as number).toBeLessThan(0.5)
    expect(above.backgroundFraction as number).toBeGreaterThan(0.5)
    expect(resultStatus(below.flags)).toBe('caution')
    expect(resultStatus(above.flags)).toBe('do_not_report')
  })

  // The out-of-range control already raises a critical naming this same
  // fraction. A second one would repeat the number and add no fact, so the
  // worked example's keratinocyte keeps exactly the flags it was reviewed with.
  it('does not double-report a dominant background the range guard already named', () => {
    const kera = quantifySample(DEMO_SAMPLES.keratinocyte, c, DEMO_OPTIONS)
    expect(kera.backgroundFraction as number).toBeGreaterThan(0.5)
    expect(kera.controlInRange).toBe(false)
    const background = kera.flags.filter((f) => f.message.includes('of gross density'))
    expect(background).toHaveLength(1)
    expect(background[0].message).toContain('lies below the calibrated range')
  })
})

describe('a standard containing a number no instrument produced', () => {
  // On the brightest population, so the intensities still rise with the
  // certified values and the monotonicity check stays quiet. The flag then has
  // to be doing the work on its own rather than riding alongside another
  // critical that would have invalidated the curve anyway.
  const withMfi = (mfi: number): BeadStandard[] =>
    DEMO_BEADS.map((b) => (b.id === 'd4' ? { ...b, mfi } : b))

  // The reported case reconstructed. An impossible intensity whose certified
  // value sits on the fitted line leaves slope and R squared perfect, so every
  // other check on this curve is satisfied and says nothing. It is the case
  // this flag exists for: without it the standard is unremarkable.
  const ON_LINE_ASSIGNED = 10 ** (1.017382 * 300 + 0.544992)

  it('is the only thing that notices a value sitting exactly on the line', () => {
    const c = curve(
      DEMO_BEADS.map((b) =>
        b.id === 'd4' ? { ...b, mfi: 1e300, assigned: ON_LINE_ASSIGNED } : b,
      ),
    )
    expect(c.fit.r2).toBeCloseTo(1, 6)
    expect(c.fit.slope).toBeCloseTo(1.017, 3)
    const critical = c.flags.filter((f) => f.level === 'critical')
    expect(critical).toHaveLength(1)
    expect(critical[0].message).toContain('cytometer reports')
    const r = quantifyWithCalibration(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS)
    expect(calibrationValid(r)).toBe(false)
  })

  it('invalidates the calibration rather than cautioning about the row', () => {
    // The reported case. Three row advisories were correct and none of them
    // could reach the verdict, which read "Calibration valid. Slope 1.00,
    // R squared > 0.9999" over a standard levered by 1e300.
    const c = curve(withMfi(1e300))
    expect(c.flags.some((f) => f.message.includes('cytometer reports'))).toBe(true)
    const r = quantifyWithCalibration(DEMO_SAMPLES.cd19, c, DEMO_OPTIONS)
    expect(calibrationValid(r)).toBe(false)
  })

  it('leads with it, because the verdict shows the first invalidating flag', () => {
    const c = curve(withMfi(1e300))
    expect(c.flags[0].level).toBe('critical')
    expect(c.flags[0].message).toContain('Population 4')
    expect(c.flags[0].message).toContain('intensity')
    expect(c.flags[0].message).toContain('not a measurement')
  })

  it('leads with it even where the standard is wrong in other ways too', () => {
    // A stray paste into a middle population breaks the ordering as well. The
    // impossible value is still the first thing said, because it is the one
    // fact that explains the rest.
    const c = curve(DEMO_BEADS.map((b) => (b.id === 'd2' ? { ...b, mfi: 1e300 } : b)))
    expect(c.flags[0].level).toBe('critical')
    expect(c.flags[0].message).toContain('Population 2')
  })

  it('catches a certified value no bead could carry', () => {
    const c = curve(DEMO_BEADS.map((b) => (b.id === 'd4' ? { ...b, assigned: 1e12 } : b)))
    expect(c.flags[0].level).toBe('critical')
    expect(c.flags[0].message).toContain('certified value')
  })

  it('says it once, naming every population it is about', () => {
    const c = curve(
      DEMO_BEADS.map((b) => (b.id === 'd3' || b.id === 'd4' ? { ...b, mfi: 1e300 } : b)),
    )
    const mine = c.flags.filter((f) => f.message.includes('cytometer reports'))
    expect(mine).toHaveLength(1)
    expect(mine[0].message).toContain('Population 3')
    expect(mine[0].message).toContain('Population 4')
    expect(mine[0].message).toContain('hold values')
  })

  // The tier below is untouched. A standard that is merely implausible still
  // fits, still reports, and still carries its caveat.
  //
  // Every population scaled rather than one moved: shifting a single reading
  // that far wrecks the fit, so a curve built that way is refused for its R
  // squared and proves nothing about this threshold. A scale factor changes the
  // intercept and leaves the slope, the scatter and the fit untouched, which
  // leaves the advisory tier as the only thing that has anything to say.
  it('leaves an implausible but possible standard fitting', () => {
    const c = curve(DEMO_BEADS.map((b) => ({ ...b, mfi: b.mfi === null ? null : b.mfi * 400 })))
    expect(c.mfiRange[1]).toBeGreaterThan(1e7)
    expect(c.mfiRange[1]).toBeLessThan(MFI_IMPOSSIBLE)
    expect(c.flags.some((f) => f.level === 'critical')).toBe(false)
    const r = quantifyWithCalibration(
      { id: 'x', label: 'x', mfi: 8_900 * 400, controlMfi: 240 * 400 },
      c,
      DEMO_OPTIONS,
    )
    expect(calibrationValid(r)).toBe(true)
  })

  it('ignores a population the reader has already unticked', () => {
    const c = curve(
      DEMO_BEADS.map((b) => (b.id === 'd4' ? { ...b, mfi: 1e300, included: false } : b)),
    )
    expect(c.flags.some((f) => f.message.includes('cytometer reports'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Nothing but the fit reaches a reported number.
//
// This file, and the calibration core beside it, carry a dozen named
// thresholds: what counts as a material background, where a slope stops being
// near unity, which R squared is acceptable, what magnitude is impossible.
// Every one of them decides what the tool SAYS. None of them may touch what it
// COMPUTES, or the reported density would be a function of this project's
// opinions rather than of the reader's data.
//
// Asserted by recomputing every reported quantity from the fitted parameters
// alone, in the open, and requiring bit equality. Any threshold that leaked
// into the arithmetic would break it. The reference expressions below are the
// whole method: a referee can read them without reading the implementation.
// ---------------------------------------------------------------------------
describe('the reported numbers are a function of the fit and nothing else', () => {
  const c = curve(DEMO_BEADS)
  const { slope, intercept, residualSE, n, meanX, sxx, df } = c.fit

  /** The calibration, written out. */
  const abcAt = (mfi: number) => 10 ** (slope * Math.log10(mfi) + intercept)

  it.each(['cd19', 'her2', 'keratinocyte'] as const)(
    'reproduces every quantity reported for %s',
    (key) => {
      const s = DEMO_SAMPLES[key]
      const r = quantifySample(s, c, DEMO_OPTIONS)

      const gross = abcAt(s.mfi as number)
      const background = abcAt(s.controlMfi as number)
      const net = gross - background

      expect(r.grossAbc).toBe(gross)
      expect(r.controlAbc).toBe(background)
      expect(r.netAbc).toBe(net)
      expect(r.backgroundFraction).toBe(background / gross)

      // The interval is the mean-response half-width at the stained reading,
      // applied as a multiplicative factor because the fit is in log space.
      const x0 = Math.log10(s.mfi as number)
      const se = residualSE * Math.sqrt(1 / n + (x0 - meanX) ** 2 / sxx)
      const factor = 10 ** (tCritical(DEMO_OPTIONS.confidenceLevel, df) * se)
      expect(r.lower).toBe(net / factor)
      expect(r.upper).toBe(net * factor)

      // The only hard-coded multiplier that reaches a reported figure, and the
      // interface labels it as an assumption rather than a measurement.
      expect(r.sitesLow).toBe(net)
      expect(r.sitesHigh).toBe(net * 2)
    },
  )

  it('reproduces a monovalent result, where that multiplier is one', () => {
    const r = quantifySample(DEMO_SAMPLES.cd19, c, { ...DEMO_OPTIONS, valency: 'monovalent' })
    expect(r.sitesHigh).toBe(r.netAbc)
  })

  // Across magnitudes, not only across the worked example. Every threshold in
  // this codebase governs a range, so an invariant tested only where the demo
  // happens to sit would miss a clamp at either end: a plausibility ceiling
  // pinning large results, a floor lifting small ones, a range guard rounding
  // an extrapolated value back inside the beads.
  it.each([
    ['far below the lowest bead', 300, 210],
    ['inside the calibrated range', 20_000, 900],
    ['above the highest bead', 400_000, 1_000],
    ['past the plausibility ceiling', 6_500_000, 1_200],
  ] as const)('holds %s', (_where, mfi, controlMfi) => {
    const r = quantifySample({ id: 'x', label: 'x', mfi, controlMfi }, c, DEMO_OPTIONS)
    const net = abcAt(mfi) - abcAt(controlMfi)
    expect(r.grossAbc).toBe(abcAt(mfi))
    expect(r.controlAbc).toBe(abcAt(controlMfi))
    expect(r.netAbc).toBe(net)
    expect(r.sitesHigh).toBe(net * 2)
    const x0 = Math.log10(mfi)
    const se = residualSE * Math.sqrt(1 / n + (x0 - meanX) ** 2 / sxx)
    const factor = 10 ** (tCritical(DEMO_OPTIONS.confidenceLevel, df) * se)
    expect(r.lower).toBe(net / factor)
    expect(r.upper).toBe(net * factor)
  })

  it('holds for a result smaller than any threshold in the file', () => {
    // Below the assigned-value floor, below the lowest bead, below the density
    // band boundaries. Nothing here may lift it to meet any of them.
    const r = quantifySample({ id: 'x', label: 'x', mfi: 20, controlMfi: null }, c, DEMO_OPTIONS)
    expect(r.netAbc).toBe(abcAt(20))
    expect(r.netAbc as number).toBeLessThan(100)
    expect(r.sitesLow).toBe(abcAt(20))
    expect(r.controlAbc).toBeNull()
  })

  it('divides by the F/P ratio the reader supplied, and by nothing else', () => {
    const fpRatio = 3.4
    const pe = quantifySample(DEMO_SAMPLES.cd19, c, {
      ...DEMO_OPTIONS,
      standardKind: 'pe-molecules',
      fpRatio,
    })
    expect(pe.grossAbc).toBe(abcAt(DEMO_SAMPLES.cd19.mfi as number) / fpRatio)
  })

  it.each([0.9, 0.95, 0.99] as const)('holds at every confidence level offered (%s)', (level) => {
    const r = quantifySample(DEMO_SAMPLES.her2, c, { ...DEMO_OPTIONS, confidenceLevel: level })
    const x0 = Math.log10(DEMO_SAMPLES.her2.mfi as number)
    const se = residualSE * Math.sqrt(1 / n + (x0 - meanX) ** 2 / sxx)
    const factor = 10 ** (tCritical(level, df) * se)
    expect(r.lower).toBe((r.netAbc as number) / factor)
    expect(r.upper).toBe((r.netAbc as number) * factor)
  })
})

describe('a magnitude at the bottom of the scale', () => {
  // F4 guarded the top and left the mirror case open. An intensity of 1e-250
  // produced no magnitude flag of any kind: the cell was styled as filled, no
  // row note mentioned magnitude, and the headline read valid. It was caught
  // only incidentally, when the ratio consistency test happened to notice the
  // row disagreed with the others.
  const withMfi = (mfi: number) => DEMO_BEADS.map((b) => (b.id === 'd1' ? { ...b, mfi } : b))
  const criticals = (beads: BeadStandard[]) => {
    const r = fitStandardCurve(beads)
    return 'error' in r ? [] : r.flags.filter((f) => f.level === 'critical')
  }

  it.each([1e-250, 1e-12, 0.0001])('refuses a standard containing %s', (mfi) => {
    expect(criticals(withMfi(mfi)).length).toBeGreaterThan(0)
  })

  it('reaches the headline, which is what was wrong', () => {
    const r = fitStandardCurve(withMfi(1e-250))
    if ('error' in r) throw new Error(r.error)
    const q = quantifyWithCalibration(DEMO_SAMPLES.cd19, r, DEMO_OPTIONS)
    expect(calibrationValid(q)).toBe(false)
  })

  // The span guard is the one that does the work, because a log-log fit makes
  // the intensity unit arbitrary: the same 0.0001 is a typo on a channel scale
  // and a legitimate reading on a normalised one. What cannot be legitimate is
  // one standard covering nine decades.
  it('names the span rather than the value, where the value alone is ambiguous', () => {
    const message = criticals(withMfi(0.0001))[0].message
    expect(message).toContain('decades of intensity')
    expect(message).toContain('Population 1')
  })

  it('is not fooled by a change of unit, since only the span matters', () => {
    // Every intensity divided by a million: a legitimate rescaling, and the
    // same standard. An absolute floor would refuse this; the span does not.
    const rescaled = DEMO_BEADS.map((b) => ({ ...b, mfi: b.mfi === null ? null : b.mfi / 1e6 }))
    expect(criticals(rescaled)).toHaveLength(0)
  })

  it('leaves the worked example alone', () => {
    expect(criticals(DEMO_BEADS)).toHaveLength(0)
  })

  it('does not refuse a dim population for being dim', () => {
    // Moved to 210 with its certified value scaled to match, so the row is
    // still consistent with the others and only its magnitude has changed.
    // Asserted against these guards by name: a dim population will trip other
    // checks on other data, and this is about not tripping these.
    const dim = DEMO_BEADS.map((b) =>
      b.id === 'd1' ? { ...b, mfi: 210, assigned: 780 } : b,
    )
    const messages = criticals(dim).map((f) => f.message)
    expect(messages.some((m) => m.includes('decades of intensity'))).toBe(false)
    expect(messages.some((m) => m.includes('not an intensity'))).toBe(false)
  })

  it('refuses a certified value below anything a certificate carries', () => {
    const beads = DEMO_BEADS.map((b) => (b.id === 'd1' ? { ...b, assigned: 1e-40 } : b))
    expect(criticals(beads).some((f) => f.message.includes('certified value'))).toBe(true)
  })
})

describe('no row note is longer than a reader will read', () => {
  // An intensity of 1e-250 made the ratio message carry the same quantity twice
  // as grouped integers: roughly 660 characters of digits and commas in one
  // sentence. The small side of the ratio already reached the shared threshold
  // and rendered as 8.3e-297; the large side did not.
  const std = (label: string, mfi: number, assigned: number) => ({
    id: label, label, mfi, assigned, included: true,
  })

  const notes = (beads: Parameters<typeof checkStandardConsistency>[0]) =>
    checkStandardConsistency(beads).outliers.map((o) => `${o.message} ${o.remedy ?? ''}`)

  it('keeps the ratio message readable when a row is out by 250 decades', () => {
    const messages = notes([
      std('Population 1', 1e-250, 8_300),
      std('Population 2', 12_900, 51_000),
      std('Population 3', 39_500, 175_000),
      std('Population 4', 121_000, 512_000),
    ])
    expect(messages.length).toBeGreaterThan(0)
    for (const m of messages) {
      expect(m.length).toBeLessThan(400)
      // No run of digits and separators long enough to be a wall of numerals.
      expect(m).not.toMatch(/[\d,]{20}/)
    }
  })

  // The reason the old behaviour survived: every magnitude anyone had tried
  // was one a separator suits. This is the ceiling on any of them.
  it('holds for every row note the calibration can produce', () => {
    for (const extreme of [1e-250, 1e-12, 1e12, 1e250]) {
      for (const m of notes([
        std('Population 1', 2_050, 8_300),
        std('Population 2', 12_900, 51_000),
        std('Population 3', 39_500, 175_000),
        std('Out of place', extreme, 512_000),
      ])) {
        expect(m.length).toBeLessThan(400)
      }
    }
  })
})

describe('the flags that name an offending value can be acted on', () => {
  // The refusal messages printed the offending intensity as 0.00, so the one
  // that said the value lay outside anything a cytometer reports contradicted
  // itself, and 0.0001 and 1e-250 read identically. A message that names a
  // value the reader cannot find in their table does half its job.
  const withMfi = (mfi: number) => DEMO_BEADS.map((b) => (b.id === 'd1' ? { ...b, mfi } : b))
  const messages = (mfi: number) => {
    const r = fitStandardCurve(withMfi(mfi))
    return 'error' in r ? [] : r.flags.map((f) => f.message)
  }

  it.each([
    [1e-250, '1e-250'],
    [1e-12, '1e-12'],
    [0.0001, '0.0001'],
  ])('prints %s as itself rather than as zero', (mfi, rendered) => {
    const said = messages(mfi).join(' ')
    expect(said).toContain(rendered)
    expect(said).not.toMatch(/intensity 0\.00\b/)
    expect(said).not.toMatch(/at 0\.00\b/)
  })

  it('distinguishes two values that used to render the same', () => {
    expect(messages(1e-250).join(' ')).not.toBe(messages(1e-12).join(' '))
  })

  it('does not say a value is beyond a range when it is below it', () => {
    // "beyond anything a cytometer reports" reads as a claim about the top end.
    const said = messages(1e-250).join(' ')
    expect(said).not.toContain('beyond anything a cytometer reports')
    expect(said).toContain('outside anything a cytometer reports')
  })
})

// ---------------------------------------------------------------------------
// A1: an endorsed calibration containing an intensity no instrument produces.
//
// No fixture in this file scaled both coordinates of one population together,
// which is exactly why nothing caught it. Scaling a point's intensity and its
// certified value by the same factor moves it along a line of slope one, and
// the calibration's own slope is 1.017, so the point lands almost on the line
// it is about to distort. R squared stays above 0.9999, the ratio test sees the
// two errors cancel, and the span stays under six decades.
//
// The property this fixture family assumes, stated so it is auditable: both
// columns move together, which is what a pasted decimal slip does and what
// every other fixture here avoids by moving one column only.
// ---------------------------------------------------------------------------
describe('one population out of range while the rest are inside it', () => {
  const std = (label: string, mfi: number, assigned: number) => ({
    id: label, label, mfi, assigned, included: true,
  })
  const WORKED = [
    std('Population 1', 2_050, 8_300),
    std('Population 2', 12_900, 51_000),
    std('Population 3', 39_500, 175_000),
    std('Population 4', 121_000, 512_000),
  ]
  /** The reported case: one row's two columns scaled by the same factor. */
  const scaledRow = (factor: number) => [
    ...WORKED.slice(0, 3),
    std('Population 4', 121_000 * factor, 512_000 * factor),
  ]
  const flagsOf = (beads: ReturnType<typeof scaledRow>) => {
    const r = fitStandardCurve(beads)
    if ('error' in r) throw new Error(r.error)
    return r
  }
  const verdict = (beads: ReturnType<typeof scaledRow>) => {
    const f = flagsOf(beads).flags
    if (f.some((x) => x.level === 'critical')) return 'not usable'
    return f.some((x) => x.level === 'warning') ? 'caveat' : 'valid'
  }

  it('is endorsed by every other check, which is why this one is needed', () => {
    // Asserted so the premise cannot rot: if some other guard starts catching
    // this, the reason for this one has changed and someone should know.
    const r = flagsOf(scaledRow(1_000))
    expect(r.fit.r2).toBeGreaterThan(0.9999)
    expect(Math.abs(r.fit.slope - 1)).toBeLessThan(0.15)
    expect(Math.max(...r.logMfi) - Math.min(...r.logMfi)).toBeLessThan(6)
  })

  it.each([100, 1_000])('caveats the headline for a x%s slip in both columns', (factor) => {
    expect(verdict(scaledRow(factor))).toBe('caveat')
    const said = flagsOf(scaledRow(factor)).flags.map((f) => f.message).join(' ')
    expect(said).toContain('Population 4')
    expect(said).toContain('outside what a cytometer reports')
  })

  it('does not withhold the figure, which is right to a fraction of a percent', () => {
    // The auditor measured +0.2% at x1000, inside the reported interval. A
    // refusal would overstate what is wrong.
    expect(verdict(scaledRow(1_000))).not.toBe('not usable')
  })

  it('leaves the worked example valid', () => {
    expect(verdict(WORKED)).toBe('valid')
  })

  // The invariance the fix had to preserve. A reader working in different units
  // moves every population together, so every row is unusual at once and the
  // count of odd rows is zero or all, never some.
  it('still endorses a standard with every intensity divided by a million', () => {
    const rescaled = WORKED.map((s) => ({ ...s, mfi: s.mfi / 1e6 }))
    expect(verdict(rescaled)).toBe('valid')
  })

  // The designs that broke the two diagnostics tried first. A top-heavy bead
  // set scores higher than the typo on both largest-gap-to-median and maximum
  // leverage, so either would have refused a real kit.
  it('leaves a legitimately top-heavy bead set alone', () => {
    expect(verdict([
      std('P1', 2_000, 7_000), std('P2', 4_000, 14_500),
      std('P3', 8_000, 29_000), std('P4', 200_000, 760_000),
    ])).toBe('valid')
  })
})
