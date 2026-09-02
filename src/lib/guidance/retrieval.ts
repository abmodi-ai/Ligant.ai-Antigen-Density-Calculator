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

import { NORMALISATIONS, STOPWORDS, TERM_TO_GROUP, stem } from './synonyms'
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
 * What a synonym match is worth when judging whether the question was
 * understood, as opposed to when ranking.
 *
 * These are different judgements and they need different numbers. For ranking,
 * a related term must count for less than the word the reader actually typed,
 * or an approximate match could outrank an exact one. For coverage, a synonym
 * match means the question *was* understood, and weighting it at the ranking
 * value caps a question phrased entirely in synonyms at that value: with the
 * gate above it, "is anything sent to a server" could never pass, however well
 * the corpus answers it. Every paraphrase would have been declined, which is
 * the opposite of what the synonym groups exist for.
 */
const COVERAGE_SYNONYM_CREDIT = 0.75

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
 * Measured across a probe of twenty-seven questions the corpus does and does not
 * answer: everything it answers scores 0.63 to 1.00, and everything it cannot
 * scores 0.42 or below, or matches nothing at all. The threshold sits in that
 * gap, and every case in the probe falls on the correct side of it.
 *
 * Twenty-six of the twenty-seven land on the correct side. The exception is
 * "how long should the killing assay run", which reduces to killing and assay,
 * finds a passage about killing assays, and scores 0.60 for it. That is the
 * residual this statistic cannot reach: an in-domain question answered by an
 * in-domain passage that does not address the specific point. The reader sees
 * the passage under its own title and can tell.
 *
 * The separation did not exist until the stop list grew. Before it, generic
 * English carried spurious weight in a corpus this small, junk questions scored
 * 0.39 to 0.48 and real ones bottomed out at 0.45, and the two distributions
 * overlapped so completely that no threshold could split them. Fixing the
 * vocabulary was what made the gate work, not moving the number.
 *
 * The threshold will need re-measuring whenever the tokeniser or the stop list
 * changes, because both move the distribution it sits in. It is calibrated
 * against the probe rather than chosen, and the probe cases live in the tests.
 */
const MIN_QUERY_COVERAGE = 0.55

/**
 * Preference for an entry whose kind matches what the question is asking for.
 *
 * A student's first questions at any control are what it is and why it is
 * there; someone who already knows asks which option to pick. Those are
 * different entries, and term matching alone cannot separate them, because both
 * are about the same subject and share almost all of their vocabulary. Worse,
 * the definition usually wins on terms alone: it says the subject's name more
 * often, being an explanation of it.
 *
 * So the match is made symmetric. A definitional question promotes definitions,
 * a practical question promotes practice, and neither pushes anything down: the
 * other kind still appears beneath, which matters because the two questions
 * shade into each other and the reader may have meant either.
 */
const KIND_MATCH_BOOST = 1.45

const DEFAULT_LIMIT = 4

/**
 * Whether a question asks what something is, or what to do about it.
 *
 * Read from the raw query rather than from tokens, because the words that carry
 * the intent are exactly the ones the stop list removes.
 *
 * A question mentioning the reader's own work is treated as practical whatever
 * else it contains. "Why is my slope off" and "why is a slope of one expected"
 * both begin with why, and only the second is asking to be taught something.
 */
const DEFINITIONAL = [
  /\bwhat (is|are|was|were)\b/i,
  // The trailing form: "what an EC50 is", "what the control channel is".
  /\bwhat (a|an|the)\b[^?]*\bis\b/i,
  /\btell me\b/i,
  /\bwhat does\b[^?]*\bmean\b/i,
  /\bwhat.*\bfor\b/i,
  /\bwhy\b/i,
  /\bexplain\b/i,
  /\bdefine\b/i,
  /\bmeaning of\b/i,
  /\bpurpose of\b/i,
]

export function questionIntent(query: string): 'definition' | 'practice' {
  if (/\b(my|mine|our)\b/i.test(query)) return 'practice'
  return DEFINITIONAL.some((pattern) => pattern.test(query)) ? 'definition' : 'practice'
}

/**
 * Split text into index terms, keeping each alongside the word it came from.
 *
 * The written form is kept because it is what a reader recognises. Reporting
 * that a question matched on "isotyp" would be showing them the machinery.
 */
export function tokenisePairs(text: string): { written: string; term: string }[] {
  let normalised = text
  for (const [pattern, replacement] of NORMALISATIONS) {
    normalised = normalised.replace(pattern, replacement)
  }
  return normalised
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    // Stopwords are matched on what was written, so the list stays readable,
    // and stemming happens after, so inflections still collapse.
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .map((written) => ({ written, term: stem(written) }))
}

/** Index terms alone. */
export function tokenise(text: string): string[] {
  return tokenisePairs(text).map((pair) => pair.term)
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

  const intent = questionIntent(query)

  // Stem back to the reader's own word, for anything the interface reports.
  const written = new Map<string, string>()
  for (const pair of tokenisePairs(query)) {
    if (!written.has(pair.term)) written.set(pair.term, pair.written)
  }

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
      if (!term.startsWith('g.')) matched.push(written.get(term) ?? term)
    }

    if (score <= 0) continue

    // A term is covered outright by an exact match, and partially by a synonym.
    // Crediting the synonym is what lets a question phrased entirely in bench
    // register clear the gate at all: "my beads are dim" contains no
    // word the corpus spells the same way, and is still a question the corpus
    // answers.
    let coveredIdf = 0
    for (const t of contentTerms) {
      if (passage.frequencies.has(t.term)) coveredIdf += t.potential
      else if (t.group && passage.frequencies.has(t.group)) {
        coveredIdf += t.potential * COVERAGE_SYNONYM_CREDIT
      }
    }
    const coverage = queryIdf > 0 ? coveredIdf / queryIdf : 1
    if (coverage < MIN_QUERY_COVERAGE) continue

    const scope: Match['scope'] =
      options.anchor !== undefined && entry.anchor === options.anchor ? 'card' : 'suite'
    if (scope === 'card') score *= ANCHOR_BOOST
    if ((entry.kind ?? 'practice') === intent) score *= KIND_MATCH_BOOST

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
