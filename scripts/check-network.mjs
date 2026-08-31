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
 * must not carry its own copy of what the site contains.
 */
const TOOLS = [...readFileSync('src/lib/site.ts', 'utf8').matchAll(
  /\{\s*id:\s*'([^']+)'[^}]*?path:\s*'([^']+)'[^}]*?\}/g,
)].map(([, id, path]) => ({ id, path }))
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
  // directory routes behave here as they do in production.
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

// ---- pre-launch regressions ------------------------------------------------

const uiFailures = []

for (const [name, path] of [['antigen density', '/']]) {
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
    // Who publishes this, under what terms, and how to reach them. A reader
    // deciding whether to use a measurement tool in their own work needs all
    // three, and none of it was on the page.
    footer: (() => {
      const text = document.querySelector('.site-footer')?.textContent ?? ''
      return {
        licence: /Apache License, Version 2\.0/.test(text),
        'open source statement': /free and open source under Apache 2\.0/.test(text),
        'research use only notice': /Research use only/i.test(text),
        'registered address': /3675 Market Street/.test(text) && /Philadelphia PA 19104/.test(text),
        'contact address': /hello@ligant\.ai/.test(text),
        'legal entity': /Ligant AI Incorporated/.test(text),
      }
    })(),
  }))
  if (!structure.hasMain) uiFailures.push(`${name}: no main landmark`)
  if (!structure.hasSkipLink) uiFailures.push(`${name}: no skip link`)
  if (!structure.hasPrivacy) uiFailures.push(`${name}: privacy disclosure missing`)
  if (!structure.hasClearStorage) uiFailures.push(`${name}: no control to clear stored data`)
  if (!structure.hasSuiteMark) uiFailures.push(`${name}: the masthead does not name the suite`)
  for (const [what, present] of Object.entries(structure.footer)) {
    if (!present) uiFailures.push(`${name}: the footer does not carry the ${what}`)
  }
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
    if (name === 'antigen density') {
      // A standard curve without its slope and R squared is not publication
      // usable, and those two numbers are the tool's whole argument that the
      // calibration can be trusted. They were HTML beside the chart, so the
      // exported figure carried neither, and sample points exported as
      // unlabelled diamonds.
      if (!/slope/i.test(svg) || !/R²/.test(svg)) {
        uiFailures.push(`${name}: exported SVG carries no fit statistics`)
      }
      if (!/CD19/.test(svg)) {
        uiFailures.push(`${name}: exported SVG does not name the samples it plots`)
      }
    }
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

  // The results rail is sticky on a wide screen, and must not be once the two
  // columns collapse: a sticky element in a single column pins the results over
  // the inputs and can leave part of it unreachable. Raised in review as the
  // one thing a desktop pass cannot see, and a lot of bench scientists open a
  // tool like this on a phone.
  const narrow = await page.evaluate(() => {
    const rail = document.querySelector('.rail')
    if (!rail) return null
    const r = rail.getBoundingClientRect()
    return {
      position: getComputedStyle(rail).position,
      // Reachable by scrolling: its bottom sits inside the scrollable document.
      bottom: Math.round(r.bottom + window.scrollY),
      scrollHeight: document.documentElement.scrollHeight,
      overlaps: [...document.querySelectorAll('.stack > .panel')].some((p) => {
        const q = p.getBoundingClientRect()
        return q.right > r.left + 1 && q.left < r.right - 1 && q.bottom > r.top + 1 && q.top < r.bottom - 1
      }),
    }
  })
  if (narrow) {
    if (narrow.position === 'sticky') {
      uiFailures.push(`${name}: the results rail is still sticky at 360px, where there is only one column`)
    }
    if (narrow.bottom > narrow.scrollHeight + 2) {
      uiFailures.push(`${name}: the results rail extends past the scrollable document at 360px, so part of it cannot be reached`)
    }
    if (narrow.overlaps) {
      uiFailures.push(`${name}: the results rail overlaps an input panel at 360px`)
    }
  }

  // A guidance panel is positioned against the viewport, so the narrow case is
  // the one that can push it off screen.
  const narrowPin = page.locator('.guidance-pin-button').first()
  if ((await narrowPin.count()) > 0) {
    await narrowPin.scrollIntoViewIfNeeded().catch(() => {})
    await narrowPin.click().catch(() => {})
    await page.waitForTimeout(250)
    const panelAt360 = await page.evaluate(() => {
      const el = document.querySelector('.guidance-panel')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        off: r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight,
        width: Math.round(r.width),
      }
    })
    if (panelAt360?.off) {
      uiFailures.push(`${name}: a guidance panel runs off screen at 360px (${panelAt360.width}px wide)`)
    }
    await page.keyboard.press('Escape')
  }

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
  // Where the populations sit, not only how well they fit. An even ladder has a
  // skew of zero and no shipped kit provides one, so a reader comparing two
  // standards has no way to see that difference from R squared alone.
  if (!/^Design skew of log10\(MFI\),-0\.30/m.test(csv)) {
    const line = (csv.match(/^Design skew.*$/m) ?? ['(no Design skew row at all)'])[0]
    uiFailures.push(`antigen density: the CSV reports the design skew as "${line}"`)
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

const cleanFlags = await page.evaluate(() => document.querySelectorAll('.row-notes li').length)
if (cleanFlags !== 0) {
  uiFailures.push(`antigen density: the worked example raised ${cleanFlags} row warning(s), expected none`)
}

await page.getByLabel('Assigned value for Population 4').fill('5120000')
await page.waitForTimeout(500)

const rowFlag = await page.evaluate(() => {
  // Below the table now, rather than inserted as a row inside it, so that
  // saying something never moves a field the reader is typing into. The row it
  // is about is named in the sentence and marked in the table.
  const flags = [...document.querySelectorAll('.row-notes li')]
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
const quietStart = await page.evaluate(() => document.querySelectorAll('.row-notes li').length)
if (quietStart !== 0) {
  uiFailures.push(`antigen density: the worked example raised ${quietStart} field warning(s) before anything was typed`)
}

await page.getByLabel('Assigned value for Population 3').fill('')
await page.waitForTimeout(500)

const orphan = await page.evaluate(() => {
  const field = document.querySelector('input[aria-label="Assigned value for Population 3"]')
  const notes = [...document.querySelectorAll('.row-notes li')].map((n) => n.textContent ?? '')
  return {
    marked: field?.getAttribute('aria-invalid'),
    // The note that names this row, so the sentence is still traceable to the
    // value even though it no longer sits beneath it.
    text: notes.find((t) => t.includes('Population 3')) ?? '',
  }
})
if (orphan.marked !== 'true') {
  uiFailures.push('antigen density: a population with no certified value is not marked at the field')
}
if (!/certified value/i.test(orphan.text)) {
  uiFailures.push(`antigen density: nothing names Population 3 as missing its certified value (found "${orphan.text.slice(0, 70)}")`)
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
  const notes = [...document.querySelectorAll('.row-notes li')].map((n) => n.textContent ?? '')
  return {
    marked: field?.className ?? '',
    invalid: field?.getAttribute('aria-invalid'),
    text: notes.find((t) => t.includes('CD19')) ?? '',
  }
})
if (!/cell-warning/.test(swapped.marked)) {
  uiFailures.push('antigen density: a control brighter than its sample is not marked at the field')
}
if (swapped.invalid === 'true') {
  uiFailures.push('antigen density: a control brighter than its sample is treated as an invalid entry rather than a caveat')
}
if (!/other way round/i.test(swapped.text)) {
  uiFailures.push(`antigen density: nothing names CD19 as having a brighter control (found "${swapped.text.slice(0, 70)}")`)
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
// A table whose two columns are the same numbers.
//
// Found in a live pass, and the worst failure this tool can have: it fits
// perfectly. Slope 1.00, R squared 1, every residual zero, a confidence
// interval of zero width, and every reported density is the raw intensity
// wearing calibrated units. The interface was more confident about it than
// about the real worked example, and nothing downstream could tell, because
// arithmetically there is nothing wrong.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Clear all' }).click()
await page.waitForTimeout(400)

await page.evaluate(() => {
  const cell = document.querySelector('input[aria-label^="MFI for"]')
  cell.focus()
  const data = new DataTransfer()
  data.setData('text/plain', '2050\t2050\n12900\t12900\n39500\t39500\n121000\t121000')
  cell.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  )
})
await page.waitForTimeout(400)
await page.getByLabel('Stained MFI for Sample 1').fill('8660')
await page.waitForTimeout(700)

const identity = await page.evaluate(() => ({
  verdict: document.querySelector('.verdict')?.textContent ?? '',
  invalid: !!document.querySelector('.verdict-invalid'),
  notice: document.querySelector('.paste-notice')?.innerText ?? '',
  digits: [...document.querySelectorAll('.result-card .hero .value')].filter((v) =>
    /\d/.test(v.textContent ?? ''),
  ).length,
  bands: document.querySelectorAll('.result-card .band-chip').length,
}))
if (!identity.invalid) {
  uiFailures.push(`antigen density: a standard whose certified values are its own intensities reports "${identity.verdict.slice(0, 60)}"`)
}
if (!/same number as its intensity/i.test(identity.verdict)) {
  uiFailures.push('antigen density: the verdict on an identity standard does not say what is wrong with it')
}
if (identity.digits > 0) {
  uiFailures.push(`antigen density: ${identity.digits} card(s) still report a density from an identity standard`)
}
if (identity.bands > 0) {
  uiFailures.push('antigen density: a density band was offered on an identity standard')
}
if (!/same numbers/i.test(identity.notice)) {
  uiFailures.push('antigen density: pasting two identical columns raised no notice')
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// A reason not to report, against a caveat on reporting.
//
// The two were the same amber rule, the same icon and the same tint, separated
// by "Caution" against "Note". A card carried "do not report this figure"
// immediately above an interpretation sentence about that figure.
// ---------------------------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
// The host mismatch produces a sample-level critical while leaving a number.
await page.locator('#host').selectOption('rat').catch(() => {})
await page.waitForTimeout(700)

const severity = await page.evaluate(() => {
  const critical = [...document.querySelectorAll('.result-card .flag-critical')]
  const warning = [...document.querySelectorAll('.result-card .flag:not(.flag-critical)')]
  const styleOf = (el) => {
    if (!el) return null
    const s = getComputedStyle(el)
    return { border: s.borderLeftWidth, background: s.backgroundColor }
  }
  return {
    criticals: critical.length,
    label: critical[0]?.querySelector('strong')?.textContent ?? '',
    criticalStyle: styleOf(critical[0]),
    warningStyle: styleOf(warning[0]),
    bands: document.querySelectorAll('.result-card .band-chip').length,
    // Scoped to the card. The page also carries a standing explainer titled
    // "Interpretation of density bands", which is not a verdict on any figure.
    interpretation: [...document.querySelectorAll('.result-card dt')].some(
      (dt) => dt.textContent?.trim() === 'Interpretation',
    ),
  }
})
if (severity.criticals === 0) {
  uiFailures.push('antigen density: no critical flag rendered where one was expected')
} else {
  if (!/do not report/i.test(severity.label)) {
    uiFailures.push(`antigen density: a critical flag is labelled "${severity.label.trim()}" rather than saying not to report`)
  }
  if (
    severity.warningStyle &&
    severity.criticalStyle.border === severity.warningStyle.border &&
    severity.criticalStyle.background === severity.warningStyle.background
  ) {
    uiFailures.push('antigen density: a critical flag is styled identically to a caveat')
  }
  if (severity.bands > 0) {
    uiFailures.push('antigen density: a density band was offered beside a figure the reader was told not to report')
  }
  if (severity.interpretation) {
    uiFailures.push('antigen density: an interpretation is applied to a figure the reader was told not to report')
  }
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// The answer, on a phone, and the table that does not move under the cursor.
//
// Two findings from the same live pass, measured the way the reviewer measured
// them rather than by reading the CSS.
//
// At 420px the columns collapse, and "Method and limitations" sat between the
// last input and the first number: roughly 1,750px of methodology, putting the
// standard curve at y=3,595 on a 5,000px page. Reading order is now inputs,
// results, method.
//
// The row warning was inserted as a table row beneath the offending one, so it
// reflowed the table and the next field moved 73px out from under the cursor.
// Deferring it until blur moved the jump rather than removing it, and hid the
// warning from anyone looking straight at the value they had just typed. The
// sentence now sits below the table, where it moves nothing.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)

// --- the wide layout, where the left column must stay one flow ---
//
// Making the method section its own grid child, to get the phone order right,
// forced the rail to span both grid rows to stay sticky. A spanning item is
// sized across the rows it spans, so the grid inflated the first row to absorb
// a tall rail and opened several hundred pixels of empty space between the
// settings and the method section. Nothing here measured that, and a reader
// found it.
const desktop = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.stack > .panel')]
  const method = document.querySelector('.method-panel')
  if (panels.length < 2 || !method) return null
  const previous = panels[panels.length - 2]
  return {
    gap: Math.round(method.getBoundingClientRect().top - previous.getBoundingClientRect().bottom),
    columns: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns.split(' ').length,
  }
})
if (!desktop) {
  uiFailures.push('antigen density: could not find the left column and its method section')
} else {
  if (desktop.columns !== 2) {
    uiFailures.push(`antigen density: the wide layout has ${desktop.columns} column(s), expected 2`)
  }
  // The column's own gap is 16px. Anything approaching a screenful is the
  // grid stretching a row rather than a margin.
  if (desktop.gap > 64) {
    uiFailures.push(
      `antigen density: ${desktop.gap}px of empty space sits between the last input panel and the ` +
        'method section on a wide screen',
    )
  }
}

// --- the phone reading order ---
await page.setViewportSize({ width: 420, height: 900 })
await page.waitForTimeout(500)
const phone = await page.evaluate(() => {
  const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null)
  const heading = [...document.querySelectorAll('h2')]
  const find = (text) => heading.find((h) => h.textContent?.includes(text))
  const lastInput = [...document.querySelectorAll('.stack input')].pop()
  return {
    lastInput: top(lastInput),
    curve: top(find('Standard curve')?.closest('.panel')),
    method: top(find('Method and limitations')?.closest('.panel')),
    page: document.documentElement.scrollHeight,
  }
})
if (phone.curve === null || phone.method === null) {
  uiFailures.push('antigen density: could not find the results and method panels at 420px')
} else {
  if (phone.method < phone.curve) {
    uiFailures.push(
      `antigen density: at 420px the method section (y=${phone.method}) sits above the results ` +
        `(y=${phone.curve}), so a reader scrolls past it to reach their answer`,
    )
  }
  // The results must be reachable shortly after the inputs end, not a screen
  // or more later. Generous, because the check is on ordering, not on pixels.
  if (phone.lastInput !== null && phone.curve - phone.lastInput > 1200) {
    uiFailures.push(
      `antigen density: at 420px the results begin ${phone.curve - phone.lastInput}px after the ` +
        'last input',
    )
  }
}
await page.setViewportSize({ width: 1280, height: 900 })
await page.waitForTimeout(400)

// --- the table that does not move ---
await page.getByRole('button', { name: 'Load worked example' }).click()
await page.waitForTimeout(600)

// Measured with the table in view, which is the situation being protected: a
// reader is looking at the field they are about to type into. Measuring from a
// scroll position where the table sits above the viewport gives a number that
// is really the browser's scroll anchoring, not a reflow.
await page.getByLabel('Assigned value for Population 2').scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

const shift = await page.evaluate(async () => {
  const field = (label) => document.querySelector(`input[aria-label="${label}"]`)
  const target = field('MFI for Population 3')
  const docTop = (el) => Math.round(el.getBoundingClientRect().top + window.scrollY)
  const before = { viewport: Math.round(target.getBoundingClientRect().top), doc: docTop(target) }

  // Provoke a warning on the row above, the way a reader typing would.
  const victim = field('Assigned value for Population 2')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(victim, '5')
  victim.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 400))

  return {
    // Both, because either alone can mislead. The document measure says the
    // table did not reflow; the viewport measure says the reader's cursor is
    // still over the field it was over.
    doc: Math.abs(docTop(target) - before.doc),
    viewport: Math.abs(Math.round(target.getBoundingClientRect().top) - before.viewport),
    warned: document.body.innerText,
  }
})
if (shift.doc > 2) {
  uiFailures.push(
    `antigen density: a row warning reflowed the table, moving the field below it by ` +
      `${shift.doc}px within the document`,
  )
}
if (shift.viewport > 2) {
  uiFailures.push(
    `antigen density: a row warning moved the field below it by ${shift.viewport}px on screen, ` +
      'so the next value is typed into a field that has moved',
  )
}
// The range guard's own words, not just any warning. A certified value of 5
// also trips the ratio check, whose remedy mentions the certificate of
// analysis, so matching on that passed whether the range guard fired or not.
if (!/certified capacities in these kits fall/i.test(shift.warned)) {
  uiFailures.push(
    'antigen density: a certified value of 5, far below any kit, drew no range warning of its own',
  )
}

// --- what the messages say, at the moment several of them are on screen ---
//
// Two defects of the same shape reached a live pass, one on each side of the
// same change: a note repeated the row name the component had already printed
// ("Population 1 Population 1 does not agree ..."), and a range guard written
// without the shared formatter said capacities "fall roughly between 1e+2 and
// 1e+7". Asserted as classes rather than as the two strings, because both are
// cheap to reintroduce anywhere a sentence is composed.
const prose = await page.evaluate(() => {
  const notes = [...document.querySelectorAll('.row-notes li')].map((li) => ({
    row: li.querySelector('strong')?.textContent?.trim() ?? '',
    text: li.textContent ?? '',
  }))
  const everything = [
    ...document.querySelectorAll('.row-notes li, .flag, .verdict, .paste-notice p, .result-card'),
  ].map((el) => el.textContent ?? '')
  return { notes, everything }
})
if (prose.notes.length === 0) {
  uiFailures.push('antigen density: expected the table to be saying something, and it said nothing')
}
for (const note of prose.notes) {
  // "Population 1" followed immediately by "Population 1 does not agree ...".
  if (note.row && note.text.replace(note.row, '').trimStart().startsWith(note.row)) {
    uiFailures.push(`antigen density: a note repeats the row it already names: "${note.text.slice(0, 70)}"`)
  }
}
for (const text of prose.everything) {
  const exponent = text.match(/\d(?:\.\d+)?e[+-]\d+/i)
  if (exponent) {
    uiFailures.push(
      `antigen density: a message written for a reader carries "${exponent[0]}" in scientific ` +
        `notation ("${text.trim().slice(0, 70)}")`,
    )
  }
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// What the origin's own robots.txt says.
//
// A live check found the served file carrying blanket `Disallow: /` rules for
// ClaudeBot, GPTBot, Google-Extended, CCBot, Bytespider, Amazonbot,
// Applebot-Extended and meta-externalagent, none of which this repository
// writes: they are injected by Cloudflare's managed robots.txt setting, which
// merges its own block into the origin's file. For a free tool whose whole
// purpose is to be found and recommended, that is the opposite of the policy.
//
// This asserts what the origin serves, which is the half that lives in version
// control. The injected block is a dashboard setting and cannot be seen from
// here; a mismatch between this file and the live one is the signal that the
// setting is still on.
// ---------------------------------------------------------------------------
{
  const robots = await (await fetch(ORIGIN + '/robots.txt')).text()

  const disallows = robots
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^Disallow:\s*\S/i.test(line))
  if (disallows.length > 0) {
    uiFailures.push(
      `robots.txt: the origin disallows ${disallows.length} path(s) (${disallows.join('; ').slice(0, 80)}), ` +
        'on a tool published to be found',
    )
  }

  if (!/^User-agent:\s*\*/im.test(robots) || !/^Allow:\s*\/\s*$/im.test(robots)) {
    uiFailures.push('robots.txt: the origin does not allow every crawler everything')
  }

  // The policy, stated by the origin rather than left to the edge, so that
  // turning the managed setting off does not silently remove it too.
  const signal = robots.match(/^Content-Signal:\s*(.+)$/im)
  if (!signal) {
    uiFailures.push('robots.txt: the origin states no Content-Signal policy of its own')
  } else {
    for (const expected of ['search=yes', 'ai-input=yes', 'ai-train=no', 'use=reference']) {
      if (!signal[1].includes(expected)) {
        uiFailures.push(`robots.txt: the Content-Signal policy is missing ${expected} (reads "${signal[1].trim()}")`)
      }
    }
  }

  if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
    uiFailures.push('robots.txt: no sitemap is advertised')
  }
}

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
// A row added to the table is a row of the same table.
//
// Quantum Simply Cellular names its populations Blank and Population 1 to 4,
// and the add button offered "Standard 6": a second naming scheme inside one
// table, carried from there into the residual strip and the CSV as though a
// different kind of row had been added. The number counts numbered
// populations, so the blank does not advance it.
//
// The share of gross is asserted at the same card, because it was rounded to
// whole percent: a background of 24.5% printed as "25% of gross" beside no
// background flag, stating the threshold that governs that flag as met and
// then ignored. One decimal place everywhere, matching the flag text.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Load worked example' }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: '+ Add population' }).click()
await page.waitForTimeout(500)

const labels = await page.evaluate(() => {
  const table = [...document.querySelectorAll('table')].find((t) =>
    t.querySelector('caption')?.textContent?.includes('Calibration bead standards'),
  )
  if (!table) return null
  // By the label each row's name field carries: the value cells are text
  // inputs too, so the column has to be named rather than counted.
  return [...table.querySelectorAll('tbody input[aria-label^="Label for standard"]')].map(
    (el) => el.value,
  )
})
if (!labels || labels.length === 0) {
  uiFailures.push('antigen density: the standards table did not render its populations')
} else if (labels[labels.length - 1] !== 'Population 5') {
  uiFailures.push(
    `antigen density: a population added to ${labels.slice(0, -1).join(', ')} is called ` +
      `"${labels[labels.length - 1]}" rather than continuing the kit's own naming`,
  )
}

const shares = await page.evaluate(() =>
  [...document.querySelectorAll('.result-card')]
    .flatMap((card) => (card.textContent ?? '').match(/[\d.]+% of gross/g) ?? []),
)
if (shares.length === 0) {
  uiFailures.push('antigen density: no result disclosed its background as a share of gross')
}
for (const share of shares) {
  if (!/\d\.\d% of gross/.test(share)) {
    uiFailures.push(
      `antigen density: background is disclosed as "${share}", rounded to the same whole ` +
        'percent as the threshold that decides whether it is flagged',
    )
  }
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// A verdict is withheld where the measurement cannot support one.
//
// At 74.6% background the card reported a clean five-figure density, put a
// "High" chip beside the sample name and printed "Full effector response is
// expected. On normal tissue, this density represents a substantial on-target
// off-tumour risk." underneath it. The caveat naming the background fraction
// was present and had always been present, at the foot of the card. A reader
// met the biological verdict and the safety claim first.
//
// The number was never the defect. Asserted here rather than only in the unit
// tests, because what changed is what the reader meets and in what order, and
// that is not visible from the flag level alone.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
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
      samples: [
        // 74.6% background, both readings inside the calibrated range so no
        // range guard fires, and 43.4%, which stays a caveat on a reportable
        // figure. One card of each on screen at once.
        { id: 's1', label: 'Dominant background', mfi: 20000, controlMfi: 15000 },
        { id: 's2', label: 'Material background', mfi: 5000, controlMfi: 2200 },
      ],
      options: {
        standardKind: 'abc',
        fpRatio: 1,
        backgroundMode: 'abc',
        valency: 'bivalent',
        antibodyHost: 'mouse',
        saturationConfirmed: true,
        confidenceLevel: 0.95,
      },
    }),
  )
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)

const verdicts = await page.evaluate(() =>
  [...document.querySelectorAll('.result-card')].map((card) => {
    const critical = card.querySelector('.flag-critical')
    const hero = card.querySelector('.hero')
    const position = (el) => (el ? el.getBoundingClientRect().top + window.scrollY : null)
    return {
      name: card.querySelector('.result-name span')?.textContent ?? '',
      value: card.querySelector('.hero .value')?.textContent ?? '',
      chip: card.querySelector('.band-chip')?.textContent?.trim() ?? null,
      interpretation: [...card.querySelectorAll('dt')].some(
        (dt) => dt.textContent === 'Interpretation',
      ),
      criticalText: critical?.textContent ?? null,
      criticalAboveValue:
        critical && hero ? position(critical) < position(hero) : null,
    }
  }),
)
const dominant = verdicts.find((v) => v.name === 'Dominant background')
const material = verdicts.find((v) => v.name === 'Material background')
if (!dominant || !material) {
  uiFailures.push('antigen density: the two background cards did not render')
} else {
  // The figure stays. Withholding it would say "below detection", which is a
  // different and untrue claim about this measurement.
  if (!/^\d/.test(dominant.value)) {
    uiFailures.push(
      `antigen density: at 74.6% background the card shows "${dominant.value}" rather than the ` +
        'figure, which overstates what is wrong with it',
    )
  }
  if (dominant.chip !== null) {
    uiFailures.push(
      `antigen density: at 74.6% background the card still carries the "${dominant.chip}" band ` +
        'chip, applying a verdict to a figure that is mostly control signal',
    )
  }
  if (dominant.interpretation) {
    uiFailures.push(
      'antigen density: at 74.6% background the card still prints the band interpretation, ' +
        'which is a claim about effector response and about on-target off-tumour risk',
    )
  }
  if (!dominant.criticalText?.includes('Do not report')) {
    uiFailures.push('antigen density: at 74.6% background nothing tells the reader not to report it')
  }
  if (dominant.criticalAboveValue !== true) {
    uiFailures.push(
      'antigen density: at 74.6% background the reason not to report the figure renders below ' +
        'the figure, so the reader meets the number first',
    )
  }
  // The tier below is unchanged, and the check is only meaningful if it is.
  if (material.chip === null || !material.interpretation) {
    uiFailures.push(
      'antigen density: at 43% background the band and its interpretation were withheld too, so ' +
        'the tier boundary is not where it is supposed to be',
    )
  }
  if (material.criticalText !== null) {
    uiFailures.push('antigen density: at 43% background a caveat was escalated to a critical')
  }
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// A licence claim and the source that backs it, or neither.
//
// The footer asserts Apache 2.0 and refers to a LICENSE file "distributed with
// this software" while offering no way to reach that software. A reviewer put it
// in the same category as any other claim a reader cannot check, which is right:
// an assertion nobody can verify is worth what an assertion nobody can verify is
// worth.
//
// It cannot be fixed by linking the development repository, which is private, so
// REPO_URL is null and this asserts the only thing that is true today: the
// footer links nowhere. Setting REPO_URL is what turns on the stronger
// assertion, so the claim and its evidence can never be separated once there is
// evidence to point at.
//
// Either way the link is an anchor rather than a resource. The foreign-request
// guard at the top of this file is what proves nothing is loaded from it.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const repoDeclaration = readFileSync('src/lib/site.ts', 'utf8').match(
  /REPO_URL(?::[^=]+)?=\s*(?:null|['"]([^'"]+)['"])/,
)
const footer = await page.evaluate(() => {
  const el = document.querySelector('.site-footer')
  if (!el) return null
  return {
    claimsOpenSource: /open source/i.test(el.textContent ?? ''),
    links: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
  }
})
if (!repoDeclaration) {
  uiFailures.push('antigen density: REPO_URL is not declared in src/lib/site.ts')
} else if (!footer) {
  uiFailures.push('antigen density: the page has no footer')
} else if (repoDeclaration[1]) {
  if (footer.claimsOpenSource && !footer.links.includes(repoDeclaration[1])) {
    uiFailures.push(
      'antigen density: the footer claims the tool is open source and does not link the source, ' +
        'so a reader has no way to check the licence it asserts',
    )
  }
} else {
  const external = footer.links.filter((href) => /^https?:/i.test(href))
  if (external.length > 0) {
    uiFailures.push(
      `antigen density: no repository is configured and the footer links ${external.join(', ')}, ` +
        'which is a claim pointing somewhere a reader cannot be sent',
    )
  }
}

// ---------------------------------------------------------------------------
// The headline agrees with the rows beneath it.
//
// A standard containing 1e300 produced three correct row advisories under a
// verdict reading "Calibration valid. Slope 1.00, R² > 0.9999". Both halves
// were behaving as written: checkMfi returns a field issue, and the verdict
// reads curve flags, which a field issue is not and never becomes. So the one
// thing the reader looks at first was the one thing that had not been told.
//
// Asserted here rather than only in the unit tests, because what was wrong was
// which of two correct mechanisms the reader met.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
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
        // The certified value sits on the fitted line, which is the reported
        // case: slope and R squared stay perfect, so every other check on this
        // curve is satisfied and the impossible intensity is the only fault.
        { id: 'd4', label: 'Population 4', mfi: 1e300, assigned: 5.748995914281287e305, included: true },
      ],
      samples: [{ id: 's1', label: 'CD19 (NALM-6)', mfi: 8900, controlMfi: 240 }],
      options: {
        standardKind: 'abc',
        fpRatio: 1,
        backgroundMode: 'abc',
        valency: 'bivalent',
        antibodyHost: 'mouse',
        saturationConfirmed: true,
        confidenceLevel: 0.95,
      },
    }),
  )
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)

const impossible = await page.evaluate(() => {
  const verdict = document.querySelector('.verdict')
  return {
    verdict: verdict?.textContent ?? '',
    valid: verdict?.classList.contains('verdict-valid') ?? false,
    density: document.querySelector('.result-card .hero .value')?.textContent ?? '',
  }
})
if (/Calibration valid/i.test(impossible.verdict) || impossible.valid) {
  uiFailures.push(
    `antigen density: a standard containing 1e300 reports "${impossible.verdict.trim().slice(0, 80)}"`,
  )
}
if (!/not usable/i.test(impossible.verdict)) {
  uiFailures.push(
    'antigen density: a population holding a value no instrument produces does not make the ' +
      'calibration unusable',
  )
}
if (/^[\d,]/.test(impossible.density)) {
  uiFailures.push(
    `antigen density: a density of ${impossible.density} is reported from a calibration levered ` +
      'by an impossible intensity',
  )
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// The one thing no arithmetic here can check, written down.
//
// Assigned values are certified per manufacturing lot. A fit built from another
// lot's certificate is a straight line through consistent numbers: the slope is
// near one, the residuals are small, every check in this file is satisfied, and
// the result is wrong by whatever the two lots differ by. Provenance is the only
// mitigation, and the tool had nowhere to put it: the field did not exist and
// the word "lot" appeared nowhere in the export.
//
// Asserted on both artefacts, because a lot identifier that reaches the CSV and
// not the figure is separated from the plot the first time someone drops the
// image into a manuscript.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Load worked example' }).click()
await page.waitForTimeout(500)

const csvFor = async (label) => {
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ])
    return await readFile(await download.path(), 'utf8')
  } catch (e) {
    uiFailures.push(`antigen density: CSV export failed ${label} (${String(e).slice(0, 60)})`)
    return ''
  }
}

// Unrecorded, which is the state the worked example ships in. A blank cell
// would read as a field that does not exist rather than as the omission it is.
const csvBlank = await csvFor('with no lot recorded')
if (csvBlank && !/^Bead lot,not recorded$/m.test(csvBlank)) {
  const line = (csvBlank.match(/^Bead lot.*$/m) ?? ['(no Bead lot row at all)'])[0]
  uiFailures.push(`antigen density: with no lot recorded the CSV says "${line}"`)
}

const LOT = 'A21-0934'
await page.fill('#lot', LOT)
await page.waitForTimeout(500)

const csvLot = await csvFor('with a lot recorded')
if (csvLot && !csvLot.includes(`Bead lot,${LOT}`)) {
  uiFailures.push('antigen density: a recorded bead lot does not reach the exported CSV')
}

const onFigure = await page.evaluate(
  (lot) => (document.querySelector('#standard-curve-svg')?.textContent ?? '').includes(lot),
  LOT,
)
if (!onFigure) {
  uiFailures.push(
    'antigen density: a recorded bead lot does not reach the exported figure, so a plot dropped ' +
      'into a manuscript carries no provenance for the ruler that produced it',
  )
}

// It is transcribed from a vial, so losing it on reload would mean transcribing
// it again, which is how a field stops being filled in.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const restoredLot = await page.evaluate(() => document.querySelector('#lot')?.value ?? '')
if (restoredLot !== LOT) {
  uiFailures.push(`antigen density: the bead lot restored as "${restoredLot}" rather than "${LOT}"`)
}

// A label alone is not work in progress. Typing only a lot must leave storage
// untouched, the same rule sample labels already follow, and the same rule the
// privacy disclosure implies.
await page.getByRole('button', { name: 'Clear all' }).click()
await page.waitForTimeout(400)
await page.evaluate(() => localStorage.clear())
await page.fill('#lot', 'B02-1177')
await page.waitForTimeout(600)
const wroteOnLotAlone = await page.evaluate(() => localStorage.getItem('adc.state.v1') !== null)
if (wroteOnLotAlone) {
  uiFailures.push('antigen density: typing only a bead lot wrote a document to browser storage')
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// A paste says what it did not cover.
//
// Pasting a four population standard over a six population one overwrote the
// first four and left the last two holding values from the previous standard,
// still ticked and still in the fit: one calibration built from two unrelated
// datasets. The ratio consistency check named the two rows downstream, so no
// bad number was reported, but re-pasting a corrected standard over an earlier
// one is an ordinary thing to do and the contamination was silent at the moment
// it happened.
//
// The decision block is asserted rather than the truncation, because neither
// outcome is chosen for the reader. Clearing rows would discard values they
// typed; keeping them silently is the defect.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

/** Seed a six population standard, then paste a four population one over it. */
const seedAndPaste = async (rows) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'adc.state.v1',
      JSON.stringify({
        kitId: 'qsc-mouse',
        lotId: '',
        standards: [
          { id: 'p1', label: 'Population 1', mfi: 900, assigned: 3000, included: true },
          { id: 'p2', label: 'Population 2', mfi: 4000, assigned: 15000, included: true },
          { id: 'p3', label: 'Population 3', mfi: 16000, assigned: 62000, included: true },
          { id: 'p4', label: 'Population 4', mfi: 52000, assigned: 210000, included: true },
          { id: 'p5', label: 'Population 5', mfi: 88000, assigned: 360000, included: true },
          { id: 'p6', label: 'Population 6', mfi: 140000, assigned: 600000, included: true },
        ],
        samples: [{ id: 's1', label: 'Sample 1', mfi: 8900, controlMfi: 240 }],
        options: {
          standardKind: 'abc',
          fpRatio: 1,
          backgroundMode: 'abc',
          valency: 'bivalent',
          antibodyHost: 'mouse',
          saturationConfirmed: true,
          confidenceLevel: 0.95,
        },
      }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.evaluate((text) => {
    const cell = document.querySelector('input[aria-label^="MFI for"]')
    cell.focus()
    const data = new DataTransfer()
    data.setData('text/plain', text)
    cell.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  }, rows)
  await page.waitForTimeout(500)
}

const decision = () =>
  page.evaluate(() => {
    const el = document.querySelector('.paste-decision')
    return {
      text: el?.innerText ?? '',
      buttons: [...(el?.querySelectorAll('button') ?? [])].map((b) => b.textContent ?? ''),
      rows: document.querySelectorAll('input[aria-label^="MFI for"]').length,
      dismissable: (el?.querySelectorAll('button[aria-label^="Dismiss"]') ?? []).length > 0,
    }
  })

const SHORT = '2050\t8300\n12900\t51000\n39500\t175000\n121000\t512000'
await seedAndPaste(SHORT)
const left = await decision()
if (!left.text) {
  uiFailures.push(
    'antigen density: four populations pasted over six left two holding the previous standard ' +
      'and said nothing about it',
  )
} else {
  for (const name of ['Population 5', 'Population 6']) {
    if (!left.text.includes(name)) {
      uiFailures.push(`antigen density: the paste decision does not name ${name}`)
    }
  }
  if (!/still in the fit/i.test(left.text)) {
    uiFailures.push('antigen density: the paste decision does not say the rows are still in the fit')
  }
  if (left.buttons.length !== 2) {
    uiFailures.push(
      `antigen density: the paste decision offers ${left.buttons.length} action(s), so the ` +
        'decision is not actually the reader\'s to make',
    )
  }
  if (left.dismissable) {
    uiFailures.push(
      'antigen density: the paste decision can be dismissed without deciding, which puts the ' +
        'table back where it started',
    )
  }
}

/** Click, and record the failure rather than taking the whole run down. */
const clickOrReport = async (name) => {
  try {
    await page.getByRole('button', { name, exact: true }).click({ timeout: 5000 })
    await page.waitForTimeout(400)
    return true
  } catch (e) {
    uiFailures.push(`antigen density: could not press "${name}" (${String(e).split('\n')[0].slice(0, 70)})`)
    return false
  }
}

// Removing leaves the four that were pasted.
await clickOrReport('Remove them')
const removed = await decision()
if (removed.rows !== 4) {
  uiFailures.push(`antigen density: removing the rows a paste left behind gave ${removed.rows} rows, expected 4`)
}
if (removed.text) {
  uiFailures.push('antigen density: the paste decision survives the reader acting on it')
}

// Keeping leaves the table alone and stops asking.
await seedAndPaste(SHORT)
await clickOrReport('Keep them')
const kept = await decision()
if (kept.rows !== 6) {
  uiFailures.push(`antigen density: keeping the rows a paste left behind gave ${kept.rows} rows, expected 6`)
}
if (kept.text) {
  uiFailures.push('antigen density: the paste decision keeps asking after the reader has decided')
}

// A paste that covers the table has nothing to decide.
await seedAndPaste(
  SHORT + '\n150000\t640000\n180000\t760000',
)
const covered = await decision()
if (covered.text) {
  uiFailures.push('antigen density: a paste covering every row still asked what to do about rows beyond it')
}

// The same paste over the samples table, which is the worse of the two. A
// stale standard is caught downstream by the ratio consistency check; a stale
// sample is quantified and reported like any other, and nothing catches it.
await page.evaluate(() => {
  localStorage.setItem(
    'adc.state.v1',
    JSON.stringify({
      kitId: 'qsc-mouse',
      lotId: '',
      standards: [
        { id: 'd1', label: 'Population 1', mfi: 2050, assigned: 8300, included: true },
        { id: 'd2', label: 'Population 2', mfi: 12900, assigned: 51000, included: true },
        { id: 'd3', label: 'Population 3', mfi: 39500, assigned: 175000, included: true },
        { id: 'd4', label: 'Population 4', mfi: 121000, assigned: 512000, included: true },
      ],
      samples: [
        { id: 'a', label: 'Sample 1', mfi: 8900, controlMfi: 240 },
        { id: 'b', label: 'Sample 2', mfi: 12000, controlMfi: 250 },
        { id: 'c', label: 'Sample 3', mfi: 30000, controlMfi: 260 },
        { id: 'd', label: 'Sample 4', mfi: 45000, controlMfi: 270 },
      ],
      options: {
        standardKind: 'abc',
        fpRatio: 1,
        backgroundMode: 'abc',
        valency: 'bivalent',
        antibodyHost: 'mouse',
        saturationConfirmed: true,
        confidenceLevel: 0.95,
      },
    }),
  )
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.evaluate(() => {
  const cell = document.querySelector('input[aria-label^="Stained MFI for"]')
  cell.focus()
  const data = new DataTransfer()
  data.setData('text/plain', '5000\n7000')
  cell.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  )
})
await page.waitForTimeout(500)

const staleSamples = await page.evaluate(
  () => document.querySelector('.paste-decision')?.innerText ?? '',
)
if (!staleSamples) {
  uiFailures.push(
    'antigen density: two samples pasted over four left two from the previous run being ' +
      'quantified and reported, and said nothing about it',
  )
} else if (!staleSamples.includes('Sample 3') || !staleSamples.includes('Sample 4')) {
  uiFailures.push('antigen density: the sample paste decision does not name the rows it is about')
} else if (!/density is reported/i.test(staleSamples)) {
  uiFailures.push(
    'antigen density: the sample paste decision does not say the stale rows are being reported',
  )
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// What a reader needs at the moment they decide to use a figure from this tool.
//
// The footer said a copy of the licence was distributed with this software and
// linked nowhere, so /LICENSE answered 404. JSX also swallowed the space before
// the code element, rendering "in theLICENSE file". And there was no citation
// string anywhere on a page whose whole purpose is producing figures other
// people will publish.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const footerParts = await page.evaluate(() => {
  const el = document.querySelector('.site-footer')
  return {
    text: el?.textContent ?? '',
    licenceHref: el?.querySelector('a[href$="LICENSE"]')?.getAttribute('href') ?? null,
    citation: el?.querySelector('.footer-citation p')?.textContent?.trim() ?? '',
  }
})
if (footerParts.licenceHref === null) {
  uiFailures.push('antigen density: the footer names a LICENSE file and links nothing to it')
}
if (/the\s*LICENSE/.test(footerParts.text) && !/the LICENSE/.test(footerParts.text)) {
  uiFailures.push('antigen density: the footer reads "theLICENSE", with the space swallowed')
}
for (const part of ['Modi', 'Antigen Density Calculator', 'v0.1.0', 'benchtools.ligant.ai']) {
  if (!footerParts.citation.includes(part)) {
    uiFailures.push(`antigen density: the citation on the page does not carry ${part}`)
  }
}

// The licence itself, served rather than only linked.
const licence = await fetch(ORIGIN + '/LICENSE')
if (!licence.ok) {
  uiFailures.push(`antigen density: /LICENSE answers ${licence.status}, so the footer link is dead`)
} else if (!(await licence.text()).includes('Apache License')) {
  uiFailures.push('antigen density: /LICENSE answers but carries no licence text')
}

// ---------------------------------------------------------------------------
// Changing kit is reversible.
//
// It clears the certified values, which is right, and the intensity column,
// which is arguable: those are instrument readings and do not stop being
// readings because a different kit was selected. Rather than guess, the change
// is undoable, the way Clear all already is.
// ---------------------------------------------------------------------------
await page.getByRole('button', { name: 'Load worked example' }).click()
await page.waitForTimeout(400)
const before = await page.evaluate(() =>
  [...document.querySelectorAll('input[aria-label^="MFI for"]')].map((i) => i.value),
)
await page.selectOption('#kit', { index: 1 })
await page.waitForTimeout(400)
const cleared = await page.evaluate(() =>
  [...document.querySelectorAll('input[aria-label^="MFI for"]')].map((i) => i.value),
)
if (cleared.join() === before.join()) {
  uiFailures.push('antigen density: changing the bead kit left the standards table unchanged')
} else {
  try {
    await page.getByRole('button', { name: 'Undo kit change' }).click({ timeout: 5000 })
    await page.waitForTimeout(400)
    const restored = await page.evaluate(() =>
      [...document.querySelectorAll('input[aria-label^="MFI for"]')].map((i) => i.value),
    )
    if (restored.join() !== before.join()) {
      uiFailures.push(
        `antigen density: undoing a kit change restored ${JSON.stringify(restored.slice(0, 3))}, ` +
          `expected ${JSON.stringify(before.slice(0, 3))}`,
      )
    }
  } catch (e) {
    uiFailures.push(
      `antigen density: a kit change offers no way back (${String(e).split('\n')[0].slice(0, 60)})`,
    )
  }
}

await page.evaluate(() => localStorage.clear())

// ---------------------------------------------------------------------------
// The headline does not endorse a reading no instrument produces.
//
// Pasting a standard whose last population has both columns scaled by a
// thousand gave "Calibration valid. Slope 1.00, R² 0.9999, 4 populations." over
// an intensity of 1.21e8, with two row advisories underneath it that nothing
// carried upward. Every other gate is silent by construction: scaling both
// coordinates moves the point along a line of slope one, and the calibration's
// slope is 1.017, so it lands on the line it is about to distort.
//
// Driven through a real paste rather than seeded state, because the paste is
// how the defect was found and how a reader would meet it.
// ---------------------------------------------------------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
// The worked example rather than an empty table, and the paste starts at
// Population 1 rather than at the first cell. The example's four populations
// are exactly the four being pasted, so the standard ends up as the auditor
// typed it with the excluded blank and the three samples untouched, and there
// is a quantified card to read the density off. Clearing first, which this did
// at first, leaves no sample to report and the density assertion below reads an
// empty card rather than a withheld figure.
await page.getByRole('button', { name: 'Load worked example' }).click()
await page.waitForTimeout(400)
await page.evaluate(() => {
  const cell = document.querySelector('input[aria-label="MFI for Population 1"]')
  cell.focus()
  const data = new DataTransfer()
  data.setData(
    'text/plain',
    '2050\t8300\n12900\t51000\n39500\t175000\n121000000\t512000000',
  )
  cell.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  )
})
await page.waitForTimeout(600)

const endorsed = await page.evaluate(() => {
  const v = document.querySelector('.verdict')
  return {
    text: v?.textContent?.trim() ?? '',
    valid: v?.classList.contains('verdict-valid') ?? false,
    density: document.querySelector('.result-card .hero .value')?.textContent ?? '',
  }
})
if (endorsed.valid || /Calibration valid/i.test(endorsed.text)) {
  uiFailures.push(
    `antigen density: a standard containing 121,000,000 reports "${endorsed.text.slice(0, 70)}"`,
  )
}
if (!/caveat/i.test(endorsed.text)) {
  uiFailures.push(
    'antigen density: one population outside what a cytometer reports does not reach the headline',
  )
}
// A caveat, not a refusal. The density is right to a fraction of a percent, so
// withholding it would overstate what is wrong.
if (!/^[\d,]/.test(endorsed.density)) {
  uiFailures.push(
    `antigen density: the figure was withheld ("${endorsed.density}") for a 0.2 percent error`,
  )
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
console.log('that cannot support a figure reports itself, and withholds the figure; and\n' +
  'what is wrong with one value is said at the field it\n' +
  'was typed into, without moving the field below it and without waiting for the\n' +
  'reader to leave the row; and the answer is reachable on a phone without\n' +
  'scrolling past the method; and a\n' +
  'standard whose certified values are its own intensities is refused despite\n' +
  'fitting perfectly; and a reason not to report is met before the figure it is\n' +
  'about, and withholds the band and the interpretation beside it; and a reason\n' +
  'not to report reads and looks different from a\n' +
  'caveat, and carries no band or interpretation; and the exported figure carries\n' +
  'its own fit statistics and names its samples; and the results rail is not\n' +
  'sticky where there is only one column; and a population added to the table\n' +
  'continues the naming the kit uses, with its background disclosed to the decimal\n' +
  'place the threshold is judged on; and every\n' +
  'key written to a browser is disclosed on the page and removed by the control\n' +
  'that offers to remove it.')
