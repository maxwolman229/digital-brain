import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fileName = 'danieli-md1-ontology-and-kcards_7_1-v0.html'
const protectedPath = path.join(projectRoot, 'src/danieli-html', fileName)
const expectedSha256 = '5b018560a4b629d1b1927d507d824bd4b99f4e44a8f314d1ca7c4acf1e032cfa'

const protectedHtml = await readFile(protectedPath, 'utf8')
const actualSha256 = createHash('sha256').update(protectedHtml).digest('hex')

assert.equal(
  actualSha256,
  expectedSha256,
  'The protected Danieli HTML copy must match the reviewed 7_1 source payload'
)
assert.ok(protectedHtml.length > 110_000, 'The 7_1 protected page should include the full combined WTP/CLO/WCU artifact')
assert.match(
  protectedHtml,
  /<title>MD1 — WTP \/ CLO \/ WCU Ontology \(PSG Mojave, MIDA\)<\/title>/,
  'The refreshed 7_1 title must be present'
)
assert.match(protectedHtml, /data-view="wtp">WTP<\/button>/, 'The WTP main tab must be present')
assert.match(protectedHtml, /data-view="clo">CLO<\/button>/, 'The CLO main tab must be present')
assert.match(protectedHtml, /data-view="wcu">WCU<\/button>/, 'The WCU main tab must be present')
assert.match(protectedHtml, /renderOntology\(document\.getElementById\("view-wtp"\),DATA\.wtp\)/, 'WTP must initialize')
assert.match(protectedHtml, /renderOntology\(document\.getElementById\("view-clo"\),DATA\.clo\)/, 'CLO must initialize')
assert.match(protectedHtml, /renderOntology\(document\.getElementById\("view-wcu"\),DATA\.wcu\)/, 'WCU must initialize')
assert.doesNotMatch(protectedHtml, /DANIELI_SHARE_PASSWORD/, 'The raw HTML must not contain server env names')
assert.doesNotMatch(protectedHtml, /localStorage/i, 'The raw HTML must not include client-side storage for access control')
assert.doesNotMatch(protectedHtml, /name=["']password["']/i, 'The raw HTML must not include its own password gate')

await assert.rejects(
  access(path.join(projectRoot, 'public', fileName), constants.R_OK),
  /ENOENT/,
  'The protected HTML must not be directly reachable from marketing/public'
)

console.log('Danieli HTML payload check passed.')
