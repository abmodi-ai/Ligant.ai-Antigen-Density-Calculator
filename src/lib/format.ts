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
  if (v >= 1) return '1'
  const fixed = v.toFixed(6)
  if (Number(fixed) >= 1) return '> 0.999999'
  return fixed.replace(/0+$/, '').replace(/\.$/, '')
}
