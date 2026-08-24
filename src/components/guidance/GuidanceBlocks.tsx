import type { Block } from '../../lib/guidance/types'

/**
 * Renders *emphasis* without letting the corpus hold markup.
 *
 * The corpus is plain text data so that a retrieval layer can index it, which
 * means emphasis travels as a marker and is turned into an element here, at
 * display time, rather than being stored as one.
 */
export function withEmphasis(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <strong key={i}>{part.slice(1, -1)}</strong>
    ) : (
      part
    ),
  )
}

export function BlockView({ block }: { block: Block }) {
  if (block.kind === 'list') {
    return (
      <ul>
        {block.items.map((item, i) => (
          <li key={i}>{withEmphasis(item)}</li>
        ))}
      </ul>
    )
  }
  if (block.kind === 'note') return <p className="guidance-note">{withEmphasis(block.text)}</p>
  return <p>{withEmphasis(block.text)}</p>
}
