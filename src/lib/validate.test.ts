import { describe, it, expect } from 'vitest'
import {
  ASSIGNED_IMPOSSIBLE,
  MFI_IMPOSSIBLE,
  MFI_IMPOSSIBLE_LOW,
  checkAssigned,
  checkControl,
  checkMfi,
} from './validate'

describe('checkMfi', () => {
  it('says nothing about an ordinary bead intensity', () => {
    expect(checkMfi(2_050)).toBeNull()
    expect(checkMfi(121_000)).toBeNull()
  })

  it('says nothing about an empty cell, which is not yet an error', () => {
    expect(checkMfi(null)).toBeNull()
  })

  it('refuses zero and negative intensities, which are not fluorescence', () => {
    expect(checkMfi(0)?.severity).toBe('error')
    expect(checkMfi(-410)?.severity).toBe('error')
    expect(checkMfi(-410)?.message).toMatch(/greater than zero/i)
  })

  // A biexponential axis puts genuinely negative events below zero, but an MFI
  // is a summary statistic of a stained population and cannot be logged.
  it('names the exclusion rather than leaving the row to disappear', () => {
    expect(checkMfi(0)?.message).toMatch(/excluded from the fit/i)
  })

  it('warns about an intensity beyond any cytometer scale, without refusing it', () => {
    const issue = checkMfi(5.1e7)
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toMatch(/stray digit/i)
  })

  it('leaves the top of a real scale alone', () => {
    // 2^23 is the ceiling of a 24-bit digitiser, and is entered legitimately.
    expect(checkMfi(8_388_608)).toBeNull()
  })
})

describe('checkAssigned', () => {
  it('says nothing about a certified value from a real kit', () => {
    expect(checkAssigned(51_000, { included: true })).toBeNull()
    expect(checkAssigned(512_000, { included: true })).toBeNull()
  })

  it('asks for a certified value on a population that is in the fit', () => {
    const issue = checkAssigned(null, { included: true })
    expect(issue?.severity).toBe('error')
    expect(issue?.message).toMatch(/untick/i)
  })

  it('refuses zero and negative certified values', () => {
    expect(checkAssigned(0, { included: true })?.severity).toBe('error')
    expect(checkAssigned(-8_300, { included: true })?.severity).toBe('error')
  })

  // The check is on inclusion, never on the label. A rule keyed to a row named
  // "Blank" breaks the moment a reader renames it, and misfires on anyone who
  // names a real population that.
  it('asks nothing of a population left out of the fit', () => {
    expect(checkAssigned(null, { included: false })).toBeNull()
    expect(checkAssigned(0, { included: false })).toBeNull()
  })

  it('warns about a value an order of magnitude outside any kit, without refusing it', () => {
    expect(checkAssigned(8, { included: true })?.severity).toBe('warning')
    expect(checkAssigned(5.1e7, { included: true })?.severity).toBe('warning')
    expect(checkAssigned(8, { included: true })?.message).toMatch(/certificate of analysis/i)
  })
})

describe('checkControl', () => {
  it('says nothing when the control is dimmer, which is the ordinary case', () => {
    expect(checkControl(310, 12_900)).toBeNull()
  })

  it('says nothing about an equal reading, which is below detection rather than swapped', () => {
    expect(checkControl(12_900, 12_900)).toBeNull()
  })

  it('warns when the control is brighter than the sample it belongs to', () => {
    const issue = checkControl(12_900, 310)
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toMatch(/other way round/i)
  })

  // It is a real reading as well as a likely transposition, so it is reported
  // and the result is still computed.
  it('says the genuine reading is reported rather than discarded', () => {
    expect(checkControl(12_900, 310)?.message).toMatch(/below detection/i)
  })

  it('needs both halves before it can compare them', () => {
    expect(checkControl(310, null)).toBeNull()
    expect(checkControl(null, 12_900)).toBeNull()
    expect(checkControl(0, 12_900)).toBeNull()
  })
})

describe('a magnitude that is impossible rather than implausible', () => {
  // The tier above the advisory one, and deliberately far above it. An earlier
  // review wanted the 1e7 ceiling called impossible and was refused, because
  // 1e7 is a number a scale could carry. These are numbers no scale can.
  it('marks an intensity past 32 bit full scale as an error, not a caution', () => {
    expect(checkMfi(MFI_IMPOSSIBLE)?.severity).toBe('error')
    expect(checkMfi(1e300)?.severity).toBe('error')
  })

  it('leaves the implausible tier where it was', () => {
    expect(checkMfi(5.1e7)?.severity).toBe('warning')
    expect(checkMfi(MFI_IMPOSSIBLE - 1)?.severity).toBe('warning')
  })

  it('says why, in terms a reader can act on rather than a bound', () => {
    expect(checkMfi(1e300)?.message).toContain('pasted exponent')
    // No exponent in the sentence: the tool writes numbers the way a reader
    // says them, and there is no way to say this one.
    expect(checkMfi(1e300)?.message).not.toMatch(/e\+\d/)
  })

  it('marks a certified value past any bead capacity as an error', () => {
    expect(checkAssigned(ASSIGNED_IMPOSSIBLE, { included: true })?.severity).toBe('error')
    expect(checkAssigned(1e300, { included: true })?.severity).toBe('error')
    expect(checkAssigned(5.1e7, { included: true })?.severity).toBe('warning')
  })

  it('still says nothing about a population left out of the fit', () => {
    expect(checkAssigned(1e300, { included: false })).toBeNull()
  })
})

describe('the low end of the magnitude scale', () => {
  it('marks an intensity below any digitiser least count as an error', () => {
    expect(checkMfi(1e-250)?.severity).toBe('error')
    expect(checkMfi(MFI_IMPOSSIBLE_LOW / 2)?.severity).toBe('error')
  })

  it('cautions below one channel without refusing it', () => {
    // Legitimate for rescaled or derived values, so a caution. The number the
    // reader typed is still used.
    expect(checkMfi(0.0001)?.severity).toBe('warning')
    expect(checkMfi(0.5)?.severity).toBe('warning')
  })

  it('leaves an ordinary dim reading alone', () => {
    expect(checkMfi(1)).toBeNull()
    expect(checkMfi(210)).toBeNull()
  })

  it('marks a certified value below any certificate as an error', () => {
    expect(checkAssigned(1e-40, { included: true })?.severity).toBe('error')
  })
})
