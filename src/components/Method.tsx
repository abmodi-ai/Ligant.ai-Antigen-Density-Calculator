export function Method() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="titles"><h2>Method &amp; limitations</h2></div>
      </div>
      <div className="panel-body prose">
        <h3>How the number is produced</h3>
        <p>
          Bead standards are fitted by ordinary least squares in log<sub>10</sub>–log<sub>10</sub>{' '}
          space, and your sample&rsquo;s MFI is mapped through that fit:
        </p>
        <pre>log₁₀(assigned value) = slope · log₁₀(MFI) + intercept</pre>
        <p>
          Nothing else happens. There is no model, no imputation, and no language model anywhere
          in the calculation — the same inputs always give the same answer.
        </p>

        <h3>What the confidence interval covers</h3>
        <p>
          It is the interval on the fitted mean response at your sample&rsquo;s MFI: the uncertainty
          in <em>where the calibration curve sits</em>. It deliberately excludes measurement
          variability in the sample itself, which would need replicates. Reporting that here would
          overstate precision.
        </p>

        <h3>What this does not tell you</h3>
        <ul>
          <li>
            <strong>ABC is not antigen copy number.</strong> Epitope accessibility, binding valency,
            conjugate performance, and antigen internalisation all sit between the two.
          </li>
          <li>
            <strong>Beads and cells must be acquired identically.</strong> Same instrument settings,
            same session. A voltage change between runs invalidates the curve.
          </li>
          <li>
            <strong>Density bands are reading aids, not cutoffs.</strong> A CAR&rsquo;s activation
            threshold depends on the construct and on which effector function you are asking for.
          </li>
        </ul>

        <h3>Your data</h3>
        <p>
          Everything runs locally in your browser. Nothing is uploaded, there are no accounts, and
          your entries are kept only in this browser&rsquo;s local storage so a refresh
          doesn&rsquo;t lose your work.
        </p>
      </div>
    </section>
  )
}
