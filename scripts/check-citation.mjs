/**
 * The same claim, in three documents.
 *
 * The tool's footer, CITATION.cff, and the manuscript's Availability section
 * all state the tool name, author, year, version and URL. Three copies of one
 * string is three chances to disagree, and the disagreement is silent: nothing
 * fails when they drift, a reader simply finds two citations for one artefact
 * and cannot tell which is right.
 *
 * Two of the three are held together here. The third is a manuscript nothing
 * in this repository can see, so that comparison stays manual and is named as
 * manual rather than assumed.
 *
 * A script rather than a test, for the same reason check-style and
 * check-privacy are scripts: it reads files from disk, and the application's
 * TypeScript project targets a browser with no node types, so a test that
 * imports node:fs passes under vitest and fails the typecheck.
 */

import { readFileSync } from 'node:fs'

const cff = readFileSync('CITATION.cff', 'utf8')
const site = readFileSync('src/lib/site.ts', 'utf8')
const readme = readFileSync('README.md', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

const failures = []
const fail = (message) => failures.push(message)

/** A top-level scalar from the CFF document. Enough for the flat fields here. */
const cffField = (name) =>
  (cff.match(new RegExp(`^${name}:\\s*(.+)$`, 'm')) ?? [])[1]?.trim().replace(/^['"]|['"]$/g, '')

/** A string constant from the single module that defines the site's identity. */
const siteConst = (name) =>
  (site.match(new RegExp(`${name}[^=]*=\\s*['"]([^'"]+)['"]`)) ?? [])[1]

for (const [cffName, siteName] of [
  ['version', 'APP_VERSION'],
  ['repository-code', 'REPO_URL'],
  ['url', 'SITE_URL'],
]) {
  const stated = cffField(cffName)
  const actual = siteConst(siteName)
  if (actual === undefined) {
    fail(`could not read ${siteName} from src/lib/site.ts`)
  } else if (stated !== actual) {
    fail(`CITATION.cff says ${cffName}: ${stated ?? '(absent)'}, but ${siteName} is ${actual}`)
  }
}

if (!/family-names:\s*Modi/.test(cff) || !/given-names:\s*A\.B\./.test(cff)) {
  fail('CITATION.cff does not name the author the footer names')
}
if (!/affiliation:\s*Ligant AI Incorporated/.test(cff)) {
  fail('CITATION.cff does not name the affiliation the footer names')
}
// The version is stated in four places, not two.
//
// This check covered CITATION.cff against site.ts and nothing else, so
// releasing v0.1.1 left README.md announcing v0.1.0 in its status line and
// package.json still at 0.1.0, and the check passed. Two of the four agreeing
// is not consistency. APP_VERSION is the source; the rest are asserted
// against it.
const appVersion = siteConst('APP_VERSION')
if (appVersion) {
  // README states it with a leading v, as the footer and the tag do.
  const stated = (readme.match(/^`(v[\d.]+)`\.\s+\*\*Research use only/m) ?? [])[1]
  if (!stated) {
    fail('README.md has no version in its status line, so it cannot be held to APP_VERSION')
  } else if (stated !== appVersion) {
    fail(`README.md states ${stated} in its status line, but APP_VERSION is ${appVersion}`)
  }
  // package.json is semver, so it carries no leading v.
  const bare = appVersion.replace(/^v/, '')
  if (pkg.version !== bare) {
    fail(`package.json version is ${pkg.version}, but APP_VERSION is ${appVersion}`)
  }
}

if (cffField('license') !== 'Apache-2.0') {
  fail(`CITATION.cff states the licence as ${cffField('license')}, not Apache-2.0`)
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(cffField('date-released') ?? '')) {
  fail('CITATION.cff has no release date, which the tag must match')
}

// Absent on purpose until Zenodo mints one, and asserted so that adding a
// placeholder that looks like an identifier is a deliberate act rather than
// something that slips in.
if (/10\.5281\/zenodo\.0+\b/.test(cff)) {
  fail('CITATION.cff carries a placeholder DOI, which is worse than no DOI')
}

if (failures.length > 0) {
  console.error(`Citation check failed with ${failures.length} issue(s):\n`)
  for (const f of failures) console.error('  ' + f)
  console.error('\nThe footer, CITATION.cff and the manuscript must state one citation.')
  process.exit(1)
}

console.log(
  `Citation check passed: CITATION.cff, README.md and package.json all agree with ` +
    `src/lib/site.ts on version ${cffField('version')}, and the citation file agrees on ` +
    `repository and origin. The manuscript is not readable from here ` +
    'and must be diffed by hand.',
)
