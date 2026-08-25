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
