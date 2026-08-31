/**
 * dist/ served the way the production host serves it, for one purpose only:
 * so scripts/check-deployed.mjs can be run before a deploy rather than only
 * after one.
 *
 * That script had a defect for eleven days. It fetched /LICENSE after closing
 * the browser, threw on every production deploy, and the workflow's retry loop
 * reported the crash three times as "the deployed site did not pass
 * verification" while the site was serving correctly the whole time. It ran
 * nowhere except after a deploy, so there was no run in which a fault in the
 * check could be told apart from a fault in the deployment.
 *
 * This is not a second copy of the header rules. Every header comes from
 * public/_headers, parsed here into its path blocks, so a rule the production
 * host would apply is applied and one it would not is not. The two things a
 * local mirror cannot show are the two the deployed check exists for: what the
 * edge injects, and whether the authored headers survive the trip. Those still
 * only come from the real URL.
 *
 * Usage: node scripts/serve-dist.mjs [port]
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

/** public/_headers as ordered {match, headers} blocks, later blocks winning. */
function headerBlocks() {
  const blocks = []
  let current = null
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    if (/^\S/.test(line) && !line.startsWith('#')) {
      current = { match: line.trim(), headers: {} }
      blocks.push(current)
    } else if (current && /^\s+\S/.test(line)) {
      const text = line.trim()
      if (text.startsWith('#')) continue
      const colon = text.indexOf(':')
      if (colon > 0) current.headers[text.slice(0, colon).trim()] = text.slice(colon + 1).trim()
    }
  }
  return blocks
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json',
}

const BLOCKS = headerBlocks()
if (BLOCKS.length === 0) {
  console.error('Could not read any header block from public/_headers.')
  process.exit(1)
}

/** Cloudflare's matching, to the extent this uses it: exact, or a /* prefix. */
function matches(pattern, path) {
  if (pattern === '/*') return true
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1))
  return pattern === path
}

export function serveDist(port) {
  const server = createServer(async (req, res) => {
    const requested = req.url.split('?')[0]
    const path = requested.endsWith('/') ? requested + 'index.html' : requested
    let body
    try {
      body = await readFile(join('dist', path))
    } catch {
      res.writeHead(404)
      res.end()
      return
    }
    const headers = { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }
    for (const block of BLOCKS) {
      if (matches(block.match, requested)) Object.assign(headers, block.headers)
    }
    res.writeHead(200, headers)
    res.end(body)
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || 4183)
  await serveDist(port)
  console.log(`dist/ on http://127.0.0.1:${port}, with the headers public/_headers authors.`)
}
