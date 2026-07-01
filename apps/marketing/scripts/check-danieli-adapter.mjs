import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
const astroConfig = await readFile(path.join(projectRoot, 'astro.config.mjs'), 'utf8')

assert.match(
  packageJson.dependencies?.['@astrojs/vercel'] || '',
  /^\^8\./,
  'apps/marketing must depend on @astrojs/vercel v8 for on-demand protected Danieli routes'
)
assert.match(astroConfig, /from ['"]@astrojs\/vercel['"]/, 'astro.config.mjs must import the Vercel adapter')
assert.match(astroConfig, /adapter:\s*vercel\(/, 'astro.config.mjs must configure the Vercel adapter')
assert.match(
  astroConfig,
  /includeFiles:\s*\[\s*['"]\.\/src\/danieli-html\/danieli-md1-ontology-and-kcards_7_1-v0\.html['"]\s*\]/,
  'astro.config.mjs must explicitly include protected Danieli HTML in the Vercel function bundle'
)
assert.doesNotMatch(
  astroConfig,
  /output:\s*['"]server['"]/,
  'marketing should not switch the whole site to server output for this narrow share'
)
assert.doesNotMatch(
  astroConfig,
  /output:\s*['"]hybrid['"]/,
  'Astro 5 removed output: "hybrid"; static output plus prerender=false routes is the supported shape'
)

console.log('Danieli adapter check passed.')
