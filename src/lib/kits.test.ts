import { describe, expect, it } from 'vitest'
import { BEAD_KITS, nextStandardLabel, standardsForKit } from './kits'

const kit = (id: string) => BEAD_KITS.find((k) => k.id === id)!

describe('standardsForKit', () => {
  it('leaves a blank population out of the fit and every other one in', () => {
    const rows = standardsForKit(kit('qsc-mouse'))
    expect(rows.map((r) => [r.label, r.included])).toEqual([
      ['Blank', false],
      ['Population 1', true],
      ['Population 2', true],
      ['Population 3', true],
      ['Population 4', true],
    ])
  })

  it('includes every population of a kit that has no blank', () => {
    expect(standardsForKit(kit('quantibrite-pe')).every((r) => r.included)).toBe(true)
  })
})

describe('nextStandardLabel', () => {
  const rows = (...labels: string[]) => labels.map((label) => ({ label }))

  it('continues the kit numbering rather than starting a second scheme', () => {
    // The unnumbered blank is not a numbered population, so the sixth row of
    // the table is Population 5 and not Population 6 or Standard 6.
    expect(nextStandardLabel(standardsForKit(kit('qsc-mouse')))).toBe('Population 5')
  })

  it('continues a custom standard', () => {
    expect(nextStandardLabel(standardsForKit(kit('custom')))).toBe('Standard 5')
  })

  it('follows a stem the reader typed', () => {
    expect(nextStandardLabel(rows('Blank', 'Bead 1', 'Bead 2'))).toBe('Bead 3')
  })

  it('counts within the stem the last numbered row uses', () => {
    expect(nextStandardLabel(rows('Population 1', 'Population 2', 'QC 1'))).toBe('QC 2')
  })

  it('names a population where no row is numbered', () => {
    expect(nextStandardLabel(standardsForKit(kit('quantibrite-pe')))).toBe('Population 5')
  })

  it('names the first row of an empty table', () => {
    expect(nextStandardLabel([])).toBe('Population 1')
  })

  it('ignores a number embedded in a name that does not end in one', () => {
    expect(nextStandardLabel(rows('CD19 (NALM-6) bead'))).toBe('Population 2')
  })
})
