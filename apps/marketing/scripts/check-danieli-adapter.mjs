import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')
const repoRoot = resolve(marketingRoot, '../..')

const packageJson = JSON.parse(readFileSync(resolve(marketingRoot, 'package.json'), 'utf8'))
const astroConfig = readFileSync(resolve(marketingRoot, 'astro.config.mjs'), 'utf8')
const protectedHtmlPath = resolve(
  marketingRoot,
  'src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html'
)
const oldAccessHtmlPath = resolve(marketingRoot, 'src/danieli-html/danieli-access-6_25-v0.html')
const sourceHtmlPath = resolve(repoRoot, 'docs/html/danieli-md1-ontology-and-kcards_6_25-v0.html')

assert.equal(packageJson.dependencies['@astrojs/vercel'], '^9.0.0')
assert.match(astroConfig, /import vercel from '@astrojs\/vercel'/)
assert.match(astroConfig, /adapter:\s*vercel\(\)/)
assert.equal(existsSync(sourceHtmlPath), true, 'source Danieli HTML should exist under docs/html')
assert.equal(existsSync(protectedHtmlPath), true, 'protected HTML should be copied under src/danieli-html')
assert.equal(existsSync(oldAccessHtmlPath), false, 'client-side access page must not be copied as protected content')

console.log('Danieli adapter/source check passed.')
