import { describe, it, expect } from 'vitest'
import { formatNumber, formatR2 } from './format'

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

describe('formatNumber', () => {
  // Moved here from the calibration core so that anything writing a number into
  // a sentence can reach it. The range guard did not, and told readers that
  // capacities "fall roughly between 1e+2 and 1e+7".
  it('writes the bounds of the certified range as numbers', () => {
    expect(formatNumber(1e2)).toBe('100')
    expect(formatNumber(1e7)).toBe('10,000,000')
  })

  it('keeps precision where the magnitude warrants it', () => {
    expect(formatNumber(8.234)).toBe('8.23')
    expect(formatNumber(63.21)).toBe('63.2')
    expect(formatNumber(8_300)).toBe('8300')
    expect(formatNumber(63_252.4)).toBe('63,252')
  })

  it('reaches for an exponent only where a full rendering would break a layout', () => {
    expect(formatNumber(1e9)).toBe('1.00e+9')
    expect(formatNumber(NaN)).toBe('n/a')
  })
})

describe('a number that reaches the grouping threshold by rounding', () => {
  // Found in a screenshot of a result card: "95% CI 10000 - 13,259". The lower
  // bound was 9,999.6, which fails the grouping test and then rounds past it.
  it('groups a value that rounds to five digits', () => {
    expect(formatNumber(9_999.6)).toBe('10,000')
  })

  it('leaves a value that rounds to four digits alone', () => {
    expect(formatNumber(9_999.4)).toBe('9999')
  })
})

describe('a number too small for two decimal places', () => {
  // The mirror of the defect fixed at the top end, and it read worse. A
  // standard refused for holding 1e-250 said "Population 1 (intensity 0.00)
  // holds a value outside anything a cytometer reports", which contradicts
  // itself and gives the reader no way to find the cell. 0.0001 and 1e-250
  // rendered identically.
  it.each([
    [0.0034, '0.0034'],
    [0.0001, '0.0001'],
    [0.00999, '0.00999'],
    [1e-12, '1e-12'],
    [1e-250, '1e-250'],
  ])('renders %s as something a reader can act on', (input, expected) => {
    expect(formatNumber(input)).toBe(expected)
  })

  it('leaves zero saying zero, which is the one honest 0.00', () => {
    expect(formatNumber(0)).toBe('0.00')
  })

  // The property, rather than the examples. Anything that renders as 0.00 when
  // it is not zero is a value the reader cannot find and cannot correct.
  it('never collapses a non-zero value to zero, at any magnitude', () => {
    for (let exponent = 0; exponent >= -300; exponent -= 1) {
      for (const mantissa of [1, 2.5, 9.87]) {
        const v = mantissa * 10 ** exponent
        if (v === 0) continue
        expect(formatNumber(v)).not.toBe('0.00')
        expect(formatNumber(-v)).not.toBe('0.00')
        expect(formatNumber(v)).not.toBe('-0.00')
      }
    }
  })

  it('leaves the magnitudes two decimal places already suited', () => {
    expect(formatNumber(0.05)).toBe('0.05')
    expect(formatNumber(0.5)).toBe('0.50')
    expect(formatNumber(2.5)).toBe('2.50')
    expect(formatNumber(9.99)).toBe('9.99')
  })
})
