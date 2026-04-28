// =============================================================================
// extract-from-document — pipeline (self-chaining, per-chunk checkpointed)
//
// The Anthropic 4k-output-tokens/min ceiling forces serial chunking; combined
// with the Supabase edge function wall-clock budget (~150s free / ~400s paid),
// a single invocation cannot process arbitrarily many chunks. So:
//
//   • Each invocation processes up to BATCH_PER_INVOCATION chunks (2).
//   • Candidates from each chunk are inserted IMMEDIATELY (per-chunk
//     checkpoint) so a worker recycle cannot lose completed work.
//   • Progress is tracked in documents.extraction_progress.
//   • If chunks remain, the function self-triggers via HTTP fire-and-forget.
//   • The final invocation runs the dedup pass and finalises the document.
//
// Public API used by index.ts:
//   extractText, chunkPages, dedupe — used in the smoke path
//   processNextBatch(...)           — per-invocation worker
//   finalize(...)                   — runs dedup + flips status
// =============================================================================

import {
  EXTRACTION_TOOL,
  buildSystemPrompt,
  buildUserMessage,
  type ExtractMeta,
} from './prompt.ts'

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constants ───────────────────────────────────────────────────────────────

export const CHUNK_SIZE = 4000
export const CHUNK_OVERLAP = 500
export const MAX_CHUNKS_V1 = 50           // hard upper bound; with batching we can support more docs
export const BATCH_PER_INVOCATION = 2     // chunks per edge function invocation
export const RETRY_MAX = 3                // attempts per chunk on 429

// ── Types ───────────────────────────────────────────────────────────────────

export type Page = { pageNum: number | null; text: string }
export type Chunk = {
  index: number
  start: number
  end: number
  text: string
  page: number | null
}
export type Candidate = {
  type: 'rule' | 'assertion'
  title: string
  content: string
  scope: string | null
  rationale: string | null
  source_excerpt: string
  confidence: 'high' | 'medium' | 'low'
  source_page?: number | null
  source_section?: string | null
}
export type ExtractionProgress = {
  total_chunks: number
  processed: number[]    // chunk indices successfully processed
  failed: number[]       // chunk indices that exhausted retries
  started_at: string
}

// ── Text extraction ────────────────────────────────────────────────────────

export async function extractText(buffer: ArrayBuffer, mimeType: string): Promise<Page[]> {
  if (mimeType === 'application/pdf') return extractPdf(buffer)
  if (mimeType === 'text/plain')      return [{ pageNum: null, text: new TextDecoder().decode(buffer) }]
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mimeType === 'application/msword'
  ) {
    throw new Error('DOCX is not supported in v1. Save as PDF and re-upload.')
  }
  throw new Error(`Unsupported MIME type: ${mimeType}. Supported: application/pdf, text/plain.`)
}

async function extractPdf(buffer: ArrayBuffer): Promise<Page[]> {
  const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: false })
  return (text as string[]).map((t, i) => ({ pageNum: i + 1, text: t || '' }))
}

// ── Chunker w/ page tracking ────────────────────────────────────────────────

export function chunkPages(pages: Page[]): { chunks: Chunk[]; totalChars: number } {
  let fullText = ''
  const offsets: { pageNum: number | null; start: number; end: number }[] = []
  for (const p of pages) {
    const start = fullText.length
    fullText += (p.text || '') + '\n\n'
    offsets.push({ pageNum: p.pageNum, start, end: fullText.length })
  }
  fullText = fullText.trimEnd()

  const chunks: Chunk[] = []
  let i = 0, idx = 0
  while (i < fullText.length) {
    const end = Math.min(i + CHUNK_SIZE, fullText.length)
    chunks.push({ index: idx, start: i, end, text: fullText.slice(i, end), page: pageForOffset(offsets, i) })
    if (end === fullText.length) break
    i = end - CHUNK_OVERLAP
    idx++
  }
  return { chunks, totalChars: fullText.length }
}

function pageForOffset(
  offsets: { pageNum: number | null; start: number; end: number }[],
  off: number,
): number | null {
  for (const o of offsets) if (off >= o.start && off < o.end) return o.pageNum
  return offsets[offsets.length - 1]?.pageNum ?? null
}

// ── Claude call with exp-backoff + jitter retry ─────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function callClaude(opts: {
  chunk: string
  meta: ExtractMeta
  source_section?: string
  source_page?: number | null
  apiKey: string
  model: string
}): Promise<{ candidates: Candidate[]; usage: any; ms: number }> {
  const t0 = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 8000,
      temperature: 0,
      system: buildSystemPrompt(opts.meta),
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
      messages: [{
        role: 'user',
        content: buildUserMessage({
          chunk: opts.chunk,
          source_section: opts.source_section,
          source_page: opts.source_page ?? undefined,
        }),
      }],
    }),
  })
  const ms = Date.now() - t0
  if (!res.ok) {
    const text = await res.text()
    const err: any = new Error(`Anthropic ${res.status}: ${text}`)
    err.status = res.status
    err.body = text
    throw err
  }
  const data = await res.json()
  const toolUse = data.content?.find((c: any) => c.type === 'tool_use')
  if (!toolUse) throw new Error('Claude returned no tool_use block')
  return { candidates: toolUse.input?.candidates ?? [], usage: data.usage, ms }
}

async function callClaudeWithRetry(opts: Parameters<typeof callClaude>[0]) {
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return await callClaude(opts)
    } catch (e: any) {
      const is429 = e.status === 429 || /rate_limit|429/i.test(e.body || e.message || '')
      if (!is429 || attempt >= RETRY_MAX) throw e
      const base = 30_000 * Math.pow(2, attempt)
      const jitter = Math.floor(Math.random() * 10_000)
      await sleep(base + jitter)
    }
  }
  throw new Error('unreachable')
}

// ── Dedup ────────────────────────────────────────────────────────────────────

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

function normalize(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function dedupe<T extends Candidate & { id?: string }>(candidates: T[]): T[] {
  // Tier 1 — exact source_excerpt match. Keep first occurrence.
  const seen1 = new Set<string>()
  const tier1: T[] = []
  for (const c of candidates) {
    if (c.source_excerpt && seen1.has(c.source_excerpt)) continue
    seen1.add(c.source_excerpt)
    tier1.push(c)
  }
  // Tier 2 — (type + normalized title + first 60 chars of normalized content).
  const seen2 = new Map<string, T>()
  const tier2: T[] = []
  for (const c of tier1) {
    const key = `${c.type}::${normalize(c.title)}::${normalize(c.content).slice(0, 60)}`
    const existing = seen2.get(key)
    if (!existing) {
      seen2.set(key, c)
      tier2.push(c)
      continue
    }
    const newRank = CONF_RANK[c.confidence] ?? 0
    const oldRank = CONF_RANK[existing.confidence] ?? 0
    if (newRank > oldRank) {
      // Keep new payload but preserve first's source_excerpt + source_page.
      const merged: T = {
        ...c,
        source_excerpt: existing.source_excerpt,
        source_page: existing.source_page,
      }
      const idx = tier2.indexOf(existing)
      if (idx >= 0) tier2[idx] = merged
      seen2.set(key, merged)
    }
  }
  return tier2
}

// ── Per-invocation worker ───────────────────────────────────────────────────

export type WorkerOpts = {
  supabase: SupabaseClient
  doc: any
  apiKey: string
  model: string
  selfTrigger: () => Promise<void>
  log?: (m: string) => void
}

export async function processNextBatch(opts: WorkerOpts): Promise<{
  done: boolean
  processedThisRun: number[]
  failedThisRun: number[]
  totalChunks: number
}> {
  const log = opts.log || (() => {})
  const { supabase, doc } = opts

  // 1. Re-extract & re-chunk (cheap; PDF parse is sub-second for our sizes).
  log(`download ${doc.file_path}`)
  const { data: blob, error: dlErr } = await supabase.storage
    .from('plant-documents').download(doc.file_path)
  if (dlErr || !blob) throw new Error(`Storage download failed: ${dlErr?.message || 'no blob'}`)
  const buffer = await blob.arrayBuffer()
  const pages = await extractText(buffer, doc.mime_type)
  const { chunks } = chunkPages(pages)
  log(`pages=${pages.length} chunks=${chunks.length}`)

  if (chunks.length > MAX_CHUNKS_V1) {
    throw new Error(`Document too long: ${chunks.length} chunks (max ${MAX_CHUNKS_V1}).`)
  }

  // 2. Determine progress.
  const progress: ExtractionProgress = doc.extraction_progress || {
    total_chunks: chunks.length,
    processed: [],
    failed: [],
    started_at: new Date().toISOString(),
  }
  const remaining = chunks.filter(
    c => !progress.processed.includes(c.index) && !progress.failed.includes(c.index)
  )
  log(`remaining chunks: ${remaining.length} of ${chunks.length}`)

  if (remaining.length === 0) {
    return { done: true, processedThisRun: [], failedThisRun: [], totalChunks: chunks.length }
  }

  // 3. Lookup plant for prompt context (once per invocation).
  const { data: plant } = await supabase
    .from('plants').select('name, industry').eq('id', doc.plant_id).single()
  const meta: ExtractMeta = {
    plant_name:    plant?.name,
    industry:      plant?.industry,
    document_type: doc.document_type,
    process_area:  doc.process_area,
  }

  // 4. Process up to BATCH_PER_INVOCATION chunks.
  const batch = remaining.slice(0, BATCH_PER_INVOCATION)
  const processedThisRun: number[] = []
  const failedThisRun: number[] = []

  for (const c of batch) {
    log(`chunk ${c.index + 1}/${chunks.length} (${c.text.length} chars, page ${c.page ?? '-'})`)
    try {
      const { candidates, ms, usage } = await callClaudeWithRetry({
        chunk: c.text, meta,
        source_section: c.page ? `Page ${c.page}` : `Chunk ${c.index + 1}`,
        source_page: c.page,
        apiKey: opts.apiKey, model: opts.model,
      })
      log(`  → ${candidates.length} cand, ${ms}ms (in=${usage?.input_tokens}/out=${usage?.output_tokens})`)

      if (candidates.length > 0) {
        const rows = candidates.map(cand => ({
          document_id:    doc.id,
          type:           cand.type,
          title:          cand.title,
          content:        cand.content,
          scope:          cand.scope ?? null,
          rationale:      cand.rationale ?? null,
          source_excerpt: cand.source_excerpt,
          source_page:    c.page ?? null,
          source_section: c.page ? `Page ${c.page}` : `Chunk ${c.index + 1}`,
          confidence:     cand.confidence,
          status:         'pending_review',
        }))
        const { error } = await supabase.from('extraction_candidates').insert(rows)
        if (error) throw new Error(`Insert failed: ${error.message}`)
      }
      processedThisRun.push(c.index)
    } catch (e: any) {
      log(`  ✗ chunk ${c.index + 1} failed: ${e?.message || e}`)
      failedThisRun.push(c.index)
    }

    // Checkpoint progress after each chunk.
    progress.processed = [...progress.processed, ...processedThisRun.filter(i => !progress.processed.includes(i))]
    progress.failed    = [...progress.failed,    ...failedThisRun.filter(i => !progress.failed.includes(i))]
    await supabase.from('documents')
      .update({ extraction_progress: progress })
      .eq('id', doc.id)
  }

  const allDoneCount = progress.processed.length + progress.failed.length
  return {
    done: allDoneCount >= chunks.length,
    processedThisRun, failedThisRun,
    totalChunks: chunks.length,
  }
}

// ── Finalize: dedup + flip status ───────────────────────────────────────────

export async function finalize(supabase: SupabaseClient, doc: any, log?: (m: string) => void) {
  const l = log || (() => {})
  const { data: rows, error } = await supabase
    .from('extraction_candidates')
    .select('id, type, title, content, scope, rationale, source_excerpt, source_page, source_section, confidence, status, created_at')
    .eq('document_id', doc.id)
    .neq('status', 'promoted')   // never touch promoted candidates
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Final fetch failed: ${error.message}`)

  const raw = (rows || []) as any[]
  const deduped = dedupe(raw as any)
  const dropIds = raw.filter(r => !deduped.some((d: any) => d.id === r.id)).map(r => r.id)
  l(`finalize: ${raw.length} raw → ${deduped.length} kept (${dropIds.length} dropped)`)

  if (dropIds.length > 0) {
    // Delete in batches of 200 to stay under URL/payload limits.
    for (let i = 0; i < dropIds.length; i += 200) {
      const batch = dropIds.slice(i, i + 200)
      const { error: delErr } = await supabase
        .from('extraction_candidates').delete().in('id', batch)
      if (delErr) throw new Error(`Delete failed: ${delErr.message}`)
    }
  }

  const progress: ExtractionProgress | null = doc.extraction_progress || null
  const total = progress?.total_chunks ?? 0
  const failed = progress?.failed?.length ?? 0

  let status: string
  let warning: string | null = null
  if (total > 0 && failed === total) {
    status = 'failed'
    warning = `All ${total} chunks failed.`
  } else if (deduped.length === 0 && failed === 0) {
    status = 'review_complete'
  } else {
    status = 'ready_for_review'
    if (failed > 0) warning = `${failed} of ${total} chunks failed after retries.`
  }

  await supabase.from('documents').update({
    status,
    candidate_count:     deduped.length,
    extraction_error:    warning,
    extraction_progress: null,
  }).eq('id', doc.id)
  l(`finalize: status=${status}`)
}
