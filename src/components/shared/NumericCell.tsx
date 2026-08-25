/**
 * Numeric table cell with spreadsheet paste, shared by every bench tool.
 *
 * Pasting a block from Excel is how lab data actually arrives, so a single
 * scalar paste falls through to normal input handling while a multi-cell block
 * is handed to the table to fill down and across.
 */

import { parseNum, readPaste } from '../../lib/paste'

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
}

export function NumericCell({
  value,
  onChange,
  onPasteGrid,
  placeholder,
  ariaLabel,
  calibration,
}: Props) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className={value !== null ? 'filled' : undefined}
      value={value === null ? '' : String(value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(parseNum(e.target.value))}
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
