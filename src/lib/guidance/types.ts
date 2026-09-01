/**
 * The guidance contract, shared by every bench tool.
 *
 * Two decisions here matter beyond this feature.
 *
 * Content is plain text data, not JSX. A later retrieval layer needs to embed
 * this corpus, and it cannot embed a React tree. `plainText` below is what such
 * a layer would index.
 *
 * State reaches guidance as a typed snapshot, never a DOM scrape. Each tool
 * publishes a small set of named facts, and an entry may declare itself relevant
 * only under certain values of them. That keeps the surface auditable, keeps the
 * payload tiny, and is the same object a conversational layer would read.
 */

import type { Flag } from '../flags'

/** Stable identifier for a place in the interface, e.g. `ad.mfi`. */
export type AnchorId = string

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; text: string }

/**
 * What kind of question an entry answers.
 *
 * A student arriving at a control asks what it is and why it is there; someone
 * who already knows asks which option to pick. Those are different entries, and
 * a question phrased one way should not be answered with the other. Marking the
 * kind is what lets retrieval tell them apart.
 */
export type EntryKind = 'definition' | 'practice'

export interface GuidanceEntry {
  id: string
  anchor: AnchorId
  title: string
  /** Defaults to 'practice', which is what most existing entries are. */
  kind?: EntryKind
  body: Block[]
  /**
   * Shown only when the current state satisfies this. Entries without a
   * predicate are always available at their anchor.
   */
  when?: (context: ToolContext) => boolean
  /** Higher sorts first where several entries share an anchor. */
  priority?: number
}

export type FactValue = number | string | boolean | null

export interface ToolContext {
  tool: string
  /** Named facts the tool publishes. See each corpus module for the keys. */
  facts: Readonly<Record<string, FactValue>>
  flags: readonly Flag[]
}

export function numberFact(context: ToolContext, key: string): number | null {
  const v = context.facts[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function boolFact(context: ToolContext, key: string): boolean {
  return context.facts[key] === true
}

/** Entries for an anchor, most relevant first. */
export function entriesFor(
  corpus: readonly GuidanceEntry[],
  anchor: AnchorId,
  context: ToolContext,
): GuidanceEntry[] {
  return corpus
    .filter((e) => e.anchor === anchor && (!e.when || e.when(context)))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

/**
 * Flatten an entry to text. Emphasis markers are stripped, so the result is
 * what a retrieval index would store and what a screen reader would hear.
 */
export function plainText(entry: GuidanceEntry): string {
  const parts = [entry.title]
  for (const block of entry.body) {
    if (block.kind === 'list') parts.push(...block.items)
    else parts.push(block.text)
  }
  return parts.join(' ').replace(/\*/g, '')
}
