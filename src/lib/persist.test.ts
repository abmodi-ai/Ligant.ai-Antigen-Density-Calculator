import { describe, it, expect, beforeEach } from 'vitest'
import { persist, restoreOptions } from './persist'
import { DEFAULT_OPTIONS, captureCompatibilityFlags, type QuantifyOptions } from './quantify'

/**
 * Settings exactly as the released version wrote them, before the antibody host
 * and saturation options existed. This is the shape every returning user has in
 * storage, and the shape no test constructed until this one.
 */
const V0_ANTIGEN_OPTIONS = {
  standardKind: 'abc',
  fpRatio: 1,
  backgroundMode: 'abc',
  valency: 'bivalent',
  confidenceLevel: 0.95,
}

describe('restoreOptions', () => {
  it('backfills an option that did not exist when the state was written', () => {
    const restored = restoreOptions(V0_ANTIGEN_OPTIONS, DEFAULT_OPTIONS)
    expect(restored.antibodyHost).toBe('unstated')
    expect(restored.saturationConfirmed).toBe(false)
  })

  it('keeps every value the stored payload does carry', () => {
    const restored = restoreOptions(
      { ...V0_ANTIGEN_OPTIONS, backgroundMode: 'mfi', confidenceLevel: 0.99 },
      DEFAULT_OPTIONS,
    )
    expect(restored.backgroundMode).toBe('mfi')
    expect(restored.confidenceLevel).toBe(0.99)
  })

  it('does not leave a backfilled key undefined, which is what broke the guards', () => {
    const restored = restoreOptions(V0_ANTIGEN_OPTIONS, DEFAULT_OPTIONS) as unknown as Record<string, unknown>
    for (const key of Object.keys(DEFAULT_OPTIONS)) {
      expect(restored[key]).toBeDefined()
    }
  })

  it('discards a stored value of the wrong type', () => {
    const restored = restoreOptions(
      { ...V0_ANTIGEN_OPTIONS, confidenceLevel: 'ninety five' },
      DEFAULT_OPTIONS,
    )
    expect(restored.confidenceLevel).toBe(DEFAULT_OPTIONS.confidenceLevel)
  })

  it('discards null, which JSON can carry where undefined cannot', () => {
    const restored = restoreOptions({ ...V0_ANTIGEN_OPTIONS, valency: null }, DEFAULT_OPTIONS)
    expect(restored.valency).toBe(DEFAULT_OPTIONS.valency)
  })

  it('discards a non-finite number rather than letting it reach a computation', () => {
    const restored = restoreOptions({ fpRatio: Number.NaN }, DEFAULT_OPTIONS)
    expect(restored.fpRatio).toBe(DEFAULT_OPTIONS.fpRatio)
  })

  it('drops a key the defaults do not declare', () => {
    const restored = restoreOptions(
      { ...V0_ANTIGEN_OPTIONS, retiredSetting: 'x' },
      DEFAULT_OPTIONS,
    ) as unknown as Record<string, unknown>
    expect(restored.retiredSetting).toBeUndefined()
  })

  it('falls back entirely on a payload that is not an object', () => {
    for (const junk of [null, undefined, 'x', 7, [1, 2]]) {
      expect(restoreOptions(junk, DEFAULT_OPTIONS)).toEqual(DEFAULT_OPTIONS)
    }
  })

  it('is generic over the shape it is given, not written for one tool', () => {
    // The merge is the thing being tested, so the defaults here are a fixture
    // rather than any real option set: a stored payload missing two of four
    // keys must come back complete, with what it did carry preserved.
    const defaults = { label: 'default', enabled: false, level: 0.95, count: 3 }
    const stored = { label: 'kept', level: 0.99 }
    expect(restoreOptions(stored, defaults)).toEqual({
      label: 'kept',
      enabled: false,
      level: 0.99,
      count: 3,
    })
  })
})

describe('the defect this module exists to prevent', () => {
  // Restoring the released payload directly left antibodyHost undefined. The
  // select rendered uncontrolled and reported its first option, so the
  // interface displayed "Not stated" while the guard received nothing, fell
  // past every early return, and accused the user of a mismatch against
  // "undefined". Nothing was wrong with their data.
  it('accuses a returning user of nothing', () => {
    const naive = V0_ANTIGEN_OPTIONS as unknown as QuantifyOptions
    expect(captureCompatibilityFlags('mouse', naive.antibodyHost)).toHaveLength(1)

    const restored = restoreOptions(V0_ANTIGEN_OPTIONS, DEFAULT_OPTIONS)
    expect(captureCompatibilityFlags('mouse', restored.antibodyHost)).toHaveLength(0)
  })

  it('never puts undefined in front of a user', () => {
    const naive = V0_ANTIGEN_OPTIONS as unknown as QuantifyOptions
    const [flag] = captureCompatibilityFlags('mouse', naive.antibodyHost)
    expect(flag.message).toContain('undefined')

    const restored = restoreOptions(V0_ANTIGEN_OPTIONS, DEFAULT_OPTIONS)
    for (const f of captureCompatibilityFlags('mouse', restored.antibodyHost)) {
      expect(f.message).not.toContain('undefined')
    }
  })
})

/**
 * A minimal `localStorage`, because the suite runs in node.
 *
 * Stubbed rather than pulled in with a DOM implementation: `persist` touches
 * two methods, and a stub that implements exactly those two is a more honest
 * description of what is being tested than a whole document would be.
 */
class MemoryStorage {
  private items = new Map<string, string>()
  get length() {
    return this.items.size
  }
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
  clear() {
    this.items.clear()
  }
}

describe('persist', () => {
  const key = 'test.state.v1'

  beforeEach(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
  })

  it('writes the document when there is work to keep', () => {
    persist(key, { mfi: 2050 }, true)
    expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({ mfi: 2050 })
  })

  // "Clear stored data" removed the key and then reset the tool, and resetting
  // the tool wrote the key straight back holding an empty document. The key was
  // still there afterwards, which is not what the button says.
  it('removes the key when there is nothing to keep', () => {
    persist(key, { mfi: 2050 }, true)
    persist(key, { mfi: null }, false)
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('writes nothing for a reader who has entered nothing', () => {
    persist(key, { mfi: null }, false)
    expect(localStorage.length).toBe(0)
  })

  it('survives storage being unavailable', () => {
    // A private window, or a browser set to block site data. The tool keeps
    // working; it simply does not remember.
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      setItem() {
        throw new Error('denied')
      },
      removeItem() {
        throw new Error('denied')
      },
    }
    expect(() => persist(key, { mfi: 2050 }, true)).not.toThrow()
    expect(() => persist(key, { mfi: null }, false)).not.toThrow()
  })
})
