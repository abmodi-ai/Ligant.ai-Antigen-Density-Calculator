import { useGuidance } from './GuidanceProvider'

/**
 * The single switch. Shared across every tool, so a reader turns it on once.
 */
export function GuidanceToggle() {
  const { enabled, setEnabled, undecided } = useGuidance()

  return (
    <span className="guidance-toggle">
      {undecided && <span className="guidance-offer">New to this tool?</span>}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={enabled ? 'guidance-switch on' : 'guidance-switch'}
        onClick={() => setEnabled(!enabled)}
      >
        <span className="guidance-switch-track" aria-hidden="true">
          <span className="guidance-switch-thumb" />
        </span>
        Guidance
      </button>
    </span>
  )
}
