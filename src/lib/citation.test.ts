import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { APP_VERSION, REPO_URL, SITE_URL } from './site'

/**
 * The same claim in three documents.
 *
 * The tool's footer, CITATION.cff, and the manuscript's Availability section
 * all state the tool name, author, year, version and URL. Three copies of one
 * string is three chances to disagree, and the disagreement is silent: nothing
 * fails, a reader simply finds two citations for one artefact and cannot tell
 * which is right.
 *
 * Two of the three can be held together mechanically, which is what this does.
 * The third is a manuscript nothing here can see, so that diff stays manual and
 * is named as such rather than assumed.
 */
const cff = readFileSync('CITATION.cff', 'utf8')
const field = (name: string) =>
  (cff.match(new RegExp(`^${name}:\\s*(.+)$`, 'm')) ?? [])[1]?.trim().replace(/^['"]|['"]$/g, '')

describe('the citation metadata agrees with the application', () => {
  it('states the version the application reports', () => {
    expect(field('version')).toBe(APP_VERSION)
  })

  it('points at the repository the footer links', () => {
    expect(field('repository-code')).toBe(REPO_URL)
  })

  it('points at the origin the application is served from', () => {
    expect(field('url')).toBe(SITE_URL)
  })

  it('names the author and licence the footer names', () => {
    expect(cff).toMatch(/family-names:\s*Modi/)
    expect(cff).toMatch(/given-names:\s*A\.B\./)
    expect(cff).toMatch(/affiliation:\s*Ligant AI Incorporated/)
    expect(field('license')).toBe('Apache-2.0')
  })

  // Absent on purpose until Zenodo mints one. Asserted so that adding a
  // placeholder that looks like an identifier is a deliberate act rather than
  // something that slips in.
  it('carries no DOI until there is one to carry', () => {
    expect(cff).not.toMatch(/10\.5281\/zenodo/)
    expect(cff).not.toMatch(/^identifiers:/m)
  })

  it('declares a release date, which the tag must match', () => {
    expect(field('date-released')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
