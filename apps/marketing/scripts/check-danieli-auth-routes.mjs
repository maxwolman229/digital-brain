import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DANIELI_COOKIE_MAX_AGE,
  DANIELI_COOKIE_NAME,
  DANIELI_COOKIE_PATH,
  isDanieliAccessTokenValid,
} from '../src/lib/danieliShare.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')
const danieliEnv = {
  DANIELI_SHARE_PASSWORD: 'correct-client-code',
  DANIELI_SHARE_COOKIE_SECRET: 'local-cookie-secret-with-enough-entropy',
}

const read = (path) => readFileSync(resolve(marketingRoot, path), 'utf8')
const routeUrl = (path) => pathToFileURL(resolve(marketingRoot, path)).href

const index = read('src/pages/danieli/index.astro')
const session = read('src/pages/danieli/session.js')
const logout = read('src/pages/danieli/logout.js')

assert.match(index, /export const prerender = false/)
assert.match(index, /Astro\.response\.headers\.set\('Cache-Control', 'no-store'\)/)
assert.match(index, /method="post"/)
assert.match(index, /action="\/danieli\/session"/)
assert.match(index, /name="password"/)
assert.match(index, /name="next"/)
assert.match(index, /aria-invalid=\{hasError \? 'true' : undefined\}/)
assert.match(index, /aria-describedby=\{hasError \? 'danieli-password-error' : undefined\}/)
assert.match(index, /id="danieli-password-error"/)
assert.match(index, /role="alert"/)
assert.match(index, /Incorrect code/)
assert.match(index, /WTP Ontology & K-Cards/)

assert.match(session, /export const prerender = false/)
assert.match(session, /export async function POST/)
assert.match(session, /requireDanieliShareConfig/)
assert.match(session, /isDanieliPasswordValid/)
assert.match(session, /createDanieliAccessToken/)
assert.match(session, /getDanieliCookieOptions/)
assert.match(session, /cookies\.set/)
assert.match(session, /cache-control/)
assert.match(session, /no-store/)

assert.match(logout, /export const prerender = false/)
assert.match(logout, /cookies\.delete/)
assert.match(logout, /DANIELI_COOKIE_PATH/)
assert.match(logout, /cache-control/)
assert.match(logout, /no-store/)

function createCookieMock() {
  const setCalls = []
  const deleteCalls = []

  return {
    cookies: {
      set(name, value, options) {
        setCalls.push({ name, value, options })
      },
      delete(name, options) {
        deleteCalls.push({ name, options })
      },
    },
    setCalls,
    deleteCalls,
  }
}

function createFormRequest(fields) {
  const form = new FormData()

  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value)
  }

  return {
    async formData() {
      return form
    },
  }
}

function setDanieliEnv(env) {
  for (const name of ['DANIELI_SHARE_PASSWORD', 'DANIELI_SHARE_COOKIE_SECRET']) {
    if (env[name]) {
      process.env[name] = env[name]
    } else {
      delete process.env[name]
    }
  }
}

function assertNoStoreRedirect(response, location) {
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), location)
  assert.equal(response.headers.get('cache-control'), 'no-store')
}

async function checkSessionAndLogoutBehavior() {
  const savedEnv = {
    DANIELI_SHARE_PASSWORD: process.env.DANIELI_SHARE_PASSWORD,
    DANIELI_SHARE_COOKIE_SECRET: process.env.DANIELI_SHARE_COOKIE_SECRET,
  }
  const sessionRoute = await import(routeUrl('src/pages/danieli/session.js'))
  const logoutRoute = await import(routeUrl('src/pages/danieli/logout.js'))

  try {
    setDanieliEnv({})

    const missingEnvCookies = createCookieMock()
    const missingEnvResponse = await sessionRoute.POST({
      request: createFormRequest({
        password: 'correct-client-code',
        next: '/danieli/ontology-and-kcards/',
      }),
      cookies: missingEnvCookies.cookies,
      url: new URL('https://md1.app/danieli/session'),
    })

    assert.equal(missingEnvResponse.status, 500)
    assert.equal(missingEnvResponse.headers.get('cache-control'), 'no-store')
    assert.equal(await missingEnvResponse.text(), 'Danieli share is not configured.')
    assert.deepEqual(missingEnvCookies.setCalls, [])

    setDanieliEnv(danieliEnv)

    const sessionGetResponse = sessionRoute.GET({
      url: new URL('https://md1.app/danieli/session'),
    })

    assertNoStoreRedirect(sessionGetResponse, 'https://md1.app/danieli/')

    const wrongPasswordCookies = createCookieMock()
    const wrongPasswordResponse = await sessionRoute.POST({
      request: createFormRequest({
        password: 'wrong-code',
        next: '/danieli/ontology-and-kcards/',
      }),
      cookies: wrongPasswordCookies.cookies,
      url: new URL('https://md1.app/danieli/session'),
    })

    assertNoStoreRedirect(
      wrongPasswordResponse,
      'https://md1.app/danieli/?error=1&next=%2Fdanieli%2Fontology-and-kcards%2F'
    )
    assert.deepEqual(wrongPasswordCookies.setCalls, [])

    const validPasswordCookies = createCookieMock()
    const validPasswordResponse = await sessionRoute.POST({
      request: createFormRequest({
        password: 'correct-client-code',
        next: '/danieli/ontology-and-kcards/?tab=cards',
      }),
      cookies: validPasswordCookies.cookies,
      url: new URL('https://md1.app/danieli/session'),
    })

    assertNoStoreRedirect(
      validPasswordResponse,
      'https://md1.app/danieli/ontology-and-kcards/?tab=cards'
    )
    assert.equal(validPasswordCookies.setCalls.length, 1)
    assert.equal(validPasswordCookies.setCalls[0].name, DANIELI_COOKIE_NAME)
    assert.equal(isDanieliAccessTokenValid(validPasswordCookies.setCalls[0].value, danieliEnv), true)
    assert.deepEqual(validPasswordCookies.setCalls[0].options, {
      httpOnly: true,
      maxAge: DANIELI_COOKIE_MAX_AGE,
      path: DANIELI_COOKIE_PATH,
      sameSite: 'lax',
      secure: true,
    })

    const unsafeNextCookies = createCookieMock()
    const unsafeNextResponse = await sessionRoute.POST({
      request: createFormRequest({
        password: 'correct-client-code',
        next: 'https://evil.example/danieli/ontology-and-kcards/',
      }),
      cookies: unsafeNextCookies.cookies,
      url: new URL('https://md1.app/danieli/session'),
    })

    assertNoStoreRedirect(unsafeNextResponse, 'https://md1.app/danieli/')

    const logoutCookies = createCookieMock()
    const logoutGetResponse = logoutRoute.GET({
      cookies: logoutCookies.cookies,
      url: new URL('https://md1.app/danieli/logout'),
    })

    assertNoStoreRedirect(logoutGetResponse, 'https://md1.app/danieli/')
    assert.deepEqual(logoutCookies.deleteCalls, [
      {
        name: DANIELI_COOKIE_NAME,
        options: {
          path: DANIELI_COOKIE_PATH,
        },
      },
    ])

    const logoutPostCookies = createCookieMock()
    const logoutPostResponse = logoutRoute.POST({
      cookies: logoutPostCookies.cookies,
      url: new URL('https://md1.app/danieli/logout'),
    })

    assertNoStoreRedirect(logoutPostResponse, 'https://md1.app/danieli/')
    assert.deepEqual(logoutPostCookies.deleteCalls, [
      {
        name: DANIELI_COOKIE_NAME,
        options: {
          path: DANIELI_COOKIE_PATH,
        },
      },
    ])
  } finally {
    setDanieliEnv(savedEnv)
  }
}

await checkSessionAndLogoutBehavior()

console.log('Danieli auth route check passed.')
