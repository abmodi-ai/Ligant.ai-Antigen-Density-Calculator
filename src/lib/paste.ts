/**
 * Reading a block pasted from a spreadsheet.
 *
 * Pasting is the highest-volume entry path in the tool, and it was the least
 * guarded. The parser split on a comma whenever a line had no tab, so a column
 * of thousands-formatted values did not merely misread: `51,000` became two
 * cells, filling 51 into the intensity and 0 into the assigned value, silently,
 * all the way down the block. Typed input was never affected, because typing
 * strips separators, which is exactly why the defect could sit unnoticed.
 *
 * Everything here is a pure function of the pasted text. Where the reading is a
 * judgement rather than a parse, the block is read the safe way and the reader
 * is told what was assumed, rather than the tool silently choosing for them.
 */

/** Parse a user-typed number, allowing thousands separators and exponents. */
export function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (cleaned === '') return null
  const v = Number(cleaned)
  return Number.isFinite(v) ? v : null
}

/** A number written with thousands separators, and nothing else. */
const THOUSANDS_ONLY = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/

/**
 * Values below this, when every one of them is a whole number, suggest channel
 * numbers from a 1024-resolution scale rather than linear fluorescence.
 */
const CHANNEL_CEILING = 1024

/** Rows needed before a pattern across the block means anything. */
const MIN_ROWS_FOR_PATTERN = 3

export interface PasteResult {
  grid: string[][]
  /**
   * What the reader should know about how their paste was read. Never a
   * silent correction: anything here changed what was entered, or is a
   * suspicion the tool cannot resolve on its own.
   */
  notices: string[]
}

/**
 * Whether the commas in a block separate thousands or separate columns.
 *
 * Decided for the block rather than per line, because real pasted data is
 * homogeneous and a per-line decision produces a ragged grid. A single line
 * that cannot be read as one thousands-formatted number settles it for all of
 * them, which fails towards treating commas as delimiters: that is the reading
 * the tool has always used, so a block that was parsed correctly before is
 * parsed the same way now.
 *
 * `2,050` is a separator. `2050,8300` is not, because a thousands group cannot
 * follow a four-digit head. `2050,830` is not either, for the same reason,
 * which is what keeps a genuine two-column block intact.
 */
export function commasAreThousands(lines: readonly string[]): boolean {
  const candidates = lines.filter((line) => line.trim() !== '' && !line.includes('\t'))
  if (candidates.length === 0) return false
  return candidates.every((line) => THOUSANDS_ONLY.test(line.trim()))
}

function splitLine(line: string, thousands: boolean): string[] {
  if (line.includes('\t')) return line.split('\t')
  return thousands ? [line] : line.split(',')
}

/** Cells that carry a number, ignoring blanks. */
function numericCells(column: (string | undefined)[]): number[] {
  return column
    .map((cell) => (cell === undefined ? null : parseNum(cell)))
    .filter((v): v is number => v !== null)
}

export interface ReadOptions {
  /**
   * True for the calibration table, where a block is expected to be intensity
   * against certified value and the checks below are meaningful. A sample
   * column is legitimately dim, so they are not applied there.
   */
  calibration?: boolean
}

/**
 * Parse a clipboard payload into a grid, with what was assumed along the way.
 */
export function readPaste(text: string, options: ReadOptions = {}): PasteResult {
  const notices: string[] = []

  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')

  const thousands = commasAreThousands(lines)
  let grid = lines.map((line) => splitLine(line, thousands))

  if (thousands && lines.some((line) => line.includes(','))) {
    notices.push(
      'Commas in this block were read as thousands separators, so each line was taken as one value. Paste tab separated columns if you meant two.',
    )
  }

  // A header row carries no number in any column. Dropping it is a parse rather
  // than a judgement, but the reader is told, because a row disappeared.
  const first = grid[0]
  if (
    grid.length > 1 &&
    first.some((cell) => cell.trim() !== '') &&
    first.every((cell) => parseNum(cell) === null)
  ) {
    notices.push(`A header row was ignored: ${first.join(', ').slice(0, 60)}.`)
    grid = grid.slice(1)
  }

  if (options.calibration) {
    const rows = grid.filter((cells) => cells.some((cell) => parseNum(cell) !== null))
    const firstColumn = numericCells(rows.map((cells) => cells[0]))
    const secondColumn = numericCells(rows.map((cells) => cells[1]))

    // Channel numbers rather than linear intensity. A whole block of small
    // whole numbers is the signature; a single dim value is not, which is why
    // this needs several rows and is never applied to a sample column.
    if (
      firstColumn.length >= MIN_ROWS_FOR_PATTERN &&
      firstColumn.every((v) => Number.isInteger(v) && v > 0 && v < CHANNEL_CEILING)
    ) {
      notices.push(
        `Every pasted value is a whole number below ${CHANNEL_CEILING}, which suggests channel numbers from a 1024 resolution scale rather than linear fluorescence intensity. Channel values need converting before they can be calibrated.`,
      )
    }

    // Certified values run several times the intensity in these kits, so a
    // first column that is larger in every row suggests the two were swapped.
    // Reported, never corrected: the tool cannot be sure, and a silent swap
    // would be a worse error than the one it is guessing at.
    if (
      firstColumn.length >= MIN_ROWS_FOR_PATTERN &&
      firstColumn.length === secondColumn.length &&
      firstColumn.every((v, i) => v > secondColumn[i])
    ) {
      notices.push(
        'The first pasted column is larger than the second in every row. Certified values are normally several times the intensity, so check the columns are not the other way round. Nothing has been swapped.',
      )
    }
  }

  return { grid, notices }
}
