import { DENSITY_BANDS, bandFor, formatNumber, type Flag, type Sample, type SampleResult } from '../lib/quantify'

const BAND_COLOR: Record<string, string> = {
  subthreshold: 'var(--text-muted)',
  low: 'var(--warning)',
  intermediate: 'var(--good)',
  high: 'var(--series-2)',
}

function FlagIcon({ level }: { level: Flag['level'] }) {
  const color = level === 'critical' ? 'var(--critical)' : 'var(--warning)'
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5 15 14H1L8 1.5Z" fill={color} />
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
        <div key={i} className={`flag ${f.level}`} role={f.level === 'critical' ? 'alert' : undefined}>
          <FlagIcon level={f.level} />
          <span>
            <strong>{f.level === 'critical' ? 'Check this: ' : 'Note: '}</strong>
            {f.message}
          </span>
        </div>
      ))}
    </>
  )
}

interface Props {
  entries: { sample: Sample; result: SampleResult }[]
  valency: 'monovalent' | 'bivalent'
}

export function Results({ entries, valency }: Props) {
  const quantified = entries.filter((e) => e.result.netAbc !== null)

  if (entries.length === 0) {
    return <div className="empty">Add a sample MFI to see its antigen density.</div>
  }

  return (
    <div>
      {entries.map(({ sample, result }) => {
        const band = result.netAbc !== null ? bandFor(result.netAbc) : null
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

            {result.netAbc === null ? (
              <p className="hint">Not quantifiable — see below.</p>
            ) : (
              <>
                <div className="hero">
                  <span className="value">{formatNumber(result.netAbc)}</span>
                  <span className="unit">molecules / cell</span>
                </div>
                <div className="ci">
                  95% CI {formatNumber(result.lower as number)} – {formatNumber(result.upper as number)}
                  <span className="hint"> (standard-curve fit)</span>
                </div>

                <dl className="detail-grid">
                  <dt>Antigen sites</dt>
                  <dd>
                    {valency === 'bivalent'
                      ? `${formatNumber(result.sitesLow as number)} – ${formatNumber(result.sitesHigh as number)}`
                      : formatNumber(result.sitesLow as number)}
                    <span className="hint">
                      {valency === 'bivalent' ? ' (bivalent IgG binding)' : ' (1:1 binding)'}
                    </span>
                  </dd>
                  {result.controlAbc !== null && (
                    <>
                      <dt>Gross</dt>
                      <dd>{formatNumber(result.grossAbc as number)}</dd>
                      <dt>Background</dt>
                      <dd>{formatNumber(result.controlAbc)}</dd>
                    </>
                  )}
                  {band && (
                    <>
                      <dt>Reading</dt>
                      <dd>{band.note}</dd>
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
          <summary>How to read the density bands</summary>
          <div>
            <p className="hint">
              These are order-of-magnitude reading aids drawn from the published density-threshold
              literature, <strong>not validated cutoffs</strong>. A CAR's real activation threshold is a
              property of the specific construct — scFv affinity, hinge, costimulatory domain — and of the
              effector function in question: cytotoxicity is triggered at lower antigen density than
              cytokine release and proliferation. Establish the threshold for your own construct.
            </p>
            <table style={{ marginTop: 4 }}>
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
        </details>
      )}
    </div>
  )
}
