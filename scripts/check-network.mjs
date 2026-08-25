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
  }))
  if (!structure.hasMain) uiFailures.push(`${name}: no main landmark`)
  if (!structure.hasSkipLink) uiFailures.push(`${name}: no skip link`)
  if (!structure.hasPrivacy) uiFailures.push(`${name}: privacy disclosure missing`)
  if (!structure.hasClearStorage) uiFailures.push(`${name}: no control to clear stored data`)

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
  const guidanceSwitch = page.getByRole('switch', { name: /Guidance/i })
  await guidanceSwitch.click()
  await page.waitForTimeout(300)
  const pins = page.locator('.guidance-pin-button')
  const pinCount = await pins.count()
  if (pinCount === 0) uiFailures.push(`${name}: guidance is on but no pins rendered`)
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
  await guidanceSwitch.click()
  await page.waitForTimeout(200)

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
// Asking a question at a card.
//
// Every answer is a passage already in the page, so the assertions are about
// provenance rather than plausibility: what comes back must be a corpus title,
// a question the corpus cannot answer must be declined rather than approximated,
// and nothing the reader types may reach storage.
// ---------------------------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('switch', { name: /Guidance/i }).click()
await page.waitForTimeout(400)

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
console.log('reads as the numbers it was written as.')
