import { PrivacyPanel } from './shared/PrivacyPanel'

interface Props {
  /** Storage keys this tool writes, listed to the user verbatim. */
  storageKeys: string[]
  onClearStorage: () => void
}

export function Method({ storageKeys, onClearStorage }: Props) {
  return (
    <section className="panel method-panel">
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
            voltages and optical configuration must be unchanged between the two. If the bead and
            cell acquisitions were not part of the same session under the same settings, the
            calibration does not apply, and <em>no output of this tool will indicate that</em>. The
            numbers will look entirely ordinary.
          </li>
          <li>
            <strong>Sub-saturating antibody undercounts, in one direction.</strong> Unless the
            detection antibody was titrated to saturation on beads and on cells, every reported ABC
            is a lower bound. This is the commonest way the measurement goes wrong at the bench, and
            nothing in the numbers reveals it.
          </li>
          <li>
            <strong>MFI must come from a live, singlet-gated population.</strong> Dead and dying
            cells bind antibody non-specifically and inflate the stained and control channels alike.
            Subtraction does not remove it.
          </li>
          <li>
            <strong>Capture beads bind one host's immunoglobulin.</strong> Anti-immunoglobulin
            capture reagents cross-react across related hosts to an uncertified degree, so a
            mismatched detection antibody can still produce an ordered, well-fitting curve while the
            beads bind a fraction of what their assigned values assume. The declared host species is
            compared against the kit for this reason.
          </li>
          <li>
            <strong>Density bands are interpretive aids, not validated cutoffs.</strong> CAR
            activation thresholds depend on the construct and on the effector function assessed.
          </li>
        </ul>

        <h3>Sources for the density bands</h3>
        <p>
          The band boundaries and their interpretive notes are drawn from the published work on
          antigen density thresholds for CAR activation. They are order-of-magnitude summaries of
          that literature rather than values reported by any single study.
        </p>
        <ul>
          <li>
            Majzner RG, et al. Tuning the antigen density requirement for CAR T-cell activity.{' '}
            <em>Cancer Discovery</em>, 2020.
          </li>
          <li>
            Walker AJ, et al. Tumor antigen and receptor densities regulate efficacy of a chimeric
            antigen receptor targeting anaplastic lymphoma kinase. <em>Molecular Therapy</em>, 2017.
          </li>
          <li>
            Watanabe K, et al. Target antigen density governs the efficacy of anti-CD20 CAR-modified
            effector CD8+ T cells. <em>Journal of Immunology</em>, 2015.
          </li>
        </ul>
        <p className="hint">
          References are listed as text rather than as links. Every byte of this page is served from
          this origin, and a link that navigates to a publisher would disclose a visit that the rest
          of the tool is built to prevent.
        </p>

        <PrivacyPanel storageKeys={storageKeys} onClearStorage={onClearStorage} />
      </div>
    </section>
  )
}
