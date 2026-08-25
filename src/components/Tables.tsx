import { useState } from 'react'
import { checkStandardConsistency, type BeadStandard, type Sample } from '../lib/quantify'
import { checkAssigned, checkControl, checkMfi, type FieldIssue } from '../lib/validate'
import { NumericCell as NumCell, parseNum } from './shared/NumericCell'
import { PasteNotices } from './shared/PasteNotices'
import { GuidancePin } from './guidance/GuidancePin'

export { parseNum, parseClipboardGrid } from './shared/NumericCell'

interface StandardsTableProps {
  standards: BeadStandard[]
  assignedLabel: string
  onChange: (next: BeadStandard[]) => void
}

export function StandardsTable({ standards, assignedLabel, onChange }: StandardsTableProps) {
  const [notices, setNotices] = useState<string[]>([])
  // The row being typed in. Its warning waits until the reader leaves it: a
  // live pass caught the row below moving out from under the cursor part way
  // through entering four values, because inserting the warning reflows the
  // table. Nothing is suppressed, only deferred to the moment it is useful.
  const [editing, setEditing] = useState<string | null>(null)

  // Named at the row it belongs to, at the moment it is entered. R squared can
  // say the table is wrong; only this can say which population.
  const consistency = checkStandardConsistency(standards)
  const outlierFor = new Map(consistency.outliers.map((o) => [o.id, o]))

  // A row missing its certified value is dropped from the fit without saying
  // so, which is worth naming. It is only worth naming once some other row is
  // complete: before that the table is mid-entry, and every row in it is on its
  // way to being filled. This keeps the check on the row left behind by a short
  // paste rather than on every row between one keystroke and the next.
  const anyComplete = standards.some((s) => s.mfi !== null && s.assigned !== null)

  const update = (i: number, patch: Partial<BeadStandard>) =>
    onChange(standards.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  /** Fill down and across from (row, col), growing the table if needed. */
  const pasteFrom = (row: number, col: 0 | 1, grid: string[][], from: string[]) => {
    setNotices(from)
    const next = standards.map((s) => ({ ...s }))
    grid.forEach((cells, r) => {
      const target = row + r
      while (next.length <= target) {
        next.push({
          id: `bead-p-${next.length}-${target}`,
          label: `Standard ${next.length + 1}`,
          mfi: null,
          assigned: null,
          included: true,
        })
      }
      cells.forEach((cell, c) => {
        const field = col + c
        const value = parseNum(cell)
        if (field === 0) next[target].mfi = value
        else if (field === 1) next[target].assigned = value
      })
    })
    onChange(next)
  }

  return (
    <>
      <table>
        <caption>Calibration bead standards</caption>
        <thead>
          <tr>
            <th style={{ width: '1%' }}>
              <span className="visually-hidden">Include in fit</span>
            </th>
            <th>Population</th>
            <th className="num">MFI<GuidancePin anchor="ad.mfi" /></th>
            <th className="num">{assignedLabel}<GuidancePin anchor="ad.assigned" /></th>
            <th className="shrink" />
          </tr>
        </thead>
        <tbody>
          {standards.flatMap((s, i) => {
            // What can be said about each value on its own, at the field it was
            // typed into. The row below carries these and the consistency flag
            // together, so a reader never has to reconcile two places.
            const mfiIssue = checkMfi(s.mfi)
            const assignedIssue = checkAssigned(s.assigned, {
              included: s.included,
              started: s.mfi !== null && anyComplete,
            })
            const outlier = consistency.wholeTable ? undefined : outlierFor.get(s.id)
            const fieldIssues =
              editing === s.id
                ? []
                : [mfiIssue, assignedIssue].filter((issue): issue is FieldIssue => issue !== null)
            return [
              <tr
                key={s.id}
                className={
                  [s.included ? '' : 'excluded', outlier ? 'inconsistent' : '']
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              >
                <td className="shrink" style={{ paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={s.included}
                    aria-label={`Include ${s.label} in the fit`}
                    onChange={(e) => update(i, { included: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={s.label}
                    aria-label={`Label for standard ${i + 1}`}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </td>
                <td className="num">
                  <NumCell
                    value={s.mfi}
                    ariaLabel={`MFI for ${s.label}`}
                    onChange={(v) => update(i, { mfi: v })}
                    calibration
                    issue={editing === s.id ? null : mfiIssue?.severity}
                    onEditing={(on) => setEditing(on ? s.id : null)}
                    onPasteGrid={(g, n) => pasteFrom(i, 0, g, n)}
                  />
                </td>
                <td className="num">
                  <NumCell
                    value={s.assigned}
                    ariaLabel={`Assigned value for ${s.label}`}
                    onChange={(v) => update(i, { assigned: v })}
                    calibration
                    issue={assignedIssue?.severity}
                    onPasteGrid={(g, n) => pasteFrom(i, 1, g, n)}
                  />
                </td>
                <td className="shrink">
                  <button
                    className="icon"
                    aria-label={`Remove ${s.label}`}
                    onClick={() => onChange(standards.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </td>
              </tr>,
              outlier || fieldIssues.length > 0 ? (
                <tr className="row-flag" key={`${s.id}-flag`}>
                  <td colSpan={5}>
                    {fieldIssues.map((issue, n) => (
                      <p key={n}>{issue.message}</p>
                    ))}
                    {outlier && (
                      <p>
                        <strong>{outlier.message}</strong> <span>{outlier.remedy}</span>
                      </p>
                    )}
                  </td>
                </tr>
              ) : null,
            ]
          })}
          {consistency.wholeTable && (
            <tr className="row-flag">
              <td colSpan={5}>
                <strong>
                  Most of these populations disagree with one another, so the problem is the table
                  rather than any one row.
                </strong>{' '}
                <span>
                  Check the certified values against the certificate of analysis before reading any
                  result. A column pasted into the wrong place, or values from a different lot, are
                  the usual causes.
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <PasteNotices notices={notices} onDismiss={() => setNotices([])} />
      <div className="table-foot">
        <button
          onClick={() =>
            onChange([
              ...standards,
              {
                id: `bead-add-${standards.length}-${Date.now()}`,
                label: `Standard ${standards.length + 1}`,
                mfi: null,
                assigned: null,
                included: true,
              },
            ])
          }
        >
          + Add population
        </button>
        <span className="hint">Paste tab or comma delimited values into any MFI cell.</span>
      </div>
    </>
  )
}

interface SamplesTableProps {
  samples: Sample[]
  showControl: boolean
  onChange: (next: Sample[]) => void
}

export function SamplesTable({ samples, showControl, onChange }: SamplesTableProps) {
  const [notices, setNotices] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)

  const update = (i: number, patch: Partial<Sample>) =>
    onChange(samples.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const pasteFrom = (row: number, col: 0 | 1, grid: string[][], from: string[]) => {
    setNotices(from)
    const next = samples.map((s) => ({ ...s }))
    grid.forEach((cells, r) => {
      const target = row + r
      while (next.length <= target) {
        next.push({
          id: `sample-p-${next.length}-${target}`,
          label: `Sample ${next.length + 1}`,
          mfi: null,
          controlMfi: null,
        })
      }
      cells.forEach((cell, c) => {
        const field = col + c
        const value = parseNum(cell)
        if (field === 0) next[target].mfi = value
        else if (field === 1) next[target].controlMfi = value
      })
    })
    onChange(next)
  }

  return (
    <>
      <table>
        <caption>Samples and their control readings</caption>
        <thead>
          <tr>
            <th>Sample</th>
            <th className="num">Stained MFI<GuidancePin anchor="ad.mfi" /></th>
            {showControl && <th className="num">Control MFI<GuidancePin anchor="ad.control" /></th>}
            <th className="shrink" />
          </tr>
        </thead>
        <tbody>
          {samples.flatMap((s, i) => {
            const mfiIssue = checkMfi(s.mfi)
            const controlIssue = showControl ? checkControl(s.controlMfi, s.mfi) : null
            const issues =
              editing === s.id
                ? []
                : [mfiIssue, controlIssue].filter((issue): issue is FieldIssue => issue !== null)
            const span = showControl ? 4 : 3
            return [
              <tr key={s.id}>
                <td>
                  <input
                    type="text"
                    value={s.label}
                    aria-label={`Label for sample ${i + 1}`}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </td>
                <td className="num">
                  <NumCell
                    value={s.mfi}
                    ariaLabel={`Stained MFI for ${s.label}`}
                    onChange={(v) => update(i, { mfi: v })}
                    issue={editing === s.id ? null : mfiIssue?.severity}
                    onEditing={(on) => setEditing(on ? s.id : null)}
                    onPasteGrid={(g, n) => pasteFrom(i, 0, g, n)}
                  />
                </td>
                {showControl && (
                  <td className="num">
                    <NumCell
                      value={s.controlMfi}
                      placeholder="isotype / FMO"
                      ariaLabel={`Control MFI for ${s.label}`}
                      onChange={(v) => update(i, { controlMfi: v })}
                      issue={controlIssue?.severity}
                      onPasteGrid={(g, n) => pasteFrom(i, 1, g, n)}
                    />
                  </td>
                )}
                <td className="shrink">
                  <button
                    className="icon"
                    aria-label={`Remove ${s.label}`}
                    onClick={() => onChange(samples.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </td>
              </tr>,
              issues.length > 0 ? (
                <tr className="row-flag" key={`${s.id}-flag`}>
                  <td colSpan={span}>
                    {issues.map((issue, n) => (
                      <p key={n}>{issue.message}</p>
                    ))}
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table>
      <PasteNotices notices={notices} onDismiss={() => setNotices([])} />
      <div className="table-foot">
        <button
          onClick={() =>
            onChange([
              ...samples,
              {
                id: `sample-add-${samples.length}-${Date.now()}`,
                label: `Sample ${samples.length + 1}`,
                mfi: null,
                controlMfi: null,
              },
            ])
          }
        >
          + Add sample
        </button>
        <span className="hint">Paste a column of MFI values.</span>
      </div>
    </>
  )
}
