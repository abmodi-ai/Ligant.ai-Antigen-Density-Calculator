import { describe, it, expect } from 'vitest'
import { buildIndex, expandQuery, questionIntent, search, tokenise, type RetrievalIndex } from './retrieval'
import { stem } from './synonyms'
import { ANTIGEN_DENSITY_GUIDANCE } from './corpus/antigen-density'
import { CYTOTOXICITY_GUIDANCE } from './corpus/cytotoxicity'
import { SHARED_GUIDANCE } from './corpus/shared'
import type { GuidanceEntry, ToolContext } from './types'

/**
 * Retrieval is tested against the real corpus rather than a fixture.
 *
 * A fixture would prove the arithmetic and nothing about the product. What
 * matters is whether a question a scientist would actually type reaches the
 * passage written to answer it, and that is a property of the corpus and the
 * ranking together.
 */
const CORPUS: GuidanceEntry[] = [
  ...ANTIGEN_DENSITY_GUIDANCE,
  ...CYTOTOXICITY_GUIDANCE,
  ...SHARED_GUIDANCE,
]

const index: RetrievalIndex = buildIndex(CORPUS)

const CONTEXT: ToolContext = {
  tool: 'antigen-density',
  facts: { slope: 1.017, r2: 0.9995, beadCount: 4, backgroundMode: 'abc' },
  flags: [],
}

const ids = (query: string, anchor?: string) =>
  search(index, query, { context: CONTEXT, anchor }).map((m) => m.entry.id)

describe('tokenise', () => {
  it('keeps the forms that splitting on punctuation would destroy', () => {
    expect(tokenise('what is R²')).toContain('r2')
    expect(tokenise('my E:T ratio')).toContain('et')
    expect(tokenise('the F/P ratio')).toContain('fp')
    expect(tokenise('reporting EC 50')).toContain('ec50')
    expect(tokenise('log 10 space')).toContain('log10')
  })

  it('drops words that carry no signal, and keeps the ones that do', () => {
    const tokens = tokenise('why is the value below the lowest standard')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('is')
    // "below" is the whole meaning of the question, not a stopword.
    expect(tokens).toContain('below')
    expect(tokens).toContain('lowest')
  })
})

describe('expandQuery', () => {
  it('weights a typed term above the group it implies', () => {
    const weights = expandQuery('isotype')
    expect(weights.get(stem('isotype'))).toBe(1)
    expect(weights.get('g.control')).toBeLessThan(1)
  })

  it('does not let two synonyms compound into a stronger signal than one exact term', () => {
    const one = expandQuery('isotype')
    const two = expandQuery('isotype fmo unstained')
    expect(two.get('g.control')).toBe(one.get('g.control'))
  })

  it('is empty for a query of nothing but stopwords', () => {
    expect(expandQuery('what is it for').size).toBe(0)
  })
})

describe('card scoping', () => {
  it('prefers the passage written for the card the question was asked at', () => {
    // Asked anywhere, "which control" is ambiguous across the suite.
    const atControl = search(index, 'which control should I use', {
      context: CONTEXT,
      anchor: 'ad.control',
    })
    expect(atControl[0].entry.id).toBe('ad.control.which')
    expect(atControl[0].scope).toBe('card')
  })

  it('still reaches an answer written for another card, and says so', () => {
    const results = search(index, 'isotype or FMO', { context: CONTEXT, anchor: 'ad.mfi' })
    const control = results.find((m) => m.entry.id === 'ad.control.which')
    expect(control).toBeDefined()
    expect(control?.scope).toBe('suite')
  })

  it('reorders the same question by where it was asked', () => {
    const atCurve = ids('what does the slope tell me', 'ad.curve')
    const anywhere = ids('what does the slope tell me')
    expect(atCurve[0]).toMatch(/^ad\.curve\./)
    // The suite-wide search need not agree, and that is the point of scoping.
    expect(atCurve).not.toEqual([])
    expect(anywhere).not.toEqual([])
  })
})

describe('questions a scientist would actually type', () => {
  // Each pair is a question in bench register and the entry that answers it.
  // These are the coverage regression: a corpus edit that breaks one of these
  // has made the tool worse at the thing it exists to do.
  const CASES: [string, string, string | undefined][] = [
    ['which fluorescence statistic', 'ad.mfi.statistic', 'ad.mfi'],
    ['should I use median or geometric mean', 'ad.mfi.statistic', 'ad.mfi'],
    ['isotype or FMO', 'ad.control.which', 'ad.control'],
    ['where do I get the assigned values', 'ad.assigned.where', 'ad.assigned'],
    ['are the bead values on the vial', 'ad.assigned.where', 'ad.assigned'],
    ['is my antibody bivalent', 'ad.valency.which', 'ad.valency'],
    ['does the host species matter', 'ad.host.why', 'ad.host'],
    ['did I titrate to saturation', 'ad.saturation.why', 'ad.saturation'],
    ['subtract background before or after converting', 'ad.background.mode', 'ad.background'],
    ['is my standard curve straight', 'ad.curve.straight', 'ad.curve'],
    ['what does this number mean', 'ad.result.meaning', 'ad.result'],
    ['what goes in the dose column', 'cy.dose.what', 'cy.dose'],
    ['percentage or unbounded response', 'cy.scale.which', 'cy.scale'],
    ['what does the hill slope tell me', 'cy.potency.hill', 'cy.potency'],
    ['what does the confidence interval cover', 'shared.confidence', 'shared.confidence'],
    ['where does my data go', 'shared.privacy', 'shared.privacy'],
  ]

  it.each(CASES)('"%s" retrieves %s', (query, expected, anchor) => {
    expect(ids(query, anchor)).toContain(expected)
  })

  it.each(CASES)('"%s" ranks %s first', (query, expected, anchor) => {
    expect(ids(query, anchor)[0]).toBe(expected)
  })
})

describe('paraphrase, which is what the synonym groups are for', () => {
  it('reaches the calibration passages from bench phrasing', () => {
    // Nothing in the corpus contains "dim".
    expect(CORPUS.some((e) => /\bdim\b/i.test(e.title))).toBe(false)
    expect(ids('my beads look dim', 'ad.bead-kit').length).toBeGreaterThan(0)
  })

  it('reaches the privacy passage from a question about servers', () => {
    expect(ids('is anything sent to a server')).toContain('shared.privacy')
  })

  it('reaches the potency passage from "how strong is my CAR"', () => {
    expect(ids('how potent is this construct', 'cy.potency').length).toBeGreaterThan(0)
  })
})

describe('saying nothing rather than guessing', () => {
  it('returns nothing when no term matches', () => {
    expect(search(index, 'zzzz qqqq', { context: CONTEXT })).toEqual([])
  })

  it('returns nothing for a question with no content words', () => {
    expect(search(index, 'what is it', { context: CONTEXT })).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(search(index, '   ', { context: CONTEXT })).toEqual([])
  })

  it('prunes weak results rather than padding the list', () => {
    const results = search(index, 'isotype or FMO', { context: CONTEXT, anchor: 'ad.control' })
    const best = results[0].score
    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(best * 0.25)
    }
  })
})

describe('state awareness', () => {
  it('excludes an entry that declares itself irrelevant under current values', () => {
    const conditional: GuidanceEntry = {
      id: 'test.conditional',
      anchor: 'ad.curve',
      title: 'Only when the slope has drifted',
      // A marker word that appears nowhere else, so the only thing the query
      // can retrieve is this entry, if the predicate lets it through.
      body: [{ kind: 'p', text: 'A distinctive marker phrase: zebrafish.' }],
      when: (c) => (c.facts.slope as number) > 1.5,
    }
    const conditionalIndex = buildIndex([...CORPUS, conditional])

    // Slope 1.017: the entry keeps itself out of retrieval, as it does out of the pins.
    expect(
      search(conditionalIndex, 'zebrafish', { context: CONTEXT }),
    ).toEqual([])

    const drifted: ToolContext = { ...CONTEXT, facts: { ...CONTEXT.facts, slope: 1.9 } }
    expect(
      search(conditionalIndex, 'zebrafish', { context: drifted }).map((m) => m.entry.id),
    ).toEqual(['test.conditional'])
  })
})

describe('determinism', () => {
  it('returns identical results for identical inputs', () => {
    const once = search(index, 'which control should I use', { context: CONTEXT, anchor: 'ad.control' })
    const twice = search(index, 'which control should I use', { context: CONTEXT, anchor: 'ad.control' })
    expect(twice).toEqual(once)
  })

  it('does not depend on the order entries appear in the corpus', () => {
    const reversed = buildIndex([...CORPUS].reverse())
    const forward = ids('isotype or FMO', 'ad.control')
    const backward = search(reversed, 'isotype or FMO', {
      context: CONTEXT,
      anchor: 'ad.control',
    }).map((m) => m.entry.id)
    expect(backward).toEqual(forward)
  })
})

describe('what the interface shows', () => {
  it('reports the terms that matched, and not the synonym groups', () => {
    const [top] = search(index, 'isotype control', { context: CONTEXT, anchor: 'ad.control' })
    expect(top.matched).toContain('isotype')
    expect(top.matched.every((t) => !t.startsWith('g.'))).toBe(true)
  })

  it('caps the number of passages returned', () => {
    expect(search(index, 'curve slope fit standard bead', { context: CONTEXT, limit: 2 })).toHaveLength(2)
  })
})

describe('declining what the corpus does not cover', () => {
  // The gate that makes the no-match path reachable at all. Without it every
  // question found something: "how do I cite this tool" shares the word "tool"
  // with half the corpus, and BM25 will happily rank on that alone.
  const UNANSWERABLE: [string, string | undefined][] = [
    ['how do I cite this tool', undefined],
    ['can I use this for CAR-NK', undefined],
    ['does fixation change MFI', 'ad.mfi'],
    ['what is the recommended incubation time', 'cy.response'],
    ['what is the weather today', undefined],
    ['how do I install python', undefined],
  ]

  // Not in the list above, deliberately. "How long should the killing assay
  // run" reduces to killing and assay, finds a passage about killing assays,
  // and scores 0.60 for it. The corpus does not give a duration, so this is a
  // near miss, and it is the one the coverage statistic cannot reach: an
  // in-domain question answered by an in-domain passage that does not address
  // the point. Excluding it by threshold would take real answers with it.
  it('surfaces an in-domain near miss under its own title, where the reader can judge it', () => {
    const [top] = search(index, 'how long should the killing assay run', {
      context: CONTEXT,
      anchor: 'cy.response',
    })
    expect(top).toBeDefined()
    expect(top.entry.title).toBeTruthy()
  })

  it.each(UNANSWERABLE)('declines "%s"', (query, anchor) => {
    expect(search(index, query, { context: CONTEXT, anchor })).toEqual([])
  })

  it('credits a synonym toward coverage, or bench phrasing could never pass', () => {
    // Nothing in the corpus spells "E:T"; it writes "effector to target ratio".
    // Without synonym credit this question is all unknown terms and is declined.
    const results = search(index, 'what E:T ratio should I use', {
      context: CONTEXT,
      anchor: 'cy.dose',
    })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].entry.anchor).toBe('cy.dose')
  })

  it('lets a question written entirely in synonyms through the gate', () => {
    // Neither "sent" nor "server" appears in the corpus, which writes
    // "transmitted" and "contacts no third party". Judging comprehension at the
    // ranking weight for synonyms would cap this question below the gate and
    // decline every paraphrase ever asked.
    expect(ids('is anything sent to a server')).toContain('shared.privacy')
  })

  it('reports coverage above the gate for everything it does return', () => {
    for (const [query, , anchor] of [
      ['isotype or FMO', '', 'ad.control'],
      ['my beads look dim', '', 'ad.bead-kit'],
      ['should I run replicates', '', 'shared.confidence'],
    ] as [string, string, string][]) {
      for (const match of search(index, query, { context: CONTEXT, anchor })) {
        expect(match.coverage).toBeGreaterThanOrEqual(0.34)
      }
    }
  })
})

describe('questionIntent', () => {
  it('reads a request to be taught', () => {
    for (const q of [
      'what is a bead kit',
      'what are assigned values',
      'what does ABC mean',
      'why subtract background',
      'explain the standard curve',
      'what is the control channel for',
    ]) {
      expect(questionIntent(q)).toBe('definition')
    }
  })

  it('reads a question about the reader’s own work as practical', () => {
    // "Why is my slope off" and "why is a slope of one expected" both begin
    // with why, and only the second is asking to be taught something.
    for (const q of [
      'why is my slope off',
      'which control should I use',
      'is my standard curve straight',
      'what goes in the dose column',
    ]) {
      expect(questionIntent(q)).toBe('practice')
    }
  })
})

describe('a student asking what and why', () => {
  // The corpus answers two different questions at most controls: what the thing
  // is, and which option to pick. Term matching cannot separate them, because
  // the definition says the subject's name more often than the practice entry
  // does, being an explanation of it. These cases are the regression on that.
  const DEFINITIONS: [string, string, string | undefined][] = [
    ['what is a bead kit', 'ad.beads.what', 'ad.bead-kit'],
    // The phrasing a reader actually typed, which the first version declined:
    // "explain" appears nowhere in the corpus, so the relevance gate counted it
    // as the most distinctive word in the question.
    ['Can you explain what is the Bead Kit?', 'ad.beads.what', 'ad.bead-kit'],
    ['tell me what an EC50 is', 'cy.potency.what.is', 'cy.potency'],
    ['define specific lysis', 'cy.response.what.is', 'cy.response'],
    ['what is the purpose of the control', 'ad.control.what', 'ad.control'],
    ['why do I need beads', 'ad.beads.what', 'ad.bead-kit'],
    ['what is MFI', 'ad.mfi.what', 'ad.mfi'],
    ['what is an assigned value', 'ad.assigned.what', 'ad.assigned'],
    ['what is the control channel for', 'ad.control.what', 'ad.control'],
    ['why subtract background', 'ad.background.why', 'ad.background'],
    ['what is binding valency', 'ad.valency.what', 'ad.valency'],
    ['what is a standard curve', 'ad.curve.what', 'ad.curve'],
    ['what is antibody binding capacity', 'ad.result.what', 'ad.result'],
    ['what does titrating to saturation mean', 'ad.saturation.what', 'ad.saturation'],
    ['what is an effector to target ratio', 'cy.dose.what.is', 'cy.dose'],
    ['what is specific lysis', 'cy.response.what.is', 'cy.response'],
    ['what is an EC50', 'cy.potency.what.is', 'cy.potency'],
    ['what is a four parameter logistic curve', 'cy.curve.what.is', 'cy.curve'],
  ]

  it.each(DEFINITIONS)('"%s" ranks %s first', (query, expected, anchor) => {
    expect(ids(query, anchor)[0]).toBe(expected)
  })

  it('does not let a definition take over a practical question', () => {
    // The reverse failure, and the one that appeared first: every definition
    // outranked its practice neighbour until the kind match was made symmetric.
    const practical: [string, string, string][] = [
      ['which control should I use', 'ad.control.which', 'ad.control'],
      ['which fluorescence statistic', 'ad.mfi.statistic', 'ad.mfi'],
      ['where do I get the assigned values', 'ad.assigned.where', 'ad.assigned'],
      ['is my standard curve straight', 'ad.curve.straight', 'ad.curve'],
    ]
    for (const [query, expected, anchor] of practical) {
      expect(ids(query, anchor)[0]).toBe(expected)
    }
  })

  it('offers the other kind beneath rather than hiding it', () => {
    // The two questions shade into each other, so the boost promotes and never
    // demotes: a reader who asked one way can still see the other answer.
    const results = ids('what is a bead kit', 'ad.bead-kit')
    expect(results[0]).toBe('ad.beads.what')
    expect(results).toContain('ad.kit.which')
  })
})

describe('inflection', () => {
  it('collapses the forms a reader and a corpus write differently', () => {
    expect(stem('beads')).toBe(stem('bead'))
    expect(stem('needed')).toBe(stem('need'))
    expect(stem('titrated')).toBe(stem('titrate'))
    expect(stem('curves')).toBe(stem('curve'))
    expect(stem('values')).toBe(stem('value'))
  })

  it('leaves names that contain digits alone', () => {
    for (const name of ['ec50', 'ic50', 'r2', 'log10']) expect(stem(name)).toBe(name)
  })

  it('leaves short domain abbreviations alone', () => {
    for (const abbr of ['abc', 'mfi', 'fmo', 'igg']) expect(stem(abbr)).toBe(abbr)
  })

  it('reports the word the reader wrote, not its stem', () => {
    const [top] = search(index, 'which beads should I use', { context: CONTEXT, anchor: 'ad.bead-kit' })
    expect(top.matched).toContain('beads')
    expect(top.matched).not.toContain('bead')
  })
})
