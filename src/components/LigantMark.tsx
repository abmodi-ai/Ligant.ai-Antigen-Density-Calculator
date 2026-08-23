/**
 * Council · Ringed — the Ligant mark.
 *
 * Per the brand guidelines: the ring is the table, the six dots are the agents,
 * the amber centre is the human who decides. The centre is the one sanctioned
 * brightening (#E0A416); amber is #B8860B everywhere else.
 */

const RING_RADIUS = 9.2
const DOT_RADIUS = 2.1
const CENTRE_RADIUS = 3.6

/** Pointy-top hexagon: a vertex at twelve o'clock, one dot per vertex. */
const VERTICES = Array.from({ length: 6 }, (_, i) => {
  const angle = (-90 + i * 60) * (Math.PI / 180)
  return [16 + RING_RADIUS * Math.cos(angle), 16 + RING_RADIUS * Math.sin(angle)] as const
})

const HEX_PATH = `${VERTICES.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`).join(' ')} Z`

interface Props {
  size?: number
  /** Teal tile ground (default) or the mark alone on the page ground. */
  variant?: 'tile' | 'bare'
  title?: string
}

export function LigantMark({ size = 28, variant = 'tile', title }: Props) {
  const onTile = variant === 'tile'
  const strokeColor = onTile ? 'var(--brand-offwhite)' : 'var(--brand-teal)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0, display: 'block' }}
    >
      {title && <title>{title}</title>}
      {/* Tile corner radius is 22% of the mark's width. */}
      {onTile && <rect width="32" height="32" rx="7.04" fill="var(--brand-teal)" />}
      <path d={HEX_PATH} fill="none" stroke={strokeColor} strokeWidth="1.7" strokeLinejoin="round" />
      {VERTICES.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={DOT_RADIUS} fill={strokeColor} />
      ))}
      <circle cx="16" cy="16" r={CENTRE_RADIUS} fill="var(--brand-amber-mark)" />
    </svg>
  )
}

/** Horizontal lockup — mark plus wordmark. The default for headers. */
export function LigantLockup({ size = 28 }: { size?: number }) {
  return (
    <span className="lockup">
      <LigantMark size={size} title="Ligant" />
      <span className="wordmark">Ligant</span>
    </span>
  )
}
