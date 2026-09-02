import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AnchorId, GuidanceEntry, ToolContext } from '../../lib/guidance/types'
import { buildIndex, search, type Match } from '../../lib/guidance/retrieval'

/**
 * A preference this component used to write, and now only clears.
 *
 * Guidance was opt in behind a switch in the masthead. It is always on, so
 * there is no preference to keep, and the key is removed from anyone who still
 * carries it. It was also the one key the privacy disclosure never listed,
 * which the disclosure now cannot be wrong about: there is nothing here to
 * list.
 */
const RETIRED_PREFERENCE_KEY = 'ligant.guidance.v1'

/** One question and the passages retrieval returned for it. */
export interface Exchange {
  id: string
  question: string
  /** Empty where nothing cleared the relevance gate. */
  matches: Match[]
}

interface GuidanceValue {
  corpus: readonly GuidanceEntry[]
  context: ToolContext
  /** Questions asked at each card, in the order they were asked. */
  exchanges: Readonly<Record<AnchorId, Exchange[]>>
  ask: (anchor: AnchorId, question: string) => void
  forget: (anchor: AnchorId) => void
}

const Ctx = createContext<GuidanceValue | null>(null)

interface Props {
  corpus: readonly GuidanceEntry[]
  context: ToolContext
  children: ReactNode
}

/**
 * Holds the corpus and the current tool snapshot.
 *
 * Guidance is always available. It was behind a switch, defaulted off, on the
 * reasoning that a working scientist should not have to dismiss anything. What
 * the switch actually did was hide the explanations from every reader who did
 * not already know they wanted them, which is the reader they were written for.
 * A pin costs 16 pixels beside a label and answers nothing until it is asked.
 */
export function GuidanceProvider({ corpus, context, children }: Props) {
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

  // Nothing writes this any more, so a reader who once used the switch would
  // otherwise keep a key no part of the interface accounts for.
  useEffect(() => {
    try {
      localStorage.removeItem(RETIRED_PREFERENCE_KEY)
    } catch {
      // Storage unavailable. Nothing was written in the first place.
    }
  }, [])

  const value = useMemo<GuidanceValue>(
    () => ({
      corpus,
      context,
      exchanges,
      ask,
      forget,
    }),
    [corpus, context, exchanges, ask, forget],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGuidance(): GuidanceValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useGuidance must be used inside a GuidanceProvider')
  return value
}
