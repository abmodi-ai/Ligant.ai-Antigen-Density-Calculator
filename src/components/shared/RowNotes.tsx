import type { Severity } from '../../lib/validate'

export interface RowNote {
  /** The row this is about, named so the reader can find it. */
  row: string
  severity: Severity
  message: string
  remedy?: string
}

/**
 * What is wrong with the rows of a table, in a place that cannot move them.
 *
 * These sentences used to be inserted as an extra row beneath the offending
 * one. That put them next to the value, which is where they belong, and it also
 * reflowed the table: a live pass measured the next row jumping 73 pixels the
 * moment a warning appeared, with the field the reader was about to type into
 * moving out from under the cursor.
 *
 * Deferring the message until the row lost focus fixed neither half. The jump
 * still happened, one blur later, and a reader who typed a value and looked
 * straight at it was told nothing at all, which is how a certified value of 5
 * reached a live QA pass without the range check ever announcing itself.
 *
 * So the message sits below the table, where appearing and disappearing moves
 * nothing a reader is using, and proximity is carried instead by marking the
 * cell it is about and naming the row in the sentence.
 */
export function RowNotes({ notes }: { notes: readonly RowNote[] }) {
  if (notes.length === 0) return null
  return (
    <ul className="row-notes" role="status">
      {notes.map((note, i) => (
        <li key={i} className={note.severity === 'error' ? 'row-note-error' : undefined}>
          <strong>{note.row}</strong> {note.message}
          {note.remedy && <span className="row-note-remedy">{note.remedy}</span>}
        </li>
      ))}
    </ul>
  )
}
