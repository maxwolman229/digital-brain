import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')

const read = (path) => readFileSync(resolve(marketingRoot, path), 'utf8')

const index = read('src/pages/danieli/index.astro')
const session = read('src/pages/danieli/session.js')
const logout = read('src/pages/danieli/logout.js')

assert.match(index, /export const prerender = false/)
assert.match(index, /method="post"/)
assert.match(index, /action="\/danieli\/session"/)
assert.match(index, /name="password"/)
assert.match(index, /name="next"/)
assert.match(index, /Incorrect code/)
assert.match(index, /WTP Ontology & K-Cards/)

assert.match(session, /export const prerender = false/)
assert.match(session, /export async function POST/)
assert.match(session, /requireDanieliShareConfig/)
assert.match(session, /isDanieliPasswordValid/)
assert.match(session, /createDanieliAccessToken/)
assert.match(session, /getDanieliCookieOptions/)
assert.match(session, /cookies\.set/)
assert.match(session, /Response\.redirect/)

assert.match(logout, /export const prerender = false/)
assert.match(logout, /cookies\.delete/)
assert.match(logout, /DANIELI_COOKIE_PATH/)
assert.match(logout, /Response\.redirect/)

console.log('Danieli auth route check passed.')
