import { describe, it, expect } from 'vitest'
import { predict, type FitParams } from './doseresponse'
import {
  DEFAULT_CYTOTOX_OPTIONS,
  analyseSeries,
  type CytotoxOptions,
  type Series,
} from './cytotox'

function seriesFrom(doses: number[], truth: FitParams, label = 'construct'): Series {
  return {
    id: 's',
    label,
    included: true,
    points: doses.map((dose, i) => ({
      id: `p${i}`,
      dose,
      response: predict(truth, Math.log10(dose)),
    })),
  }
}

const FULL = [0.05, 0.1, 0.3, 1, 3, 10, 30, 100]
const KILLING: FitParams = { bottom: 2, top: 95, logEC50: Math.log10(4), hill: 1.3 }
const opts: CytotoxOptions = DEFAULT_CYTOTOX_OPTIONS

describe('analyseSeries', () => {
  it('reports a clean fit with no flags', () => {
    const a = analyseSeries(seriesFrom(FULL, KILLING), opts)
    expect(a.error).toBeNull()
    expect(a.fit?.ec50).toBeCloseTo(4, 4)
    expect(a.potencyLabel).toBe('EC50')
    expect(a.flags).toHaveLength(0)
  })

  it('names a falling curve IC50', () => {
    const inhibition: FitParams = { bottom: 90, top: 5, logEC50: Math.log10(6), hill: 1.4 }
    const a = analyseSeries(seriesFrom(FULL, inhibition), opts)
    expect(a.potencyLabel).toBe('IC50')
    expect(a.fit?.ec50).toBeCloseTo(6, 4)
  })

  it('flags a potency extrapolated beyond the tested doses', () => {
    // Doses stop well below the transition, so the EC50 is off the end.
    const a = analyseSeries(seriesFrom([0.001, 0.003, 0.01, 0.03, 0.1, 0.3], KILLING), opts)
    const messages = a.flags.map((f) => f.message).join(' ')
    expect(messages).toMatch(/outside the tested dose range/)
    expect(a.flags.some((f) => f.level === 'critical')).toBe(true)
  })

  it('flags an upper plateau the data never reaches', () => {
    const a = analyseSeries(seriesFrom([0.01, 0.03, 0.1, 0.3, 1, 2], KILLING), opts)
    expect(a.flags.some((f) => /upper plateau/.test(f.message))).toBe(true)
  })

  it('every flag carries a remedy', () => {
    const a = analyseSeries(seriesFrom([0.001, 0.003, 0.01, 0.03, 0.1, 0.3], KILLING), opts)
    expect(a.flags.length).toBeGreaterThan(0)
    for (const flag of a.flags) {
      expect(flag.remedy, `flag without remedy: ${flag.message}`).toBeTruthy()
    }
  })

  it('flags implausible plateaus only when the response is a percentage', () => {
    const wild: FitParams = { bottom: -40, top: 180, logEC50: 0, hill: 1 }
    const asPercent = analyseSeries(seriesFrom(FULL, wild), opts)
    expect(asPercent.flags.some((f) => /plausible range for a percentage/.test(f.message))).toBe(true)

    const asCounts = analyseSeries(seriesFrom(FULL, wild), { ...opts, responseIsPercent: false })
    expect(asCounts.flags.some((f) => /plausible range for a percentage/.test(f.message))).toBe(false)
  })

  it('warns when four parameters rest on few points', () => {
    const a = analyseSeries(seriesFrom([0.1, 1, 4, 20, 100], KILLING), opts)
    expect(a.flags.some((f) => /Four parameters are being estimated/.test(f.message))).toBe(true)
  })

  it('reports an error rather than a fit when the data cannot identify four parameters', () => {
    const sparse: Series = {
      id: 's', label: 'x', included: true,
      points: [1, 10].map((dose, i) => ({ id: `p${i}`, dose, response: dose })),
    }
    const a = analyseSeries(sparse, opts)
    expect(a.fit).toBeNull()
    expect(a.error).toMatch(/at least 5 points/)
  })

  it('ignores non-positive and blank doses', () => {
    const s = seriesFrom(FULL, KILLING)
    s.points.push({ id: 'zero', dose: 0, response: 50 })
    s.points.push({ id: 'blank', dose: null, response: null })
    const a = analyseSeries(s, opts)
    expect(a.fit?.n).toBe(FULL.length)
    expect(a.doseRange).toEqual([0.05, 100])
  })

  it('is deterministic across repeated analysis', () => {
    const s = seriesFrom(FULL, KILLING)
    const runs = Array.from({ length: 5 }, () => JSON.stringify(analyseSeries(s, opts)))
    expect(new Set(runs).size).toBe(1)
  })
})
