/**
 * What can be said about a value at the field it was typed into.
 *
 * Error detection in this tool has run late: a reader types five rows, scrolls
 * past a chart, and reads that something is wrong with the table. These checks
 * run on one value at the moment it is entered, and they are deliberately
 * narrow. Anything requiring the other rows belongs with the calibration
 * checks, and anything requiring a fit belongs with the curve.
 *
 * Nothing here blocks entry. A value that cannot be used is already excluded
 * from the fit by the filters in `quantify.ts`, so refusing the keystroke as
 * well would fight the reader for no gain, and the tool's whole posture is to
 * compute, render, and say what is wrong. The one thing these checks add is
 * saying it in the place the value was typed.
 */

/**
 * Above this an intensity is beyond what a cytometer reports on any scale in
 * ordinary use. A warning, not a refusal: it is implausible rather than
 * impossible, and a review that classed it as impossible was applying its own
 * rule for "violates physics regardless" to a number that does not.
 */
const MFI_CEILING = 1e7

/**
 * And above this it is impossible rather than implausible.
 *
 * A reported intensity is a digitised detector output. The widest digitisation
 * in any cytometer is 32 bit, so a value above full scale did not come off an
 * instrument on any scale, log or linear. Nothing is lost by refusing it,
 * because there is no reading it could be.
 *
 * This does not reopen the ceiling above. That review wanted 1e7 called
 * impossible and was refused, correctly: 1e7 is a number a scale could carry.
 * This tier sits four hundred times higher, where no scale can.
 */
export const MFI_IMPOSSIBLE = 2 ** 32

/**
 * Certified capacities in these kits run from a few thousand to a few hundred
 * thousand. The bounds are an order of magnitude either side of that, so they
 * catch a misplaced decimal point without pretending to know any lot's values.
 */
const ASSIGNED_FLOOR = 1e2
const ASSIGNED_CEILING = 1e7

/**
 * The same distinction for a certified value.
 *
 * A surface accommodates on the order of ten million antibody footprints, the
 * figure MAX_PLAUSIBLE_DENSITY already rests on. Two orders above that is past
 * any certificate ever issued for any bead, so a value there is a transcription
 * artefact rather than a capacity.
 */
export const ASSIGNED_IMPOSSIBLE = 1e9

import { formatNumber } from './format'

export type Severity = 'error' | 'warning'

export interface FieldIssue {
  severity: Severity
  message: string
}

/** An intensity, from a bead population or a sample. */
export function checkMfi(mfi: number | null): FieldIssue | null {
  if (mfi === null) return null
  if (!Number.isFinite(mfi)) {
    return {
      severity: 'error',
      message: 'This is not a number the tool can read.',
    }
  }
  if (mfi <= 0) {
    return {
      severity: 'error',
      message:
        'A fluorescence intensity is greater than zero. A value at or below zero is excluded from the fit.',
    }
  }
  if (mfi >= MFI_IMPOSSIBLE) {
    return {
      severity: 'error',
      message:
        'No cytometer digitises above 32 bit, so a value this large is not a reading on any scale. Check for a pasted exponent or a formula result.',
    }
  }
  if (mfi > MFI_CEILING) {
    return {
      severity: 'warning',
      message:
        'This is beyond what a cytometer reports on any scale in ordinary use. Check for a stray digit.',
    }
  }
  return null
}

/**
 * A certified value, judged against the row's own state.
 *
 * The check is on whether the row is in the fit, never on what it is called. A
 * review proposed refusing a certified value on a row named "Blank", which
 * would break the moment a reader renamed it and misfire on anyone who names a
 * real population that. Labels are free text; inclusion is state.
 *
 * A missing value is only missing once the row is far enough along for the
 * omission to mean something, which is what `started` carries. A half-typed
 * row is being worked on, not wrong, and flagging it would put the tool a
 * keystroke ahead of the reader for the whole of data entry.
 */
export function checkAssigned(
  assigned: number | null,
  options: { included: boolean; started?: boolean },
): FieldIssue | null {
  if (!options.included) return null
  if (assigned === null) {
    if (options.started === false) return null
    return {
      severity: 'error',
      message:
        'A population in the fit needs a certified value. Untick it to leave it out, as a blank population is left out.',
    }
  }
  if (!Number.isFinite(assigned) || assigned <= 0) {
    return {
      severity: 'error',
      message:
        'A certified value is greater than zero. Untick this population to leave it out of the fit.',
    }
  }
  if (assigned >= ASSIGNED_IMPOSSIBLE) {
    return {
      severity: 'error',
      message:
        'This is orders of magnitude beyond the capacity of any bead, so it is not a certified value. Check for a pasted exponent or a formula result.',
    }
  }
  if (assigned < ASSIGNED_FLOOR || assigned > ASSIGNED_CEILING) {
    return {
      severity: 'warning',
      message: `Certified capacities in these kits fall roughly between ${formatNumber(ASSIGNED_FLOOR)} and ${formatNumber(ASSIGNED_CEILING)}. Check this against the certificate of analysis.`,
    }
  }
  return null
}

/**
 * A control read brighter than the sample it belongs to.
 *
 * A warning rather than a refusal, because it is a real result: a population
 * carrying no target can read below its own control. What it more often means
 * is that two columns were entered the wrong way round, and saying so at the
 * field costs nothing if the reading was genuine.
 */
export function checkControl(control: number | null, stained: number | null): FieldIssue | null {
  if (control === null || stained === null) return null
  if (!(control > 0) || !(stained > 0)) return null
  if (control <= stained) return null
  return {
    severity: 'warning',
    message:
      'The control is brighter than the stained sample. Check the two columns are not the other way round. A genuinely negative population can read this way, and is reported as below detection.',
  }
}
