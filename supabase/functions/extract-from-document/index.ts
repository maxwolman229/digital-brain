/**
 * extract-from-document — Supabase Edge Function
 *
 * Two modes:
 *
 *   DRY-RUN (mode='dry_run'):
 *     POST { mode:'dry_run', chunk, plant_name?, industry?, document_type?,
 *            process_area?, source_section?, source_page? }
 *     → returns extracted candidates without touching the DB. Used by the
 *       eval harness and for prompt iteration.
 *
 *   FULL (default, when document_id is provided):
 *     Not yet implemented. Will fetch the document, extract text, chunk it,
 *     run dry-run on each chunk, dedupe, and write candidates to the DB.
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY
 *   DOCUMENT_EXTRACT_MODEL  (optional; default claude-sonnet-4-6)
 *   SUPABASE_URL                (auto, used in full mode)
 *   SUPABASE_SERVICE_ROLE_KEY   (auto, used in full mode)
 */

import {
  DEFAULT_MODEL, EXTRACTION_TOOL,
  buildSystemPrompt, buildUserMessage,
  type ExtractMeta,
} from './prompt.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const MODEL = Deno.env.get('DOCUMENT_EXTRACT_MODEL') || DEFAULT_MODEL

async function callClaude(opts: {
  chunk: string
  meta: ExtractMeta
  source_section?: string
  source_page?: number
}) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set on this function')

  const system = buildSystemPrompt(opts.meta)
  const user = buildUserMessage({
    chunk: opts.chunk,
    source_section: opts.source_section,
    source_page: opts.source_page,
  })

  const t0 = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      temperature: 0,
      system,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
      messages: [{ role: 'user', content: user }],
    }),
  })
  const ms = Date.now() - t0

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic ${res.status}: ${text}`)
  }
  const data = await res.json()
  const toolUse = data.content?.find((c: any) => c.type === 'tool_use')
  if (!toolUse) {
    throw new Error('Claude returned no tool_use block')
  }
  const candidates = toolUse.input?.candidates ?? []
  return { candidates, ms, usage: data.usage, model: MODEL }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  // ── DRY-RUN ────────────────────────────────────────────────────────────────
  if (body.mode === 'dry_run') {
    if (typeof body.chunk !== 'string' || body.chunk.length === 0) {
      return json({ error: 'dry_run requires a non-empty `chunk` string' }, 400)
    }
    try {
      const out = await callClaude({
        chunk: body.chunk,
        meta: {
          plant_name:    body.plant_name,
          industry:      body.industry,
          document_type: body.document_type,
          process_area:  body.process_area,
        },
        source_section: body.source_section,
        source_page:    body.source_page,
      })
      return json({ ok: true, mode: 'dry_run', ...out })
    } catch (e: any) {
      console.error('[extract dry_run] error:', e?.message || e)
      return json({ error: e?.message || String(e) }, 500)
    }
  }

  // ── FULL MODE — not yet implemented ───────────────────────────────────────
  if (typeof body.document_id === 'string') {
    return json({
      error: 'Full extraction mode is not yet implemented. Use mode="dry_run" with a chunk.',
    }, 501)
  }

  return json({
    error: 'Body must include either { mode:"dry_run", chunk } or { document_id }',
  }, 400)
})
