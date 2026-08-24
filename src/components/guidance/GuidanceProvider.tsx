import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AnchorId, GuidanceEntry, ToolContext } from '../../lib/guidance/types'
import { buildIndex, search, type Match } from '../../lib/guidance/retrieval'

const STORAGE_KEY = 'ligant.guidance.v1'

/** One question and the passages retrieval returned for it. */
export interface Exchange {
  id: string
  question: string
  /** Empty where nothing cleared the relevance gate. */
  matches: Match[]
}

interface GuidanceValue {
  enabled: boolean
  setEnabled: (on: boolean) => void
  /** True until the reader has made a choice, so the offer can be shown once. */
  undecided: boolean
  corpus: readonly GuidanceEntry[]
  context: ToolContext
  /** Questions asked at each card, in the order they were asked. */
  exchanges: Readonly<Record<AnchorId, Exchange[]>>
  ask: (anchor: AnchorId, question: string) => void
  forget: (anchor: AnchorId) => void
}

const Ctx = createContext<GuidanceValue | null>(null)

function loadPreference(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'on') return true
    if (raw === 'off') return false
  } catch {
    // Storage unavailable. Guidance still works, it just will not be remembered.
  }
  return null
}

interface Props {
  corpus: readonly GuidanceEntry[]
  context: ToolContext
  children: ReactNode
}

/**
 * Holds the guidance preference and the current tool snapshot.
 *
 * The preference is shared across every tool in the suite, so a reader turns it
 * on once. It is off by default: a working scientist should not have to dismiss
 * anything, and the offer to turn it on is made once, quietly, in the masthead.
 */
export function GuidanceProvider({ corpus, context, children }: Props) {
  const [stored, setStored] = useState<boolean | null>(loadPreference)

  // Questions live in memory for the session and are never written to storage.
  // A question can carry as much of a reader's work as the data does ("why is
  // my donor 4 keratinocyte sample below detection"), and the tool discloses
  // every key it writes. The cheapest way to keep that disclosure short is to
  // have nothing to disclose.
  const [exchanges, setExchanges] = useState<Record<AnchorId, Exchange[]>>({})
  const sequence = useRef(0)

  const index = useMemo(() => buildIndex(corpus), [corpus])

  const ask = useCallback(
    (anchor: AnchorId, question: string) => {
      const trimmed = question.trim()
      if (trimmed.length === 0) return
      const matches = search(index, trimmed, { context, anchor })
      sequence.current += 1
      const entry: Exchange = { id: `ask-${sequence.current}`, question: trimmed, matches }
      setExchanges((current) => ({ ...current, [anchor]: [...(current[anchor] ?? []), entry] }))
    },
    [index, context],
  )

  const forget = useCallback((anchor: AnchorId) => {
    setExchanges((current) => {
      const next = { ...current }
      delete next[anchor]
      return next
    })
  }, [])

  const setEnabled = useCallback((on: boolean) => {
    setStored(on)
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
    } catch {
      // Applies for this session regardless.
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.guidance = stored === true ? 'on' : 'off'
  }, [stored])

  const value = useMemo<GuidanceValue>(
    () => ({
      enabled: stored === true,
      setEnabled,
      undecided: stored === null,
      corpus,
      context,
      exchanges,
      ask,
      forget,
    }),
    [stored, setEnabled, corpus, context, exchanges, ask, forget],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGuidance(): GuidanceValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useGuidance must be used inside a GuidanceProvider')
  return value
}
