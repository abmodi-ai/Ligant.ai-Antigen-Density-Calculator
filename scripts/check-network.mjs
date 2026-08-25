/**
 * Runtime assertions against the production build, in a real browser.
 *
 * The original and most important of these is that the application contacts no
 * third party: string scanning cannot establish that, only observing the browser
 * can. The CSP from public/_headers is applied as a real response header, so
 * this also confirms the policy does not break the app.
 *
 * The remaining assertions are regressions found during a pre-launch audit,
 * pinned here so they cannot return:
 *
 *   - every page carries the privacy disclosure, since privacy is the product's
 *     central claim and a tool that quietly lacked it would undercut the rest
 *   - every page exposes a main landmark and a skip link
 *   - nothing overflows horizontally at 360px, tables included
 *   - an extreme numeric input cannot explode the chart, which once turned a
 *     39 element plot into 729 gridlines and an unreadable smear
 */

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const PORT = 8971
const ORIGIN = `http://localhost:${PORT}`
// Use an explicitly provided browser when there is one, otherwise let Playwright
// resolve the chromium it manages. CI installs that browser itself.
const CHROME = process.env.CHROME_PATH

/** The configured origin, from the single module that defines it. */
const SITE_URL = (readFileSync('src/lib/site.ts', 'utf8').match(/SITE_URL\s*=\s*['"]([^'"]+)['"]/) ?? [])[1]
if (!SITE_URL) {
  console.error('Could not read SITE_URL from src/lib/site.ts.')
  process.exit(1)
}

/**
 * The tool registry, read the same way and for the same reason: this script
 * must not carry its own copy of what the site contains, or unlisting a tool
 * would leave the assertion below testing the previous shape of the site.
 */
const TOOLS = [...readFileSync('src/lib/site.ts', 'utf8').matchAll(
  /\{\s*id:\s*'([^']+)'[^}]*?path:\s*'([^']+)'[^}]*?listed:\s*(true|false)\s*\}/g,
)].map(([, id, path, listed]) => ({ id, path, listed: listed === 'true' }))
if (TOOLS.length === 0) {
  console.error('Could not read the tool registry from src/lib/site.ts.')
  process.exit(1)
}

const csp = readFileSync('public/_headers', 'utf8')
  .split('\n')
  .find((l) => l.trim().startsWith('Content-Security-Policy:'))
  ?.split(':')
  .slice(1)
  .join(':')
  .trim()

if (!csp) {
  console.error('Could not read the Content-Security-Policy from public/_headers.')
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
}

const server = createServer(async (req, res) => {
  // Resolve a directory to its index, the way a static host does, so the
  // multi-page routes under /cytotoxicity/ behave here as they do in production.
  let path = req.url.split('?')[0]
  if (path.endsWith('/')) path += 'index.html'
  try {
    const body = await readFile(join('dist', path))
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      'Content-Security-Policy': csp,
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(PORT)

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })

const foreign = []
const cspViolations = []
page.on('request', (r) => {
  if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
    foreign.push(`${r.method()} ${r.url()}`)
  }
})
page.on('console', (m) => {
  if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text())
})

// Every page in the suite, each exercised the way a user would, so that any
// lazily triggered request fires.
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.locator('#bg').selectOption('none')
await page.locator('#valency').selectOption('monovalent')
await page.locator('#conf').selectOption('0.99')
await page.getByRole('button', { name: 'Clear all' }).click()
await page.getByRole('button', { name: 'Load worked example' }).click()
await page.locator('table').first().locator('input[inputmode="decimal"]').first().fill('3000')
await page.locator('details.options summary').first().click().catch(() => {})
await page.waitForTimeout(1000)

await page.goto(ORIGIN + '/cytotoxicity/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.locator('#conf').selectOption('0.99')
await page.locator('#pct').selectOption('other')
await page.getByRole('button', { name: '+ Add construct' }).click()
await page.locator('table').first().locator('input[inputmode="decimal"]').first().fill('0.2')
await page.getByRole('button', { name: 'Clear all' }).click()
await page.getByRole('button', { name: 'Load worked example' }).click()
await page.waitForTimeout(1200)

// ---- pre-launch regressions ------------------------------------------------

const uiFailures = []

for (const [name, path] of [['antigen density', '/'], ['cytotoxicity', '/cytotoxicity/']]) {
  await page.goto(ORIGIN + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const structure = await page.evaluate(() => ({
    hasMain: !!document.querySelector('main#main'),
    hasSkipLink: !!document.querySelector('a.skip-link'),
    // The disclosure is rendered by one shared component in both tools.
    hasPrivacy: /contacts no third party at all/i.test(document.body.innerText),
    hasClearStorage: !!document.body.innerText.match(/Clear stored data/),
    hasSuiteMark: /bench tools/i.test(document.querySelector('.masthead')?.textContent ?? ''),
    hasGuidanceSwitch: !!document.querySelector('[role="switch"]'),
  }))
  if (!structure.hasMain) uiFailures.push(`${name}: no main landmark`)
  if (!structure.hasSkipLink) uiFailures.push(`${name}: no skip link`)
  if (!structure.hasPrivacy) uiFailures.push(`${name}: privacy disclosure missing`)
  if (!structure.hasClearStorage) uiFailures.push(`${name}: no control to clear stored data`)
  if (!structure.hasSuiteMark) uiFailures.push(`${name}: the masthead does not name the suite`)
  // Guidance is on for everyone, so there is nothing to switch. A switch left
  // rendering would offer to turn off something that no longer reads it.
  if (structure.hasGuidanceSwitch) {
    uiFailures.push(`${name}: a guidance switch is still rendered`)
  }

  // An extreme value must coarsen the axis, not multiply it.
  const before = await page.evaluate(() => document.querySelectorAll('svg.chart line').length)
  const numeric = page.locator('input[inputmode="decimal"]')
  await numeric.first().fill('1e300')
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => document.querySelectorAll('svg.chart line').length)
  if (after > 80) {
    uiFailures.push(`${name}: chart drew ${after} lines after an extreme input (was ${before})`)
  }

  // Social and canonical metadata. A relative og:image yields a preview card
  // with no image on every platform that renders one, which is invisible until
  // somebody shares the link.
  const meta = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null,
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null,
    twitterImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ?? null,
    title: document.title,
  }))
  if (!meta.canonical) uiFailures.push(`${name}: no canonical link`)
  if (!meta.ogUrl) uiFailures.push(`${name}: no og:url`)
  for (const [label, value] of [['og:image', meta.ogImage], ['twitter:image', meta.twitterImage]]) {
    if (!value) uiFailures.push(`${name}: no ${label}`)
    else if (!/^https?:\/\//.test(value)) uiFailures.push(`${name}: ${label} is relative (${value})`)
  }
  for (const [label, value] of [['canonical', meta.canonical], ['og:url', meta.ogUrl], ['og:image', meta.ogImage]]) {
    if (value && !value.startsWith(SITE_URL)) {
      uiFailures.push(`${name}: ${label} does not use the configured origin (${value})`)
    }
  }
  if (!meta.title) uiFailures.push(`${name}: no document title`)

  // The exported figure must be a file a parser will actually open. Resolving
  // custom properties into already-serialised markup once produced
  // font-family=""IBM Plex Mono", ...", which closes the attribute and yields a
  // file every XML parser rejects.
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.getByRole('button', { name: 'Export SVG' }).click(),
    ])
    const svg = await readFile(await download.path(), 'utf8')
    const parse = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
      const error = doc.querySelector('parsererror')
      return {
        error: error ? error.textContent.slice(0, 140) : null,
        texts: doc.querySelectorAll('text').length,
        paths: doc.querySelectorAll('path').length,
        unresolved: /var\(--/.test(markup),
      }
    }, svg)
    if (parse.error) uiFailures.push(`${name}: exported SVG is not well formed: ${parse.error}`)
    if (parse.unresolved) uiFailures.push(`${name}: exported SVG still contains an unresolved var()`)
    if (parse.texts === 0) uiFailures.push(`${name}: exported SVG has no text elements`)
    if (parse.paths === 0) uiFailures.push(`${name}: exported SVG has no drawn paths`)
  } catch (e) {
    uiFailures.push(`${name}: SVG export failed (${String(e).slice(0, 70)})`)
  }

  // Every guidance panel must be fully on screen. They are portalled out of the
  // card that holds them precisely because that card clips its overflow, which
  // once cut the panels off at the edges.
  const pins = page.locator('.guidance-pin-button')
  const pinCount = await pins.count()
  if (pinCount === 0) uiFailures.push(`${name}: no guidance pins rendered`)
  for (let i = 0; i < pinCount; i++) {
    const pin = pins.nth(i)
    await pin.scrollIntoViewIfNeeded().catch(() => {})
    await pin.click()
    await page.waitForTimeout(140)
    const panel = await page.evaluate(() => {
      const el = document.querySelector('.guidance-panel')
      if (!el) return { missing: true }
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40))
      return {
        label: el.querySelector('h4')?.textContent?.slice(0, 40) ?? 'untitled',
        off:
          r.left < 0 || r.top < 0 ||
          r.right > window.innerWidth || r.bottom > window.innerHeight,
        covered: !(hit && el.contains(hit)),
      }
    })
    if (panel.missing) uiFailures.push(`${name}: a pin opened no panel`)
    else if (panel.off) uiFailures.push(`${name}: guidance panel "${panel.label}" runs off screen`)
    else if (panel.covered) uiFailures.push(`${name}: guidance panel "${panel.label}" is obscured`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(60)
  }

  // Narrowest common handset width.
  await page.setViewportSize({ width: 360, height: 900 })
  await page.waitForTimeout(500)
  const overflow = await page.evaluate(() => {
    const wide = [...document.querySelectorAll('table')]
      .filter((t) => t.scrollWidth > t.parentElement.clientWidth + 2)
      .filter((t) => getComputedStyle(t.parentElement).overflowX === 'visible')
      .map((t) => t.querySelector('caption')?.textContent ?? 'untitled table')
    return { page: document.documentElement.scrollWidth > window.innerWidth, clipped: wide }
  })
  if (overflow.page) uiFailures.push(`${name}: page scrolls horizontally at 360px`)
  for (const t of overflow.clipped) uiFailures.push(`${name}: "${t}" is clipped at 360px`)
  await page.setViewportSize({ width: 1280, height: 900 })
}

await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// ---------------------------------------------------------------------------
// Antigen density disclosure, on a pristine worked example.
//
// The loop above fills an extreme value and persists it, so the state is
// cleared first: these assertions are about what the demo says, and the demo is
// what a first-time visitor sees.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)

const disclosure = await page.evaluate(() => {
  const text = document.body.innerText
  const cards = [...document.querySelectorAll('.result-card')].map((c) => c.innerText)
  return {
    // ABC is not antigen copy number, and the tool said so in its method panel
    // while leading with the opposite claim in its largest type.
    unqualifiedClaim: /molecules\s*(\/|per)\s*cell/i.test(text.replace(/antibody molecules bound per cell/gi, '')),
    metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    headlineUnits: [...document.querySelectorAll('.result-card .hero .unit')].map((u) => u.innerText),
    cards,
  }
})

if (disclosure.unqualifiedClaim) {
  uiFailures.push('antigen density: an unqualified "molecules per cell" claim is rendered')
}
if (/molecules\s*(\/|per)\s*cell/i.test(disclosure.metaDescription)) {
  uiFailures.push('antigen density: meta description still claims molecules per cell')
}
for (const unit of disclosure.headlineUnits) {
  if (unit.trim() !== 'ABC') uiFailures.push(`antigen density: headline unit is "${unit}", not ABC`)
}
if (disclosure.cards.length !== 3) {
  uiFailures.push(`antigen density: worked example rendered ${disclosure.cards.length} cards, expected 3`)
}

// Background as a share of gross is the diagnostic that decides whether an
// extrapolated control matters, so it appears on every card carrying a control,
// flagged or not.
for (const [i, card] of disclosure.cards.entries()) {
  if (!/% of gross/.test(card)) {
    uiFailures.push(`antigen density: card ${i + 1} does not report background as a share of gross`)
  }
}

// The demo's discrimination: 61.4% of gross on an extrapolated control is
// escalated; 2.5% on an equally extrapolated control stays quiet. A flag that
// fires on every card teaches nobody anything.
const keratinocyte = disclosure.cards.find((c) => /keratinocyte/i.test(c)) ?? ''
const cd19 = disclosure.cards.find((c) => /CD19/i.test(c)) ?? ''
if (!/of gross density/.test(keratinocyte)) {
  uiFailures.push('antigen density: the dominant-background sample is not flagged')
}
if (/of gross density/.test(cd19)) {
  uiFailures.push('antigen density: an immaterial background was flagged, which trains users to ignore flags')
}

// Per-population residuals, which R squared alone conceals.
const residuals = await page.evaluate(
  () => document.querySelectorAll('.residual-strip b').length,
)
if (residuals !== 4) uiFailures.push(`antigen density: ${residuals} residuals shown, expected 4`)

// A flag that survives only on screen stops working when the value enters a
// notebook, so the export carries a machine-readable status too.
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  const csv = await readFile(await download.path(), 'utf8')
  for (const column of ['flag_status', 'background_pct_of_gross', 'control_within_calibrated_range']) {
    if (!csv.includes(column)) uiFailures.push(`antigen density: CSV export has no ${column} column`)
  }
  if (!csv.includes('do_not_report')) {
    uiFailures.push('antigen density: CSV export marks nothing do_not_report, though the demo contains such a row')
  }
  if (!/Detection antibody host species/.test(csv)) {
    uiFailures.push('antigen density: CSV export does not record the declared antibody host')
  }
  // Absence of the curvature test is not evidence of a straight standard, so
  // the export says which of the two it is rather than omitting the row.
  if (!/^Curvature/m.test(csv)) {
    uiFailures.push('antigen density: CSV export says nothing about curvature, tested or not')
  }
} catch (e) {
  uiFailures.push(`antigen density: CSV export failed (${String(e).slice(0, 70)})`)
}

// ---------------------------------------------------------------------------
// A returning user, whose stored settings predate the options added since.
//
// Restoring that payload directly left a new key undefined. The select bound to
// it rendered uncontrolled and reported its first option, so the interface
// showed a valid choice while the guard received nothing and accused the user of
// a mismatch against "undefined". It reproduced only from stored state, which is
// why nothing constructed from defaults ever saw it.
// ---------------------------------------------------------------------------
await page.evaluate(() => {
  localStorage.setItem(
    'adc.state.v1',
    JSON.stringify({
      kitId: 'qsc-mouse',
      standards: [
        { id: 'd0', label: 'Blank', mfi: 210, assigned: null, included: false },
        { id: 'd1', label: 'Population 1', mfi: 2050, assigned: 8300, included: true },
        { id: 'd2', label: 'Population 2', mfi: 12900, assigned: 51000, included: true },
        { id: 'd3', label: 'Population 3', mfi: 39500, assigned: 175000, included: true },
        { id: 'd4', label: 'Population 4', mfi: 121000, assigned: 512000, included: true },
      ],
      samples: [{ id: 's1', label: 'CD19 (NALM-6)', mfi: 8900, controlMfi: 240 }],
      // Exactly the option set the released version wrote: no antibodyHost,
      // no saturationConfirmed.
      options: {
        standardKind: 'abc',
        fpRatio: 1,
        backgroundMode: 'abc',
        valency: 'bivalent',
        confidenceLevel: 0.95,
      },
    }),
  )
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)

const returning = await page.evaluate(() => ({
  text: document.body.innerText,
  host: document.querySelector('#host')?.value ?? null,
  criticals: document.querySelectorAll('[role="alert"]').length,
  value: document.querySelector('.result-card .hero .value')?.innerText ?? '',
}))
if (/undefined/i.test(returning.text)) {
  uiFailures.push('antigen density: restored state renders the word "undefined" to the user')
}
if (returning.criticals > 0) {
  uiFailures.push(
    `antigen density: restored state raised ${returning.criticals} critical flag(s) on settings the user never changed`,
  )
}
if (returning.host !== 'unstated') {
  uiFailures.push(`antigen density: restored host select reads "${returning.host}", expected unstated`)
}
if (!returning.value.startsWith('35,63')) {
  uiFailures.push(`antigen density: restored state computed "${returning.value}", expected 35,636`)
}

// ---------------------------------------------------------------------------
// An invalidated calibration must reach the figures it invalidates. The curve
// and the results are separate panels, and a reader who scrolls to their number
// would otherwise never pass the alarm.
// ---------------------------------------------------------------------------
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.selectOption('#host', 'rat')
await page.waitForTimeout(600)

const invalidated = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.result-card')]
  return {
    count: cards.length,
    withoutAlarm: cards.filter((c) => !/cannot calibrate this stain/i.test(c.innerText)).length,
    withBand: cards.filter((c) => c.querySelector('.band-chip')).length,
    withVerdict: cards.filter((c) => /Full effector response is expected/i.test(c.innerText)).length,
    withFigure: cards.filter((c) => /\d/.test(c.querySelector('.hero .value')?.textContent ?? ''))
      .length,
  }
})
if (invalidated.count === 0) uiFailures.push('antigen density: no result cards under a host mismatch')
if (invalidated.withoutAlarm > 0) {
  uiFailures.push(
    `antigen density: ${invalidated.withoutAlarm} card(s) render a figure without the calibration alarm that invalidates it`,
  )
}
if (invalidated.withBand > 0) {
  uiFailures.push(`antigen density: ${invalidated.withBand} card(s) show a density band on an invalid calibration`)
}
if (invalidated.withVerdict > 0) {
  uiFailures.push(
    `antigen density: ${invalidated.withVerdict} card(s) interpret a figure the calibration cannot support`,
  )
}
// This is the case that matters for withholding: a host mismatch leaves the
// arithmetic perfectly able to produce 35,636, and the tool must decline to.
if (invalidated.withFigure > 0) {
  uiFailures.push(
    `antigen density: ${invalidated.withFigure} card(s) still print a figure under an invalidated calibration`,
  )
}

try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  const csv = await readFile(await download.path(), 'utf8')
  if (!csv.includes('calibration_valid')) {
    uiFailures.push('antigen density: CSV export has no calibration_valid column')
  }
  const sampleRows = csv.split('\n').filter((r) => /^CD19|^HER2/.test(r))
  for (const row of sampleRows) {
    if (!row.includes('do_not_report')) {
      uiFailures.push('antigen density: an invalidated calibration exported a row not marked do_not_report')
      break
    }
  }
} catch (e) {
  uiFailures.push(`antigen density: CSV export under a mismatch failed (${String(e).slice(0, 70)})`)
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// Whether the calibration is usable, said where it was built.
//
// The table is in one panel and the chart in another, so a reader who has just
// finished typing had nothing telling them whether it worked. An unusable
// calibration must also withhold the figure it cannot support: a number on the
// page invites being written down, whatever sits above it.
// ---------------------------------------------------------------------------
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const verdictOk = await page.evaluate(() => ({
  text: document.querySelector('.verdict')?.textContent ?? '',
  invalid: !!document.querySelector('.verdict-invalid'),
}))
if (!/Calibration valid/.test(verdictOk.text)) {
  uiFailures.push(`antigen density: the worked example reports "${verdictOk.text.slice(0, 60)}", expected a valid calibration`)
}
if (verdictOk.invalid) uiFailures.push('antigen density: a sound calibration is reported as unusable')

// Invert the standard: certified values falling as intensity rises.
for (const [population, value] of [
  ['Population 1', '512000'],
  ['Population 2', '175000'],
  ['Population 3', '51000'],
  ['Population 4', '8300'],
]) {
  await page.getByLabel(`Assigned value for ${population}`).fill(value)
}
await page.waitForTimeout(700)

const inverted = await page.evaluate(() => ({
  verdict: document.querySelector('.verdict')?.textContent ?? '',
  headlines: [...document.querySelectorAll('.result-card .hero .value')].map((v) => v.textContent),
  bands: document.querySelectorAll('.result-card .band-chip').length,
  digits: [...document.querySelectorAll('.result-card .hero .value')].filter((v) =>
    /\d/.test(v.textContent ?? ''),
  ).length,
}))
if (!/not usable/i.test(inverted.verdict)) {
  uiFailures.push('antigen density: a downward sloping standard is not reported as unusable')
}
if (!/slopes downward/i.test(inverted.verdict)) {
  uiFailures.push(`antigen density: the verdict leads with "${inverted.verdict.slice(0, 70)}" rather than what is wrong with the curve`)
}
if (inverted.digits > 0) {
  uiFailures.push(`antigen density: ${inverted.digits} card(s) still show a figure under an unusable calibration`)
}
if (inverted.headlines.some((h) => !/Calibration invalid/.test(h ?? ''))) {
  uiFailures.push(`antigen density: a card headline reads ${JSON.stringify(inverted.headlines)} under an unusable calibration`)
}
if (inverted.bands > 0) {
  uiFailures.push('antigen density: a density band was offered on an unusable calibration')
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// A population that disagrees with the rest of the table.
//
// R squared can say a table is wrong without saying which row. This names the
// row, at the row, at the moment it is entered. The case is a tenfold slip on
// the top population, which leaves the order intact, so the monotonicity check
// stays silent and nothing else locates it.
// ---------------------------------------------------------------------------
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const cleanFlags = await page.evaluate(() => document.querySelectorAll('.row-flag').length)
if (cleanFlags !== 0) {
  uiFailures.push(`antigen density: the worked example raised ${cleanFlags} row warning(s), expected none`)
}

await page.getByLabel('Assigned value for Population 4').fill('5120000')
await page.waitForTimeout(500)

const rowFlag = await page.evaluate(() => {
  const flags = [...document.querySelectorAll('.row-flag')]
  const rows = [...document.querySelectorAll('tr.inconsistent')]
  return {
    count: flags.length,
    text: flags[0]?.innerText ?? '',
    // The warning has to sit against the row it accuses, not in a panel below.
    marked: rows.map((r) => r.querySelector('input[aria-label^="Label for"]')?.value ?? ''),
  }
})
if (rowFlag.count !== 1) {
  uiFailures.push(`antigen density: a tenfold slip on one population raised ${rowFlag.count} row warnings, expected 1`)
}
if (!/Population 4/.test(rowFlag.text)) {
  uiFailures.push('antigen density: the row warning does not name the population it accuses')
}
if (rowFlag.marked[0] !== 'Population 4') {
  uiFailures.push(`antigen density: the marked row is ${JSON.stringify(rowFlag.marked)}, expected Population 4`)
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// Pasting a column of thousands-formatted values.
//
// The parser used to split on every comma in a line without a tab, so a pasted
// column of 2,050 and 12,900 became two cells per row: 2 into the intensity and
// 50 into the certified value, silently, all the way down. Typed input was
// never affected, because typing strips separators, which is why it went
// unnoticed. This drives the real path rather than the parser.
// ---------------------------------------------------------------------------
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Clear all' }).click()
await page.waitForTimeout(400)

await page.evaluate(() => {
  const cell = document.querySelector('input[aria-label^="MFI for"]')
  cell.focus()
  const data = new DataTransfer()
  data.setData('text/plain', '2,050\n12,900\n39,500\n121,000')
  cell.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  )
})
await page.waitForTimeout(500)

const pasted = await page.evaluate(() => ({
  mfi: [...document.querySelectorAll('input[aria-label^="MFI for"]')].map((i) => i.value),
  assigned: [...document.querySelectorAll('input[aria-label^="Assigned value for"]')].map(
    (i) => i.value,
  ),
  notice: document.querySelector('.paste-notice')?.innerText ?? '',
}))
const expectedMfi = ['2050', '12900', '39500', '121000']
if (expectedMfi.some((value, i) => pasted.mfi[i] !== value)) {
  uiFailures.push(
    `antigen density: a pasted thousands-formatted column read as ${JSON.stringify(pasted.mfi.slice(0, 4))}, expected ${JSON.stringify(expectedMfi)}`,
  )
}
if (pasted.assigned.slice(0, 4).some((value) => value !== '')) {
  uiFailures.push('antigen density: a single pasted column spilled into the certified value column')
}
if (!/thousands separators/i.test(pasted.notice)) {
  uiFailures.push('antigen density: the reader was not told how the commas in their paste were read')
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// What is wrong with one value, said at the field it was typed into.
//
// Every other check in this tool speaks about the table or the curve, which
// means a reader learns about a mistyped cell after scrolling past a chart.
// These are the two that are worth catching at the row: a population carrying
// an intensity and no certified value, which is dropped from the fit without
// saying so, and a control brighter than the sample it belongs to, which is
// usually two columns entered the wrong way round.
// ---------------------------------------------------------------------------
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// The shipped example carries a row named "Blank" with no certified value,
// left out of the fit. Nothing may be said about it: the rule is on inclusion,
// never on what a row is called, because labels are free text.
const quietStart = await page.evaluate(() => document.querySelectorAll('.row-flag').length)
if (quietStart !== 0) {
  uiFailures.push(`antigen density: the worked example raised ${quietStart} field warning(s) before anything was typed`)
}

await page.getByLabel('Assigned value for Population 3').fill('')
await page.waitForTimeout(500)

const orphan = await page.evaluate(() => {
  const field = document.querySelector('input[aria-label="Assigned value for Population 3"]')
  const flag = field?.closest('tr')?.nextElementSibling
  return {
    marked: field?.getAttribute('aria-invalid'),
    text: flag?.classList.contains('row-flag') ? flag.textContent ?? '' : '',
  }
})
if (orphan.marked !== 'true') {
  uiFailures.push('antigen density: a population with no certified value is not marked at the field')
}
if (!/certified value/i.test(orphan.text)) {
  uiFailures.push(`antigen density: the row beneath a population with no certified value reads "${orphan.text.slice(0, 70)}"`)
}

await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// The control at 9,600 against a stained reading of 8,900. A real population
// can read this way, so it is a caveat rather than a refusal, and the result
// is still computed.
await page.getByLabel('Control MFI for CD19 (NALM-6)').fill('9600')
await page.waitForTimeout(500)

const swapped = await page.evaluate(() => {
  const field = document.querySelector('input[aria-label="Control MFI for CD19 (NALM-6)"]')
  const flag = field?.closest('tr')?.nextElementSibling
  return {
    marked: field?.className ?? '',
    invalid: field?.getAttribute('aria-invalid'),
    text: flag?.classList.contains('row-flag') ? flag.textContent ?? '' : '',
  }
})
if (!/cell-warning/.test(swapped.marked)) {
  uiFailures.push('antigen density: a control brighter than its sample is not marked at the field')
}
if (swapped.invalid === 'true') {
  uiFailures.push('antigen density: a control brighter than its sample is treated as an invalid entry rather than a caveat')
}
if (!/other way round/i.test(swapped.text)) {
  uiFailures.push(`antigen density: the row beneath a brighter control reads "${swapped.text.slice(0, 70)}"`)
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// Asking a question at a card.
//
// Every answer is a passage already in the page, so the assertions are about
// provenance rather than plausibility: what comes back must be a corpus title,
// a question the corpus cannot answer must be declined rather than approximated,
// and nothing the reader types may reach storage.
// ---------------------------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
let opened = false
const askPins = page.locator('.guidance-pin-button')
for (let i = 0; i < (await askPins.count()); i++) {
  const label = await askPins.nth(i).getAttribute('aria-label')
  if (/isotype|control/i.test(label ?? '')) {
    await askPins.nth(i).click()
    opened = true
    break
  }
}
if (!opened) uiFailures.push('antigen density: no guidance pin to ask a question at')
else {
  await page.waitForTimeout(400)
  const form = page.locator('.guidance-panel .ask-row input')
  if ((await form.count()) === 0) {
    uiFailures.push('antigen density: the guidance panel offers no way to ask a question')
  } else {
    // A question the corpus answers.
    await form.fill('isotype or FMO')
    await page.locator('.guidance-panel .ask-row button').click()
    await page.waitForTimeout(400)

    // One it cannot.
    const SECRET = 'how do I cite this tool'
    await form.fill(SECRET)
    await page.locator('.guidance-panel .ask-row button').click()
    await page.waitForTimeout(400)

    const ask = await page.evaluate(() => {
      const panel = document.querySelector('.guidance-panel')
      const exchanges = [...(panel?.querySelectorAll('.ask-exchange') ?? [])]
      return {
        exchanges: exchanges.length,
        answered: exchanges.filter((e) => e.querySelector('.ask-answer, .ask-seen')).length,
        declined: exchanges.filter((e) => e.querySelector('.ask-empty')).length,
        // Every rendered answer must carry the heading of the passage it came
        // from. A heading is what lets a reader see a near miss for what it is.
        headless: [...(panel?.querySelectorAll('.ask-answer') ?? [])].filter(
          (a) => !a.querySelector('h5')?.textContent?.trim(),
        ).length,
      }
    })
    if (ask.exchanges !== 2) uiFailures.push(`antigen density: ${ask.exchanges} exchanges rendered, expected 2`)
    if (ask.answered !== 1) uiFailures.push('antigen density: a question the corpus answers was not answered')
    if (ask.declined !== 1) {
      uiFailures.push('antigen density: a question the corpus cannot answer was not declined')
    }
    if (ask.headless > 0) {
      uiFailures.push(`antigen density: ${ask.headless} answer(s) rendered without the title of the passage they came from`)
    }

    // The panel grew by two exchanges and must still be on screen.
    const grown = await page.evaluate(() => {
      const el = document.querySelector('.guidance-panel')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        ok: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
        height: Math.round(r.height),
      }
    })
    if (grown && !grown.ok) {
      uiFailures.push(`antigen density: the panel ran off screen once answers were added (${grown.height}px)`)
    }

    // Nothing the reader typed may reach storage. A question can carry as much
    // of their work as the data does.
    const leaked = await page.evaluate((needle) => {
      const found = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) continue
        if ((localStorage.getItem(key) ?? '').includes(needle)) found.push(key)
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (!key) continue
        if ((sessionStorage.getItem(key) ?? '').includes(needle)) found.push(`session:${key}`)
      }
      return found
    }, SECRET)
    if (leaked.length > 0) {
      uiFailures.push(`antigen density: a question the reader typed was written to storage (${leaked.join(', ')})`)
    }
  }
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// Every key written is a key disclosed.
//
// The privacy claim is that a reader can see exactly what is kept in their
// browser and clear it. That was enforced by nobody: the guidance preference
// wrote `ligant.guidance.v1` and the disclosure listed only the tool's own
// state key, so the one thing the claim guaranteed was the one thing not being
// checked. Guidance no longer stores a preference, and this asserts the general
// property rather than the particular fix.
// ---------------------------------------------------------------------------
for (const tool of TOOLS) {
  await page.goto(ORIGIN + tool.path, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(700)

  // Use the tool the way a reader would, so anything written lazily is written.
  await page.getByRole('button', { name: 'Load worked example' }).click().catch(() => {})
  await page.waitForTimeout(500)
  const anyPin = page.locator('.guidance-pin-button').first()
  if ((await anyPin.count()) > 0) {
    await anyPin.scrollIntoViewIfNeeded().catch(() => {})
    await anyPin.click()
    await page.waitForTimeout(300)
    const askField = page.locator('.guidance-panel .ask-row input')
    if ((await askField.count()) > 0) {
      await askField.fill('what is this')
      await page.locator('.guidance-panel .ask-row button').click()
      await page.waitForTimeout(300)
    }
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(400)

  const storage = await page.evaluate(() => {
    const written = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) written.push(key)
    }
    const session = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key) session.push(key)
    }
    const disclosed = [...document.querySelectorAll('code')].map((c) => c.textContent?.trim() ?? '')
    return { written, session, disclosed }
  })

  const undisclosed = storage.written.filter((key) => !storage.disclosed.includes(key))
  if (undisclosed.length > 0) {
    uiFailures.push(`${tool.id}: writes ${undisclosed.join(', ')} without disclosing it`)
  }
  if (storage.session.length > 0) {
    uiFailures.push(`${tool.id}: writes to session storage (${storage.session.join(', ')}), which nothing discloses`)
  }

  // Disclosed and erasable are two claims. This is the second.
  await page.getByRole('button', { name: 'Clear stored data' }).click().catch(() => {})
  await page.waitForTimeout(400)
  const remaining = await page.evaluate(() => {
    const left = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) left.push(key)
    }
    return left
  })
  if (remaining.length > 0) {
    uiFailures.push(`${tool.id}: clearing stored data left ${remaining.join(', ')} behind`)
  }
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// A tool that is built, served, and offered to nobody.
//
// Unlisted is four things that have to agree: absent from the switcher, absent
// from the sitemap, asking not to be indexed, and still working for anyone
// holding the link. Three of them are quiet failures. A tool left in the
// sitemap is indexed whatever its page says; a tool dropped from the build is
// a dead link for everyone already sent to it. This asserts all four, so
// relisting is one flag rather than an archaeology exercise.
// ---------------------------------------------------------------------------
{
  const unlisted = TOOLS.filter((tool) => !tool.listed)
  const listed = TOOLS.filter((tool) => tool.listed)

  const sitemap = await (await fetch(ORIGIN + '/sitemap.xml')).text()
  for (const tool of unlisted) {
    if (sitemap.includes(tool.path === '/' ? `${SITE_URL}/<` : SITE_URL + tool.path)) {
      uiFailures.push(`${tool.id}: unlisted, but still in the sitemap`)
    }
  }
  for (const tool of listed) {
    if (!sitemap.includes(SITE_URL + tool.path)) {
      uiFailures.push(`${tool.id}: listed, but missing from the sitemap`)
    }
  }

  for (const tool of unlisted) {
    const res = await fetch(ORIGIN + tool.path)
    if (!res.ok) {
      uiFailures.push(`${tool.id}: unlisted, but no longer served (HTTP ${res.status})`)
      continue
    }
    if (!/name="robots"[^>]*noindex/i.test(await res.text())) {
      uiFailures.push(`${tool.id}: unlisted, but its page does not ask to be left out of an index`)
    }

    // Still a working tool, not a shell. Someone was sent this link.
    await page.goto(ORIGIN + tool.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const alive = await page.evaluate(() => ({
      main: !!document.querySelector('main#main'),
      figures: document.querySelectorAll('svg').length,
    }))
    if (!alive.main || alive.figures === 0) {
      uiFailures.push(`${tool.id}: unlisted, and the page no longer renders a working tool`)
    }

    // The way back is the one place it may appear, and only to a reader who is
    // already standing on it.
    const nav = await page.evaluate(() => [...document.querySelectorAll('.tool-nav a')].map((a) => a.getAttribute('href')))
    if (!listed.every((t) => nav.includes(t.path))) {
      uiFailures.push(`${tool.id}: unlisted, and the switcher offers no way back to the published tools`)
    }
  }

  // The published pages must not point at it anywhere.
  for (const tool of listed) {
    await page.goto(ORIGIN + tool.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    const leaked = await page.evaluate((paths) => {
      const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '')
      return hrefs.filter((href) => paths.some((p) => href === p || href.endsWith(p)))
    }, unlisted.map((t) => t.path))
    if (leaked.length > 0) {
      uiFailures.push(`${tool.id}: links to an unlisted tool (${leaked.join(', ')})`)
    }
  }
}

// ---------------------------------------------------------------------------
// A student asking what and why at the other tool.
//
// The corpus was probed with the questions a reader new to cell therapy asks
// at the cytotoxicity tool, and a quarter of them were declined outright while
// others were answered confidently with the wrong passage. The entries written
// for them are only worth anything if they are reachable through the interface,
// which is what this drives: a definitional question, asked at the card it
// belongs to, answered under the heading of the passage written for it.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/cytotoxicity/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
let cyOpened = false
const cyPins = page.locator('.guidance-pin-button')
for (let i = 0; i < (await cyPins.count()); i++) {
  const label = await cyPins.nth(i).getAttribute('aria-label')
  // The pin is labelled with the first entry at its anchor, which is the
  // definition of specific lysis rather than the word "response".
  if (/lysis|response/i.test(label ?? '')) {
    await cyPins.nth(i).click()
    cyOpened = true
    break
  }
}
if (!cyOpened) uiFailures.push('cytotoxicity: no guidance pin on the response column to ask a question at')
else {
  await page.waitForTimeout(400)
  const cyForm = page.locator('.guidance-panel .ask-row input')
  if ((await cyForm.count()) === 0) {
    uiFailures.push('cytotoxicity: the guidance panel offers no way to ask a question')
  } else {
    await cyForm.fill('what is a cytotoxicity assay')
    await page.locator('.guidance-panel .ask-row button').click()
    await page.waitForTimeout(400)

    const cyAsk = await page.evaluate(() => {
      const panel = document.querySelector('.guidance-panel')
      const exchange = panel?.querySelector('.ask-exchange')
      return {
        declined: !!exchange?.querySelector('.ask-empty'),
        heading: exchange?.querySelector('.ask-answer h5, .ask-seen')?.textContent ?? '',
      }
    })
    if (cyAsk.declined) {
      uiFailures.push('cytotoxicity: a student question the corpus now answers was declined')
    }
    // The heading alone, never the exchange text: the exchange contains the
    // question the reader typed, so matching against it would pass whatever the
    // answer was. A vacuous assertion here has slipped through twice before.
    if (!/cytotoxicity assay/i.test(cyAsk.heading)) {
      uiFailures.push(`cytotoxicity: the question was answered from "${cyAsk.heading.slice(0, 60) || '(no heading)'}" rather than the passage written for it`)
    }
    // The formats list is long, and a panel that grows off screen is the
    // failure mode this surface has had before.
    const cyPanel = await page.evaluate(() => {
      const el = document.querySelector('.guidance-panel')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        ok: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
        height: Math.round(r.height),
      }
    })
    if (cyPanel && !cyPanel.ok) {
      uiFailures.push(`cytotoxicity: the panel ran off screen once the answer was added (${cyPanel.height}px)`)
    }
  }
}

await page.evaluate(() => localStorage.clear())

const fontsApplied = await page.evaluate(async () => {
  await document.fonts.ready
  return {
    inter: document.fonts.check('16px Inter'),
    plex: document.fonts.check('16px "IBM Plex Mono"'),
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').length,
  }
})

await browser.close()
server.close()

console.log(`Fonts: Inter ${fontsApplied.inter ? 'loaded' : 'MISSING'}, ` +
            `IBM Plex Mono ${fontsApplied.plex ? 'loaded' : 'MISSING'} ` +
            `(${fontsApplied.loaded} faces resolved, all same-origin)`)

let failed = false
if (foreign.length > 0) {
  console.error(`\nFAIL: the page contacted ${foreign.length} external origin(s):`)
  for (const r of foreign) console.error('  ' + r)
  failed = true
}
if (cspViolations.length > 0) {
  console.error(`\nFAIL: ${cspViolations.length} Content-Security-Policy violation(s):`)
  for (const v of cspViolations) console.error('  ' + v)
  failed = true
}
if (!fontsApplied.inter || !fontsApplied.plex) {
  console.error('\nFAIL: a self-hosted typeface did not load under the production CSP.')
  failed = true
}
if (uiFailures.length > 0) {
  console.error(`\nFAIL: ${uiFailures.length} pre-launch regression(s):`)
  for (const f of uiFailures) console.error('  ' + f)
  failed = true
}

if (failed) process.exit(1)
console.log('Runtime checks passed: no request left the origin; social and canonical')
console.log('metadata is absolute and on the configured origin; both pages carry the privacy')
console.log('disclosure and a main landmark; every guidance panel is fully on screen; the')
console.log('exported SVG parses; nothing is clipped at 360px; an extreme input cannot')
console.log('explode the chart; the reported unit is ABC rather than an unqualified molecule')
console.log('count; every result discloses background as a share of gross while only a')
console.log('material one is flagged; settings persisted by an earlier release restore without')
console.log('raising a flag the user did not earn; an invalidated calibration reaches every')
console.log('figure it invalidates; a question the corpus cannot answer is declined rather')
console.log('than approximated, every answer carries the title of the passage it came from,')
console.log('and nothing the reader types reaches storage; and the CSV export carries a')
console.log('machine-readable status; and a pasted column of thousands-formatted values')
console.log('reads as the numbers it was written as; and a population whose certified value')
console.log('does not belong with the others is named at its own row; and a calibration')
console.log('that cannot support a figure reports itself, and withholds the figure; and a\n' +
  'student question the corpus was extended to answer reaches the passage written\n' +
  'for it, at the card it belongs to; and an unlisted tool is absent from the\n' +
  'switcher and the sitemap, asks not to be indexed, and still works for anyone\n' +
  'holding its link; and what is wrong with one value is said at the field it\n' +
  'was typed into, on inclusion rather than on what a row is called; and every\n' +
  'key written to a browser is disclosed on the page and removed by the control\n' +
  'that offers to remove it.')
