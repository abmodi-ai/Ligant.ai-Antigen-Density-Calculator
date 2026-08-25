/**
 * Numeric table cell with spreadsheet paste, shared by every bench tool.
 *
 * Pasting a block from Excel is how lab data actually arrives, so a single
 * scalar paste falls through to normal input handling while a multi-cell block
 * is handed to the table to fill down and across.
 */

import { parseNum, readPaste } from '../../lib/paste'
import type { Severity } from '../../lib/validate'

export { parseNum }

/**
 * Split a clipboard payload into a grid, accepting tab or comma separation.
 *
 * Kept as the naive reading, and no longer used for pasting. `readPaste` in
 * `lib/paste.ts` replaced it because splitting on every comma turned a
 * thousands-formatted value into two cells. This remains only so the tests that
 * pin the old behaviour have something to compare against.
 */
export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => (line.includes('\t') ? line.split('\t') : line.split(',')))
}

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  onPasteGrid: (grid: string[][], notices: string[]) => void
  placeholder?: string
  ariaLabel: string
  /** True in a calibration table, where a pasted block has an expected shape. */
  calibration?: boolean
  /**
   * What is wrong with this value, where anything is. Marks the field so the
   * sentence beneath the row can be traced back to the cell it is about.
   * Nothing here prevents entry, and nothing here is red.
   */
  issue?: Severity | null
  /**
   * Told when this field gains and loses focus, so the table can hold a
   * warning back until the reader has stopped typing in it. Inserting a row
   * mid-keystroke pushes every row below it down, and the field someone is
   * about to type into moves out from under the cursor.
   */
  onEditing?: (editing: boolean) => void
}

export function NumericCell({
  value,
  onChange,
  onPasteGrid,
  placeholder,
  ariaLabel,
  calibration,
  issue,
  onEditing,
}: Props) {
  const className =
    [value !== null ? 'filled' : '', issue ? `cell-${issue}` : ''].filter(Boolean).join(' ') ||
    undefined
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      aria-invalid={issue === 'error' || undefined}
      value={value === null ? '' : String(value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(parseNum(e.target.value))}
      onFocus={() => onEditing?.(true)}
      onBlur={() => onEditing?.(false)}
      onPaste={(e) => {
        const { grid, notices } = readPaste(e.clipboardData.getData('text/plain'), {
          calibration,
        })
        // A single value is left to ordinary input handling, which strips
        // thousands separators on its own.
        if (grid.length > 1 || grid[0]?.length > 1) {
          e.preventDefault()
          onPasteGrid(grid, notices)
        }
      }}
    />
  )
}
