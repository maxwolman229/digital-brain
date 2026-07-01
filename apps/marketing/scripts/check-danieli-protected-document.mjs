import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = path.resolve(projectRoot, '../..')
const routePath = path.join(projectRoot, 'src/pages/danieli/[slug].js')
const sourceDir = path.join(projectRoot, 'src/danieli-html')
const protectedFile = 'danieli-md1-ontology-and-kcards_7_1-v0.html'

async function readRequired(file, label) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    throw new assert.AssertionError({
      message: `Missing ${label}: ${path.relative(projectRoot, file)}`,
      actual: error.code,
      expected: 'file to exist',
    })
  }
}

const route = await readRequired(routePath, 'protected document route')

assert.match(route, /export\s+const\s+prerender\s*=\s*false/, '[slug].js must run on demand')
assert.match(route, /getDanieliDocument/, '[slug].js must resolve documents from the allowlist')
assert.match(route, /isDanieliAccessTokenValid/, '[slug].js must verify the signed cookie')
assert.match(route, /safeDanieliRedirect/, '[slug].js must redirect through the safe redirect helper')
assert.match(route, /import\.meta\.glob/, '[slug].js must load protected HTML from a non-public source directory')
assert.match(route, /\?raw/, '[slug].js must bundle protected HTML as server-only raw text')
assert.match(route, /text\/html;\s*charset=utf-8/, '[slug].js must return HTML with an explicit UTF-8 content type')
assert.doesNotMatch(route, /docs\/html/, '[slug].js must not serve directly from docs/html')

await access(path.join(sourceDir, protectedFile), constants.R_OK)
const sourceFiles = await readdir(sourceDir)
assert.deepEqual(
  sourceFiles.filter((file) => file.endsWith('.html')),
  [protectedFile],
  'Only the refreshed 7_1 protected HTML should be shipped in src/danieli-html'
)

await assert.rejects(
  access(path.join(projectRoot, 'public', protectedFile), constants.R_OK),
  /ENOENT/,
  'Protected Danieli HTML must not be placed under public/'
)
await assert.rejects(
  access(path.join(repoRoot, 'apps/app/public', protectedFile), constants.R_OK),
  /ENOENT/,
  'Protected Danieli HTML must not be placed under the product app public directory'
)

console.log('Danieli protected document check passed.')
