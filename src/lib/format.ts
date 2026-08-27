/**
 * Display formatting shared by the bench tools.
 */

/**
 * Format a coefficient of determination without ever claiming a perfect fit.
 *
 * Four decimal places rounds 0.999956 to "1.0000", which asserts something the
 * data does not support. Values close to one are shown with enough precision to
 * stay honest, and an exact 1 is only ever printed when the residual really is
 * zero.
 */
export function formatR2(v: number): string {
  if (!Number.isFinite(v)) return 'n/a'
  // A residual of exactly zero really does give one, and the tool now says
  // separately that such a standard is not a measurement.
  if (v >= 1) return '1.0000'
  const fixed = v.toFixed(4)
  // Rounding up to 1.0000 would assert a perfect fit the data does not support.
  if (Number(fixed) >= 1) return '> 0.9999'
  return fixed
}

/**
 * Above this a value is written in scientific notation, because rendering it in
 * full breaks the layout it sits in.
 */
export const SCIENTIFIC_ABOVE = 1e9

/**
 * Human readable, with the precision the magnitude warrants.
 *
 * Lives here rather than with the calibration core so that anything writing a
 * number into a sentence can reach it. A range guard written without it said
 * capacities "fall roughly between 1e+2 and 1e+7", which is not a sentence
 * anyone says at a bench, and is the third time an exponent has reached the
 * interface through a formatter that was one import away.
 */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return 'n/a'
  if (Math.abs(v) >= SCIENTIFIC_ABOVE) return v.toExponential(2)
  // On the rounded value, not the raw one. A confidence bound of 9,999.6 is
  // below the grouping threshold and rounds to five digits, so it printed as
  // "10000" beside an upper bound of "13,259" on the same line.
  if (Math.round(v) >= 10_000) return Math.round(v).toLocaleString('en-US')
  if (v >= 100) return v.toFixed(0)
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}
