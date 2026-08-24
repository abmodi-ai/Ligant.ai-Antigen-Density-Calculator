import { useEffect, useId, useRef, useState } from 'react'
import { entriesFor, type AnchorId, type Block } from '../../lib/guidance/types'
import { useGuidance } from './GuidanceProvider'

/** Renders *emphasis* without letting the corpus hold markup. */
function withEmphasis(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <strong key={i}>{part.slice(1, -1)}</strong>
    ) : (
      part
    ),
  )
}

function BlockView({ block }: { block: Block }) {
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

/**
 * A question mark beside a control, which opens an explanation in place.
 *
 * Renders nothing at all when guidance is off, or when nothing in the corpus
 * applies to this anchor under the current state. An expert therefore never
 * pays for the feature, and a pin is never a dead end.
 */
export function GuidancePin({ anchor, label }: { anchor: AnchorId; label?: string }) {
  const { enabled, corpus, context } = useGuidance()
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  if (!enabled) return null

  const entries = entriesFor(corpus, anchor, context)
  if (entries.length === 0) return null

  const title = label ?? entries[0].title

  return (
    <span className="guidance-pin" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="guidance-pin-button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Guidance: ${title}`}
        onClick={() => {
          // Open toward the centre of the viewport so the panel never runs off.
          const rect = buttonRef.current?.getBoundingClientRect()
          if (rect) setAlignRight(rect.left > window.innerWidth * 0.55)
          setOpen((v) => !v)
        }}
      >
        ?
      </button>

      {open && (
        <span
          id={panelId}
          role="note"
          className={`guidance-panel${alignRight ? ' align-right' : ''}`}
        >
          {entries.map((entry) => (
            <span className="guidance-entry" key={entry.id}>
              <h4>{entry.title}</h4>
              {entry.body.map((block, i) => (
                <BlockView block={block} key={i} />
              ))}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
