#!/usr/bin/env node
// =============================================================================
// eval/document-extract/run.mjs
//
// Calls the deployed extract-from-document edge function in dry_run mode with
// the sample EAF chunk and prints the candidates. The prompt itself lives in
// supabase/functions/extract-from-document/prompt.ts — single source of truth.
//
// Usage (no API key needed locally; the function uses its own ANTHROPIC_API_KEY):
//   node eval/document-extract/run.mjs
//
// Optional env:
//   PLANT_NAME       (default "EAF Demo")
//   INDUSTRY         (default "steel")
//   DOCUMENT_TYPE    (default "manual")
//   PROCESS_AREA     (default "EAF")
// =============================================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const chunk = readFileSync(join(here, 'sample-chunk.txt'), 'utf8')

// Load Supabase URL + service key from .env.local.
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
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
  process.exit(1)
}

const meta = {
  plant_name:     process.env.PLANT_NAME    || 'EAF Demo',
  industry:       process.env.INDUSTRY      || 'steel',
  document_type:  process.env.DOCUMENT_TYPE || 'manual',
  process_area:   process.env.PROCESS_AREA  || 'EAF',
}

console.log(`Function: ${URL}/functions/v1/extract-from-document`)
console.log(`Chunk size: ${chunk.length} chars`)
console.log(`Meta: ${JSON.stringify(meta)}`)
console.log('Calling…\n')

const t0 = Date.now()
const res = await fetch(`${URL}/functions/v1/extract-from-document`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'authorization': `Bearer ${KEY}`,
    'apikey': KEY,
  },
  body: JSON.stringify({
    mode: 'dry_run',
    chunk,
    ...meta,
    source_section: 'Operations Overview',
    source_page: 12,
  }),
})
const ms = Date.now() - t0

if (!res.ok) {
  console.error(`HTTP ${res.status}:`, await res.text())
  process.exit(1)
}

const data = await res.json()
if (!data.ok) {
  console.error('Function error:', data)
  process.exit(1)
}

const { candidates = [], usage = {}, model = '?' } = data
console.log(`✓ ${candidates.length} candidate(s) in ${data.ms} ms (round-trip ${ms} ms)`)
console.log(`  model=${model}  in=${usage.input_tokens}  out=${usage.output_tokens}\n`)

for (const [i, c] of candidates.entries()) {
  console.log(`── ${i + 1} ─ [${c.type.toUpperCase()}] [${c.confidence}] ${c.title}`)
  console.log(`   content:        ${c.content}`)
  if (c.scope)     console.log(`   scope:          ${c.scope}`)
  if (c.rationale) console.log(`   rationale:      ${c.rationale}`)
  console.log(`   source_excerpt: "${c.source_excerpt}"`)
  console.log('')
}

const counts = candidates.reduce((a, c) => {
  a[`type:${c.type}`] = (a[`type:${c.type}`] || 0) + 1
  a[`conf:${c.confidence}`] = (a[`conf:${c.confidence}`] || 0) + 1
  return a
}, {})
console.log('Summary:', counts)
