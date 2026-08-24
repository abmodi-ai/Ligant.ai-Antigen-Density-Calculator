import type { BeadStandard, Sample } from '../lib/quantify'
import { NumericCell as NumCell, parseNum } from './shared/NumericCell'
import { GuidancePin } from './guidance/GuidancePin'

export { parseNum, parseClipboardGrid } from './shared/NumericCell'

interface StandardsTableProps {
  standards: BeadStandard[]
  assignedLabel: string
  onChange: (next: BeadStandard[]) => void
}

export function StandardsTable({ standards, assignedLabel, onChange }: StandardsTableProps) {
  const update = (i: number, patch: Partial<BeadStandard>) =>
    onChange(standards.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  /** Fill down and across from (row, col), growing the table if needed. */
  const pasteFrom = (row: number, col: 0 | 1, grid: string[][]) => {
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
          {standards.map((s, i) => (
            <tr key={s.id} className={s.included ? undefined : 'excluded'}>
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
                  onPasteGrid={(g) => pasteFrom(i, 0, g)}
                />
              </td>
              <td className="num">
                <NumCell
                  value={s.assigned}
                  ariaLabel={`Assigned value for ${s.label}`}
                  onChange={(v) => update(i, { assigned: v })}
                  onPasteGrid={(g) => pasteFrom(i, 1, g)}
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
            </tr>
          ))}
        </tbody>
      </table>
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
  const update = (i: number, patch: Partial<Sample>) =>
    onChange(samples.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const pasteFrom = (row: number, col: 0 | 1, grid: string[][]) => {
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
          {samples.map((s, i) => (
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
                  onPasteGrid={(g) => pasteFrom(i, 0, g)}
                />
              </td>
              {showControl && (
                <td className="num">
                  <NumCell
                    value={s.controlMfi}
                    placeholder="isotype / FMO"
                    ariaLabel={`Control MFI for ${s.label}`}
                    onChange={(v) => update(i, { controlMfi: v })}
                    onPasteGrid={(g) => pasteFrom(i, 1, g)}
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
            </tr>
          ))}
        </tbody>
      </table>
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
