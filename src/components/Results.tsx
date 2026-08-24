import {
  DENSITY_BANDS,
  bandFor,
  calibrationValid,
  confidenceLabel,
  formatNumber,
  type Flag,
  type Sample,
  type SampleResult,
} from '../lib/quantify'

/**
 * Density is a magnitude, not a verdict. The ramp is deliberately achromatic so
 * no band reads as "good" or "bad" (brand §04: green is not good, red is not
 * bad news; §06.03: epistemic neutrality in the visual language).
 */
const BAND_COLOR: Record<string, string> = {
  subthreshold: 'var(--magnitude-1)',
  low: 'var(--magnitude-2)',
  intermediate: 'var(--magnitude-3)',
  high: 'var(--magnitude-4)',
}

function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5 15 14H1L8 1.5Z" fill="var(--brand-amber)" />
      <path d="M8 6v3.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.9" fill="#fff" />
    </svg>
  )
}

export function FlagList({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null
  return (
    <>
      {flags.map((f, i) => (
        <div key={i} className="flag" role={f.level === 'critical' ? 'alert' : undefined}>
          <FlagIcon />
          <span>
            <strong>{f.level === 'critical' ? 'Caution: ' : 'Note: '}</strong>
            {f.message}
            {f.remedy && <span className="flag-remedy">{f.remedy}</span>}
          </span>
        </div>
      ))}
    </>
  )
}

/** Background as a share of gross, the diagnostic that decides how much the
 *  extrapolated control matters. Shown on every card, not only when flagged. */
function backgroundShare(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction < 0.1 ? 1 : 0)}% of gross`
}

interface Props {
  entries: { sample: Sample; result: SampleResult }[]
  valency: 'monovalent' | 'bivalent'
  confidenceLevel: number
  /** Whether the user attested the stain was titrated to saturation. */
  saturationConfirmed: boolean
}

export function Results({ entries, valency, confidenceLevel, saturationConfirmed }: Props) {
  const quantified = entries.filter((e) => e.result.netAbc !== null)

  if (entries.length === 0) {
    return <div className="empty">Enter a sample MFI to compute antigen density.</div>
  }

  return (
    <div>
      {!saturationConfirmed && quantified.length > 0 && (
        <p className="hint" style={{ marginBottom: 10 }}>
          <strong>Stain titration: not declared.</strong> Every value below is therefore reported as
          a lower bound, since sub-saturating antibody undercounts and does so in one direction
          only. Record it under Analysis settings once the antibody has been titrated to saturation
          on the beads and on the cells.
        </p>
      )}
      {entries.map(({ sample, result }) => {
        // A band and an interpretation are verdicts. An invalid calibration
        // cannot support one, so neither is shown, and the reason is stated
        // above the figure rather than beside a chart in another panel.
        const valid = calibrationValid(result)
        const band = result.netAbc !== null && valid ? bandFor(result.netAbc) : null
        return (
          <div className="result-card" key={sample.id}>
            <div className="result-name">
              <span>{sample.label || 'Unnamed sample'}</span>
              {band && (
                <span className="band-chip">
                  <span className="band-dot" style={{ background: BAND_COLOR[band.id] }} />
                  {band.label}
                </span>
              )}
            </div>

            <FlagList flags={result.calibrationFlags} />

            {result.netAbc === null ? (
              <>
                <div className="hero">
                  <span className="value below-detection">Below detection</span>
                </div>
                <p className="hint">
                  Signal is not distinguishable from background under this staining condition. No
                  density is reported, because the arithmetic would produce one that the measurement
                  does not support.
                </p>
              </>
            ) : (
              <>
                <div className="hero">
                  <span className="value">{formatNumber(result.netAbc)}</span>
                  <span className="unit">ABC</span>
                </div>
                <p className="hint" style={{ marginTop: -2 }}>
                  Antibody binding capacity: antibody molecules bound per cell.
                </p>
                <div className="ci">
                  {confidenceLabel(confidenceLevel)} {formatNumber(result.lower as number)} –{' '}
                  {formatNumber(result.upper as number)}
                  <span className="hint"> (from standard curve fit)</span>
                </div>

                <dl className="detail-grid">
                  <dt>Inferred antigen sites</dt>
                  <dd>
                    {valency === 'bivalent'
                      ? `${formatNumber(result.sitesLow as number)} – ${formatNumber(result.sitesHigh as number)}`
                      : formatNumber(result.sitesLow as number)}
                    <span className="hint" style={{ fontFamily: 'var(--font)' }}>
                      {valency === 'bivalent'
                        ? ' derived from ABC assuming bivalent IgG binding; not measured'
                        : ' derived from ABC assuming 1:1 binding; not measured'}
                    </span>
                  </dd>
                  {result.controlAbc !== null && (
                    <>
                      <dt>Gross density</dt>
                      <dd>{formatNumber(result.grossAbc as number)}</dd>
                      <dt>Background density</dt>
                      <dd>
                        {formatNumber(result.controlAbc)}
                        {result.backgroundFraction !== null && (
                          <span className="hint" style={{ fontFamily: 'var(--font)' }}>
                            {' ('}
                            {backgroundShare(result.backgroundFraction)}
                            {result.controlInRange === false && ', extrapolated below the standard'}
                            {')'}
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                  {band && (
                    <>
                      <dt>Interpretation</dt>
                      <dd className="prose-dd">{band.note}</dd>
                    </>
                  )}
                </dl>
              </>
            )}

            <FlagList flags={result.flags} />
          </div>
        )
      })}

      {quantified.length > 0 && (
        <details className="options" style={{ marginTop: 14 }}>
          <summary>Interpretation of density bands</summary>
          <div>
            <p className="hint">
              These are order-of-magnitude reading aids drawn from the published density-threshold
              literature, <strong>not validated cutoffs</strong>. A CAR's real activation threshold is a
              property of the specific construct (scFv affinity, hinge, costimulatory domain) and of
              the effector function under consideration. Cytotoxicity is triggered at lower antigen
              density than cytokine release or proliferation. Determine the threshold empirically for
              the construct in use.
            </p>
            <div className="table-scroll">
            <table style={{ marginTop: 4 }}>
              <caption>Density bands and their interpretation</caption>
              <tbody>
                {DENSITY_BANDS.map((b) => (
                  <tr key={b.id}>
                    <td style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}>
                      <span className="band-chip">
                        <span className="band-dot" style={{ background: BAND_COLOR[b.id] }} />
                        {b.label}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {b.max === Infinity
                        ? `> ${b.min.toLocaleString('en-US')}`
                        : `${b.min.toLocaleString('en-US')} – ${b.max.toLocaleString('en-US')}`}
                    </td>
                    <td className="hint" style={{ padding: '6px 8px' }}>{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </details>
      )}
    </div>
  )
}
