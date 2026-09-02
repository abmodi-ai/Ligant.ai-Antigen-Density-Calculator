import { GuidancePin } from '../guidance/GuidancePin'

interface Props {
  /** Storage keys this tool writes, listed to the reader verbatim. */
  storageKeys: string[]
  onClearStorage: () => void
}

/**
 * The privacy disclosure, rendered identically by every tool.
 *
 * Shared rather than duplicated because privacy is the product's central claim.
 * Two copies would drift, and a tool that quietly lacked this section would
 * undercut the claim everywhere else.
 */
export function PrivacyPanel({ storageKeys, onClearStorage }: Props) {
  return (
    <>
      <h3>
        Privacy
        <GuidancePin anchor="shared.privacy" />
      </h3>
      <p>
        All computation is performed locally in this browser. Nothing you enter is transmitted, and
        the page contacts <strong>no third party at all</strong>: typefaces are served from this
        site rather than a font network, and there is no analytics script.
      </p>
      <p>
        This is enforced rather than promised. The content security policy permits connections to
        this origin only, and the build fails if any external origin is introduced or if a full
        session in a real browser produces a single request that leaves it.
      </p>
      <p>
        That check is on the build, and the build is what gets published. What no check here can
        see is anything a host inserts into a response afterwards, which is a real failure mode
        rather than a hypothetical one. Whoever deploys this is the only party positioned to check
        for that.
      </p>
      <p>Stored in this browser, and nowhere else:</p>
      <ul>
        {storageKeys.map((key) => (
          <li key={key}>
            <code>{key}</code> holds the values currently on screen, so that a page reload does not
            discard work in progress.
          </li>
        ))}
      </ul>
      <div className="button-row" style={{ marginTop: 12 }}>
        <button onClick={onClearStorage}>Clear stored data</button>
      </div>
    </>
  )
}
