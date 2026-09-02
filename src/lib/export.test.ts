import { describe, it, expect } from 'vitest'
import { substituteCssVars } from './export'

const RESOLVED = new Map([
  ['series-evidence', '#0D7C66'],
  ['surface', '#FFFFFF'],
  // The value that broke the export: a font stack containing double quotes.
  ['mono', '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'],
  ['band-fill', 'rgba(13, 124, 102, 0.14)'],
])

describe('substituteCssVars', () => {
  it('replaces a single reference', () => {
    expect(substituteCssVars('var(--series-evidence)', RESOLVED)).toBe('#0D7C66')
  })

  it('replaces every reference in a compound value', () => {
    expect(substituteCssVars('1px solid var(--surface) var(--series-evidence)', RESOLVED)).toBe(
      '1px solid #FFFFFF #0D7C66',
    )
  })

  it('returns a font stack complete with its quotes, for the serialiser to escape', () => {
    const out = substituteCssVars('var(--mono)', RESOLVED)
    expect(out).toContain('"IBM Plex Mono"')
    expect(out).toContain('monospace')
  })

  it('leaves an unknown reference untouched rather than emitting empty', () => {
    expect(substituteCssVars('var(--not-a-token)', RESOLVED)).toBe('var(--not-a-token)')
  })

  it('passes through a value with no references', () => {
    expect(substituteCssVars('#123456', RESOLVED)).toBe('#123456')
    expect(substituteCssVars('', RESOLVED)).toBe('')
  })

  it('handles values holding commas and parentheses', () => {
    expect(substituteCssVars('var(--band-fill)', RESOLVED)).toBe('rgba(13, 124, 102, 0.14)')
  })
})
