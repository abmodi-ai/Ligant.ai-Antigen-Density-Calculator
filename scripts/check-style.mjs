/**
 * Fails the build on prose conventions that are easy to reintroduce by hand.
 *
 * Rule: no em dash (U+2014) anywhere in source, markup, or docs. En dash
 * (U+2013) is permitted only as a range or compound separator, where numerals
 * or words sit on both sides.
 *
 * The dash characters are built from code points so that this file does not
 * match its own rule.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const ROOTS = ['src', 'scripts', '.github', 'index.html', 'README.md']
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.md', '.yml', '.yaml'])
const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)
const SELF = resolve(new URL(import.meta.url).pathname)

function walk(path, out = []) {
  const info = statSync(path, { throwIfNoEntry: false })
  if (!info) return out
  if (info.isFile()) {
    if (EXTENSIONS.has(extname(path)) && resolve(path) !== SELF) out.push(path)
    return out
  }
  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry.startsWith('.git')) continue
    walk(join(path, entry), out)
  }
  return out
}

/** Nearest non-whitespace character on each side, so spaced ranges still pass. */
function neighbours(line, index) {
  let left = index - 1
  while (left >= 0 && /\s/.test(line[left])) left--
  let right = index + 1
  while (right < line.length && /\s/.test(line[right])) right++
  return [line[left] ?? '', line[right] ?? '']
}

const failures = []
for (const file of ROOTS.flatMap((r) => walk(r))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const where = `${file}:${i + 1}`
    const snippet = `    ${line.trim().slice(0, 110)}`
    if (line.includes(EM_DASH)) failures.push(`${where}  em dash\n${snippet}`)

    for (let c = line.indexOf(EN_DASH); c !== -1; c = line.indexOf(EN_DASH, c + 1)) {
      const [before, after] = neighbours(line, c)
      // Template placeholders resolve to numbers at runtime, so treat the
      // closing and opening braces of an interpolation as numeric too.
      const numeric = /[0-9)}]/.test(before) && /[0-9({$]/.test(after)
      const compound = /[0-9a-z>]/i.test(before) && /[0-9a-z<]/i.test(after)
      if (!numeric && !compound) failures.push(`${where}  en dash outside a range\n${snippet}`)
    }
  })
}

if (failures.length > 0) {
  console.error(`Style check failed with ${failures.length} issue(s):\n`)
  console.error(failures.join('\n'))
  console.error('\nEm dashes are not used in this project. Use a full stop, a colon,')
  console.error('a semicolon, or parentheses instead. See CONVENTIONS.md.')
  process.exit(1)
}

console.log('Style check passed: no em dashes, en dashes only as range separators.')
