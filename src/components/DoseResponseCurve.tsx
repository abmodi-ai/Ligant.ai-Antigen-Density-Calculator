import { useMemo, useState } from 'react'
import { predict } from '../lib/doseresponse'
import { decadeTicks, formatDecade } from '../lib/axis'
import { formatDose, formatResponse, type CytotoxOptions, type SeriesAnalysis } from '../lib/cytotox'

const W = 580
const H = 400
const M = { top: 16, right: 78, bottom: 48, left: 58 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

/**
 * Series identity is carried by marker shape, dash pattern and a direct label,
 * never by hue.
 *
 * The brand palette defines no categorical set, and the colours it does define
 * cannot supply one: navy against slate measures ΔE 14.1 for normal vision,
 * below the legibility floor, before colour vision deficiency is considered.
 * Encoding identity by shape is also what a journal figure does, survives
 * greyscale printing, and keeps teal meaning evidence rather than "construct 3".
 */
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'plus', 'cross'] as const
const DASHES = ['', '6 3', '2 3', '9 3 2 3', '1 3', '12 4']

type Shape = (typeof SHAPES)[number]

function markerPath(shape: Shape, x: number, y: number, r = 4.5): string {
  switch (shape) {
    case 'square':
      return `M${x - r},${y - r} h${r * 2} v${r * 2} h${-r * 2} Z`
    case 'triangle':
      return `M${x},${y - r * 1.15} L${x + r},${y + r * 0.8} L${x - r},${y + r * 0.8} Z`
    case 'diamond':
      return `M${x},${y - r * 1.25} L${x + r * 1.1},${y} L${x},${y + r * 1.25} L${x - r * 1.1},${y} Z`
    case 'plus':
      return `M${x - r},${y} h${r * 2} M${x},${y - r} v${r * 2}`
    case 'cross':
      return `M${x - r},${y - r} l${r * 2},${r * 2} M${x + r},${y - r} l${-r * 2},${r * 2}`
    default:
      return `M${x},${y} m${-r},0 a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`
  }
}

const OPEN_SHAPES = new Set<Shape>(['plus', 'cross'])

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo
  if (!(span > 0)) return [lo]
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)))
  return out
}

interface Hover {
  x: number
  y: number
  title: string
  lines: string[]
}

interface Props {
  analyses: SeriesAnalysis[]
  options: CytotoxOptions
}

export function DoseResponseCurve({ analyses, options }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)

  const plotted = analyses.filter((a) => a.fit !== null || a.doseRange !== null)

  const geom = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    for (const a of plotted) {
      for (const p of a.series.points) {
        if (p.dose && p.dose > 0 && p.response !== null && Number.isFinite(p.response)) {
          xs.push(Math.log10(p.dose))
          ys.push(p.response)
        }
      }
      if (a.fit) {
        ys.push(a.fit.params.top, a.fit.params.bottom)
      }
    }
    if (xs.length === 0) return null

    const x0raw = Math.min(...xs)
    const x1raw = Math.max(...xs)
    const xPad = Math.max((x1raw - x0raw) * 0.08, 0.2)
    const x0 = x0raw - xPad
    const x1 = x1raw + xPad

    const y0raw = Math.min(...ys)
    const y1raw = Math.max(...ys)
    const yPad = Math.max((y1raw - y0raw) * 0.1, 1)
    const y0 = y0raw - yPad
    const y1 = y1raw + yPad

    return {
      x0, x1, y0, y1,
      sx: (v: number) => M.left + ((v - x0) / (x1 - x0)) * PLOT_W,
      sy: (v: number) => M.top + PLOT_H - ((v - y0) / (y1 - y0)) * PLOT_H,
    }
  }, [plotted])

  if (!geom) {
    return <div className="empty">Enter doses and responses to fit a curve.</div>
  }
  const { x0, x1, sx, sy } = geom

  const xTicks = decadeTicks(x0, x1)
  const yTicks = niceTicks(geom.y0, geom.y1)
  const single = plotted.length === 1

  return (
    <>
      <div className="chart-wrap">
        <svg
          className="chart"
          id="dose-response-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Dose response curves on a log dose axis, one fitted four parameter logistic per construct"
          onMouseLeave={() => setHover(null)}
        >
          {xTicks.map((t) => (
            <line key={`xg${t}`} x1={sx(t)} x2={sx(t)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--grid)" strokeWidth={1} />
          ))}
          {yTicks.map((t) => (
            <line key={`yg${t}`} x1={M.left} x2={M.left + PLOT_W} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
          ))}

          {plotted.map((a, i) => {
            const shape = SHAPES[i % SHAPES.length]
            const dash = DASHES[i % DASHES.length]
            const dim = hover !== null && hover.title !== a.series.label
            const opacity = dim ? 0.28 : 1

            // Fitted curve, sampled across the visible x range.
            let path = ''
            if (a.fit) {
              const N = 100
              const seg: string[] = []
              for (let k = 0; k <= N; k++) {
                const lx = x0 + ((x1 - x0) * k) / N
                seg.push(`${k === 0 ? 'M' : 'L'}${sx(lx).toFixed(2)},${sy(predict(a.fit.params, lx)).toFixed(2)}`)
              }
              path = seg.join(' ')
            }

            const pts = a.series.points.filter(
              (p) => p.dose && p.dose > 0 && p.response !== null && Number.isFinite(p.response),
            )

            return (
              <g key={a.series.id} opacity={opacity}>
                {path && (
                  <path
                    d={path}
                    fill="none"
                    stroke="var(--series-evidence)"
                    strokeWidth={2}
                    strokeDasharray={dash || undefined}
                    strokeLinecap="round"
                  />
                )}

                {a.fit && (
                  <line
                    x1={sx(a.fit.params.logEC50)}
                    x2={sx(a.fit.params.logEC50)}
                    y1={sy(geom.y0)}
                    y2={sy((a.fit.params.top + a.fit.params.bottom) / 2)}
                    stroke="var(--series-decision)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.75}
                  />
                )}

                {pts.map((p) => {
                  const cx = sx(Math.log10(p.dose as number))
                  const cy = sy(p.response as number)
                  const open = OPEN_SHAPES.has(shape)
                  return (
                    <path
                      key={p.id}
                      d={markerPath(shape, cx, cy)}
                      fill={open ? 'none' : 'var(--series-evidence)'}
                      stroke={open ? 'var(--series-evidence)' : 'var(--surface)'}
                      strokeWidth={open ? 2 : 1.5}
                      onMouseEnter={() =>
                        setHover({
                          x: cx,
                          y: cy,
                          title: a.series.label,
                          lines: [
                            `${options.doseLabel}  ${formatDose(p.dose as number)}`,
                            `Response  ${formatResponse(p.response as number)}`,
                          ],
                        })
                      }
                    />
                  )
                })}

                {/* Direct label at the curve's right edge, so identity never
                    depends on matching a colour to a legend. */}
                {a.fit && (
                  <text
                    x={M.left + PLOT_W + 6}
                    y={sy(predict(a.fit.params, x1)) + 4}
                    fontSize={11}
                    fill="var(--text-secondary)"
                  >
                    {a.series.label.slice(0, 11)}
                  </text>
                )}
              </g>
            )
          })}

          <line x1={M.left} x2={M.left + PLOT_W} y1={M.top + PLOT_H} y2={M.top + PLOT_H} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + PLOT_H} stroke="var(--border-strong)" strokeWidth={1} />

          {xTicks.map((t) => (
            <text key={`xt${t}`} x={sx(t)} y={M.top + PLOT_H + 17} textAnchor="middle" fontSize={11} fill="var(--text-muted)" fontFamily="var(--mono)">
              {formatDecade(t)}
            </text>
          ))}
          {yTicks.map((t) => (
            <text key={`yt${t}`} x={M.left - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" fontFamily="var(--mono)">
              {t}
            </text>
          ))}

          <text x={M.left + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--text-secondary)">
            {options.doseLabel}
          </text>
          <text transform={`translate(13, ${M.top + PLOT_H / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--text-secondary)">
            {options.responseLabel}
          </text>

          {hover && (
            <g pointerEvents="none" transform={`translate(${Math.min(hover.x + 12, W - 176)}, ${Math.max(hover.y - 46, 4)})`}>
              <rect width={166} height={hover.lines.length * 15 + 22} rx={5} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={1} />
              <text x={10} y={17} fontSize={11} fontWeight={600} fill="var(--text-primary)">{hover.title}</text>
              {hover.lines.map((l, i) => (
                <text key={i} x={10} y={33 + i * 15} fontSize={11} fill="var(--text-secondary)" fontFamily="var(--mono)">{l}</text>
              ))}
            </g>
          )}
        </svg>
      </div>

      <div className="legend">
        {plotted.map((a, i) => (
          <span className="legend-item" key={a.series.id}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d={markerPath(SHAPES[i % SHAPES.length], 7, 7, 4)}
                fill={OPEN_SHAPES.has(SHAPES[i % SHAPES.length]) ? 'none' : 'var(--series-evidence)'}
                stroke="var(--series-evidence)"
                strokeWidth={OPEN_SHAPES.has(SHAPES[i % SHAPES.length]) ? 2 : 1}
              />
            </svg>
            {a.series.label}
          </span>
        ))}
        {single && (
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: 'var(--series-decision)', width: 2, height: 11 }} />
            Fitted {plotted[0].potencyLabel}
          </span>
        )}
      </div>
    </>
  )
}
