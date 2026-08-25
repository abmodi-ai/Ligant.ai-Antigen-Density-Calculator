import { useState } from 'react'
import type { DoseMatrix } from '../lib/cytotox'
import { NumericCell, parseNum } from './shared/NumericCell'
import { PasteNotices } from './shared/PasteNotices'
import { GuidancePin } from './guidance/GuidancePin'

interface Props {
  matrix: DoseMatrix
  doseLabel: string
  onChange: (next: DoseMatrix) => void
}

function clone(m: DoseMatrix): DoseMatrix {
  return {
    doses: [...m.doses],
    seriesNames: [...m.seriesNames],
    responses: m.responses.map((r) => [...r]),
  }
}

function growRows(m: DoseMatrix, rows: number) {
  while (m.doses.length < rows) {
    m.doses.push(null)
    m.responses.push(m.seriesNames.map(() => null))
  }
}

export function CytotoxTables({ matrix, doseLabel, onChange }: Props) {
  const [notices, setNotices] = useState<string[]>([])
  const columns = matrix.seriesNames.length

  /**
   * Fill from (row, column) across and down. Column -1 is the dose column, so a
   * block pasted there lands as doses plus responses in one action, which is how
   * a plate export is shaped.
   */
  const pasteFrom = (row: number, column: number, grid: string[][]) => {
    const next = clone(matrix)
    growRows(next, row + grid.length)
    grid.forEach((cells, r) => {
      cells.forEach((cell, c) => {
        const target = column + c
        const value = parseNum(cell)
        if (target === -1) next.doses[row + r] = value
        else if (target < columns) next.responses[row + r][target] = value
      })
    })
    onChange(next)
  }

  const setDose = (row: number, v: number | null) => {
    const next = clone(matrix)
    next.doses[row] = v
    onChange(next)
  }
  const setResponse = (row: number, column: number, v: number | null) => {
    const next = clone(matrix)
    next.responses[row][column] = v
    onChange(next)
  }

  return (
    <>
      <table>
        <caption>Dose and response values, one column per construct</caption>
        <thead>
          <tr>
            <th className="num">{doseLabel}<GuidancePin anchor="cy.dose" /></th>
            {matrix.seriesNames.map((name, c) => (
              <th key={c} style={{ textTransform: 'none', letterSpacing: 0, padding: '6px 6px' }}>
                {c === 0 && <GuidancePin anchor="cy.response" />}
                <input
                  type="text"
                  value={name}
                  aria-label={`Name of construct ${c + 1}`}
                  onChange={(e) => {
                    const next = clone(matrix)
                    next.seriesNames[c] = e.target.value
                    onChange(next)
                  }}
                />
              </th>
            ))}
            <th className="shrink" />
          </tr>
        </thead>
        <tbody>
          {matrix.doses.map((dose, row) => (
            <tr key={row}>
              <td className="num">
                <NumericCell
                  value={dose}
                  ariaLabel={`${doseLabel} for row ${row + 1}`}
                  onChange={(v) => setDose(row, v)}
                  onPasteGrid={(g, n) => {
                    setNotices(n)
                    pasteFrom(row, -1, g)
                  }}
                />
              </td>
              {matrix.seriesNames.map((_, c) => (
                <td className="num" key={c}>
                  <NumericCell
                    value={matrix.responses[row]?.[c] ?? null}
                    ariaLabel={`Response for ${matrix.seriesNames[c]} at row ${row + 1}`}
                    onChange={(v) => setResponse(row, c, v)}
                    onPasteGrid={(g, n) => {
                      setNotices(n)
                      pasteFrom(row, c, g)
                    }}
                  />
                </td>
              ))}
              <td className="shrink">
                <button
                  className="icon"
                  aria-label={`Remove row ${row + 1}`}
                  onClick={() => {
                    const next = clone(matrix)
                    next.doses.splice(row, 1)
                    next.responses.splice(row, 1)
                    onChange(next)
                  }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <PasteNotices notices={notices} onDismiss={() => setNotices([])} />
      <div className="table-foot">
        <div className="button-row">
          <button
            onClick={() => {
              const next = clone(matrix)
              growRows(next, next.doses.length + 1)
              onChange(next)
            }}
          >
            + Add dose
          </button>
          <button
            onClick={() => {
              const next = clone(matrix)
              next.seriesNames.push(`Construct ${String.fromCharCode(65 + next.seriesNames.length)}`)
              next.responses.forEach((r) => r.push(null))
              onChange(next)
            }}
          >
            + Add construct
          </button>
          {columns > 1 && (
            <button
              onClick={() => {
                const next = clone(matrix)
                next.seriesNames.pop()
                next.responses.forEach((r) => r.pop())
                onChange(next)
              }}
            >
              Remove last construct
            </button>
          )}
        </div>
        <span className="hint">Paste a dose and response block into any cell.</span>
      </div>
    </>
  )
}
