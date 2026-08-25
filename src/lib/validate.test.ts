import { describe, it, expect } from 'vitest'
import { checkAssigned, checkControl, checkMfi } from './validate'

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
