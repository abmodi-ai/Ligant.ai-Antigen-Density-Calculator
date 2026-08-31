/**
 * Runtime assertions against the site as it is actually served.
 *
 * scripts/check-network.mjs drives the same application from a local server
 * that reads dist/ off disk and applies the authored headers itself. That is
 * the right check for the build, and it is structurally incapable of seeing
 * two things:
 *
 *   - anything the edge injects into the response after the build, and
 *   - whether the authored headers reach the browser at all.
 *
 * Both mattered. A scientific review of 26 August 2026 captured a full session
 * and found two requests to static.cloudflareinsights.com, a beacon injected by
 * Cloudflare Web Analytics, against a page that states it contacts no third
 * party. The requests were issued rather than blocked, which under a
 * script-src of 'self' means the served policy was not the authored one.
 *
 * So this runs after a deploy, against the deployed URL, and asserts three
 * things a build check cannot:
 *
 *   1. no request leaves the origin across a full session
 *   2. nothing in the served HTML references another origin, which catches an
 *      injected tag even where the policy stops it before a request is made
 *   3. every header in public/_headers arrives, and the policy has not been
 *      widened in transit
 *
 * Usage: node scripts/check-deployed.mjs [url]
 * Falls back to DEPLOY_URL, then to SITE_URL from src/lib/site.ts.
 */

import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'node:fs'

const CHROME = process.env.CHROME_PATH

const configured = (readFileSync('src/lib/site.ts', 'utf8').match(
  /SITE_URL\s*=\s*['"]([^'"]+)['"]/,
) ?? [])[1]
const target = process.argv[2] || process.env.DEPLOY_URL || configured
if (!target) {
  console.error('No URL given, and SITE_URL could not be read from src/lib/site.ts.')
  process.exit(1)
}
const ORIGIN = new URL(target).origin

/**
 * The header block public/_headers applies to every path.
 *
 * Only the `/*` rule is read. A path-specific rule below it is about caching
 * rather than about what the page may reach, and asserting cache headers here
 * would make this fail on a CDN doing its job.
 */
function authoredHeaders() {
  const lines = readFileSync('public/_headers', 'utf8').split('\n')
  const start = lines.findIndex((l) => l.trim() === '/*')
  if (start === -1) return {}
  const out = {}
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break
    const text = line.trim()
    if (text.startsWith('#')) continue
    const colon = text.indexOf(':')
    if (colon === -1) continue
    out[text.slice(0, colon).trim().toLowerCase()] = text.slice(colon + 1).trim()
  }
  return out
}

/** A policy as {directive: Set(sources)}, so it compares by meaning. */
function parsePolicy(value) {
  const out = new Map()
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) out.set(name.toLowerCase(), new Set(sources))
  }
  return out
}

// A thrown error means this script could not run, which is a different claim
// from "the site is wrong" and must not be reported as one. Exit 2 says so, and
// the deploy workflow does not retry it.
//
// Both events, because a rejected top level await surfaces as an uncaught
// exception rather than as an unhandled rejection, which is how the crash this
// guards against actually arrived.
const crashed = (e) => {
  console.error('\nThe deployed-site check could not run. This is a fault in the check, not a')
  console.error(`verdict on ${target}:\n`)
  console.error(String(e?.stack ?? e))
  process.exit(2)
}
process.on('uncaughtException', crashed)
process.on('unhandledRejection', crashed)

const failures = []
const authored = authoredHeaders()
if (Object.keys(authored).length === 0) {
  console.error('Could not read the /* header block from public/_headers.')
  process.exit(1)
}

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox'],
})
// A fresh context with no extensions and no profile: the review's own capture
// carried the reviewing browser's extension traffic, which is noise this has to
// be free of to mean anything.
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })

const isLocal = (url) =>
  url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')

// Outcome as well as occurrence. A request the policy refuses still surfaces as
// a request, so occurrence alone cannot say whether the policy held; the review
// reported a status code, which suggests its beacon was answered rather than
// blocked. Recording both settles that where a capture cannot.
const foreign = new Map()
page.on('request', (r) => {
  if (!isLocal(r.url())) foreign.set(r.url(), `${r.method()} ${r.url()} (no outcome recorded)`)
})
page.on('requestfailed', (r) => {
  if (!isLocal(r.url())) {
    foreign.set(r.url(), `${r.method()} ${r.url()} blocked: ${r.failure()?.errorText ?? 'unknown'}`)
  }
})
page.on('response', (r) => {
  if (!isLocal(r.url())) foreign.set(r.url(), `${r.request().method()} ${r.url()} answered ${r.status()}`)
})

let served = null
page.on('response', (r) => {
  if (served === null && r.url().replace(/\/$/, '') === target.replace(/\/$/, '')) {
    served = r.headers()
  }
})

/**
 * Do the thing, and say so if it could not be done.
 *
 * These steps were written to swallow their own failures, on the reasoning that
 * the check is about network traffic rather than about the interface. That was
 * wrong in a way that only showed up when a deploy needed defending: a page that
 * rendered nothing at all would click nothing, fail nothing, and pass. A check
 * that cannot tell a working deployment from a blank one cannot be cited as
 * evidence that a deployment worked.
 */
async function step(what, action) {
  try {
    await action()
  } catch (error) {
    failures.push(`could not ${what}: ${String(error).split('\n')[0]}`)
  }
}

// --- the session the review captured, end to end ---
const response = await page.goto(target, { waitUntil: 'networkidle' })
if (!response || !response.ok()) {
  failures.push(`${target} answered ${response ? response.status() : 'nothing'}`)
}
if (served === null && response) served = response.headers()

await step('load the worked example', () =>
  page.getByRole('button', { name: 'Load worked example' }).click({ timeout: 15000 }),
)
await page.waitForTimeout(600)

// Editing, because a keystroke is where a beacon that samples interaction
// would fire, and a page-load capture alone would miss it.
await step('edit a sample reading', () =>
  page.locator('input[aria-label^="Stained MFI"]').first().fill('12345', { timeout: 15000 }),
)
await page.waitForTimeout(600)

// The figure the edit produces. A deployment that serves the shell but not the
// application would get this far on markup alone.
await step('read back a computed density', async () => {
  const value = await page.locator('.result-card .hero .value').first().innerText({ timeout: 15000 })
  if (!/\d/.test(value)) throw new Error(`the result card reads "${value}"`)
})

for (const name of ['Export SVG', 'Export CSV']) {
  await step(`export ${name.split(' ')[1]}`, () =>
    Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.getByRole('button', { name }).click({ timeout: 15000 }),
    ]),
  )
  await page.waitForTimeout(400)
}
await page.waitForTimeout(800)

// --- a path this repository no longer builds ---
//
// The cytotoxicity curve fitter was removed and nothing here emits that path,
// yet a review found it answering 200 with an unfinished second tool under the
// same branding. Nothing in the repository explains that, so the only way to
// know is to ask the deployed site.
const retired = await page.request.get(new URL('/cytotoxicity/', target).href, {
  maxRedirects: 0,
  failOnStatusCode: false,
})
if (retired.status() === 200) {
  failures.push(
    'the retired /cytotoxicity/ path answers 200. Nothing in this repository builds it, so the ' +
      'deployment is serving an artefact the source does not explain.',
  )
}

// --- the licence the footer sends a reader to ---
const licence = await page.request.get(new URL('/LICENSE', target).href, {
  failOnStatusCode: false,
})
if (!licence.ok()) {
  failures.push(
    `the footer links /LICENSE and it answers ${licence.status()}, so the one sentence on the ` +
      'page a reader might follow goes nowhere',
  )
} else if (!(await licence.text()).includes('Apache License')) {
  failures.push('/LICENSE answers, but does not contain the Apache licence text')
}

// --- what the served document references, whether or not it was fetched ---
//
// A tag the policy refuses to load makes no request, so the request log above
// cannot see it. The document can.
//
// Only the elements that actually fetch. A canonical link and an alternate are
// declarations about this page rather than resources it loads, and reading them
// as subresources reported the site's own canonical URL as a third party.
const referenced = await page.evaluate(() => {
  const FETCHING = new Set([
    'stylesheet',
    'preload',
    'modulepreload',
    'prefetch',
    'preconnect',
    'dns-prefetch',
    'icon',
    'apple-touch-icon',
    'mask-icon',
    'manifest',
  ])
  const out = []
  for (const el of document.querySelectorAll('script[src], img[src], iframe[src]')) {
    out.push(el.getAttribute('src'))
  }
  for (const el of document.querySelectorAll('link[href]')) {
    const rels = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (rels.some((rel) => FETCHING.has(rel))) out.push(el.getAttribute('href'))
  }
  return out.filter(Boolean)
})
const offOrigin = referenced.filter((ref) => {
  if (!/^https?:|^\/\//.test(ref)) return false
  return !new URL(ref, target).href.startsWith(ORIGIN)
})

// Nothing below this line may touch the network or the page. Everything after
// it reads data already captured above.
//
// The /LICENSE assertion was appended to the end of the file, which put it
// under a closed browser. It threw "Target page, context or browser has been
// closed" on every production deploy for eleven days while the site itself was
// fine, and the retry loop reported the crash three times as a failed
// deployment. A new assertion that needs a request belongs above here.
await browser.close()

/**
 * Is the page being served the build that was just uploaded?
 *
 * Nothing here asked that, so a deploy that silently did not take would have
 * passed every assertion below while serving the previous release. Asked when
 * a red run had to be told apart from a failed deploy, which is the moment the
 * omission mattered.
 *
 * Vite content-hashes the entry assets, so their filenames are the build's
 * identity and there is no version string to remember to bump. Skipped when
 * dist/ is absent, since this can be pointed at a URL from anywhere.
 */
const built = existsSync('dist/index.html')
  ? [...new Set(readFileSync('dist/index.html', 'utf8').match(/\/assets\/[A-Za-z0-9._-]+/g) ?? [])]
  : []
const servedPaths = new Set(
  referenced.map((ref) => {
    try {
      return new URL(ref, target).pathname
    } catch {
      return ref
    }
  }),
)
const missing = built.filter((asset) => !servedPaths.has(asset))
if (built.length === 0 && existsSync('dist/index.html')) {
  failures.push('dist/index.html references no hashed assets, so the build cannot be identified')
} else if (missing.length > 0) {
  failures.push(
    `the deployed page does not reference ${missing.join(', ')} from this build, so it is serving ` +
      'something else. The upload may not have taken, or the edge may be caching the previous one.',
  )
}

// --- assertions ---

if (foreign.size > 0) {
  failures.push(
    `the page contacted ${foreign.size} external origin(s): ${[...foreign.values()].join('; ')}`,
  )
}
if (offOrigin.length > 0) {
  failures.push(
    `the served document references ${offOrigin.length} external resource(s): ${offOrigin.join(', ')}`,
  )
}

if (served === null) {
  failures.push('no response headers were captured for the entry document')
} else {
  for (const [name, value] of Object.entries(authored)) {
    const actual = served[name]
    if (actual === undefined) {
      failures.push(`the served response is missing ${name}, which public/_headers sets`)
      continue
    }
    if (name !== 'content-security-policy') {
      if (actual.trim() !== value) {
        failures.push(`${name} is served as "${actual}", authored as "${value}"`)
      }
      continue
    }
    // By meaning rather than by string: a reordered policy is the same policy,
    // an added source is not.
    const want = parsePolicy(value)
    const got = parsePolicy(actual)
    for (const [directive, sources] of want) {
      if (!got.has(directive)) {
        failures.push(`the served policy drops ${directive}, which public/_headers sets`)
        continue
      }
      const added = [...got.get(directive)].filter((s) => !sources.has(s))
      if (added.length > 0) {
        failures.push(
          `the served policy widens ${directive} with ${added.join(' ')}, which public/_headers ` +
            'does not permit. Something between the build and the browser is rewriting the policy.',
        )
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} problem(s) with ${target}:`)
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}

console.log(
  `${target} serves ${referenced.length} referenced resource(s), all from this origin; a full ` +
    'session including the worked example, an edit and both exports made no request that left ' +
    'it; and every header in public/_headers arrived unwidened.',
)
