import { PrivacyPanel } from './shared/PrivacyPanel'

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

        <PrivacyPanel storageKeys={storageKeys} onClearStorage={onClearStorage} />
      </div>
    </section>
  )
}
