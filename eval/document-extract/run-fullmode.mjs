#!/usr/bin/env node
// =============================================================================
// eval/document-extract/run-fullmode.mjs
//
// End-to-end test of the full extract-from-document pipeline. Uploads
// cc-body.txt as a real document, triggers extraction, polls for completion,
// and reports candidate counts so we can verify dedup output.
//
// Expected outcome (from the multi-chunk eval):
//   ~95 raw candidates (varies slightly per run)
//   ~91 deduped (after tier 1 + tier 2)
//
// Cleanup: prints a "cleanup" SQL snippet at the end. The script does NOT
// auto-delete so the user can inspect the result in the dashboard.
//
// Usage:
//   node eval/document-extract/run-fullmode.mjs
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))

// ── Load .env.local ─────────────────────────────────────────────────────────

const envPath = join(here, '..', '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY in .env.local')
  process.exit(1)
}

// Helper: REST call with service key.
async function rest(path, opts = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`)
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

// ── 1. Find a plant + admin user ────────────────────────────────────────────

console.log('1. Finding a plant with at least one admin…')
const memberships = await rest('/rest/v1/plant_memberships?role=eq.admin&select=plant_id,user_id&limit=1')
if (!memberships?.length) {
  console.error('No admin memberships found. Cannot run end-to-end test.')
  process.exit(1)
}
const { plant_id, user_id } = memberships[0]
console.log(`   plant_id=${plant_id}`)
console.log(`   user_id =${user_id}`)

// ── 2. Upload sample document to storage ────────────────────────────────────

const sampleText = readFileSync('/tmp/cc-body.txt', 'utf8')
const documentId = randomUUID()
const filename = 'cc-body.txt'
const storagePath = `${plant_id}/${documentId}/${filename}`

console.log(`\n2. Uploading to plant-documents/${storagePath} (${sampleText.length} chars)…`)
const upRes = await fetch(`${URL}/storage/v1/object/plant-documents/${storagePath}`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    authorization: `Bearer ${KEY}`,
    'content-type': 'text/plain',
  },
  body: sampleText,
})
if (!upRes.ok) {
  console.error('Upload failed:', upRes.status, await upRes.text())
  process.exit(1)
}
console.log('   ✓ uploaded')

// ── 3. Insert document row ──────────────────────────────────────────────────

console.log('\n3. Inserting documents row…')
const docRow = {
  id:                  documentId,
  plant_id,
  uploaded_by:         user_id,
  title:               'Continuous Casting (eval/full-mode test)',
  document_type:       'manual',
  process_area:        'continuous casting',
  equipment_reference: null,
  file_path:           storagePath,
  file_size_bytes:     sampleText.length,
  mime_type:           'text/plain',
  status:              'uploading',
}
await rest('/rest/v1/documents', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify(docRow),
})
console.log(`   ✓ document_id=${documentId}`)

// ── 4. Trigger extraction ───────────────────────────────────────────────────

console.log('\n4. Triggering extract-from-document…')
const trigger = await fetch(`${URL}/functions/v1/extract-from-document`, {
  method: 'POST',
  headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ document_id: documentId }),
})
const triggerBody = await trigger.json()
console.log(`   trigger response: ${JSON.stringify(triggerBody)}`)
if (!trigger.ok) process.exit(1)

// ── 5. Poll for completion ──────────────────────────────────────────────────

console.log('\n5. Polling documents.status…')
const TERMINAL = new Set(['ready_for_review', 'review_complete', 'failed'])
const startedAt = Date.now()
let lastStatus = ''
let doc = null
while (Date.now() - startedAt < 25 * 60 * 1000) {  // 25 min ceiling
  const rows = await rest(`/rest/v1/documents?id=eq.${documentId}&select=status,candidate_count,extraction_error,updated_at`)
  doc = rows[0]
  if (doc.status !== lastStatus) {
    console.log(`   [${((Date.now() - startedAt)/1000).toFixed(0)}s] status=${doc.status} candidate_count=${doc.candidate_count}`)
    lastStatus = doc.status
  }
  if (TERMINAL.has(doc.status)) break
  await new Promise(r => setTimeout(r, 8000))
}
const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1)
console.log(`   final status: ${doc.status} (after ${totalSec}s)`)
if (doc.extraction_error) console.log(`   extraction_error: ${doc.extraction_error}`)

// ── 6. Inspect candidates ───────────────────────────────────────────────────

console.log('\n6. Querying extraction_candidates…')
const cands = await rest(`/rest/v1/extraction_candidates?document_id=eq.${documentId}&select=type,confidence,title,source_page,source_excerpt&order=created_at`)
console.log(`   inserted: ${cands.length}`)

const byType = cands.reduce((a, c) => (a[c.type] = (a[c.type] || 0) + 1, a), {})
const byConf = cands.reduce((a, c) => (a[c.confidence] = (a[c.confidence] || 0) + 1, a), {})
console.log(`   types:        rule=${byType.rule || 0}  assertion=${byType.assertion || 0}`)
console.log(`   confidence:   high=${byConf.high || 0}  medium=${byConf.medium || 0}  low=${byConf.low || 0}`)

// Confirm dedup tier 1 worked: no duplicate source_excerpts.
const excerpts = cands.map(c => c.source_excerpt)
const dupExcerpts = excerpts.filter((e, i) => excerpts.indexOf(e) !== i)
console.log(`   duplicate source_excerpts: ${dupExcerpts.length} (expected 0 if tier 1 working)`)

// Confirm tier 2: no two candidates with same (type + lower(title)).
const titleKeys = cands.map(c => `${c.type}::${(c.title||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}`)
const dupTitles = titleKeys.filter((k, i) => titleKeys.indexOf(k) !== i)
console.log(`   duplicate normalised titles: ${dupTitles.length}`)

// ── 7. Cleanup snippet ──────────────────────────────────────────────────────

console.log(`\n7. To clean up after inspection, run:`)
console.log(`   delete from extraction_candidates where document_id = '${documentId}';`)
console.log(`   delete from documents where id = '${documentId}';`)
console.log(`   then in storage: delete plant-documents/${storagePath}`)
