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

export const SYNONYM_GROUPS: readonly SynonymGroup[] = [
  { id: 'g.mfi', terms: ['mfi', 'fluorescence', 'intensity', 'signal', 'brightness', 'bright', 'dim', 'median', 'geometric', 'mean', 'channel'] },
  { id: 'g.control', terms: ['control', 'isotype', 'fmo', 'unstained', 'background', 'blank', 'baseline', 'autofluorescence', 'nonspecific'] },
  { id: 'g.bead', terms: ['bead', 'beads', 'standard', 'standards', 'calibrator', 'population', 'populations', 'vial', 'lot', 'certificate'] },
  { id: 'g.density', terms: ['abc', 'density', 'capacity', 'molecules', 'sites', 'antigen', 'target', 'epitope', 'copies'] },
  { id: 'g.curve', terms: ['curve', 'fit', 'fitted', 'regression', 'line', 'linear', 'calibration', 'slope', 'intercept'] },
  { id: 'g.range', terms: ['range', 'extrapolate', 'extrapolated', 'outside', 'beyond', 'below', 'above', 'bracket', 'bracketing', 'offscale'] },
  { id: 'g.plateau', terms: ['plateau', 'saturate', 'saturated', 'saturation', 'asymptote', 'top', 'bottom', 'levels'] },
  { id: 'g.potency', terms: ['ec50', 'ic50', 'potency', 'halfmaximal', 'maximal', 'inflection'] },
  { id: 'g.dose', terms: ['dose', 'doses', 'et', 'ratio', 'effector', 'concentration', 'titration', 'titrate', 'dilution'] },
  { id: 'g.killing', terms: ['lysis', 'killing', 'kill', 'cytotoxicity', 'cytotoxic', 'death', 'viability', 'specific'] },
  { id: 'g.error', terms: ['transcription', 'transcribed', 'typo', 'transposed', 'mistake', 'wrong', 'error', 'misplaced', 'decimal'] },
  { id: 'g.host', terms: ['host', 'species', 'mouse', 'rat', 'human', 'rabbit', 'humanised', 'capture', 'immunoglobulin', 'igg'] },
  { id: 'g.valency', terms: ['valency', 'bivalent', 'monovalent', 'fab', 'scfv', 'whole', 'binding'] },
  { id: 'g.conjugate', terms: ['fluorophore', 'conjugate', 'fp', 'pe', 'quantibrite', 'phycoerythrin'] },
  { id: 'g.interval', terms: ['confidence', 'interval', 'uncertainty', 'precision', 'replicate', 'replicates'] },
  { id: 'g.goodness', terms: ['r2', 'rsquared', 'goodness', 'quality', 'residual', 'residuals', 'scatter', 'deviation', 'departure'] },
  { id: 'g.curvature', terms: ['curved', 'curvature', 'bend', 'bent', 'straight', 'nonlinear', 'quadratic', 'drift'] },
  { id: 'g.detector', terms: ['detector', 'voltage', 'pmt', 'gain', 'compensation', 'cytometer', 'acquisition', 'settings'] },
  { id: 'g.gating', terms: ['gate', 'gated', 'gating', 'singlet', 'live', 'dead', 'viable', 'debris'] },
  { id: 'g.subtraction', terms: ['subtract', 'subtracted', 'subtraction', 'correct', 'corrected', 'correction'] },
  { id: 'g.flag', terms: ['flag', 'flagged', 'caution', 'warning', 'alert', 'problem', 'wrong', 'invalid'] },
  { id: 'g.report', terms: ['report', 'reportable', 'publish', 'manuscript', 'figure', 'notebook', 'thesis'] },
  { id: 'g.export', terms: ['export', 'csv', 'svg', 'download', 'save', 'file'] },
  { id: 'g.privacy', terms: ['privacy', 'private', 'browser', 'local', 'locally', 'storage', 'stored', 'transmitted', 'server', 'cloud', 'sent', 'send', 'sends', 'upload', 'uploaded', 'leaves', 'internet', 'network', 'online', 'anywhere', 'anyone'] },
  { id: 'g.construct', terms: ['car', 'construct', 'scfv', 'affinity', 'hinge', 'costimulatory', 'receptor'] },
  { id: 'g.threshold', terms: ['threshold', 'band', 'bands', 'cutoff', 'activation', 'escape'] },
  { id: 'g.cells', terms: ['cell', 'cells', 'tumour', 'tumor', 'sample', 'samples', 'line', 'primary'] },
  { id: 'g.count', terms: ['few', 'fewer', 'more', 'number', 'points', 'levels', 'degrees', 'freedom'] },
  { id: 'g.detection', terms: ['detection', 'detectable', 'limit', 'quantification', 'sensitivity', 'noise'] },
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
  [/\bdegrees? of freedom\b/gi, ' degrees freedom '],
] as const

/**
 * Words carrying no retrieval signal.
 *
 * Deliberately short. An aggressive stop list removes terms that matter in this
 * domain: "not" separates "is straight" from "is not straight", and "below"
 * carries the whole meaning of "below the lowest standard".
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
  'they', 'this', 'to', 'was', 'were', 'what', 'when', 'where', 'which', 'why',
  'will', 'with', 'would', 'you', 'your',
])

/** Group id for each surface form, built once. */
export const TERM_TO_GROUP: ReadonlyMap<string, string> = new Map(
  SYNONYM_GROUPS.flatMap((group) => group.terms.map((term) => [term, group.id] as const)),
)
