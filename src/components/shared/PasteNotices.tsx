/**
 * What the tool assumed about a pasted block, shown where it was pasted.
 *
 * A paste can be read in more than one way, and the reader is the only one who
 * knows which was meant. Anything that changed what they entered, or that the
 * tool suspects but will not act on, is stated here rather than left to be
 * discovered in a result. Dismissible, because it describes an event rather
 * than a condition: once read, it has done its work.
 */
export function PasteNotices({
  notices,
  onDismiss,
}: {
  notices: readonly string[]
  onDismiss: () => void
}) {
  if (notices.length === 0) return null
  return (
    <div className="paste-notice" role="status">
      <div>
        {notices.map((notice, i) => (
          <p key={i}>{notice}</p>
        ))}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss paste notes">
        ✕
      </button>
    </div>
  )
}
