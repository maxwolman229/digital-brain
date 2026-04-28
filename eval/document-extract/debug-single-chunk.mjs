#!/usr/bin/env node
// Quick smoke test: a single-chunk doc through full mode. If this completes
// in <60s with candidates inserted, the pipeline works and the multi-chunk
// failure was wall-clock related. If this also hangs, the issue is elsewhere.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
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

const m = await rest('/rest/v1/plant_memberships?role=eq.admin&select=plant_id,user_id&limit=1')
const { plant_id, user_id } = m[0]
const documentId = randomUUID()
const text = readFileSync('/tmp/cc-tiny.txt', 'utf8')
console.log(`plant=${plant_id} user=${user_id} doc=${documentId} (${text.length} chars)`)

const path = `${plant_id}/${documentId}/cc-tiny.txt`
const up = await fetch(`${URL}/storage/v1/object/plant-documents/${path}`, {
  method: 'POST',
  headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'text/plain' },
  body: text,
})
if (!up.ok) { console.error('upload', up.status, await up.text()); process.exit(1) }

await rest('/rest/v1/documents', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    id: documentId, plant_id, uploaded_by: user_id,
    title: 'CC tiny (1-chunk smoke)', document_type: 'manual',
    process_area: 'continuous casting', file_path: path,
    file_size_bytes: text.length, mime_type: 'text/plain', status: 'uploading',
  }),
})
const trigger = await fetch(`${URL}/functions/v1/extract-from-document`, {
  method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ document_id: documentId }),
})
console.log('trigger →', trigger.status, await trigger.text())

const t0 = Date.now()
let last = ''
while (Date.now() - t0 < 180000) {
  const rows = await rest(`/rest/v1/documents?id=eq.${documentId}&select=status,candidate_count,extraction_error,updated_at`)
  if (rows[0].status !== last) {
    console.log(`  [${((Date.now()-t0)/1000).toFixed(0)}s] ${rows[0].status} cnt=${rows[0].candidate_count} err=${rows[0].extraction_error||'-'}`)
    last = rows[0].status
  }
  if (['ready_for_review','review_complete','failed'].includes(rows[0].status)) break
  await new Promise(r => setTimeout(r, 4000))
}

const cands = await rest(`/rest/v1/extraction_candidates?document_id=eq.${documentId}&select=type,confidence,title&order=created_at`)
console.log(`\ncandidates: ${cands.length}`)
for (const c of cands.slice(0, 5)) console.log(`  [${c.type}/${c.confidence}] ${c.title}`)
console.log(`\ncleanup: documentId=${documentId} path=${path}`)
