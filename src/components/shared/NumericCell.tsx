/**
 * Numeric table cell with spreadsheet paste, shared by every bench tool.
 *
 * Pasting a block from Excel is how lab data actually arrives, so a single
 * scalar paste falls through to normal input handling while a multi-cell block
 * is handed to the table to fill down and across.
 */

/** Parse a user-typed number, allowing thousands separators and exponents. */
export function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (cleaned === '') return null
  const v = Number(cleaned)
  return Number.isFinite(v) ? v : null
}

/** Split a clipboard payload into a grid, accepting tab or comma separation. */
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
  onPasteGrid: (grid: string[][]) => void
  placeholder?: string
  ariaLabel: string
}

export function NumericCell({ value, onChange, onPasteGrid, placeholder, ariaLabel }: Props) {
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
        const grid = parseClipboardGrid(e.clipboardData.getData('text/plain'))
        if (grid.length > 1 || grid[0]?.length > 1) {
          e.preventDefault()
          onPasteGrid(grid)
        }
      }}
    />
  )
}
