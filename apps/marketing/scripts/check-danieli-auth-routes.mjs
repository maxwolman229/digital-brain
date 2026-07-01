import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const pageRoot = path.join(projectRoot, 'src/pages/danieli')

async function readRoute(file) {
  try {
    return await readFile(path.join(pageRoot, file), 'utf8')
  } catch (error) {
    throw new assert.AssertionError({
      message: `Missing Danieli auth route: src/pages/danieli/${file}`,
      actual: error.code,
      expected: 'file to exist',
    })
  }
}

const index = await readRoute('index.astro')
const session = await readRoute('session.js')
const logout = await readRoute('logout.js')

assert.match(index, /export\s+const\s+prerender\s*=\s*false/, 'index.astro must run on demand')
assert.match(index, /DANIELI_DOCUMENTS/, 'index.astro must render the helper allowlist')
assert.match(index, /name="password"/, 'index.astro must include a password input')
assert.match(index, /name="next"/, 'index.astro must preserve a safe next value')
assert.match(index, /action="\/danieli\/session"/, 'index.astro must post to the Danieli session route')
assert.doesNotMatch(
  index,
  /DANIELI_SHARE_PASSWORD/,
  'index.astro must not read the shared password in renderable page markup'
)

assert.match(session, /export\s+const\s+prerender\s*=\s*false/, 'session.js must run on demand')
assert.match(session, /isDanieliPasswordValid/, 'session.js must validate via the helper')
assert.match(session, /createDanieliAccessToken/, 'session.js must create signed access tokens')
assert.match(session, /cookies\.set/, 'session.js must set the Danieli access cookie')
assert.match(session, /303/, 'session.js should use 303 redirects after POST')
assert.match(session, /error=1/, 'session.js must redirect failed logins with an error marker')
assert.doesNotMatch(session, /correct-client-code/, 'session.js must not hard-code the shared password')

assert.match(logout, /export\s+const\s+prerender\s*=\s*false/, 'logout.js must run on demand')
assert.match(logout, /cookies\.delete/, 'logout.js must clear the Danieli cookie')
assert.match(logout, /DANIELI_COOKIE_NAME/, 'logout.js must use the shared cookie name')
assert.match(logout, /\/danieli\//, 'logout.js must redirect back to the Danieli gate')

console.log('Danieli auth route check passed.')
