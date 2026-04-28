#!/usr/bin/env node
// =============================================================================
// eval/document-extract/run-pdf.mjs
//
// End-to-end PDF test. Uploads a real PDF, triggers extract-from-document,
// drives continuation via direct HTTP polling (the in-function self-trigger
// is intermittent until pg_cron watchdog is wired), and reports on:
//
//   • Whether unpdf successfully extracted text per-page
//   • Page count and per-page char distribution
//   • Source-page accuracy on extracted candidates (visual spot check)
//   • Any chunks that failed
//   • Final candidate quality (type/confidence/sample)
//
// Usage:
//   node eval/document-extract/run-pdf.mjs <path-to-pdf>
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const PDF_PATH = process.argv[2] || '/tmp/eaf-manual.pdf'
if (!existsSync(PDF_PATH)) { console.error(`PDF not found: ${PDF_PATH}`); process.exit(1) }

const env = Object.fromEntries(
  readFileSync(join(here, '..', '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')] })
)
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}${path}`, { ...opts, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...(opts.headers||{}) }})
  if (!r.ok) throw new Error(`${opts.method||'GET'} ${path} -> ${r.status}: ${(await r.text()).slice(0,200)}`)
  if (r.status === 204) return null
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text()
}

// ── 1. Inspect PDF locally to compare against extraction ─────────────────────

const pdfBuffer = readFileSync(PDF_PATH)
console.log(`PDF: ${PDF_PATH}  size: ${pdfBuffer.length} bytes`)

const { extractText, getDocumentProxy } = await import('unpdf')
const pdfDoc = await getDocumentProxy(new Uint8Array(pdfBuffer))
const localExtract = await extractText(pdfDoc, { mergePages: false })
const localPages = localExtract.text
console.log(`Local extract: ${localPages.length} pages`)
const charsPerPage = localPages.map(p => (p||'').length)
const nonEmpty = charsPerPage.filter(c => c > 0).length
console.log(`  non-empty pages: ${nonEmpty}/${localPages.length}`)
console.log(`  per-page char distribution: ${charsPerPage.join(', ')}`)
const totalChars = charsPerPage.reduce((a,b)=>a+b, 0)
console.log(`  total chars: ${totalChars}`)
console.log(`  estimated chunks (4000/500 overlap): ~${Math.ceil(totalChars / 3500)}`)

// ── 2. Plant + admin lookup ─────────────────────────────────────────────────

const m = await rest('/rest/v1/plant_memberships?role=eq.admin&select=plant_id,user_id&limit=1')
const { plant_id, user_id } = m[0]
const documentId = randomUUID()
const filename = PDF_PATH.split('/').pop()
const storagePath = `${plant_id}/${documentId}/${filename}`
console.log(`\nplant=${plant_id}  user=${user_id}\ndocument_id=${documentId}\npath=${storagePath}`)

// ── 3. Upload PDF ────────────────────────────────────────────────────────────

const up = await fetch(`${URL}/storage/v1/object/plant-documents/${storagePath}`, {
  method: 'POST',
  headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/pdf' },
  body: pdfBuffer,
})
if (!up.ok) { console.error('upload failed:', up.status, await up.text()); process.exit(1) }
console.log('  ✓ uploaded')

// ── 4. Insert document row ───────────────────────────────────────────────────

await rest('/rest/v1/documents', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    id: documentId, plant_id, uploaded_by: user_id,
    title: `PDF eval: ${filename}`, document_type: 'manual',
    process_area: 'EAF', file_path: storagePath,
    file_size_bytes: pdfBuffer.length, mime_type: 'application/pdf', status: 'uploading',
  }),
})

// ── 5. Trigger initial extraction ────────────────────────────────────────────

console.log('\ntriggering extraction…')
const trig = await fetch(`${URL}/functions/v1/extract-from-document`, {
  method: 'POST',
  headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ document_id: documentId }),
})
console.log('  trigger:', trig.status, await trig.text())

// ── 6. Drive continuation until terminal ────────────────────────────────────

const TERMINAL = new Set(['ready_for_review','review_complete','failed'])
const t0 = Date.now()
let lastProcessed = -1
let stuckSince = null
for (let i = 0; i < 60; i++) {
  const rows = await rest(`/rest/v1/documents?id=eq.${documentId}&select=status,extraction_progress,extraction_error`)
  const d = rows[0]
  const proc = d.extraction_progress?.processed?.length ?? 0
  const fail = d.extraction_progress?.failed?.length ?? 0
  const total = d.extraction_progress?.total_chunks ?? '?'
  const elapsed = ((Date.now()-t0)/1000).toFixed(0)
  console.log(`  [${elapsed}s] status=${d.status} processed=${proc}/${total} failed=${fail}`)

  if (TERMINAL.has(d.status)) { console.log(`  done. err=${d.extraction_error||'-'}`); break }

  if (proc === lastProcessed) {
    if (!stuckSince) stuckSince = Date.now()
    if (Date.now() - stuckSince > 60000) {
      console.log('    ↻ no progress for 60s, manual continuation trigger')
      await fetch(`${URL}/functions/v1/extract-from-document`, {
        method: 'POST',
        headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, _continue: true }),
      })
      stuckSince = null
    }
  } else {
    lastProcessed = proc
    stuckSince = null
  }
  await new Promise(r => setTimeout(r, 12000))
}

// ── 7. Inspect candidates ───────────────────────────────────────────────────

const cands = await rest(`/rest/v1/extraction_candidates?document_id=eq.${documentId}&select=type,confidence,title,content,scope,source_page,source_section,source_excerpt&order=source_page,created_at`)
console.log(`\n══════════════════════════════════════════════════════════════════`)
console.log(`Total candidates: ${cands.length}`)
const byType = cands.reduce((a,c) => (a[c.type]=(a[c.type]||0)+1, a), {})
const byConf = cands.reduce((a,c) => (a[c.confidence]=(a[c.confidence]||0)+1, a), {})
console.log(`Types:       rule=${byType.rule||0}   assertion=${byType.assertion||0}`)
console.log(`Confidence:  high=${byConf.high||0}   medium=${byConf.medium||0}   low=${byConf.low||0}`)

// Source-page distribution
const byPage = cands.reduce((a,c) => (a[c.source_page||'-']=(a[c.source_page||'-']||0)+1, a), {})
console.log(`Source pages: ${Object.entries(byPage).map(([k,v]) => `p${k}=${v}`).join(', ')}`)

// Verify source_excerpt verbatim presence in the original PDF text per page
console.log(`\nSource-excerpt verification (verbatim match against unpdf text):`)
let verbatimHit = 0, verbatimMiss = 0, fuzzyHit = 0
for (const c of cands) {
  const expectedPage = c.source_page
  if (expectedPage == null) continue
  const pageText = (localPages[expectedPage - 1] || '').replace(/\s+/g, ' ')
  const excerpt = (c.source_excerpt || '').replace(/\s+/g, ' ')
  const headSlice = excerpt.slice(0, 60)
  if (pageText.includes(excerpt)) { verbatimHit++ }
  else if (pageText.includes(headSlice)) { fuzzyHit++ }
  else { verbatimMiss++ }
}
console.log(`  verbatim full match:   ${verbatimHit}/${cands.length}`)
console.log(`  fuzzy (60-char head):  ${fuzzyHit}/${cands.length}`)
console.log(`  not found on page:     ${verbatimMiss}/${cands.length}`)

// Show samples per page
console.log(`\nSamples (first candidate per page):`)
const seen = new Set()
for (const c of cands) {
  const p = c.source_page || '-'
  if (seen.has(p)) continue
  seen.add(p)
  console.log(`  page ${p} [${c.type}/${c.confidence}] ${c.title}`)
  console.log(`    excerpt: "${(c.source_excerpt||'').slice(0,140)}…"`)
}

console.log(`\nCleanup:`)
console.log(`  delete from extraction_candidates where document_id = '${documentId}';`)
console.log(`  delete from documents where id = '${documentId}';`)
console.log(`  delete plant-documents/${storagePath}`)
