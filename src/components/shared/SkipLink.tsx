/**
 * First focusable element on the page, so a keyboard or screen reader user can
 * jump past the masthead. Hidden until focused.
 */
export function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Skip to content
    </a>
  )
}
