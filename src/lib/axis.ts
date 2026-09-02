/**
 * Log axis ticks, shared by both charts.
 *
 * A decade per tick is right for the ranges a real assay produces. It is wrong
 * the moment a transcription error widens the domain: a value of 1e300 in an MFI
 * field asks for three hundred gridlines and three hundred labels, and the plot
 * becomes an unreadable smear. The step therefore coarsens once the span exceeds
 * what can be labelled legibly, so the axis degrades rather than exploding.
 */

/** Above this many labels an axis stops being readable. */
const MAX_TICKS = 12

/** Decade steps to fall back through as the domain widens. */
const STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]

function stepFor(span: number): number {
  for (const step of STEPS) {
    if (span / step <= MAX_TICKS) return step
  }
  return Math.ceil(span / MAX_TICKS)
}

/** Major ticks across a log10 domain, bounded in number however wide it is. */
export function decadeTicks(lo: number, hi: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return []
  const step = stepFor(hi - lo)
  const out: number[] = []
  const first = Math.ceil(lo / step) * step
  for (let d = first; d <= hi + 1e-9 && out.length <= MAX_TICKS + 1; d += step) {
    out.push(Number(d.toFixed(10)))
  }
  return out
}

/**
 * Intermediate ticks, drawn only where the domain is narrow enough for them to
 * mean something. A wide domain gets none rather than thousands.
 */
export function minorTicks(lo: number, hi: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo > 3) return []
  const out: number[] = []
  for (let d = Math.floor(lo); d <= Math.ceil(hi); d++) {
    for (let m = 2; m <= 9; m++) {
      const v = d + Math.log10(m)
      if (v >= lo && v <= hi) out.push(v)
    }
  }
  return out
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/** Axis label for a log10 position, in powers of ten where that is clearer. */
export function formatDecade(logValue: number): string {
  const rounded = Math.round(logValue)
  const isWhole = Math.abs(logValue - rounded) < 1e-9
  const v = 10 ** logValue

  if (isWhole && (v >= 1000 || v < 0.01)) {
    const digits = String(Math.abs(rounded)).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)])
    return `10${rounded < 0 ? '⁻' : ''}${digits}`
  }
  if (v >= 1000 || v < 0.01) return v.toExponential(0)
  return v >= 1 ? String(Number(v.toPrecision(3))) : String(Number(v.toPrecision(2)))
}
