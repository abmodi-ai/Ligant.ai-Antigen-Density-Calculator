import { describe, it, expect } from 'vitest'
import { entriesFor, plainText, type ToolContext } from './types'
import { ANTIGEN_DENSITY_GUIDANCE } from './corpus/antigen-density'
import { SHARED_GUIDANCE } from './corpus/shared'

const ALL = [...ANTIGEN_DENSITY_GUIDANCE, ...SHARED_GUIDANCE]

function ctx(facts: Record<string, number | string | boolean | null>): ToolContext {
  return { tool: 'test', facts, flags: [] }
}

describe('corpus integrity', () => {
  it('has unique ids', () => {
    const ids = ALL.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has a title and at least one block', () => {
    for (const e of ALL) {
      expect(e.title.length, e.id).toBeGreaterThan(0)
      expect(e.body.length, e.id).toBeGreaterThan(0)
    }
  })

  it('every anchor has at least one entry that applies unconditionally', () => {
    const anchors = new Set(ALL.map((e) => e.anchor))
    for (const anchor of anchors) {
      const unconditional = ALL.filter((e) => e.anchor === anchor && !e.when)
      expect(unconditional.length, `anchor ${anchor} would show an empty pin`).toBeGreaterThan(0)
    }
  })

  it('flattens to plain text with emphasis markers stripped, ready to index', () => {
    for (const e of ALL) {
      const text = plainText(e)
      expect(text).not.toContain('*')
      expect(text.length).toBeGreaterThan(e.title.length)
    }
  })
})

describe('state-aware selection', () => {
  it('withholds the slope advice while the slope is healthy', () => {
    const found = entriesFor(ANTIGEN_DENSITY_GUIDANCE, 'ad.curve', ctx({ slope: 1.02 }))
    expect(found.some((e) => e.id === 'ad.curve.slope-off')).toBe(false)
  })

  it('surfaces the slope advice, first, once the slope drifts', () => {
    const found = entriesFor(ANTIGEN_DENSITY_GUIDANCE, 'ad.curve', ctx({ slope: 1.4 }))
    expect(found[0].id).toBe('ad.curve.slope-off')
  })

  it('treats a missing fact as not applicable rather than throwing', () => {
    const found = entriesFor(ANTIGEN_DENSITY_GUIDANCE, 'ad.curve', ctx({}))
    expect(found.some((e) => e.id === 'ad.curve.slope-off')).toBe(false)
    expect(found.length).toBeGreaterThan(0)
  })

  it('returns nothing for an anchor the corpus does not cover', () => {
    expect(entriesFor(ALL, 'does.not.exist', ctx({}))).toHaveLength(0)
  })
})
