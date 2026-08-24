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
console.log('exported SVG parses; nothing is clipped at 360px; and an extreme input cannot')
console.log('explode the chart.')
