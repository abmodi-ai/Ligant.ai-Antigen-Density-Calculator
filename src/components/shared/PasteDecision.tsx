/**
 * Rows a paste covered fewer of than the table already held.
 *
 * Pasting a four population standard over a six population one overwrote the
 * first four and left the last two holding values from the previous standard,
 * still ticked and still in the fit. The result was one calibration built from
 * two unrelated datasets. Downstream the ratio consistency check named the two
 * rows, so no bad number was reported, but re-pasting a corrected standard over
 * an earlier one is an ordinary thing to do and the contamination was silent at
 * the moment it happened. The same paste over the samples table is worse: a
 * stale sample is quantified and reported like any other, and nothing catches
 * it at all.
 *
 * Neither outcome is chosen here. Clearing the rows would discard values the
 * reader typed, and keeping them silently is the defect. So both are offered
 * and the reader decides, which is what the amber rule means everywhere else in
 * this interface.
 *
 * No dismiss control, unlike the paste notices this sits beside. Those describe
 * an event that has finished; this describes a condition that is still true,
 * and an X would put the table back exactly where it started.
 */
export function PasteDecision({
  message,
  onRemove,
  onKeep,
}: {
  message: string
  onRemove: () => void
  onKeep: () => void
}) {
  return (
    <div className="paste-notice paste-decision" role="alert">
      <div>
        <p>{message}</p>
        {/*
          "Remove them" rather than "Remove Populations 5 and 6", which is what
          this said first. Every row already carries a delete control labelled
          "Remove Population 5", so the specific wording put a seventh control
          into that namespace whose name is a prefix of six others: a reader
          moving between them by name has no way to tell which is which, and a
          test asking for the button by name matched all seven. The sentence
          above names the rows, so the buttons only have to name the choice.
        */}
        <div className="paste-decision-actions">
          <button type="button" onClick={onRemove}>
            Remove them
          </button>
          <button type="button" className="ghost" onClick={onKeep}>
            Keep them
          </button>
        </div>
      </div>
    </div>
  )
}

/** "Populations 5 and 6", or "Population 5", from the rows themselves. */
export function nameList(names: readonly string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
