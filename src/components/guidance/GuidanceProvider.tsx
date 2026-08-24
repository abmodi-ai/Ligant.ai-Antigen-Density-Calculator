import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GuidanceEntry, ToolContext } from '../../lib/guidance/types'

const STORAGE_KEY = 'ligant.guidance.v1'

interface GuidanceValue {
  enabled: boolean
  setEnabled: (on: boolean) => void
  /** True until the reader has made a choice, so the offer can be shown once. */
  undecided: boolean
  corpus: readonly GuidanceEntry[]
  context: ToolContext
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
    () => ({ enabled: stored === true, setEnabled, undecided: stored === null, corpus, context }),
    [stored, setEnabled, corpus, context],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGuidance(): GuidanceValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useGuidance must be used inside a GuidanceProvider')
  return value
}
