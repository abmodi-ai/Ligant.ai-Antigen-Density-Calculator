/**
 * Card-scoped retrieval over the guidance corpus.
 *
 * A reader asks a question at a particular control, and the answer, if the
 * corpus has one, is usually written for that control. Scoping the search to
 * the card is therefore not only a ranking convenience: it is what lets a small
 * corpus behave like a large one, because the passages competing to answer a
 * question about the control channel are the two or three written about
 * controls rather than the whole suite.
 *
 * Scoring is BM25 with two departures, both because the documents here are
 * short and titled:
 *
 *   Titles are weighted above body text. An entry title is already phrased as
 *   the question a reader asks ("Is my standard actually a straight line?"), so
 *   a title match is a much stronger signal than the same word buried in a
 *   paragraph.
 *
 *   Terms expand into synonym groups at a reduced weight, which closes the
 *   paraphrase gap that would otherwise need a sentence embedding model. See
 *   `synonyms.ts` for why that trade is worth making in this domain.
 *
 * Everything here is a pure function of the corpus, the query and the typed
 * state snapshot. The same question asked twice against the same state returns
 * the same passages in the same order, which is what the determinism rule
 * requires of anything that reaches a user.
 */

import { NORMALISATIONS, STOPWORDS, TERM_TO_GROUP } from './synonyms'
import type { AnchorId, GuidanceEntry, ToolContext } from './types'
import { plainText } from './types'

/** Saturation of term frequency. The BM25 convention. */
const K1 = 1.2
/** Strength of length normalisation. The BM25 convention. */
const B = 0.75

/**
 * A title is the question a reader would have asked, so matching it counts for
 * more than matching the same word inside a paragraph.
 */
const TITLE_WEIGHT = 2.5

/**
 * Weight of a synonym-group match relative to the word the reader actually
 * typed. Low enough that an exact term always outranks a related one, high
 * enough that a related passage still surfaces when nothing matches exactly.
 */
const EXPANSION_WEIGHT = 0.45

/**
 * Preference for passages written for the card the question was asked at.
 * A multiplier rather than a filter: a strong answer from another card is more
 * use than silence, provided the interface says where it came from.
 */
const ANCHOR_BOOST = 1.6

/**
 * Results scoring below this fraction of the best result are dropped. BM25
 * scores have no absolute scale, so relevance is judged relative to the best
 * match rather than against a fixed number that would drift with the corpus.
 */
const RELATIVE_FLOOR = 0.25

/**
 * Fraction of a question's distinctive content a passage must actually match.
 *
 * The relative floor above prunes weak results against the best one, which does
 * nothing when the best one is itself weak: every question finds *something*,
 * because "how do I cite this tool" shares the word "tool" with half the
 * corpus. That is how a retrieval layer starts answering questions it has no
 * answer to, which is the failure this whole tool exists to avoid.
 *
 * Specificity lives in a question's rare terms, so coverage is measured in
 * inverse document frequency rather than in words: what share of the query's
 * total IDF did this passage account for? A term absent from the corpus counts
 * at the maximum, because a word appearing in no document is the rarest kind
 * there is, and it is usually the word the question is really about
 * ("fixation", "clinical", "CAR-NK").
 *
 * Measured across a probe of questions the corpus does and does not answer:
 * clear answers score 0.45 to 1.00, and everything the corpus genuinely cannot
 * address ("how do I cite this tool", "can I use this for CAR-NK", "how long
 * should the killing assay run", "what is the weather today") falls below this
 * threshold and is declined.
 *
 * The limit is honest about itself. A near miss inside the domain is not
 * separable by this statistic: "does fixation change MFI", which the corpus
 * says nothing about, scores exactly 0.45, the same as "my beads look dim",
 * which it answers well. No threshold splits that pair. What makes the residue
 * tolerable is the surface rather than the score: retrieval returns passages
 * under their own titles, so a reader who asks about fixation and is offered
 * "Which fluorescence statistic should I use?" can see at a glance that it is
 * not an answer. A layer that synthesised prose instead would turn the same
 * near miss into a confident wrong answer, which is the argument for keeping
 * generation out of this path.
 */
const MIN_QUERY_COVERAGE = 0.34

const DEFAULT_LIMIT = 4

/** Split text into index terms, after rewriting the forms tokenising would destroy. */
export function tokenise(text: string): string[] {
  let normalised = text
  for (const [pattern, replacement] of NORMALISATIONS) {
    normalised = normalised.replace(pattern, replacement)
  }
  return normalised
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
}

/** One corpus entry, reduced to weighted terms. */
interface Passage {
  entry: GuidanceEntry
  /** Term to weighted frequency, including synonym-group terms. */
  frequencies: Map<string, number>
  /** Weighted count of the entry's own terms, for length normalisation. */
  length: number
}

export interface RetrievalIndex {
  passages: Passage[]
  /** Inverse document frequency per term. */
  idf: Map<string, number>
  averageLength: number
  /** IDF assigned to a term the corpus does not contain at all. */
  unknownTermIdf: number
}

function addTerm(into: Map<string, number>, term: string, weight: number) {
  into.set(term, (into.get(term) ?? 0) + weight)
}

/**
 * Build the index once per corpus. Cheap enough at this size to do at startup,
 * and pure, so it can equally be precomputed at build time later.
 */
export function buildIndex(corpus: readonly GuidanceEntry[]): RetrievalIndex {
  const passages: Passage[] = corpus.map((entry) => {
    const frequencies = new Map<string, number>()
    let length = 0

    const fields: [string, number][] = [
      [entry.title, TITLE_WEIGHT],
      // plainText strips the emphasis markers, so the indexed form is the text
      // as read rather than as authored.
      [plainText(entry), 1],
    ]

    for (const [text, fieldWeight] of fields) {
      for (const token of tokenise(text)) {
        addTerm(frequencies, token, fieldWeight)
        length += fieldWeight
        const group = TERM_TO_GROUP.get(token)
        // The group term carries full field weight here; the reduction is
        // applied once, on the query side.
        if (group) addTerm(frequencies, group, fieldWeight)
      }
    }

    return { entry, frequencies, length }
  })

  const documentCount = passages.length
  const containing = new Map<string, number>()
  for (const passage of passages) {
    for (const term of passage.frequencies.keys()) {
      containing.set(term, (containing.get(term) ?? 0) + 1)
    }
  }

  const idf = new Map<string, number>()
  for (const [term, count] of containing) {
    idf.set(term, Math.log(1 + (documentCount - count + 0.5) / (count + 0.5)))
  }

  const totalLength = passages.reduce((sum, p) => sum + p.length, 0)
  // A term in no document is rarer than one in a single document, so it scores
  // just above the rarest term the corpus has.
  const rarest = idf.size > 0 ? Math.max(...idf.values()) : 1
  return {
    passages,
    idf,
    averageLength: documentCount > 0 ? totalLength / documentCount : 0,
    unknownTermIdf: rarest,
  }
}

/** Query terms with their weights: what was typed, plus what it implies. */
export function expandQuery(query: string): Map<string, number> {
  const weights = new Map<string, number>()
  for (const token of tokenise(query)) {
    weights.set(token, Math.max(weights.get(token) ?? 0, 1))
    const group = TERM_TO_GROUP.get(token)
    if (group) {
      // Two synonyms in one question must not compound into a stronger group
      // signal than a single exact term, so take the maximum rather than sum.
      weights.set(group, Math.max(weights.get(group) ?? 0, EXPANSION_WEIGHT))
    }
  }
  return weights
}

export interface Match {
  entry: GuidanceEntry
  score: number
  /** Whether the passage belongs to the card the question was asked at. */
  scope: 'card' | 'suite'
  /** Terms that actually contributed, for the interface to show its working. */
  matched: string[]
  /**
   * Share of the question's distinctiveness this passage accounts for, in the
   * units the gate is expressed in. Reported so the threshold can be chosen
   * from measurements rather than from feel, and asserted in tests.
   */
  coverage: number
}

export interface SearchOptions {
  /** State snapshot, so an entry can exclude itself under current values. */
  context: ToolContext
  /** The card the question was asked at. Omit to search the whole suite. */
  anchor?: AnchorId
  limit?: number
}

/**
 * Rank the corpus against a question.
 *
 * Returns nothing rather than a weak best guess when no passage matches. A tool
 * that answers every question is a tool that answers some of them wrongly, and
 * silence here is a truthful statement that the corpus does not cover this yet.
 */
export function search(
  index: RetrievalIndex,
  query: string,
  options: SearchOptions,
): Match[] {
  const weights = expandQuery(query)
  if (weights.size === 0) return []

  // Distinctiveness the question carries, term by term, against which each
  // passage's share is judged. Only what the reader typed appears here; a
  // synonym group is credited through the term that produced it, below.
  const contentTerms = [...weights]
    .filter(([term]) => !term.startsWith('g.'))
    .map(([term, weight]) => ({
      term,
      group: TERM_TO_GROUP.get(term),
      potential: weight * (index.idf.get(term) ?? index.unknownTermIdf),
    }))
  const queryIdf = contentTerms.reduce((sum, t) => sum + t.potential, 0)

  const matches: Match[] = []

  for (const passage of index.passages) {
    const { entry } = passage
    // An entry that declares itself irrelevant under the current state stays
    // out of retrieval, exactly as it stays out of the pins.
    if (entry.when && !entry.when(options.context)) continue

    let score = 0
    const matched: string[] = []

    for (const [term, queryWeight] of weights) {
      const frequency = passage.frequencies.get(term)
      if (!frequency) continue
      const idf = index.idf.get(term) ?? 0
      if (idf <= 0) continue

      const normalised =
        frequency * (K1 + 1) /
        (frequency + K1 * (1 - B + (B * passage.length) / (index.averageLength || 1)))
      score += queryWeight * idf * normalised
      // Group terms are an implementation detail of expansion, not something a
      // reader typed, so they are not reported as matches.
      if (!term.startsWith('g.')) matched.push(term)
    }

    if (score <= 0) continue

    // A term is covered outright by an exact match, and partially by a synonym.
    // Crediting the synonym is what lets a question phrased entirely in bench
    // register clear the gate at all: "what E:T ratio should I use" contains no
    // word the corpus spells the same way, and is still a question the corpus
    // answers.
    let coveredIdf = 0
    for (const t of contentTerms) {
      if (passage.frequencies.has(t.term)) coveredIdf += t.potential
      else if (t.group && passage.frequencies.has(t.group)) {
        coveredIdf += t.potential * EXPANSION_WEIGHT
      }
    }
    const coverage = queryIdf > 0 ? coveredIdf / queryIdf : 1
    if (coverage < MIN_QUERY_COVERAGE) continue

    const scope: Match['scope'] =
      options.anchor !== undefined && entry.anchor === options.anchor ? 'card' : 'suite'
    if (scope === 'card') score *= ANCHOR_BOOST

    matches.push({ entry, score, scope, matched: matched.sort(), coverage })
  }

  if (matches.length === 0) return []

  // Sort by score, then by id, so equal scores never depend on corpus order.
  matches.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))

  const floor = matches[0].score * RELATIVE_FLOOR
  return matches.filter((m) => m.score >= floor).slice(0, options.limit ?? DEFAULT_LIMIT)
}

/**
 * What the interface says when nothing matched.
 *
 * Kept here rather than in a component so the retrieval layer owns both halves
 * of its contract: what it found, and what it says when it found nothing.
 */
export const NO_MATCH_MESSAGE =
  'The guidance here does not cover that yet. Nothing in this answer is generated, so rather than guess, the tool says so.'
