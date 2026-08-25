import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { entriesFor, type AnchorId } from '../../lib/guidance/types'
import { useGuidance } from './GuidanceProvider'
import { BlockView } from './GuidanceBlocks'
import { AskPanel } from './AskPanel'

/** Distance from the pin, and the minimum gap kept from any viewport edge. */
const OFFSET = 7
const MARGIN = 12

/**
 * A question mark beside a control, which opens an explanation.
 *
 * The panel is rendered through a portal rather than as a child of the pin.
 * Every control sits inside a `.panel`, which clips its overflow to keep its
 * rounded corners, so an absolutely positioned child was cut off wherever it
 * extended past that box. Escaping to the document and positioning against the
 * viewport is the only arrangement that cannot be clipped by an ancestor.
 *
 * Renders nothing at all when nothing in the corpus applies to this anchor
 * under the current state, so a pin is never a dead end.
 */
export function GuidancePin({ anchor, label }: { anchor: AnchorId; label?: string }) {
  const { corpus, context, exchanges } = useGuidance()
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // Measured before paint, so the panel never appears in the wrong place first.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    const place = () => {
      const pin = buttonRef.current?.getBoundingClientRect()
      const panel = panelRef.current?.getBoundingClientRect()
      if (!pin || !panel) return

      let left = pin.left
      if (left + panel.width > window.innerWidth - MARGIN) {
        left = window.innerWidth - panel.width - MARGIN
      }
      left = Math.max(MARGIN, left)

      // Prefer below the pin; flip above when there is no room.
      let top = pin.bottom + OFFSET
      if (top + panel.height > window.innerHeight - MARGIN) {
        const above = pin.top - panel.height - OFFSET
        top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - panel.height - MARGIN)
      }
      setPlacement({ top, left })
    }

    place()
    // Capture phase, so scrolling any container repositions the panel too.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
    // An answer changes the panel's height, so placement is recomputed with it.
    // Without this a panel that opened downwards can grow off the bottom of the
    // viewport as the thread fills.
  }, [open, exchanges[anchor]?.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])


  const entries = entriesFor(corpus, anchor, context)
  if (entries.length === 0) return null

  const title = label ?? entries[0].title

  return (
    <span className="guidance-pin">
      <button
        ref={buttonRef}
        type="button"
        className="guidance-pin-button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Guidance: ${title}`}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-label={`Guidance: ${title}`}
            className="guidance-panel"
            style={{
              top: placement?.top ?? 0,
              left: placement?.left ?? 0,
              // Hidden for the single frame before it has been measured.
              visibility: placement ? 'visible' : 'hidden',
            }}
          >
            {entries.map((entry) => (
              <div className="guidance-entry" key={entry.id}>
                <h4>{entry.title}</h4>
                {entry.body.map((block, i) => (
                  <BlockView block={block} key={i} />
                ))}
              </div>
            ))}
            <AskPanel anchor={anchor} shown={entries.map((e) => e.id)} />
          </div>,
          document.body,
        )}
    </span>
  )
}
