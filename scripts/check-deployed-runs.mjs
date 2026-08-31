/**
 * Does the deployed-site check run to completion?
 *
 * Only that. It is not a second opinion on the site, and it cannot be: the two
 * claims check-deployed.mjs exists to make, about what the edge injects and
 * whether the authored headers survive the trip, have no meaning against a
 * local server. What it establishes is that every assertion in that script was
 * reached and returned a verdict, on this build, before a deploy.
 *
 * That is the failure this exists for. The /LICENSE assertion sat under a
 * closed browser for eleven days and crashed on every production deploy. The
 * script ran nowhere but after a deploy, so its own crash and a failed
 * deployment were the same red mark, and it stayed broken until someone read
 * eleven days of logs.
 *
 * Exit codes from check-deployed.mjs, which this depends on: 0 passed, 1 an
 * assertion failed, 2 the check could not run. Only 2 fails here. A 1 against a
 * local mirror is expected in the cases a mirror cannot reproduce and is
 * reported without failing, since judging the site is the other script's job
 * against the real URL.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { serveDist } from './serve-dist.mjs'

if (!existsSync('dist/index.html')) {
  console.error('No dist/index.html. Run npm run build first.')
  process.exit(1)
}

const PORT = 4183
const server = await serveDist(PORT)
const target = `http://127.0.0.1:${PORT}/`

// The agent proxy in some environments refuses a loopback CONNECT, and the
// browser inherits it, so the check would fail on a tunnel error rather than on
// anything it asserts.
//
// Spawned rather than run synchronously: the mirror is served from this
// process, so blocking here would leave nothing to answer the request and the
// check would time out against a server that is running.
const run = await new Promise((resolve) => {
  let output = ''
  const child = spawn(process.execPath, ['scripts/check-deployed.mjs', target], {
    env: { ...process.env, NO_PROXY: '*', no_proxy: '*', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  })
  child.stdout.on('data', (d) => { output += d })
  child.stderr.on('data', (d) => { output += d })
  child.on('close', (status) => resolve({ status, output }))
})
server.close()

const output = run.output

if (run.status === 2 || run.status === null) {
  console.error('\nFAIL: scripts/check-deployed.mjs did not run to completion, so after the next')
  console.error('deploy it will report a crash rather than a verdict on the site.\n')
  console.error(output.trim())
  process.exit(1)
}

if (run.status === 1) {
  console.log('scripts/check-deployed.mjs ran to completion and reported against the local')
  console.log('mirror. Its verdict on the site comes from the deployed URL, not from here:\n')
  console.log(output.trim())
} else {
  console.log('scripts/check-deployed.mjs ran to completion, every assertion reached.')
}
