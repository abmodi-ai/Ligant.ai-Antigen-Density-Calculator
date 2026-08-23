import { describe, it, expect } from 'vitest'
import { fitDoseResponse, predict, type DosePoint, type DoseResponseFit, type FitParams } from './doseresponse'

function fitOf(data: DosePoint[], level = 0.95): DoseResponseFit {
  const r = fitDoseResponse(data, level)
  if ('error' in r) throw new Error(r.error)
  return r
}

/** Generate exact points from known parameters, on a log-spaced dose series. */
function synth(truth: FitParams, doses: number[]): DosePoint[] {
  return doses.map((dose) => ({ dose, response: predict(truth, Math.log10(dose)) }))
}

const DOSES = [0.05, 0.1, 0.3, 1, 3, 10, 30, 100]

describe('fitDoseResponse', () => {
  it('recovers known parameters from noiseless data', () => {
    const truth: FitParams = { bottom: 2, top: 95, logEC50: Math.log10(4), hill: 1.3 }
    const fit = fitOf(synth(truth, DOSES))

    expect(fit.params.bottom).toBeCloseTo(truth.bottom, 5)
    expect(fit.params.top).toBeCloseTo(truth.top, 5)
    expect(fit.params.hill).toBeCloseTo(truth.hill, 5)
    expect(fit.ec50).toBeCloseTo(4, 5)
    expect(fit.r2).toBeCloseTo(1, 8)
    expect(fit.converged).toBe(true)
  })

  it('recovers a steep curve', () => {
    const truth: FitParams = { bottom: 0, top: 100, logEC50: Math.log10(12), hill: 3.2 }
    const fit = fitOf(synth(truth, DOSES))
    expect(fit.ec50).toBeCloseTo(12, 4)
    expect(fit.params.hill).toBeCloseTo(3.2, 4)
  })

  it('recovers a shallow curve', () => {
    const truth: FitParams = { bottom: 10, top: 80, logEC50: Math.log10(2), hill: 0.6 }
    const fit = fitOf(synth(truth, DOSES))
    expect(fit.ec50).toBeCloseTo(2, 4)
    expect(fit.params.hill).toBeCloseTo(0.6, 4)
  })

  it('handles a descending curve', () => {
    const truth: FitParams = { bottom: 90, top: 5, logEC50: Math.log10(7), hill: 1.5 }
    const fit = fitOf(synth(truth, DOSES))
    expect(fit.ec50).toBeCloseTo(7, 4)
    // Orientation is carried by bottom/top, which the fit should reproduce.
    expect(fit.params.bottom).toBeCloseTo(90, 4)
    expect(fit.params.top).toBeCloseTo(5, 4)
  })

  it('recovers parameters approximately under noise', () => {
    const truth: FitParams = { bottom: 3, top: 92, logEC50: Math.log10(5), hill: 1.1 }
    // Fixed offsets, not random draws, so the test is deterministic.
    const jitter = [1.4, -2.1, 0.8, -1.6, 2.3, -0.9, 1.1, -1.8]
    const data = synth(truth, DOSES).map((p, i) => ({ ...p, response: p.response + jitter[i] }))
    const fit = fitOf(data)

    expect(fit.ec50).toBeGreaterThan(3.5)
    expect(fit.ec50).toBeLessThan(7)
    expect(fit.r2).toBeGreaterThan(0.99)
    expect(fit.ec50Lower).toBeLessThan(fit.ec50)
    expect(fit.ec50Upper).toBeGreaterThan(fit.ec50)
  })

  it('reports an EC50 interval that is symmetric in log space', () => {
    const truth: FitParams = { bottom: 0, top: 100, logEC50: Math.log10(9), hill: 1.2 }
    const jitter = [0.9, -1.3, 1.7, -0.6, 1.2, -1.9, 0.4, -1.1]
    const data = synth(truth, DOSES).map((p, i) => ({ ...p, response: p.response + jitter[i] }))
    const fit = fitOf(data)

    const lowRatio = Math.log10(fit.ec50 / fit.ec50Lower)
    const highRatio = Math.log10(fit.ec50Upper / fit.ec50)
    expect(lowRatio).toBeCloseTo(highRatio, 8)
  })

  it('widens the interval at a higher confidence level', () => {
    const truth: FitParams = { bottom: 0, top: 100, logEC50: 0.5, hill: 1 }
    const jitter = [1.1, -1.4, 0.7, -1.2, 1.5, -0.8, 1.0, -1.3]
    const data = synth(truth, DOSES).map((p, i) => ({ ...p, response: p.response + jitter[i] }))

    const at95 = fitOf(data, 0.95)
    const at99 = fitOf(data, 0.99)
    expect(at99.ec50Upper - at99.ec50Lower).toBeGreaterThan(at95.ec50Upper - at95.ec50Lower)
  })

  it('rejects data that cannot identify four parameters', () => {
    expect(fitDoseResponse([{ dose: 1, response: 1 }])).toHaveProperty('error')
    const tooFewLevels = [1, 1, 1, 10, 10, 10].map((dose, i) => ({ dose, response: i }))
    expect(fitDoseResponse(tooFewLevels)).toHaveProperty('error')
  })

  it('ignores non-positive and non-finite doses', () => {
    const truth: FitParams = { bottom: 0, top: 100, logEC50: 0, hill: 1 }
    const data: DosePoint[] = [
      ...synth(truth, DOSES),
      { dose: 0, response: 0 },
      { dose: -5, response: 10 },
      { dose: NaN, response: 3 },
    ]
    const fit = fitOf(data)
    expect(fit.n).toBe(DOSES.length)
    expect(fit.ec50).toBeCloseTo(1, 5)
  })

  it('is deterministic across repeated fits', () => {
    const truth: FitParams = { bottom: 4, top: 88, logEC50: 0.7, hill: 1.4 }
    const jitter = [1.2, -0.7, 1.9, -1.5, 0.6, -1.1, 1.3, -0.4]
    const data = synth(truth, DOSES).map((p, i) => ({ ...p, response: p.response + jitter[i] }))
    const runs = Array.from({ length: 5 }, () => JSON.stringify(fitOf(data)))
    expect(new Set(runs).size).toBe(1)
  })

  it('predict is the inverse of the fitted parameters at the EC50', () => {
    const truth: FitParams = { bottom: 10, top: 90, logEC50: Math.log10(6), hill: 2 }
    const fit = fitOf(synth(truth, DOSES))
    // At the EC50 the response sits midway between bottom and top.
    expect(predict(fit.params, fit.params.logEC50)).toBeCloseTo(50, 4)
  })
})
