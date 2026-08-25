import { describe, it, expect } from 'vitest'
import { formatR2 } from './format'

describe('formatR2', () => {
  // Fixed width, because a live pass found the same quantity rendered as
  // 0.999485 in one place and 1 in another, on one screen. A reader comparing
  // two curves should not have to count digits to know which fits better.
  it('is always four decimal places', () => {
    expect(formatR2(0.5)).toBe('0.5000')
    expect(formatR2(0.87231)).toBe('0.8723')
    expect(formatR2(0.9995)).toBe('0.9995')
  })

  it('never rounds a good fit up to a perfect one', () => {
    // 0.999956 to four places is 1.0000, which asserts something the data does
    // not support. It is reported as a bound instead.
    expect(formatR2(0.999956)).toBe('> 0.9999')
    expect(formatR2(0.9999999)).toBe('> 0.9999')
  })

  it('prints an exact fit as exact, since a zero residual really does give one', () => {
    // The tool says separately, and critically, that a standard with no
    // residual scatter at all is not a measurement.
    expect(formatR2(1)).toBe('1.0000')
  })

  it('says so rather than printing nonsense for a value that is not a number', () => {
    expect(formatR2(NaN)).toBe('n/a')
  })
})
