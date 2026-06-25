import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DANIELI_COOKIE_NAME,
  createDanieliAccessToken,
} from '../src/lib/danieliShare.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')
const routePath = resolve(marketingRoot, 'src/pages/danieli/[slug].js')
const documentHtmlPath = resolve(
  marketingRoot,
  'src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html'
)
const shareHelperUrl = pathToFileURL(resolve(marketingRoot, 'src/lib/danieliShare.js')).href

const route = readFileSync(routePath, 'utf8')
const documentHtml = readFileSync(documentHtmlPath, 'utf8')

assert.match(route, /export const prerender = false/)
assert.match(route, /danieli-md1-ontology-and-kcards_6_25-v0\.html\?raw/)
assert.match(route, /getDanieliDocument/)
assert.match(route, /isDanieliAccessTokenValid/)
assert.match(route, /DANIELI_COOKIE_NAME/)
assert.match(route, /Response\.redirect/)
assert.match(route, /cache-control/)
assert.match(route, /no-store/)
assert.match(route, /x-robots-tag/)
assert.match(route, /noindex, nofollow/)
assert.doesNotMatch(route, /danieli-access-6_25-v0\.html/)

const routeModule = await importRouteModule(route)

await checkUnknownSlugResponse(routeModule)
await checkUnauthenticatedRedirect(routeModule)
await checkAuthenticatedDocumentResponse(routeModule)

console.log('Danieli protected document route check passed.')

async function importRouteModule(source) {
  const transformedSource = source
    .replace(
      /import\s+ontologyAndKcardsHtml\s+from\s+['"]\.\.\/\.\.\/danieli-html\/danieli-md1-ontology-and-kcards_6_25-v0\.html\?raw['"]/,
      `const ontologyAndKcardsHtml = ${JSON.stringify(documentHtml)}`
    )
    .replace(
      /from\s+['"]\.\.\/\.\.\/lib\/danieliShare\.js['"]/,
      `from ${JSON.stringify(shareHelperUrl)}`
    )

  assert.notEqual(transformedSource, source, 'route source was not transformed for behavior checks')

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transformedSource)}`)
}

function makeRequestContext({ slug, cookieValue, url = 'https://md1.app/danieli/ontology-and-kcards/' }) {
  return {
    params: { slug },
    cookies: {
      get(name) {
        assert.equal(name, DANIELI_COOKIE_NAME)
        return cookieValue ? { value: cookieValue } : undefined
      },
    },
    url: new URL(url),
  }
}

async function checkUnknownSlugResponse({ GET }) {
  const response = GET(makeRequestContext({ slug: 'missing-document' }))

  assert.equal(response.status, 404)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
  assert.equal(await response.text(), 'Not found')
}

async function checkUnauthenticatedRedirect({ GET }) {
  const response = GET(makeRequestContext({
    slug: 'ontology-and-kcards',
    url: 'https://md1.app/danieli/ontology-and-kcards/?next=https://evil.example/',
  }))

  assert.equal(response.status, 303)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(
    response.headers.get('location'),
    'https://md1.app/danieli/?next=%2Fdanieli%2Fontology-and-kcards%2F'
  )
}

async function checkAuthenticatedDocumentResponse({ GET }) {
  const originalSecret = process.env.DANIELI_SHARE_COOKIE_SECRET
  process.env.DANIELI_SHARE_COOKIE_SECRET = 'local-cookie-secret-with-enough-entropy'

  try {
    const token = createDanieliAccessToken()
    const response = GET(makeRequestContext({ slug: 'ontology-and-kcards', cookieValue: token }))

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store, private')
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8')
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal(await response.text(), documentHtml)
  } finally {
    if (originalSecret === undefined) {
      delete process.env.DANIELI_SHARE_COOKIE_SECRET
    } else {
      process.env.DANIELI_SHARE_COOKIE_SECRET = originalSecret
    }
  }
}
