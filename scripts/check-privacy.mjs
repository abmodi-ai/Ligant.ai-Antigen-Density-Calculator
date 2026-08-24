/**
 * Fails the build if anything could contact a third party or transmit user data.
 *
 * The product claim is that nothing leaves the user's computer and that the page
 * contacts no outside origin. That claim is only worth making if it is checked,
 * so this runs in CI beside the style gate.
 *
 * Four rules:
 *   1. The Content-Security-Policy names no origin other than self.
 *   2. index.html loads nothing from an external URL.
 *   3. Application source contains no network primitive.
 *   4. The built bundle embeds no external URL, apart from inert identifiers
 *      such as XML namespaces.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const failures = []
const fail = (rule, detail) => failures.push(`  [${rule}] ${detail}`)

// CSP tokens that are keywords or schemes rather than remote origins.
const CSP_SAFE = new Set([
  "'self'", "'none'", "'unsafe-inline'", "'wasm-unsafe-eval'", "'strict-dynamic'",
  'data:', 'blob:', 'upgrade-insecure-requests',
])

// URLs that appear in built output but perform no network request.
//
// XML namespaces are identifiers rather than addresses; nothing is ever fetched
// from them. React's error-decoder link is text interpolated into a thrown
// error message for a developer to open by hand, not a request the page makes.
//
// A string allowlist is a coarse instrument, which is why it is the early gate
// and not the proof. The guarantee is enforced at runtime by the network
// assertion in scripts/check-network.mjs, which drives the built app and fails
// on any request to an origin other than its own.
const INERT_URLS = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1998/Math/MathML',
  'https://reactjs.org/docs/error-decoder.html',
]

// ---- 1. Content-Security-Policy ------------------------------------------

const headersPath = 'public/_headers'
if (!existsSync(headersPath)) {
  fail('csp', `${headersPath} is missing; the deployed site would have no policy`)
} else {
  const line = readFileSync(headersPath, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith('Content-Security-Policy:'))
  if (!line) {
    fail('csp', 'no Content-Security-Policy header is defined')
  } else {
    const policy = line.slice(line.indexOf(':') + 1).trim()
    for (const directive of policy.split(';').map((d) => d.trim()).filter(Boolean)) {
      const [name, ...values] = directive.split(/\s+/)
      for (const value of values) {
        if (CSP_SAFE.has(value)) continue
        if (/^https?:\/\//.test(value) || value.includes('.') || value === '*') {
          fail('csp', `${name} allows the external origin ${value}`)
        }
      }
    }
    for (const required of ["default-src 'self'", "connect-src 'self'"]) {
      if (!policy.includes(required)) fail('csp', `policy must contain ${required}`)
    }
  }
}

// ---- 2. Entry document ----------------------------------------------------

if (existsSync('index.html')) {
  const html = readFileSync('index.html', 'utf8')
  for (const m of html.matchAll(/<(link|script|img|iframe)\b[^>]*?(?:href|src)=["']([^"']+)["']/gi)) {
    if (/^(https?:)?\/\//.test(m[2])) fail('html', `<${m[1]}> loads external ${m[2]}`)
  }
}

// ---- 3. Application source ------------------------------------------------

const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(path))) out.push(path)
  }
  return out
}

if (existsSync('src')) {
  for (const file of walk('src')) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (NETWORK.test(line) && !line.trim().startsWith('*') && !line.trim().startsWith('//')) {
        fail('source', `${file}:${i + 1} uses a network primitive: ${line.trim().slice(0, 70)}`)
      }
    })
  }
}

// ---- 4. Built bundle ------------------------------------------------------

if (existsSync('dist')) {
  for (const file of walk('dist').concat(
    readdirSync('dist').filter((f) => f.endsWith('.html')).map((f) => join('dist', f)),
  )) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/https?:\/\/[^\s"'`)\\]+/g)) {
      const url = m[0].replace(/[.,;]+$/, '')
      if (INERT_URLS.some((inert) => url.startsWith(inert))) continue
      fail('bundle', `${file} embeds ${url.slice(0, 80)}`)
    }
  }
} else {
  console.log('note: dist/ not present, skipping bundle scan. Run npm run build first.')
}

// ---- report ---------------------------------------------------------------

if (failures.length > 0) {
  console.error(`Privacy check failed with ${failures.length} issue(s):\n`)
  console.error(failures.join('\n'))
  console.error('\nThis project contacts no third party and transmits no user data.')
  console.error('See the invariants in CLAUDE.md before changing any of the above.')
  process.exit(1)
}

console.log('Privacy check passed: no external origin, no network primitive, no embedded URL.')
