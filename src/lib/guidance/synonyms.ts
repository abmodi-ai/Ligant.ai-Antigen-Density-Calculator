/**
 * Domain vocabulary for guidance retrieval.
 *
 * The gap lexical search leaves is paraphrase: a reader asking why "my beads
 * are dim" will not match a passage about "MFI outside the calibrated range".
 * Closing that gap is usually a job for a sentence embedding model, and here it
 * is not worth one. The vocabulary of a flow cytometry calibration is small,
 * controlled, and known in advance, so fifty hand-written groups cover most of
 * the same ground for no download at all, and unlike a model they can be read,
 * argued with, and tested.
 *
 * Groups **expand**, they do not canonicalise. A query token keeps its own
 * identity and additionally matches its group at a lower weight, so a question
 * about an isotype control still prefers the passage about isotypes over the
 * passage about FMOs, while not missing it entirely. Collapsing the two into one
 * token would destroy exactly the distinction a reader is asking about.
 *
 * Terms are drawn from the corpus and from how people ask at the bench, which
 * is not the same register: the corpus says "median fluorescence intensity" and
 * the reader says "signal".
 */

/** A group of surface forms that should retrieve one another, weakly. */
export interface SynonymGroup {
  /** Stable token this group contributes to the index. */
  id: string
  terms: readonly string[]
}

/**
 * A term belongs to one group only, and the groups below are disjoint by stem.
 *
 * `TERM_TO_GROUP` is a map, so a term listed twice keeps only its last group.
 * Five terms were listed twice and were silently living in a group other than
 * the one they read as belonging to. Four were left where they had landed,
 * because that is the behaviour every ranking result was measured against:
 * "wrong" with the flags, "scfv" with the constructs, "line" with the cell
 * lines, "levels" with the dose levels. The fifth was a defect: "curved" put
 * the stem `curv` in the curvature group, which took the word *curve* out of
 * the curve group entirely.
 */
export const SYNONYM_GROUPS: readonly SynonymGroup[] = [
  { id: 'g.mfi', terms: ['mfi', 'fluorescence', 'intensity', 'signal', 'brightness', 'bright', 'dim', 'median', 'geometric', 'mean', 'channel'] },
  { id: 'g.control', terms: ['control', 'isotype', 'fmo', 'unstained', 'background', 'blank', 'baseline', 'autofluorescence', 'nonspecific'] },
  { id: 'g.bead', terms: ['bead', 'beads', 'standard', 'standards', 'calibrator', 'population', 'populations', 'vial', 'lot', 'certificate'] },
  { id: 'g.density', terms: ['abc', 'density', 'capacity', 'molecules', 'sites', 'antigen', 'target', 'epitope', 'copies'] },
  { id: 'g.curve', terms: ['curve', 'fit', 'fitted', 'regression', 'linear', 'calibration', 'slope', 'intercept'] },
  { id: 'g.range', terms: ['range', 'extrapolate', 'extrapolated', 'outside', 'beyond', 'below', 'above', 'bracket', 'bracketing', 'offscale'] },
  { id: 'g.plateau', terms: ['plateau', 'saturate', 'saturated', 'saturation', 'asymptote', 'top', 'bottom'] },
  { id: 'g.potency', terms: ['ec50', 'ic50', 'potency', 'halfmaximal', 'maximal', 'inflection'] },
  { id: 'g.dose', terms: ['dose', 'doses', 'et', 'ratio', 'effector', 'concentration', 'titration', 'titrate', 'dilution'] },
  { id: 'g.killing', terms: ['lysis', 'killing', 'kill', 'cytotoxicity', 'cytotoxic', 'death', 'viability', 'specific'] },
  { id: 'g.error', terms: ['transcription', 'transcribed', 'typo', 'transposed', 'mistake', 'error', 'misplaced', 'decimal'] },
  { id: 'g.host', terms: ['host', 'species', 'mouse', 'rat', 'human', 'rabbit', 'humanised', 'capture', 'immunoglobulin', 'igg'] },
  { id: 'g.valency', terms: ['valency', 'bivalent', 'monovalent', 'fab', 'whole', 'binding'] },
  { id: 'g.conjugate', terms: ['fluorophore', 'conjugate', 'fp', 'pe', 'quantibrite', 'phycoerythrin'] },
  { id: 'g.interval', terms: ['confidence', 'interval', 'uncertainty', 'precision', 'replicate', 'replicates'] },
  { id: 'g.goodness', terms: ['r2', 'rsquared', 'goodness', 'quality', 'residual', 'residuals', 'scatter', 'deviation', 'departure'] },
  { id: 'g.curvature', terms: ['curvature', 'bend', 'bent', 'straight', 'nonlinear', 'quadratic', 'drift'] },
  { id: 'g.detector', terms: ['detector', 'voltage', 'pmt', 'gain', 'compensation', 'cytometer', 'acquisition', 'settings'] },
  { id: 'g.gating', terms: ['gate', 'gated', 'gating', 'singlet', 'live', 'dead', 'viable', 'debris'] },
  { id: 'g.subtraction', terms: ['subtract', 'subtracted', 'subtraction', 'correct', 'corrected', 'correction'] },
  { id: 'g.flag', terms: ['flag', 'flagged', 'caution', 'warning', 'alert', 'problem', 'wrong', 'invalid', 'bad', 'poor', 'poorly'] },
  { id: 'g.report', terms: ['report', 'reportable', 'publish', 'manuscript', 'figure', 'notebook', 'thesis'] },
  { id: 'g.export', terms: ['export', 'csv', 'svg', 'download', 'save', 'file'] },
  { id: 'g.privacy', terms: ['privacy', 'private', 'browser', 'local', 'locally', 'storage', 'stored', 'transmitted', 'server', 'cloud', 'sent', 'send', 'sends', 'upload', 'uploaded', 'leaves', 'internet', 'network', 'online', 'anywhere', 'anyone'] },
  { id: 'g.construct', terms: ['car', 'construct', 'scfv', 'affinity', 'hinge', 'costimulatory', 'receptor'] },
  { id: 'g.threshold', terms: ['threshold', 'band', 'bands', 'cutoff', 'activation', 'escape'] },
  { id: 'g.cells', terms: ['cell', 'cells', 'tumour', 'tumor', 'sample', 'samples', 'line', 'primary'] },
  { id: 'g.count', terms: ['few', 'fewer', 'more', 'number', 'points', 'levels', 'degrees', 'freedom'] },
  { id: 'g.detection', terms: ['detection', 'detectable', 'limit', 'quantification', 'sensitivity', 'noise'] },
  { id: 'g.compute', terms: ['calculate', 'calculation', 'compute', 'computed', 'formula', 'equation', 'arithmetic', 'derive', 'derived', 'work'] },
  { id: 'g.assay', terms: ['assay', 'readout', 'chromium', 'cr51', 'luciferase', 'luminescence', 'imaging', 'impedance', 'cytometry', 'coculture', 'incubation', 'duration', 'timepoint', 'hours', 'overnight'] },
  { id: 'g.release', terms: ['release', 'spontaneous', 'lysed', 'triton', 'untransduced', 'mock', 'untreated', 'specificity'] },
  { id: 'g.logistic', terms: ['logistic', 'sigmoid', 'sigmoidal', '4pl', 'parameter', 'parameters', 'model', 'shape'] },
  { id: 'g.efficacy', terms: ['emax', 'efficacy', 'efficacious', 'ceiling', 'height'] },
  { id: 'g.modality', terms: ['modality', 'adoptive', 'til', 'nk', 'tcr', 'lymphocyte', 'lymphocytes', 'therapy', 'product', 'infused', 'transduced'] },
  { id: 'g.units', terms: ['unit', 'units', 'log', 'log10', 'decade', 'decades', 'scale', 'percent', 'percentage'] },
] as const

/**
 * Forms that survive tokenising only if they are normalised first.
 *
 * The tokeniser splits on anything that is not alphanumeric, which would turn
 * `R²` into a bare `r` and `E:T` into two single letters of pure noise. These
 * are rewritten before splitting.
 */
export const NORMALISATIONS: readonly (readonly [RegExp, string])[] = [
  [/r\s*(²|\^?2|\bsquared\b)/gi, ' r2 '],
  [/\be\s*[:/]\s*t\b/gi, ' et '],
  [/\bf\s*[:/]\s*p\b/gi, ' fp '],
  [/\bec\s*50\b/gi, ' ec50 '],
  [/\bic\s*50\b/gi, ' ic50 '],
  [/\blog\s*10\b/gi, ' log10 '],
  [/\bhalf[\s-]maximal\b/gi, ' halfmaximal '],
  [/\bnon[\s-]specific\b/gi, ' nonspecific '],
  [/\boff[\s-]scale\b/gi, ' offscale '],
  [/\bco[\s-]?cultures?\b/gi, ' coculture '],
  [/\b4\s*-?\s*pl\b/gi, ' 4pl '],
  [/\bfour[\s-]parameter\b/gi, ' four parameter '],
  [/\b51\s*-?\s*cr\b/gi, ' cr51 '],
  [/\bcr\s*-?\s*51\b/gi, ' cr51 '],
  [/\be[\s-]?max\b/gi, ' emax '],
  [/\bdegrees? of freedom\b/gi, ' degrees freedom '],
] as const

/**
 * Words carrying no retrieval signal.
 *
 * Deliberately short. An aggressive stop list removes terms that matter in this
 * domain: "not" separates "is straight" from "is not straight", and "below"
 * carries the whole meaning of "below the lowest standard".
 *
 * The list also carries ordinary English verbs and quantifiers that are not
 * function words. That is a consequence of corpus size rather than of taste: in
 * twenty-odd short entries, a word appearing once scores nearly the same
 * inverse document frequency as a genuine domain term, so "how long should the
 * killing assay run" matched the passage on fluorescence statistics through
 * "long" and "run" and scored as though it had found an answer. Words are added
 * here only where they carry no meaning in this domain; "high", "low", "time",
 * "change", "number" and "value" all stay, because each of them does.
 *
 * Indefinite pronouns are included for a reason particular to how relevance is
 * gated. A term the corpus does not contain counts as maximally distinctive,
 * on the reasoning that the rarest words carry a question's specificity. That
 * reasoning fails for "anything", which appears in no passage and means
 * nothing: left in, it made "is anything sent to a server" look like a question
 * about a highly specific topic and pushed a well-covered privacy question
 * below the relevance gate.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'anything', 'are', 'as', 'at', 'be', 'but', 'by', 'can',
  'do', 'does', 'everything', 'for', 'from', 'has', 'have', 'how', 'i', 'if',
  'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'should', 'so',
  'something', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'to', 'use', 'used', 'using', 'was', 'were', 'what', 'when',
  'where', 'which', 'why', 'will', 'with', 'would', 'you', 'your',
  // Words that say how the reader is asking rather than what about. These are
  // read as intent from the raw question before this list is applied, so
  // removing them here costs nothing and prevents the opposite failure: as
  // terms the corpus never uses, they counted as the most distinctive thing in
  // the question and pushed "can you explain what a bead kit is" below the
  // relevance gate. "Mean" and "meaning" are deliberately absent, because in
  // this domain a mean is a statistic.
  'define', 'defines', 'describe', 'describes', 'explain', 'explains',
  'purpose', 'tell', 'tells',
  // Generic English, kept out for the corpus-size reason above.
  'also', 'another', 'any', 'both', 'come', 'each', 'get', 'gets', 'give',
  'gives', 'go', 'goes', 'just', 'know', 'like', 'long', 'look', 'looks',
  'looking', 'make', 'makes', 'many', 'much', 'run', 'runs', 'same', 'say',
  'says', 'see', 'seen', 'short', 'still', 'take', 'takes', 'thing', 'things',
  'very', 'want', 'way', 'well',
])

/**
 * Reduce a word to a form its inflections share.
 *
 * Without this, "why do I need beads" misses the passage that says a bead
 * standard is *needed*, which is not a subtle failure: it is the commonest
 * shape of student question missing the entry written to answer it.
 *
 * Deliberately conservative, and not Porter. The rules strip only the
 * inflections that actually appear in questions, and a trailing "e" is removed
 * last so that "titrate" and "titrated" land in the same place, which stripping
 * "ed" alone would not achieve. Precision matters less than consistency here:
 * the same function runs over the corpus, the query and the synonym groups, so
 * an odd-looking stem still matches itself.
 *
 * Tokens containing a digit are left alone, since `ec50`, `r2` and `log10` are
 * names rather than words.
 */
/**
 * Collapse the consonant a suffix doubled, so "fitting" reaches "fit".
 *
 * Without it the two forms land in different places, and "why is my curve not
 * fitting" misses every passage about the fit. Doubled l, s and z are left
 * alone, which is what keeps "called" at call and "passed" at pass.
 */
function undouble(word: string): string {
  const n = word.length
  if (n < 3) return word
  const last = word[n - 1]
  if (last !== word[n - 2] || 'lsz'.includes(last)) return word
  return word.slice(0, -1)
}

export function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token

  let word = token
  if (word.endsWith('ies') && word.length > 4) word = `${word.slice(0, -3)}y`
  else if (word.endsWith('sses')) word = word.slice(0, -2)
  else if (word.endsWith('ing') && word.length > 5) word = undouble(word.slice(0, -3))
  else if (word.endsWith('ed') && word.length > 4) word = undouble(word.slice(0, -2))
  else if (word.endsWith('es') && word.length > 4) word = word.slice(0, -1)
  else if (word.endsWith('s') && !word.endsWith('ss')) word = word.slice(0, -1)

  if (word.endsWith('e') && word.length > 3) word = word.slice(0, -1)

  return word.length >= 3 ? word : token
}

/**
 * Group id for each surface form, built once, in stemmed form.
 *
 * A term may belong to one group only. The map is keyed by stem, so a term
 * listed twice silently leaves the earlier group and joins the later one: it
 * took "potency" out of the potency group and put it in a new one, which broke
 * the link between "EC50" and every passage about potency. A test asserts the
 * groups stay disjoint, because nothing about the failure is visible here.
 */
export const TERM_TO_GROUP: ReadonlyMap<string, string> = new Map(
  SYNONYM_GROUPS.flatMap((group) => group.terms.map((term) => [stem(term), group.id] as const)),
)
