import { describe, it, expect } from 'vitest'
import { formatR2 } from './format'

describe('formatR2', () => {
  it('never rounds a good fit up to a perfect one', () => {
    expect(formatR2(0.999956)).toBe('0.999956')
    expect(formatR2(0.999983)).toBe('0.999983')
    expect(formatR2(0.9999999)).toBe('> 0.999999')
  })

  it('prints an exact fit plainly', () => {
    expect(formatR2(1)).toBe('1')
  })

  it('trims noise from ordinary values', () => {
    expect(formatR2(0.9995)).toBe('0.9995')
    expect(formatR2(0.5)).toBe('0.5')
    expect(formatR2(0.87231)).toBe('0.87231')
  })
})
