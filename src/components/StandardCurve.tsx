import { useMemo, useState } from 'react'
import { meanResponseInterval } from '../lib/stats'
import { decadeTicks, formatDecade, minorTicks } from '../lib/axis'
import { formatR2 } from '../lib/format'
import { formatNumber, type CurveResult, type SampleResult, type Sample } from '../lib/quantify'

const W = 580
const H = 392
const M = { top: 16, right: 18, bottom: 46, left: 62 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

export interface PlottedSample {
  sample: Sample
  result: SampleResult
}

interface Props {
  curve: CurveResult
  samples: PlottedSample[]
  assignedLabel: string
  confidenceLevel: number
  /** The bead lot, where one was recorded. Empty is the ordinary case. */
  lotId: string
}

interface Hover {
  x: number
  y: number
  title: string
  lines: string[]
}

export function StandardCurve({ curve, samples, assignedLabel, confidenceLevel, lotId }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)

  const geom = useMemo(() => {
    const xs = [...curve.logMfi]
    const ys = [...curve.logAssigned]
    for (const { result, sample } of samples) {
      if (sample.mfi && sample.mfi > 0 && result.netAbc) {
        xs.push(Math.log10(sample.mfi))
        ys.push(Math.log10(result.netAbc))
      }
    }

    const pad = (arr: number[]) => {
      const lo = Math.min(...arr)
      const hi = Math.max(...arr)
      const span = Math.max(hi - lo, 0.5)
      return [lo - span * 0.1, hi + span * 0.1] as const
    }
    const [x0, x1] = pad(xs)
    const [y0, y1] = pad(ys)

    const sx = (v: number) => M.left + ((v - x0) / (x1 - x0)) * PLOT_W
    const sy = (v: number) => M.top + PLOT_H - ((v - y0) / (y1 - y0)) * PLOT_H
    return { x0, x1, y0, y1, sx, sy }
  }, [curve, samples])

  const { x0, x1, sx, sy } = geom

  // Fitted line and confidence band, sampled across the x domain.
  const band = useMemo(() => {
    const N = 96
    const upper: string[] = []
    const lower: string[] = []
    const line: string[] = []
    for (let i = 0; i <= N; i++) {
      const lx = x0 + ((x1 - x0) * i) / N
      const ci = meanResponseInterval(curve.fit, lx, confidenceLevel)
      line.push(`${i === 0 ? 'M' : 'L'}${sx(lx).toFixed(2)},${sy(ci.fitted).toFixed(2)}`)
      upper.push(`${i === 0 ? 'M' : 'L'}${sx(lx).toFixed(2)},${sy(ci.upper).toFixed(2)}`)
      lower.unshift(`L${sx(lx).toFixed(2)},${sy(ci.lower).toFixed(2)}`)
    }
    return { line: line.join(' '), area: `${upper.join(' ')} ${lower.join(' ')} Z` }
  }, [curve, confidenceLevel, x0, x1, sx, sy])

  const xTicks = decadeTicks(x0, x1)
  const yTicks = decadeTicks(geom.y0, geom.y1)
  const xMinor = x1 - x0 <= 3 ? minorTicks(x0, x1) : []
  const yMinor = geom.y1 - geom.y0 <= 3 ? minorTicks(geom.y0, geom.y1) : []

  const plottedSamples = samples.filter(
    ({ sample, result }) => sample.mfi && sample.mfi > 0 && result.netAbc,
  )

  return (
    <>
      <div className="chart-wrap">
        <svg
          className="chart"
          id="standard-curve-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Calibration standard curve on log-log axes with fitted regression, confidence band, and sample positions"
          onMouseLeave={() => setHover(null)}
        >
          {/* minor gridlines */}
          {xMinor.map((t) => (
            <line
              key={`xm${t}`} x1={sx(t)} x2={sx(t)} y1={M.top} y2={M.top + PLOT_H}
              stroke="var(--grid)" strokeWidth={0.5} opacity={0.55}
            />
          ))}
          {yMinor.map((t) => (
            <line
              key={`ym${t}`} x1={M.left} x2={M.left + PLOT_W} y1={sy(t)} y2={sy(t)}
              stroke="var(--grid)" strokeWidth={0.5} opacity={0.55}
            />
          ))}

          {/* major gridlines */}
          {xTicks.map((t) => (
            <line key={`xg${t}`} x1={sx(t)} x2={sx(t)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--grid)" strokeWidth={1} />
          ))}
          {yTicks.map((t) => (
            <line key={`yg${t}`} x1={M.left} x2={M.left + PLOT_W} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
          ))}

          {/* confidence band, then fitted line */}
          <path d={band.area} fill="var(--band-fill)" stroke="none" />
          <path d={band.line} fill="none" stroke="var(--series-evidence)" strokeWidth={2} strokeLinecap="round" />

          {/* axes */}
          <line x1={M.left} x2={M.left + PLOT_W} y1={M.top + PLOT_H} y2={M.top + PLOT_H} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + PLOT_H} stroke="var(--border-strong)" strokeWidth={1} />

          {xTicks.map((t) => (
            <text key={`xt${t}`} x={sx(t)} y={M.top + PLOT_H + 17} textAnchor="middle" fontSize={11} fill="var(--text-muted)" fontFamily="var(--mono)">
              {formatDecade(t)}
            </text>
          ))}
          {yTicks.map((t) => (
            <text key={`yt${t}`} x={M.left - 9} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" fontFamily="var(--mono)">
              {formatDecade(t)}
            </text>
          ))}

          <text x={M.left + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--text-secondary)">
            Median fluorescence intensity
          </text>
          <text
            transform={`translate(14, ${M.top + PLOT_H / 2}) rotate(-90)`}
            textAnchor="middle" fontSize={12} fill="var(--text-secondary)"
          >
            {assignedLabel}
          </text>

          {/*
            The fit, in the figure rather than beside it.

            Slope, R squared and n were HTML below the chart, so an exported SVG
            carried a curve with no statement of how well it fitted. Those two
            numbers are the tool's whole argument that the calibration can be
            trusted, and a standard curve without them is not publication
            usable. They travel with the figure now.
          */}
          <g fontFamily="var(--mono)" fontSize={10.5} fill="var(--text-secondary)">
            {[
              `slope   ${curve.fit.slope.toFixed(3)}`,
              `intercept ${curve.fit.intercept.toFixed(3)}`,
              `R²      ${formatR2(curve.fit.r2)}`,
              `n       ${curve.fit.n}`,
              // Where one was recorded. The figure is what ends up in a
              // manuscript, and a lot identifier that lives only in the CSV is
              // separated from the plot the first time someone drops the image
              // into a document. Truncated rather than allowed to run off the
              // plot area, since it is free text.
              ...(lotId.trim() ? [`lot     ${lotId.trim().slice(0, 24)}`] : []),
            ].map((line, i) => (
              <text key={`fit${i}`} x={M.left + 10} y={M.top + 15 + i * 13}>
                {line}
              </text>
            ))}
          </g>

          {/* bead standards */}
          {curve.logMfi.map((lx, i) => {
            const ly = curve.logAssigned[i]
            return (
              <circle
                key={`bead${i}`}
                cx={sx(lx)} cy={sy(ly)} r={5}
                fill="var(--series-evidence)" stroke="var(--surface)" strokeWidth={2}
                onMouseEnter={() =>
                  setHover({
                    x: sx(lx), y: sy(ly),
                    title: 'Calibration standard',
                    lines: [
                      `MFI  ${formatNumber(10 ** lx)}`,
                      `Assigned  ${formatNumber(10 ** ly)}`,
                    ],
                  })
                }
              />
            )
          })}

          {/* samples: drop line to the x axis, then the marker */}
          {plottedSamples.map(({ sample, result }) => {
            const lx = Math.log10(sample.mfi as number)
            const ly = Math.log10(result.netAbc as number)
            return (
              <g key={sample.id}>
                <line
                  x1={sx(lx)} x2={sx(lx)} y1={sy(ly)} y2={M.top + PLOT_H}
                  stroke="var(--series-decision)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
                />
                <line
                  x1={M.left} x2={sx(lx)} y1={sy(ly)} y2={sy(ly)}
                  stroke="var(--series-decision)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
                />
                <rect
                  x={sx(lx) - 5} y={sy(ly) - 5} width={10} height={10} rx={2}
                  transform={`rotate(45 ${sx(lx)} ${sy(ly)})`}
                  fill="var(--series-decision)" stroke="var(--surface)" strokeWidth={2}
                  onMouseEnter={() =>
                    setHover({
                      x: sx(lx), y: sy(ly),
                      title: sample.label || 'Sample',
                      lines: [
                        `MFI  ${formatNumber(sample.mfi as number)}`,
                        `Density  ${formatNumber(result.netAbc as number)} /cell`,
                      ],
                    })
                  }
                />
                {/*
                  Named in the figure. Sample markers exported as unlabelled
                  diamonds, so nothing in a saved chart said which one was
                  which. Flipped to the left near the right edge so a long
                  label does not run out of the plot.
                */}
                <text
                  x={sx(lx) + (sx(lx) > M.left + PLOT_W * 0.68 ? -10 : 10)}
                  y={sy(ly) + 4}
                  textAnchor={sx(lx) > M.left + PLOT_W * 0.68 ? 'end' : 'start'}
                  fontSize={11}
                  fill="var(--text-primary)"
                  pointerEvents="none"
                >
                  {sample.label || 'Sample'}
                </text>
              </g>
            )
          })}

          {hover && (
            <g pointerEvents="none" transform={`translate(${Math.min(hover.x + 12, W - 172)}, ${Math.max(hover.y - 44, 4)})`}>
              <rect width={162} height={hover.lines.length * 15 + 22} rx={5}
                fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={1} />
              <text x={10} y={17} fontSize={11} fontWeight={600} fill="var(--text-primary)">{hover.title}</text>
              {hover.lines.map((l, i) => (
                <text key={i} x={10} y={33 + i * 15} fontSize={11} fill="var(--text-secondary)" fontFamily="var(--mono)">{l}</text>
              ))}
            </g>
          )}
        </svg>
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--series-evidence)' }} />
          Calibration standards &amp; fit
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--band-fill)', border: '1px solid var(--series-evidence)' }} />
          {Math.round(confidenceLevel * 100)}% confidence band
        </span>
        {plottedSamples.length > 0 && (
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: 'var(--series-decision)', transform: 'rotate(45deg)' }} />
            Samples
          </span>
        )}
      </div>
    </>
  )
}
