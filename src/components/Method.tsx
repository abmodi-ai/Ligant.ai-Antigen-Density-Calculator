interface Props {
  /** Storage keys this tool writes, listed to the user verbatim. */
  storageKeys: string[]
  onClearStorage: () => void
}

export function Method({ storageKeys, onClearStorage }: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="titles"><h2>Method and limitations</h2></div>
      </div>
      <div className="panel-body prose">
        <h3>Computation</h3>
        <p>
          Bead standards are fitted by ordinary least squares in log<sub>10</sub>–log<sub>10</sub>{' '}
          space, and the sample MFI is mapped through the resulting fit:
        </p>
        <pre>log₁₀(assigned value) = slope · log₁₀(MFI) + intercept</pre>
        <p>
          No further transformation is applied. The procedure contains no model, no imputation, and
          no language model. Identical inputs yield identical outputs.
        </p>

        <h3>Interpretation of the confidence interval</h3>
        <p>
          The reported interval is the confidence interval on the fitted mean response at the sample
          MFI. It quantifies uncertainty in <em>the position of the calibration curve</em> and
          excludes measurement variability in the sample itself, which requires replicate
          acquisition to estimate. Including it here would overstate precision.
        </p>

        <h3>Limitations</h3>
        <ul>
          <li>
            <strong>ABC is not equivalent to antigen copy number.</strong> Epitope accessibility,
            binding valency, conjugate performance, and antigen internalisation intervene between
            the two quantities.
          </li>
          <li>
            <strong>Beads and cells require identical acquisition conditions.</strong> Detector
            voltages and optical configuration must be unchanged between the two. A voltage
            adjustment between runs invalidates the calibration.
          </li>
          <li>
            <strong>Density bands are interpretive aids, not validated cutoffs.</strong> CAR
            activation thresholds depend on the construct and on the effector function assessed.
          </li>
        </ul>

        <h3>Privacy</h3>
        <p>
          All computation is performed locally in this browser. Nothing you enter is transmitted,
          and the page contacts <strong>no third party at all</strong>: typefaces are served from
          this site rather than a font network, and there is no analytics script.
        </p>
        <p>
          This is enforced rather than promised. The content security policy permits connections to
          this origin only, and the build fails if any external origin is introduced or if a full
          session in a real browser produces a single request that leaves it.
        </p>
        <p>
          Stored in this browser, and nowhere else:
        </p>
        <ul>
          {storageKeys.map((key) => (
            <li key={key}>
              <code>{key}</code> holds the calibration standards, samples, and analysis settings
              currently on screen, so that a page reload does not discard work in progress.
            </li>
          ))}
        </ul>
        <div className="button-row" style={{ marginTop: 12 }}>
          <button onClick={onClearStorage}>Clear stored data</button>
        </div>
      </div>
    </section>
  )
}
