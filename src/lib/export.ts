import { confidenceLabel, formatNumber, resultStatus, type BeadStandard, type CurveResult, type QuantifyOptions, type Sample, type SampleResult } from './quantify'

const VAR_REFERENCE = /var\(--([a-z0-9-]+)\)/gi

/**
 * Replace every `var(--name)` in an attribute value with its resolved form.
 *
 * Pure so it can be tested directly. Values are substituted into the DOM before
 * serialisation, never into serialised markup: `--mono` resolves to a font stack
 * containing double quotes, and injecting that into an already-serialised
 * `font-family="..."` closes the attribute and produces a file no XML parser
 * will open.
 */
export function substituteCssVars(value: string, resolved: ReadonlyMap<string, string>): string {
  return value.replace(VAR_REFERENCE, (whole, name: string) => resolved.get(name) ?? whole)
}

/** Every custom property actually referenced by this subtree. */
function collectVarNames(el: Element, into: Set<string> = new Set()): Set<string> {
  for (const attr of Array.from(el.attributes)) {
    for (const match of attr.value.matchAll(VAR_REFERENCE)) into.add(match[1])
  }
  for (const child of Array.from(el.children)) collectVarNames(child, into)
  return into
}

/** Rewrite attributes in place, letting the serialiser handle escaping. */
function resolveAttributes(el: Element, resolved: ReadonlyMap<string, string>) {
  for (const attr of Array.from(el.attributes)) {
    if (attr.value.includes('var(--')) {
      el.setAttribute(attr.name, substituteCssVars(attr.value, resolved))
    }
  }
  for (const child of Array.from(el.children)) resolveAttributes(child, resolved)
}

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
 * Custom properties are resolved to literal values so the file renders
 * identically in Illustrator, Inkscape, and a manuscript pipeline as vector
 * output rather than a raster screenshot. The names are discovered from the
 * markup rather than listed here, so a token added to a chart cannot ship as an
 * unresolved `var(--x)` because someone forgot to register it.
 */
export function exportChartSvg(svgId: string, filename: string) {
  const source = document.getElementById(svgId) as SVGSVGElement | null
  if (!source) return

  const clone = source.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('id')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const rootStyle = getComputedStyle(document.documentElement)
  const resolved = new Map<string, string>()
  // `font` and `surface` are applied through the stylesheet rather than through
  // an attribute, so they are resolved explicitly rather than discovered.
  for (const name of [...collectVarNames(clone), 'font', 'surface']) {
    resolved.set(name, rootStyle.getPropertyValue(`--${name}`).trim() || '#000')
  }
  resolveAttributes(clone, resolved)

  // The chart inherits its face from the stylesheet, which does not travel with
  // the file, so the root carries it explicitly.
  clone.setAttribute('font-family', resolved.get('font') || 'system-ui, sans-serif')

  // Opaque background so the figure is legible on any page.
  const viewBox = (source.getAttribute('viewBox') ?? '0 0 580 392').split(/\s+/).map(Number)
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', String(viewBox[0]))
  bg.setAttribute('y', String(viewBox[1]))
  bg.setAttribute('width', String(viewBox[2]))
  bg.setAttribute('height', String(viewBox[3]))
  bg.setAttribute('fill', resolved.get('surface') || '#ffffff')
  clone.insertBefore(bg, clone.firstChild)

  const markup = new XMLSerializer().serializeToString(clone)
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

/** Rows in, CSV file out. Shared by every tool's export. */
export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  download(filename, 'text/csv', rows.map(csvRow).join('\n'))
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
  rows.push(csvRow(['Detection antibody host species', options.antibodyHost]))
  rows.push(csvRow(['Titrated to saturation', options.saturationConfirmed ? 'yes' : 'no']))
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
  if (curve.curvature) {
    rows.push(csvRow(['Curvature: quadratic term', curve.curvature.quadratic]))
    rows.push(csvRow(['Curvature: p value', curve.curvature.p]))
    rows.push(csvRow(['Curvature: local slope, low end', curve.curvature.slopeAtLow]))
    rows.push(csvRow(['Curvature: local slope, high end', curve.curvature.slopeAtHigh]))
  } else {
    rows.push(
      csvRow([
        'Curvature',
        'not tested; six populations are required before a quadratic term can be estimated with any power',
      ]),
    )
  }
  rows.push('')

  rows.push(csvRow(['CALIBRATION STANDARDS']))
  rows.push(
    csvRow(['Population', 'MFI', payload.assignedLabel, 'Included in fit', 'Residual (log10)', 'Residual (%)']),
  )
  const residualByLabel = new Map(curve.residuals.map((r) => [r.label, r]))
  for (const s of standards) {
    const r = residualByLabel.get(s.label)
    rows.push(
      csvRow([
        s.label,
        s.mfi,
        s.assigned,
        s.included ? 'yes' : 'no',
        r ? r.logResidual : null,
        r ? r.percent : null,
      ]),
    )
  }
  rows.push('')

  rows.push(csvRow(['SAMPLES']))
  rows.push(
    csvRow([
      'Sample', 'Sample MFI', 'Control MFI', 'Gross ABC', 'Background ABC', 'Net ABC',
      'CI lower', 'CI upper', 'Inferred antigen sites low', 'Inferred antigen sites high',
      'flag_status', 'within_calibrated_range', 'control_within_calibrated_range',
      'background_pct_of_gross', 'mode_divergence_pct', 'calibration_valid', 'flag_detail',
    ]),
  )
  for (const { sample, result } of samples) {
    const yesNo = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no')
    rows.push(
      csvRow([
        sample.label, sample.mfi, sample.controlMfi,
        result.grossAbc, result.controlAbc, result.netAbc,
        result.lower, result.upper, result.sitesLow, result.sitesHigh,
        resultStatus([...result.calibrationFlags, ...result.flags]),
        yesNo(result.sampleInRange),
        yesNo(result.controlInRange),
        result.backgroundFraction === null ? '' : result.backgroundFraction * 100,
        result.modeDivergence === null ? '' : result.modeDivergence * 100,
        result.calibrationFlags.length === 0 ? 'yes' : 'no',
        [...result.calibrationFlags, ...result.flags].map((f) => f.message).join(' | '),
      ]),
    )
  }
  rows.push('')
  if (!options.saturationConfirmed) {
    rows.push(
      csvRow([
        'Stain was not confirmed titrated to saturation. Every ABC in this file is a lower bound: sub-saturating antibody undercounts.',
      ]),
    )
  }
  rows.push(
    csvRow([
      'A row marked do_not_report carries its computed value so the export stays reproducible. The value is not reportable.',
    ]),
  )
  rows.push(csvRow(['Research use only. Not for clinical or diagnostic decision-making.']))

  download(filename, 'text/csv', rows.join('\n'))
}

/** Human-readable one-line summary, for pasting into a lab notebook. */
export function summaryLine(label: string, r: SampleResult, confidenceLevel: number): string {
  if (r.netAbc === null) return `${label}: below detection`
  const interval = `${confidenceLabel(confidenceLevel)} ${formatNumber(r.lower ?? 0)}–${formatNumber(r.upper ?? 0)}`
  return `${label}: ${formatNumber(r.netAbc)} ABC (${interval})`
}

// ---------------------------------------------------------------------------
// Cytotoxicity export
// ---------------------------------------------------------------------------

export interface CytotoxExportSeries {
  label: string
  points: { dose: number | null; response: number | null }[]
  ec50: number | null
  ec50Lower: number | null
  ec50Upper: number | null
  potencyLabel: string
  hill: number | null
  top: number | null
  bottom: number | null
  r2: number | null
  n: number | null
  converged: boolean | null
  flags: string[]
}

export interface CytotoxExportPayload {
  doseLabel: string
  responseLabel: string
  responseIsPercent: boolean
  confidenceLevel: number
  series: CytotoxExportSeries[]
  appVersion: string
}

/**
 * Full analysis export: settings, every entered point, and the fit parameters
 * for each construct, so a reviewer can reproduce the figures without the app.
 */
export function exportCytotoxCsv(payload: CytotoxExportPayload, filename: string) {
  const rows: (string | number | null)[][] = []

  rows.push(['Ligant Cytotoxicity Curve Fitter', payload.appVersion])
  rows.push(['Generated', new Date().toISOString()])
  rows.push([])

  rows.push(['SETTINGS'])
  rows.push(['Dose axis', payload.doseLabel])
  rows.push(['Response axis', payload.responseLabel])
  rows.push(['Response scale', payload.responseIsPercent ? 'percentage' : 'unbounded'])
  rows.push(['Confidence level', payload.confidenceLevel])
  rows.push([])

  rows.push(['FIT PARAMETERS (four parameter logistic, log10 dose axis)'])
  rows.push([
    'Construct', 'Potency', 'Potency value', 'CI lower', 'CI upper',
    'Hill slope', 'Top plateau', 'Bottom plateau', 'R squared', 'Points', 'Converged', 'Flags',
  ])
  for (const s of payload.series) {
    rows.push([
      s.label, s.potencyLabel, s.ec50, s.ec50Lower, s.ec50Upper,
      s.hill, s.top, s.bottom, s.r2, s.n,
      s.converged === null ? '' : s.converged ? 'yes' : 'no',
      s.flags.join(' | '),
    ])
  }
  rows.push([])

  rows.push(['DATA'])
  rows.push([payload.doseLabel, ...payload.series.map((s) => s.label)])
  const rowCount = Math.max(0, ...payload.series.map((s) => s.points.length))
  for (let i = 0; i < rowCount; i++) {
    rows.push([
      payload.series[0]?.points[i]?.dose ?? null,
      ...payload.series.map((s) => s.points[i]?.response ?? null),
    ])
  }
  rows.push([])
  rows.push(['Research use only. Not for clinical or diagnostic decision-making.'])

  downloadCsv(filename, rows)
}
