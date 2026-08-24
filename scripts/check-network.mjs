/**
 * Proves, at runtime, that the application contacts no third party.
 *
 * Serves the production build, drives a full user session in a real browser, and
 * fails if any request targets an origin other than the one serving the page.
 * String scanning cannot establish this; only observing the browser can.
 *
 * The CSP from public/_headers is applied as a real response header, so this
 * also confirms the policy does not break the app.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

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

if (failed) process.exit(1)
console.log('Network check passed: zero requests left the origin during a full session.')
