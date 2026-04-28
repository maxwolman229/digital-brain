/**
 * extract-from-document — Supabase Edge Function
 *
 * Modes:
 *   • DRY-RUN  — synchronous; no DB writes. For prompt iteration.
 *                POST { mode:'dry_run', chunk, plant_name?, industry?, ... }
 *
 *   • FULL     — async, self-chaining; processes long docs across multiple
 *                invocations. Each invocation handles up to BATCH_PER_INVOCATION
 *                chunks, checkpoints progress, and self-triggers if more remain.
 *                Final invocation runs dedup and finalises.
 *                POST { document_id }
 *
 * Env vars:
 *   ANTHROPIC_API_KEY           (required)
 *   DOCUMENT_EXTRACT_MODEL      (optional; default claude-sonnet-4-6)
 *   SUPABASE_URL                (auto)
 *   SUPABASE_SERVICE_ROLE_KEY   (auto)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  DEFAULT_MODEL, EXTRACTION_TOOL,
  buildSystemPrompt, buildUserMessage,
  type ExtractMeta,
} from './prompt.ts'
import { processNextBatch, finalize } from './pipeline.ts'

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined

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

const MODEL                     = Deno.env.get('DOCUMENT_EXTRACT_MODEL') || DEFAULT_MODEL
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') || ''
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const SELF_URL = `${SUPABASE_URL}/functions/v1/extract-from-document`

// ── DRY-RUN ─────────────────────────────────────────────────────────────────

async function runDryRun(body: any) {
  if (typeof body.chunk !== 'string' || body.chunk.length === 0) {
    return json({ error: 'dry_run requires a non-empty `chunk` string' }, 400)
  }
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  const t0 = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000, temperature: 0,
      system: buildSystemPrompt({
        plant_name: body.plant_name, industry: body.industry,
        document_type: body.document_type, process_area: body.process_area,
      } as ExtractMeta),
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
      messages: [{
        role: 'user',
        content: buildUserMessage({
          chunk: body.chunk,
          source_section: body.source_section,
          source_page: body.source_page,
        }),
      }],
    }),
  })
  const ms = Date.now() - t0
  if (!res.ok) return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 500)
  const data = await res.json()
  const toolUse = data.content?.find((c: any) => c.type === 'tool_use')
  return json({
    ok: true, mode: 'dry_run',
    candidates: toolUse?.input?.candidates ?? [],
    ms, usage: data.usage, model: MODEL,
  })
}

// ── FULL MODE ───────────────────────────────────────────────────────────────

async function runFullMode(documentId: string, isContinuation = false) {
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Fetch document
  const { data: doc, error: fetchErr } = await supabase
    .from('documents')
    .select('id, plant_id, file_path, mime_type, document_type, process_area, status, title, extraction_progress')
    .eq('id', documentId)
    .single()
  if (fetchErr || !doc) return json({ error: `Document not found: ${documentId}` }, 404)

  // First invocation: only kick off from uploading or failed.
  // Continuation invocations: only proceed if status is already 'extracting'.
  if (!isContinuation) {
    if (doc.status !== 'uploading' && doc.status !== 'failed') {
      return json({
        ok: true,
        message: `Document already ${doc.status}; no action.`,
        status: doc.status,
      })
    }
    // Wipe non-promoted candidates from any prior failed run, reset progress.
    await supabase.from('extraction_candidates')
      .delete().eq('document_id', doc.id).neq('status', 'promoted')
    await supabase.from('documents').update({
      status: 'extracting',
      extraction_error: null,
      extraction_progress: null,
    }).eq('id', doc.id)
    doc.status = 'extracting'
    doc.extraction_progress = null
  } else {
    // Continuation: must be in extracting; otherwise abort silently.
    if (doc.status !== 'extracting') {
      return json({ ok: true, message: `Continuation aborted; status=${doc.status}` })
    }
  }

  // Run worker in the background so the HTTP response can return fast.
  const work = (async () => {
    try {
      const result = await processNextBatch({
        supabase, doc,
        apiKey: ANTHROPIC_API_KEY,
        model: MODEL,
        selfTrigger: async () => {},  // unused — we self-trigger explicitly below
        log: (m) => console.log(`[extract:${doc.id.slice(0, 8)}] ${m}`),
      })

      if (result.done) {
        // Re-fetch the doc so finalize gets the latest extraction_progress.
        const { data: latest } = await supabase
          .from('documents').select('*').eq('id', doc.id).single()
        await finalize(supabase, latest, (m) => console.log(`[extract:${doc.id.slice(0, 8)}] ${m}`))
      } else {
        // More chunks remain — fire-and-forget self-trigger.
        console.log(`[extract:${doc.id.slice(0, 8)}] more chunks remain, self-triggering`)
        // Don't await: we want this to outlive our return and keep the chain alive.
        fetch(SELF_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ document_id: doc.id, _continue: true }),
        }).catch(e => console.error('[extract] self-trigger failed:', e))
      }
    } catch (err: any) {
      console.error(`[extract:${doc.id.slice(0, 8)}] worker crashed:`, err)
      await supabase.from('documents').update({
        status: 'failed',
        extraction_error: String(err?.message || err).slice(0, 500),
      }).eq('id', doc.id)
    }
  })()

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work)
  } else {
    await work
  }

  return json({ ok: true, status: 'extracting', document_id: doc.id })
}

// ── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  if (body.mode === 'dry_run')              return runDryRun(body)
  if (typeof body.document_id === 'string') return runFullMode(body.document_id, body._continue === true)

  return json({
    error: 'Body must include either { mode:"dry_run", chunk } or { document_id }',
  }, 400)
})
