import { formatNumber, type BeadStandard, type CurveResult, type QuantifyOptions, type Sample, type SampleResult } from './quantify'

const CSS_VARS = [
  'surface', 'surface-sunken', 'text-primary', 'text-secondary', 'text-muted',
  'grid', 'axis', 'border', 'border-strong', 'series-1', 'series-2', 'series-1-wash',
]

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Serialise the live chart to a standalone SVG.
 *
 * CSS custom properties are resolved to literal colours so the file renders
 * identically in Illustrator, Inkscape, and a manuscript pipeline — vector, not
 * a raster screenshot.
 */
export function exportChartSvg(svgId: string, filename: string) {
  const source = document.getElementById(svgId) as SVGSVGElement | null
  if (!source) return

  const resolved = new Map<string, string>()
  const rootStyle = getComputedStyle(document.documentElement)
  for (const name of CSS_VARS) {
    resolved.set(`var(--${name})`, rootStyle.getPropertyValue(`--${name}`).trim() || '#000')
  }

  const clone = source.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('id')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('font-family', 'system-ui, -apple-system, "Segoe UI", sans-serif')

  // Opaque background so the figure is legible on any page.
  const viewBox = (source.getAttribute('viewBox') ?? '0 0 580 392').split(/\s+/).map(Number)
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', String(viewBox[0]))
  bg.setAttribute('y', String(viewBox[1]))
  bg.setAttribute('width', String(viewBox[2]))
  bg.setAttribute('height', String(viewBox[3]))
  bg.setAttribute('fill', resolved.get('var(--surface)') ?? '#ffffff')
  clone.insertBefore(bg, clone.firstChild)

  let markup = new XMLSerializer().serializeToString(clone)
  for (const [token, value] of resolved) markup = markup.split(token).join(value)

  download(filename, 'image/svg+xml', `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`)
}

function csvRow(cells: (string | number | null)[]): string {
  return cells
    .map((c) => {
      if (c === null || c === undefined) return ''
      const s = String(c)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(',')
}

export interface ExportPayload {
  kitName: string
  assignedLabel: string
  options: QuantifyOptions
  standards: BeadStandard[]
  curve: CurveResult
  samples: { sample: Sample; result: SampleResult }[]
  appVersion: string
}

/**
 * Full analysis export: settings, raw inputs, fit parameters, and results in one
 * file, so a reviewer can reproduce every number without the app.
 */
export function exportResultsCsv(payload: ExportPayload, filename: string) {
  const { options, curve, standards, samples } = payload
  const rows: string[] = []

  rows.push(csvRow(['Antigen Density Calculator', payload.appVersion]))
  rows.push(csvRow(['Generated', new Date().toISOString()]))
  rows.push('')

  rows.push(csvRow(['SETTINGS']))
  rows.push(csvRow(['Calibration kit', payload.kitName]))
  rows.push(csvRow(['Standard chemistry', options.standardKind === 'abc' ? 'Certified ABC beads' : 'Certified PE molecules per bead']))
  rows.push(csvRow(['Fluorophore:protein ratio', options.standardKind === 'pe-molecules' ? options.fpRatio : 'n/a']))
  rows.push(csvRow(['Background subtraction', options.backgroundMode]))
  rows.push(csvRow(['Detection antibody valency', options.valency]))
  rows.push(csvRow(['Confidence level', options.confidenceLevel]))
  rows.push('')

  rows.push(csvRow(['STANDARD CURVE (log10-log10 ordinary least squares)']))
  rows.push(csvRow(['Slope', curve.fit.slope]))
  rows.push(csvRow(['Intercept', curve.fit.intercept]))
  rows.push(csvRow(['R squared', curve.fit.r2]))
  rows.push(csvRow(['Residual standard error', curve.fit.residualSE]))
  rows.push(csvRow(['Populations used (n)', curve.fit.n]))
  rows.push(csvRow(['Degrees of freedom', curve.fit.df]))
  rows.push(csvRow(['MFI range', `${curve.mfiRange[0]} to ${curve.mfiRange[1]}`]))
  rows.push('')

  rows.push(csvRow(['CALIBRATION STANDARDS']))
  rows.push(csvRow(['Population', 'MFI', payload.assignedLabel, 'Included in fit']))
  for (const s of standards) {
    rows.push(csvRow([s.label, s.mfi, s.assigned, s.included ? 'yes' : 'no']))
  }
  rows.push('')

  rows.push(csvRow(['SAMPLES']))
  rows.push(
    csvRow([
      'Sample', 'Sample MFI', 'Control MFI', 'Gross molecules/cell', 'Background molecules/cell',
      'Net molecules/cell', 'CI lower', 'CI upper', 'Antigen sites low', 'Antigen sites high', 'Flags',
    ]),
  )
  for (const { sample, result } of samples) {
    rows.push(
      csvRow([
        sample.label, sample.mfi, sample.controlMfi,
        result.grossAbc, result.controlAbc, result.netAbc,
        result.lower, result.upper, result.sitesLow, result.sitesHigh,
        result.flags.map((f) => f.message).join(' | '),
      ]),
    )
  }
  rows.push('')
  rows.push(csvRow(['Research use only. Not for clinical or diagnostic decision-making.']))

  download(filename, 'text/csv', rows.join('\n'))
}

/** Human-readable one-line summary, for pasting into a lab notebook. */
export function summaryLine(label: string, r: SampleResult): string {
  if (r.netAbc === null) return `${label}: not quantifiable`
  return `${label}: ${formatNumber(r.netAbc)} molecules/cell (95% CI ${formatNumber(r.lower ?? 0)}–${formatNumber(r.upper ?? 0)})`
}
