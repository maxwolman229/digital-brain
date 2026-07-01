import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DANIELI_COOKIE_MAX_AGE,
  DANIELI_COOKIE_NAME,
  DANIELI_COOKIE_PATH,
  DANIELI_DOCUMENTS,
  createDanieliAccessToken,
  getDanieliCookieOptions,
  getDanieliDocument,
  isDanieliAccessTokenValid,
  isDanieliPasswordValid,
  requireDanieliShareConfig,
  safeDanieliRedirect,
} from './danieliShare.js'

const env = {
  DANIELI_SHARE_PASSWORD: 'correct-client-code',
  DANIELI_SHARE_COOKIE_SECRET: 'local-cookie-secret-with-enough-entropy',
}

test('defines the refreshed 7_1 ontology and K-cards document', () => {
  assert.deepEqual(DANIELI_DOCUMENTS, [
    {
      slug: 'ontology-and-kcards',
      title: 'WTP / CLO / WCU Ontology & K-Cards',
      path: '/danieli/ontology-and-kcards/',
      sourceFile: 'danieli-md1-ontology-and-kcards_7_1-v0.html',
    },
  ])
  assert.equal(getDanieliDocument('ontology-and-kcards')?.title, 'WTP / CLO / WCU Ontology & K-Cards')
  assert.equal(getDanieliDocument('missing'), null)
})

test('validates the configured shared password without accepting partial matches', () => {
  assert.equal(isDanieliPasswordValid('correct-client-code', env), true)
  assert.equal(isDanieliPasswordValid('correct-client-code ', env), false)
  assert.equal(isDanieliPasswordValid('wrong-code', env), false)
  assert.equal(isDanieliPasswordValid('', env), false)
  assert.equal(isDanieliPasswordValid('correct-client-code', {}), false)
})

test('requires both server-only environment variables', () => {
  assert.doesNotThrow(() => requireDanieliShareConfig(env))
  assert.throws(
    () => requireDanieliShareConfig({ DANIELI_SHARE_COOKIE_SECRET: 'secret' }),
    /DANIELI_SHARE_PASSWORD/
  )
  assert.throws(
    () => requireDanieliShareConfig({ DANIELI_SHARE_PASSWORD: 'password' }),
    /DANIELI_SHARE_COOKIE_SECRET/
  )
})

test('creates and verifies a signed access token', () => {
  const issuedAt = 1_800_000_000
  const token = createDanieliAccessToken(env, issuedAt)

  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt), true)
  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt + DANIELI_COOKIE_MAX_AGE - 1), true)
  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt + DANIELI_COOKIE_MAX_AGE + 1), false)
  assert.equal(isDanieliAccessTokenValid(`${token}tampered`, env, issuedAt), false)
  assert.equal(
    isDanieliAccessTokenValid(token, { ...env, DANIELI_SHARE_COOKIE_SECRET: 'different-secret' }, issuedAt),
    false
  )
})

test('rejects malformed and future-dated access tokens', () => {
  const issuedAt = 1_800_000_000
  const token = createDanieliAccessToken(env, issuedAt + 120)

  assert.equal(isDanieliAccessTokenValid('', env, issuedAt), false)
  assert.equal(isDanieliAccessTokenValid('not.a.real.token', env, issuedAt), false)
  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt), false)
})

test('allows only safe redirects inside the Danieli share area', () => {
  assert.equal(safeDanieliRedirect('/danieli/ontology-and-kcards/'), '/danieli/ontology-and-kcards/')
  assert.equal(
    safeDanieliRedirect('/danieli/ontology-and-kcards/?view=wcu&tab=QW'),
    '/danieli/ontology-and-kcards/?view=wcu&tab=QW'
  )
  assert.equal(
    safeDanieliRedirect('https://md1.app/danieli/ontology-and-kcards/'),
    '/danieli/ontology-and-kcards/'
  )
  assert.equal(
    safeDanieliRedirect('http://localhost:4321/danieli/ontology-and-kcards/'),
    '/danieli/ontology-and-kcards/'
  )
  assert.equal(safeDanieliRedirect('/danieli'), '/danieli/')
  assert.equal(safeDanieliRedirect('/platform/'), '/danieli/')
  assert.equal(safeDanieliRedirect('https://evil.example/danieli/'), '/danieli/')
  assert.equal(safeDanieliRedirect('/danieli/session'), '/danieli/')
  assert.equal(safeDanieliRedirect('/danieli/logout'), '/danieli/')
  assert.equal(safeDanieliRedirect(''), '/danieli/')
})

test('returns hardened cookie options scoped to the Danieli path', () => {
  assert.equal(DANIELI_COOKIE_NAME, 'md1_danieli_share')
  assert.equal(DANIELI_COOKIE_PATH, '/danieli')
  assert.deepEqual(getDanieliCookieOptions(new URL('https://md1.app/danieli/')), {
    httpOnly: true,
    maxAge: DANIELI_COOKIE_MAX_AGE,
    path: DANIELI_COOKIE_PATH,
    sameSite: 'lax',
    secure: true,
  })
  assert.deepEqual(getDanieliCookieOptions(new URL('http://localhost:4321/danieli/')), {
    httpOnly: true,
    maxAge: DANIELI_COOKIE_MAX_AGE,
    path: DANIELI_COOKIE_PATH,
    sameSite: 'lax',
    secure: false,
  })
})
