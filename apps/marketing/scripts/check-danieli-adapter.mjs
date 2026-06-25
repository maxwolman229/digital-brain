import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')

const packageJson = JSON.parse(readFileSync(resolve(marketingRoot, 'package.json'), 'utf8'))
const astroConfig = readFileSync(resolve(marketingRoot, 'astro.config.mjs'), 'utf8')
const protectedHtmlPath = resolve(
  marketingRoot,
  'src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html'
)
const oldAccessHtmlPath = resolve(marketingRoot, 'src/danieli-html/danieli-access-6_25-v0.html')
const publicProtectedHtmlPath = resolve(
  marketingRoot,
  'public/danieli-md1-ontology-and-kcards_6_25-v0.html'
)
const publicAccessHtmlPath = resolve(marketingRoot, 'public/danieli-access-6_25-v0.html')

assert.equal(packageJson.dependencies['@astrojs/vercel'], '^9.0.0')
assert.match(astroConfig, /import vercel from '@astrojs\/vercel'/)
assert.match(astroConfig, /adapter:\s*vercel\(\)/)
assert.match(astroConfig, /security:\s*\{/)
assert.match(astroConfig, /allowedDomains:\s*\[/)
assert.match(astroConfig, /hostname:\s*'md1\.app'/)
assert.match(astroConfig, /hostname:\s*'www\.md1\.app'/)
assert.match(astroConfig, /hostname:\s*'\*\*\.vercel\.app'/)
assert.match(astroConfig, /sitemap\(\{\s*filter:/s)
assert.match(astroConfig, /!new URL\(page\)\.pathname\.startsWith\('\/danieli'\)/)
assert.equal(existsSync(protectedHtmlPath), true, 'protected HTML should be copied under src/danieli-html')
assert.equal(existsSync(oldAccessHtmlPath), false, 'client-side access page must not be copied as protected content')
assert.equal(existsSync(publicProtectedHtmlPath), false, 'protected Danieli HTML must not be served from public')
assert.equal(existsSync(publicAccessHtmlPath), false, 'client-side access page must not be served from public')

console.log('Danieli adapter/source check passed.')
