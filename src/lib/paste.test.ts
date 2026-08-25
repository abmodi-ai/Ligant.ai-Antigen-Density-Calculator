import { describe, it, expect } from 'vitest'
import { commasAreThousands, parseNum, readPaste } from './paste'

/** The grid as the table would read it: numbers, not strings. */
const numbers = (text: string, calibration = true) =>
  readPaste(text, { calibration }).grid.map((row) => row.map(parseNum))

describe('the defect this module exists to prevent', () => {
  // Splitting on a comma whenever a line had no tab turned one value into two
  // cells, filling the intensity with 51 and the certified value with 0, all
  // the way down a pasted column. Typed input was never affected, because
  // typing strips separators, which is why it went unnoticed.
  it('reads a thousands-formatted value as one number, not two cells', () => {
    expect(numbers('51,000')).toEqual([[51_000]])
  })

  it('reads a whole column of them', () => {
    expect(numbers('2,050\n12,900\n121,000')).toEqual([[2_050], [12_900], [121_000]])
  })

  it('still reads a genuine two-column block as two columns', () => {
    expect(numbers('2050,8300\n12900,51000')).toEqual([
      [2_050, 8_300],
      [12_900, 51_000],
    ])
  })

  it('is not fooled by a three-digit second column', () => {
    // "830" is three digits, but "2050" cannot be the head of a thousands
    // group, and that is what settles it.
    expect(numbers('2050,830\n12900,910')).toEqual([
      [2_050, 830],
      [12_900, 910],
    ])
  })

  it('leaves tab separated columns alone, separators and all', () => {
    expect(numbers('2,050\t8,300\n12,900\t51,000')).toEqual([
      [2_050, 8_300],
      [12_900, 51_000],
    ])
  })

  it('says so when it read commas as separators', () => {
    expect(readPaste('2,050\n12,900').notices.join(' ')).toMatch(/thousands separators/i)
  })

  it('says nothing when there were no commas to interpret', () => {
    expect(readPaste('2050\t8300').notices).toEqual([])
  })
})

describe('commasAreThousands', () => {
  it('needs every line to agree, so a mixed block stays delimited', () => {
    expect(commasAreThousands(['2,050', '12,900'])).toBe(true)
    expect(commasAreThousands(['2,050', '2050,8300'])).toBe(false)
  })

  it('ignores lines that carry a tab, which are already unambiguous', () => {
    expect(commasAreThousands(['2,050\t8,300'])).toBe(false)
  })

  it('is false for an empty block rather than throwing', () => {
    expect(commasAreThousands([])).toBe(false)
    expect(commasAreThousands(['', '  '])).toBe(false)
  })
})

describe('header rows', () => {
  it('drops a row that carries no number in any column, and says which', () => {
    const result = readPaste('MFI\tABC\n2050\t8300\n12900\t51000')
    expect(result.grid).toEqual([
      ['2050', '8300'],
      ['12900', '51000'],
    ])
    expect(result.notices.join(' ')).toMatch(/header row was ignored: MFI, ABC/)
  })

  it('keeps a first row that carries a number', () => {
    expect(readPaste('2050\t8300\n12900\t51000').grid).toHaveLength(2)
  })

  it('does not drop the only row', () => {
    expect(readPaste('MFI').grid).toEqual([['MFI']])
  })
})

describe('patterns the tool reports but does not act on', () => {
  it('recognises channel numbers from a 1024 resolution scale', () => {
    const notices = readPaste('120\t8300\n340\t51000\n780\t175000', { calibration: true }).notices
    expect(notices.join(' ')).toMatch(/channel numbers/i)
  })

  it('does not cry channel scale over a single dim value', () => {
    const notices = readPaste('120\t8300\n12900\t51000\n39500\t175000', { calibration: true }).notices
    expect(notices.join(' ')).not.toMatch(/channel numbers/i)
  })

  it('leaves a sample column alone, which is legitimately dim', () => {
    // Control intensities of 240, 310 and 260 are ordinary, not channel numbers.
    const notices = readPaste('240\n310\n260', { calibration: false }).notices
    expect(notices.join(' ')).not.toMatch(/channel numbers/i)
  })

  it('notices a first column larger than the second in every row', () => {
    const notices = readPaste('8300\t2050\n51000\t12900\n175000\t39500', { calibration: true }).notices
    expect(notices.join(' ')).toMatch(/other way round/i)
  })

  it('swaps nothing, whatever it suspects', () => {
    const result = readPaste('8300\t2050\n51000\t12900\n175000\t39500', { calibration: true })
    expect(result.grid[0]).toEqual(['8300', '2050'])
    expect(result.notices.join(' ')).toMatch(/Nothing has been swapped/)
  })

  it('says nothing about a correctly ordered block', () => {
    const notices = readPaste('2050\t8300\n12900\t51000\n39500\t175000', { calibration: true }).notices
    expect(notices).toEqual([])
  })
})

describe('the worked example, pasted', () => {
  it('reads the shipped standards exactly, however they are formatted', () => {
    const tabbed = '2050\t8300\n12900\t51000\n39500\t175000\n121000\t512000'
    const commas = '2,050\t8,300\n12,900\t51,000\n39,500\t175,000\n121,000\t512,000'
    const expected = [
      [2_050, 8_300],
      [12_900, 51_000],
      [39_500, 175_000],
      [121_000, 512_000],
    ]
    expect(numbers(tabbed)).toEqual(expected)
    expect(numbers(commas)).toEqual(expected)
  })
})

describe('a block whose two columns are the same numbers', () => {
  // Found live. The column-swap guard tests strictly greater, so equal columns
  // slipped past it, and equal columns are the worse case: the standard fits
  // perfectly and every result is the raw intensity in calibrated clothing.
  it('is named, because it fits perfectly and is wrong', () => {
    const notices = readPaste('2050\t2050\n12900\t12900\n39500\t39500', {
      calibration: true,
    }).notices
    expect(notices.join(' ')).toMatch(/same numbers/i)
  })

  it('says nothing about a genuine pair of columns', () => {
    const notices = readPaste('2050\t8300\n12900\t51000\n39500\t175000', {
      calibration: true,
    }).notices
    expect(notices.join(' ')).not.toMatch(/same numbers/i)
  })
})
