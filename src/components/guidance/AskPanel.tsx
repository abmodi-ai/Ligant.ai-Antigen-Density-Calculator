import { useId, useState } from 'react'
import type { AnchorId } from '../../lib/guidance/types'
import { NO_MATCH_MESSAGE, type Match } from '../../lib/guidance/retrieval'
import { useGuidance } from './GuidanceProvider'
import { BlockView } from './GuidanceBlocks'

/**
 * Asking a question about the card you are standing on.
 *
 * Every answer here is a passage from the corpus, shown under the title it was
 * written with and labelled with where it came from. Nothing is generated, and
 * the interface is built so that a reader can see that: an answer that does not
 * fit the question announces itself, because its own heading is visible. That
 * is the property a synthesised paragraph would destroy, and it is what makes a
 * near miss survivable in a tool that refuses to be quietly wrong.
 *
 * When nothing clears the relevance gate the panel says so rather than offering
 * the closest thing it has. An honest gap is a better answer than a plausible
 * one, and it doubles as the list of what the corpus still needs.
 */
function Answer({ match, alreadyShown }: { match: Match; alreadyShown: boolean }) {
  // The card's own guidance is already open above this form. Repeating a
  // passage the reader can see costs the height of the whole entry and tells
  // them nothing, so a match that is already on screen becomes a pointer to it.
  if (alreadyShown) {
    return (
      <p className="ask-seen">
        Answered above, under <strong>{match.entry.title}</strong>.
      </p>
    )
  }
  return (
    <div className="ask-answer">
      <h5>
        {match.entry.title}
        {match.scope === 'suite' && (
          <span className="ask-scope">elsewhere in this tool</span>
        )}
      </h5>
      {match.entry.body.map((block, i) => (
        <BlockView block={block} key={i} />
      ))}
    </div>
  )
}

interface Props {
  anchor: AnchorId
  /** Entries the panel is already displaying above this form. */
  shown: readonly string[]
}

export function AskPanel({ anchor, shown }: Props) {
  const { exchanges, ask, forget } = useGuidance()
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const asked = exchanges[anchor] ?? []
  const visible = new Set(shown)

  return (
    <div className="ask">
      {asked.length > 0 && (
        <div className="ask-thread" aria-live="polite">
          {asked.map((exchange) => (
            <div className="ask-exchange" key={exchange.id}>
              <p className="ask-question">{exchange.question}</p>
              {exchange.matches.length === 0 ? (
                <p className="ask-empty">{NO_MATCH_MESSAGE}</p>
              ) : (
                exchange.matches.map((match) => (
                  <Answer
                    match={match}
                    alreadyShown={visible.has(match.entry.id)}
                    key={match.entry.id}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault()
          ask(anchor, draft)
          setDraft('')
        }}
      >
        <label htmlFor={inputId}>Ask about this step</label>
        <div className="ask-row">
          <input
            id={inputId}
            type="text"
            value={draft}
            placeholder="Which control should I use?"
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={draft.trim().length === 0}>
            Ask
          </button>
        </div>
      </form>

      <p className="ask-footnote">
        Answers are passages from this page, matched to your question. Nothing is generated, nothing
        is sent anywhere, and your questions are not stored.
        {asked.length > 0 && (
          <>
            {' '}
            <button type="button" className="ask-forget" onClick={() => forget(anchor)}>
              Clear these questions
            </button>
          </>
        )}
      </p>
    </div>
  )
}
