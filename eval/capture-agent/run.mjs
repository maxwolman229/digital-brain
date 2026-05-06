#!/usr/bin/env node
// =============================================================================
// eval/capture-agent/run.mjs
//
// Drives the deployed `capture` edge function with a scripted SME interview
// and aggregates everything extracted across all turns. Used to evaluate the
// quantity, coverage, specificity, classification, and conditional/causal
// preservation of the capture agent's extraction prompt.
//
// Flow:
//   1. POST history=[user: ""] → function returns Q1
//      (prompt instructs it to jump straight in with no greeting)
//   2. Append user: <answer 1> → POST → returns Q2 + extracted-1
//   3. Continue for N answers
//   4. Aggregate all extracted items, write JSON + summary
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// Optional CLI args: <script-path> <output-suffix>. Default keeps the
// original casting transcript output paths.
const scriptPath = process.argv[2] || join(here, 'sme-script.json')
const outSuffix  = process.argv[3] || ''
const script = JSON.parse(readFileSync(scriptPath, 'utf8'))

const env = Object.fromEntries(
  readFileSync(join(here, '..', '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')] })
)
const URL = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY

async function callCapture(history, context, extractedSoFar, attempt = 0) {
  const r = await fetch(`${URL}/functions/v1/capture`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ history, context, extracted_so_far: extractedSoFar }),
  })
  const data = await r.json()
  if (!r.ok) {
    // Parse failures (Claude returned bad JSON) are intermittent — retry once.
    const isJsonErr = /invalid JSON|No JSON object|tool_use|record_turn/i.test(data?.error || '')
    if (isJsonErr && attempt < 1) {
      console.log(`    ↻ tool/JSON error, retrying once`)
      await new Promise(r => setTimeout(r, 1500))
      return callCapture(history, context, extractedSoFar, attempt + 1)
    }
    throw new Error(`capture HTTP ${r.status}: ${(data?.error || JSON.stringify(data)).slice(0, 200)}`)
  }
  return data
}

function persist(here, transcript, allExtracted, turnSummary, suffix = '') {
  const tag = suffix ? `-${suffix}` : ''
  writeFileSync(join(here, `transcript${tag}.json`), JSON.stringify(transcript, null, 2))
  writeFileSync(join(here, `extracted${tag}.json`), JSON.stringify(allExtracted, null, 2))
  writeFileSync(join(here, `turn-summary${tag}.json`), JSON.stringify(turnSummary, null, 2))
}

const transcript = []           // for the transcript file
const allExtracted = []         // aggregated across turns
const turnSummary = []          // {turn, question, extractedCount}
let history = [{ role: 'user', content: 'I am ready when you are.' }]

console.log(`SME context: ${script.context.display_name} · ${script.context.position} · ${script.context.years_in_industry}y`)
console.log(`Topic: ${script.context.topic}`)
console.log(`Answers scripted: ${script.answers.length}`)
console.log('')

const t0 = Date.now()

// Turn 0 — opening question
console.log(`[turn 0] kickoff…`)
let resp = await callCapture(history, script.context, [])
console.log(`  Q: ${resp.question}`)
transcript.push({ role: 'assistant', content: resp.question })
history.push({ role: 'assistant', content: resp.question })

for (let i = 0; i < script.answers.length; i++) {
  const userMsg = script.answers[i]
  history.push({ role: 'user', content: userMsg })
  transcript.push({ role: 'user', content: userMsg })
  console.log(`\n[turn ${i + 1}] SME (${userMsg.split(' ').length} words) → calling capture…`)
  // Mirror the production CaptureView behaviour: pass extracted-so-far titles
  // so the capture function can deduplicate against the running list.
  const extractedSoFar = allExtracted.map(x => `[${x.type}] ${x.title}`)
  try {
    resp = await callCapture(history, script.context, extractedSoFar)
  } catch (e) {
    console.log(`  ✗ turn ${i + 1} hard-failed: ${e.message}`)
    turnSummary.push({ turn: i + 1, question: null, extractedCount: 0, done: false, error: e.message })
    persist(here, transcript, allExtracted, turnSummary, outSuffix)
    // Pop the failed user message so the next turn doesn't re-send it
    history.pop()
    transcript.pop()
    continue
  }
  const extracted = resp.extracted || []
  for (const e of extracted) allExtracted.push({ ...e, _turn: i + 1 })
  turnSummary.push({ turn: i + 1, question: resp.question, extractedCount: extracted.length, done: resp.done })
  console.log(`  → extracted ${extracted.length} items, done=${resp.done}`)
  if (resp.question) {
    console.log(`  Q: ${resp.question.slice(0, 120)}${resp.question.length > 120 ? '…' : ''}`)
    transcript.push({ role: 'assistant', content: resp.question })
    history.push({ role: 'assistant', content: resp.question })
  }
  persist(here, transcript, allExtracted, turnSummary, outSuffix)
  if (resp.done) { console.log(`  ✓ session complete`); break }
}

const totalSec = ((Date.now() - t0) / 1000).toFixed(1)
persist(here, transcript, allExtracted, turnSummary, outSuffix)

// ── Summary report ──────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`)
console.log(`Wall time: ${totalSec}s · turns: ${turnSummary.length} · total extracted: ${allExtracted.length}`)
console.log(`══════════════════════════════════════════════════════════════════════`)

const byType = allExtracted.reduce((a, c) => (a[c.type] = (a[c.type] || 0) + 1, a), {})
const byCategory = allExtracted.reduce((a, c) => (a[c.category] = (a[c.category] || 0) + 1, a), {})
const withScope = allExtracted.filter(c => c.scope && c.scope.trim()).length
const withRationale = allExtracted.filter(c => c.rationale && c.rationale.trim()).length
console.log(`\nBy type: ${JSON.stringify(byType)}`)
console.log(`By category: ${JSON.stringify(byCategory)}`)
console.log(`Items with non-empty scope: ${withScope} / ${allExtracted.length}`)
console.log(`Items with non-empty rationale: ${withRationale} / ${allExtracted.length}`)
console.log(`\nPer-turn extraction count:`)
for (const t of turnSummary) console.log(`  turn ${t.turn}: ${t.extractedCount} items`)

console.log(`\nFiles written:`)
console.log(`  ${join(here, 'transcript.json')}`)
console.log(`  ${join(here, 'extracted.json')}`)
console.log(`  ${join(here, 'turn-summary.json')}`)
