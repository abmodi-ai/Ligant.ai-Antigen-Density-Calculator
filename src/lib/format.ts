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
 * Below this, two decimal places are not enough to say anything.
 *
 * The mirror of the defect fixed at the top end, and it read worse. Every
 * magnitude under 0.005 collapsed to "0.00", so a standard refused for holding
 * 1e-250 said "Population 1 (intensity 0.00) holds a value beyond anything a
 * cytometer reports", which is a contradiction on its face and gives a reader
 * no way to find the cell. 0.0001 and 1e-250 rendered identically.
 *
 * Significant figures rather than fixed places below here, so 0.0034 stays
 * 0.0034 and 1e-250 stays 1e-250. No separate exponential threshold is needed:
 * a JavaScript number renders itself exponentially below 1e-6, which is exactly
 * where a decimal form stops being readable anyway.
 */
const SIGNIFICANT_BELOW = 0.01

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
  // Zero is genuinely zero and says so. Anything else this small is a value the
  // reader has to be able to find, so it keeps its figures rather than its
  // decimal places.
  const magnitude = Math.abs(v)
  if (magnitude > 0 && magnitude < SIGNIFICANT_BELOW) {
    return Number(v.toPrecision(3)).toString()
  }
  return v.toFixed(2)
}
