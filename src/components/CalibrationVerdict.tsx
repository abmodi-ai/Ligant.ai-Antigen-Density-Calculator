import { formatR2 } from '../lib/format'
import type { CurveResult, Flag } from '../lib/quantify'

/**
 * One line beneath the calibration table saying whether the ruler is usable.
 *
 * The table is where the calibration is built and the chart is somewhere else,
 * so a reader who has just finished typing has nothing telling them whether
 * what they typed worked. This is that sentence, in the place they are already
 * looking.
 *
 * Never red. Red in this palette means system error, and an unusable
 * calibration is not the tool failing: it is a reading the reader now has to
 * act on, which is what amber is for.
 */
export function CalibrationVerdict({
  curve,
  error,
  flags,
}: {
  curve: CurveResult | null
  /** Why no curve could be fitted at all, where that is the case. */
  error?: string
  /** Curve flags plus anything the calibration carries from outside it. */
  flags: readonly Flag[]
}) {
  if (!curve) {
    return (
      <p className="verdict verdict-pending">
        {error ?? 'Enter calibration standards to fit a curve.'}
      </p>
    )
  }

  const invalidating = flags.filter((f) => f.level === 'critical')
  const caveats = flags.filter((f) => f.level === 'warning')
  // R squared is printed through the shared formatter rather than truncated for
  // brevity. Truncating turns 0.999956 into 1.0000, which asserts a perfect fit
  // the data does not support, and that defect has been fixed here once already.
  const summary = `Slope ${curve.fit.slope.toFixed(2)}, R² ${formatR2(curve.fit.r2)}, ${curve.fit.n} populations`

  if (invalidating.length > 0) {
    return (
      <p className="verdict verdict-invalid">
        <strong>Calibration not usable.</strong> {invalidating[0].message}
      </p>
    )
  }

  if (caveats.length > 0) {
    return (
      <p className="verdict verdict-caveat">
        <strong>Calibration usable with a caveat.</strong> {summary}. {caveats[0].message}
      </p>
    )
  }

  return (
    <p className="verdict verdict-valid">
      <strong>Calibration valid.</strong> {summary}.
    </p>
  )
}
