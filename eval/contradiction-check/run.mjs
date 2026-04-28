// Run the 20 contradiction-check eval cases against the deployed edge function.
// Usage:
//   1. Set CONTRADICTION_CHECK_MODEL Supabase secret to the model under test
//      (e.g. claude-haiku-4-5-20251001) and redeploy the function.
//   2. node eval/contradiction-check/run.mjs > eval/contradiction-check/<model>-results.json

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ENV_PATH = resolve(__dirname, '../..', '.env.local')
const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      const k = l.slice(0, idx).trim()
      let v = l.slice(idx + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      return [k, v]
    })
)

const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
if (!URL || !ANON) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing')
  process.exit(1)
}

const cases = JSON.parse(readFileSync(resolve(__dirname, 'cases.json'), 'utf8'))

const PLANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' // EAF demo

const out = []
let okCount = 0, contraCorrect = 0, contraExpected = 0, contraFalsePos = 0

// Throttle: Anthropic rate limits eat the bulk run if we go full-tilt.
const sleep = ms => new Promise(r => setTimeout(r, ms))

for (let idx = 0; idx < cases.length; idx++) {
  const c = cases[idx]
  if (idx > 0) await sleep(2500)
  const expected = c.expected
  if (expected === 'contradicts') contraExpected++

  const body = {
    plant_id: PLANT_ID,
    type: c.newStatement.type,
    title: c.newStatement.title,
    scope: c.newStatement.scope || '',
    rationale: c.newStatement.rationale || '',
    process_area: 'EAF',
    __eval_candidates: [{
      id: 'eval-internal-' + c.id,
      display_id: c.candidate.display_id,
      type: c.candidate.type,
      title: c.candidate.title,
      scope: c.candidate.scope || null,
      rationale: c.candidate.rationale || null,
      status: c.candidate.status,
      process_area: 'EAF',
    }],
  }

  let resp, data
  let latency = 0
  let attempts = 0
  // Retry up to 3 times on soft-fail (rate limit or empty results)
  while (attempts < 3) {
    attempts++
    const t0 = Date.now()
    try {
      resp = await fetch(`${URL}/functions/v1/contradiction-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON },
        body: JSON.stringify(body),
      })
      data = await resp.json()
    } catch (err) {
      latency = Date.now() - t0
      data = { error: err.message }
    }
    latency = Date.now() - t0
    // Retry if soft-failed (results empty AND error present)
    if (data.error && (data.results?.length || 0) === 0 && attempts < 3) {
      await sleep(5000)
      continue
    }
    break
  }

  const result = data.results?.[0]
  const got = result?.relationship || 'NO_RESULT'
  const correct = got === expected
  if (correct) okCount++

  if (expected === 'contradicts' && got === 'contradicts') contraCorrect++
  if (expected !== 'contradicts' && got === 'contradicts') contraFalsePos++

  out.push({
    id: c.id,
    expected,
    got,
    correct,
    confidence: result?.confidence || null,
    explanation: result?.explanation || null,
    conditions_differ: result?.conditions_differ ?? null,
    shared_conditions: result?.shared_conditions ?? null,
    latency_ms: latency,
  })

  process.stderr.write(`${c.id} ${expected.padEnd(12)} → ${got.padEnd(12)} ${correct ? 'OK' : 'WRONG'} (${latency}ms)\n`)
}

const summary = {
  total: cases.length,
  correct: okCount,
  accuracy: (okCount / cases.length).toFixed(2),
  contradiction_recall: contraExpected > 0 ? (contraCorrect / contraExpected).toFixed(2) : null,
  contradiction_false_positives: contraFalsePos,
  avg_latency_ms: Math.round(out.reduce((s, r) => s + (r.latency_ms || 0), 0) / out.length),
  median_latency_ms: (() => {
    const sorted = out.map(r => r.latency_ms || 0).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  })(),
}

console.log(JSON.stringify({ summary, results: out }, null, 2))
process.stderr.write(`\n=== Summary ===\n${JSON.stringify(summary, null, 2)}\n`)
