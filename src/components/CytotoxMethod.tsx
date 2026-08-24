import { PrivacyPanel } from './shared/PrivacyPanel'

interface Props {
  storageKeys: string[]
  onClearStorage: () => void
}

export function CytotoxMethod({ storageKeys, onClearStorage }: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="titles"><h2>Method and limitations</h2></div>
      </div>
      <div className="panel-body prose">
        <h3>Computation</h3>
        <p>
          Each construct is fitted independently with a four parameter logistic on a log
          <sub>10</sub> dose axis, in the parameterisation used by the standard variable-slope fit:
        </p>
        <pre>response = bottom + (top − bottom) / (1 + 10^((logEC50 − logDose) · hill))</pre>
        <p>
          Fitting is by Levenberg-Marquardt with an analytic Jacobian, from starting estimates
          derived from the data rather than from fixed constants. The procedure is deterministic:
          fixed iteration caps, no random restarts, and identical inputs yield identical outputs.
        </p>

        <h3>Interpretation of the potency figure</h3>
        <p>
          The reported dose is where the response sits midway between the fitted plateaus. It is
          called an EC50 where the response rises with dose and an IC50 where it falls.
        </p>
        <p>
          It is a property of the fitted curve rather than a measured point, so it is only
          meaningful where the data bracket the transition and reach both plateaus. The confidence
          interval is symmetric in log space, which is where the fit lives, and therefore asymmetric
          in the dose units shown.
        </p>

        <h3>Limitations</h3>
        <ul>
          <li>
            <strong>The model assumes a single saturating transition.</strong> A response that rises
            then falls is not described by this equation, and a good R² will not tell you so.
          </li>
          <li>
            <strong>An unreached plateau makes the potency model-dependent.</strong> The fit still
            converges and R² can still look excellent, because the curve passes through the points
            perfectly well. The flagged problem is an unsupported parameter, not a poor fit.
          </li>
          <li>
            <strong>Comparing constructs is only fair within one assay.</strong> Target line,
            effector donor and incubation time all move potency, so figures from different runs are
            not directly comparable.
          </li>
        </ul>

        <PrivacyPanel storageKeys={storageKeys} onClearStorage={onClearStorage} />
      </div>
    </section>
  )
}
