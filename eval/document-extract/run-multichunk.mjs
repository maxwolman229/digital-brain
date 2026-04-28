#!/usr/bin/env node
// =============================================================================
// eval/document-extract/run-multichunk.mjs
//
// Validates the extraction prompt across multiple chunks of a real document.
// Stress-tests:
//   • Consistency across calls (does chunk 6 look as good as chunk 1?)
//   • Mixed content (some chunks rich, some chunks fluff)
//   • Length-induced fatigue
//
// The chunker matches the production spec: 4000-char chunks with 500-char
// overlap, on character boundaries. Each chunk is sent to the deployed
// extract-from-document edge function in dry_run mode.
//
// Usage:
//   node eval/document-extract/run-multichunk.mjs <path-to-doc>
//   node eval/document-extract/run-multichunk.mjs                # uses default
//
// Optional env: PLANT_NAME, INDUSTRY, DOCUMENT_TYPE, PROCESS_AREA, CONCURRENCY
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const DOC_PATH = process.argv[2] || '/tmp/cc-body.txt'
if (!existsSync(DOC_PATH)) {
  console.error(`Doc not found: ${DOC_PATH}`)
  process.exit(1)
}
const text = readFileSync(DOC_PATH, 'utf8')

// ── Env / Supabase config ────────────────────────────────────────────────────

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

const meta = {
  plant_name:    process.env.PLANT_NAME    || 'CC Demo Plant',
  industry:      process.env.INDUSTRY      || 'steel',
  document_type: process.env.DOCUMENT_TYPE || 'manual',
  process_area:  process.env.PROCESS_AREA  || 'continuous casting',
}
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10)

// ── Chunker — match production spec: 4000 chars, 500 overlap ────────────────

function chunkText(text, size = 4000, overlap = 500) {
  const chunks = []
  let i = 0
  let idx = 0
  while (i < text.length) {
    const end = Math.min(i + size, text.length)
    chunks.push({ index: idx, start: i, end, text: text.slice(i, end) })
    if (end === text.length) break
    i = end - overlap
    idx++
  }
  return chunks
}

const chunks = chunkText(text)
console.log(`Document: ${DOC_PATH}`)
console.log(`Total chars: ${text.length}`)
console.log(`Chunks: ${chunks.length} (4000 char, 500 overlap)`)
console.log(`Concurrency: ${CONCURRENCY}`)
console.log(`Meta: ${JSON.stringify(meta)}\n`)

// ── Caller ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function runChunk(chunk, attempt = 0) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${URL}/functions/v1/extract-from-document`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${KEY}`,
        'apikey': KEY,
      },
      body: JSON.stringify({
        mode: 'dry_run',
        chunk: chunk.text,
        ...meta,
        source_section: `chunk ${chunk.index + 1}`,
      }),
    })
    const ms = Date.now() - t0
    const bodyText = res.ok ? null : await res.text()
    // Detect Anthropic 429 (the edge function wraps it in HTTP 500 with "Anthropic 429" text).
    const is429 = !res.ok && /Anthropic 429|rate_limit|rate.limit/i.test(bodyText || '')
    if (is429 && attempt < 4) {
      const wait = 65_000 + attempt * 30_000  // 65s, 95s, 125s, 155s
      process.stdout.write(`  ⏸  chunk ${chunk.index + 1} 429 — waiting ${wait/1000}s then retry (attempt ${attempt + 1}/4)\n`)
      await sleep(wait)
      return runChunk(chunk, attempt + 1)
    }
    if (!res.ok) {
      return { ...chunk, ms, error: `HTTP ${res.status}: ${(bodyText || '').slice(0, 200)}` }
    }
    const data = await res.json()
    return { ...chunk, ms, candidates: data.candidates || [], usage: data.usage, model: data.model }
  } catch (e) {
    return { ...chunk, ms: Date.now() - t0, error: e.message || String(e) }
  }
}

// ── Concurrency pool ────────────────────────────────────────────────────────

async function runAll(chunks, concurrency) {
  const results = new Array(chunks.length)
  let next = 0
  async function worker() {
    while (next < chunks.length) {
      const myIdx = next++
      const c = chunks[myIdx]
      process.stdout.write(`  → starting chunk ${c.index + 1}/${chunks.length}\n`)
      const r = await runChunk(c)
      results[myIdx] = r
      const tag = r.error ? `ERR ${r.error.slice(0,80)}` : `${r.candidates.length} cand · ${r.ms}ms`
      process.stdout.write(`  ✓ chunk ${c.index + 1} → ${tag}\n`)
    }
  }
  const workers = Array.from({ length: concurrency }, worker)
  await Promise.all(workers)
  return results
}

const t0 = Date.now()
const results = await runAll(chunks, CONCURRENCY)
const totalMs = Date.now() - t0

// ── Aggregate / dedup ──────────────────────────────────────────────────────

const all = results.flatMap(r => (r.candidates || []).map(c => ({ ...c, _chunk: r.index + 1 })))

// Dedup: same type + first 80 chars of content normalised.
function key(c) {
  const norm = (c.content || c.title || '').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0, 80)
  return `${c.type}::${norm}`
}
const seen = new Map()
const dedupedKeep = []
for (const c of all) {
  const k = key(c)
  if (!seen.has(k)) {
    seen.set(k, c)
    dedupedKeep.push(c)
  } else {
    seen.get(k)._dupCount = (seen.get(k)._dupCount || 1) + 1
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`)
console.log(`Wall time: ${(totalMs/1000).toFixed(1)}s   |   Total candidates (raw): ${all.length}   |   After dedup: ${dedupedKeep.length}`)
console.log(`══════════════════════════════════════════════════════════════════════\n`)

// Per-chunk breakdown
console.log('Per-chunk breakdown:')
for (const r of results) {
  if (r.error) {
    console.log(`  chunk ${r.index + 1}: ERROR — ${r.error}`)
    continue
  }
  const cands = r.candidates || []
  const types = cands.reduce((a,c) => (a[c.type]=(a[c.type]||0)+1, a), {})
  const confs = cands.reduce((a,c) => (a[c.confidence]=(a[c.confidence]||0)+1, a), {})
  console.log(`  chunk ${(r.index+1).toString().padStart(2)} (${r.text.length} chars, ${r.ms}ms, in=${r.usage?.input_tokens}/out=${r.usage?.output_tokens}): ${cands.length} cand | rules=${types.rule||0} assertions=${types.assertion||0} | high=${confs.high||0} med=${confs.medium||0} low=${confs.low||0}`)
}

// Aggregate distribution
const aggTypes = dedupedKeep.reduce((a,c) => (a[c.type]=(a[c.type]||0)+1, a), {})
const aggConfs = dedupedKeep.reduce((a,c) => (a[c.confidence]=(a[c.confidence]||0)+1, a), {})
console.log(`\nAggregate (deduped):`)
console.log(`  Types:       rule=${aggTypes.rule||0}   assertion=${aggTypes.assertion||0}`)
console.log(`  Confidence:  high=${aggConfs.high||0}   medium=${aggConfs.medium||0}   low=${aggConfs.low||0}`)

// Sample candidates per chunk for spot-checking
console.log(`\nSamples (first candidate from each chunk):`)
for (const r of results) {
  const c = (r.candidates || [])[0]
  if (!c) { console.log(`  chunk ${r.index + 1}: (none)`); continue }
  console.log(`  chunk ${r.index + 1} → [${c.type}/${c.confidence}] ${c.title}`)
}

// Show all low-confidence + off-area to verify rule 6
console.log(`\nLow-confidence candidates (process-area drift / ambiguity):`)
const lows = dedupedKeep.filter(c => c.confidence === 'low')
if (lows.length === 0) console.log('  (none)')
for (const c of lows) {
  console.log(`  [${c.type}] ${c.title}`)
  console.log(`     scope: ${c.scope || '(null)'}`)
  console.log(`     excerpt: "${(c.source_excerpt||'').slice(0,140)}…"`)
}

// Dump full deduped list to a file for review
const out = JSON.stringify({ meta, totalMs, totalChunks: chunks.length, deduped: dedupedKeep, perChunk: results.map(r => ({ chunk: r.index+1, ms: r.ms, error: r.error, count: (r.candidates||[]).length })) }, null, 2)
import('node:fs').then(({ writeFileSync }) => {
  writeFileSync('/tmp/extract-multichunk-result.json', out)
  console.log(`\nFull result saved to /tmp/extract-multichunk-result.json`)
})
