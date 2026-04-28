/**
 * extract-from-document — Supabase Edge Function
 *
 * Two modes:
 *
 *   DRY-RUN (mode='dry_run'):
 *     POST { mode:'dry_run', chunk, plant_name?, industry?, document_type?,
 *            process_area?, source_section?, source_page? }
 *     → returns extracted candidates synchronously without touching the DB.
 *       Used by the eval harness and prompt iteration.
 *
 *   FULL (default, when document_id is provided):
 *     POST { document_id }
 *     → marks the document 'extracting' and returns immediately. The actual
 *       pipeline (download → text → chunk → Claude → dedupe → insert) runs
 *       inside EdgeRuntime.waitUntil. The UI polls the document row for the
 *       final status.
 *
 *     Document size limit (v1): 25 chunks ≈ 100k chars of extracted text.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY           (required)
 *   DOCUMENT_EXTRACT_MODEL      (optional; default claude-sonnet-4-6)
 *   SUPABASE_URL                (auto)
 *   SUPABASE_SERVICE_ROLE_KEY   (auto)
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  DEFAULT_MODEL, EXTRACTION_TOOL,
  buildSystemPrompt, buildUserMessage,
  type ExtractMeta,
} from './prompt.ts'
import {
  runPipeline, type Candidate,
} from './pipeline.ts'

// EdgeRuntime is a Supabase global — keeps async work alive after the response.
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

const MODEL = Deno.env.get('DOCUMENT_EXTRACT_MODEL') || DEFAULT_MODEL
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// ── DRY-RUN: synchronous, no DB writes ──────────────────────────────────────

async function runDryRun(body: any) {
  if (typeof body.chunk !== 'string' || body.chunk.length === 0) {
    return json({ error: 'dry_run requires a non-empty `chunk` string' }, 400)
  }
  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY is not set on this function' }, 500)
  }

  const t0 = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      temperature: 0,
      system: buildSystemPrompt({
        plant_name:    body.plant_name,
        industry:      body.industry,
        document_type: body.document_type,
        process_area:  body.process_area,
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
  if (!res.ok) {
    return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 500)
  }
  const data = await res.json()
  const toolUse = data.content?.find((c: any) => c.type === 'tool_use')
  return json({
    ok: true,
    mode: 'dry_run',
    candidates: toolUse?.input?.candidates ?? [],
    ms,
    usage: data.usage,
    model: MODEL,
  })
}

// ── FULL MODE: async via waitUntil ──────────────────────────────────────────

async function runFullMode(documentId: string) {
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set' }, 500)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Fetch document
  const { data: doc, error: fetchErr } = await supabase
    .from('documents')
    .select('id, plant_id, file_path, mime_type, document_type, process_area, status, title')
    .eq('id', documentId)
    .single()

  if (fetchErr || !doc) {
    return json({ error: `Document not found: ${documentId}` }, 404)
  }

  // Idempotency: only kick off from uploading or failed.
  if (doc.status !== 'uploading' && doc.status !== 'failed') {
    return json({
      ok: true,
      message: `Document is already ${doc.status} — no action taken.`,
      status: doc.status,
    })
  }

  // Mark extracting + clear stale candidates from any prior failed run.
  await supabase.from('extraction_candidates')
    .delete().eq('document_id', doc.id)
    .neq('status', 'promoted')   // never delete a promoted candidate
  await supabase.from('documents')
    .update({ status: 'extracting', extraction_error: null })
    .eq('id', doc.id)

  // Background pipeline.
  const pipelinePromise = runExtractionBackground(supabase, doc).catch(async (err) => {
    console.error('[extract] pipeline crashed:', err)
    await supabase.from('documents').update({
      status: 'failed',
      extraction_error: String(err?.message || err).slice(0, 500),
    }).eq('id', doc.id)
  })

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(pipelinePromise)
  } else {
    // Local dev fallback: run inline (will block the response).
    await pipelinePromise
  }

  return json({ ok: true, status: 'extracting', document_id: doc.id })
}

async function runExtractionBackground(supabase: SupabaseClient, doc: any) {
  const log = (m: string) => console.log(`[extract:${doc.id.slice(0, 8)}] ${m}`)

  // 1. Download file
  log(`downloading ${doc.file_path}`)
  const { data: blob, error: dlErr } = await supabase.storage
    .from('plant-documents').download(doc.file_path)
  if (dlErr || !blob) throw new Error(`Storage download failed: ${dlErr?.message || 'no blob'}`)
  const buffer = await blob.arrayBuffer()

  // 2. Lookup plant + industry for the prompt
  const { data: plant } = await supabase
    .from('plants').select('name, industry').eq('id', doc.plant_id).single()

  // 3. Run pipeline
  const result = await runPipeline({
    buffer,
    mimeType: doc.mime_type,
    meta: {
      plant_name:    plant?.name,
      industry:      plant?.industry,
      document_type: doc.document_type,
      process_area:  doc.process_area,
    },
    apiKey: ANTHROPIC_API_KEY,
    model: MODEL,
    log,
  })

  // 4. Insert candidates
  if (result.candidates.length > 0) {
    const rows = result.candidates.map((c: Candidate) => ({
      document_id:    doc.id,
      type:           c.type,
      title:          c.title,
      content:        c.content,
      scope:          c.scope,
      rationale:      c.rationale,
      source_excerpt: c.source_excerpt,
      source_page:    c.source_page ?? null,
      source_section: c.source_section ?? null,
      confidence:     c.confidence,
      status:         'pending_review',
    }))
    // Insert in batches of 100 to stay well under any payload limits.
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error } = await supabase.from('extraction_candidates').insert(batch)
      if (error) throw new Error(`Insert candidates batch failed: ${error.message}`)
    }
  }

  // 5. Final status
  let finalStatus: string
  let warning: string | null = null
  if (result.failed_chunks > 0 && result.failed_chunks === result.total_chunks) {
    finalStatus = 'failed'
    warning = `All ${result.total_chunks} chunks failed.`
  } else if (result.candidates.length === 0) {
    finalStatus = 'review_complete'   // nothing to review, but not a failure
  } else {
    finalStatus = 'ready_for_review'
    if (result.failed_chunks > 0) {
      warning = `${result.failed_chunks} of ${result.total_chunks} chunks failed after retries; partial extraction.`
    }
  }

  await supabase.from('documents').update({
    status:           finalStatus,
    candidate_count:  result.deduped_count,
    extraction_error: warning,
  }).eq('id', doc.id)

  log(`done: ${finalStatus} | ${result.deduped_count} kept (${result.raw_count} raw) | ${result.failed_chunks}/${result.total_chunks} chunks failed | ${result.total_ms}ms`)
}

// ── HTTP handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  if (body.mode === 'dry_run')              return runDryRun(body)
  if (typeof body.document_id === 'string') return runFullMode(body.document_id)

  return json({
    error: 'Body must include either { mode:"dry_run", chunk } or { document_id }',
  }, 400)
})
