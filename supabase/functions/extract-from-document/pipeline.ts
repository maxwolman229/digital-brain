// =============================================================================
// extract-from-document — full-mode pipeline
//
// Steps:
//   1. Download the file from Supabase Storage (plant-documents bucket).
//   2. Extract text → an array of { pageNum, text } pages.
//      • PDF  → npm:unpdf (pure JS, edge-compatible, page-aware)
//      • TXT  → native decode; pageNum=null
//      • DOCX → not supported in v1 (mammoth has Node deps that fail in Deno);
//               returns a clear error so the UI can surface "convert to PDF".
//   3. Chunk at 4000 chars with 500-char overlap, tracking which page each
//      chunk's start offset falls on.
//   4. For each chunk: call Claude with the prompt+tool, with exponential
//      backoff + jitter on 429, max 3 retries per chunk. Failed chunks are
//      counted but do not abort the run.
//   5. Dedupe across all chunks:
//        Tier 1 — exact source_excerpt match → drop later occurrences.
//        Tier 2 — (type + normalised title + first 60 chars of content) →
//                 keep higher confidence; on tie, keep the first; preserve
//                 first occurrence's source_excerpt + source_page.
//   6. Insert candidates into extraction_candidates.
//   7. Update the document row with final status + counters.
// =============================================================================

import {
  EXTRACTION_TOOL,
  buildSystemPrompt,
  buildUserMessage,
  type ExtractMeta,
} from './prompt.ts'

// ── Constants ───────────────────────────────────────────────────────────────

export const CHUNK_SIZE = 4000
export const CHUNK_OVERLAP = 500
export const MAX_CHUNKS_V1 = 25
export const RETRY_MAX = 3

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
  // Added by the pipeline:
  source_page?: number | null
  source_section?: string | null
  _chunk?: number
}
export type ExtractionResult = {
  candidates: Candidate[]
  raw_count: number
  deduped_count: number
  total_chunks: number
  failed_chunks: number
  total_ms: number
}

// ── Text extraction ────────────────────────────────────────────────────────

export async function extractText(buffer: ArrayBuffer, mimeType: string): Promise<Page[]> {
  if (mimeType === 'application/pdf') {
    return extractPdf(buffer)
  }
  if (mimeType === 'text/plain') {
    return [{ pageNum: null, text: new TextDecoder().decode(buffer) }]
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mimeType === 'application/msword'
  ) {
    throw new Error('DOCX is not supported in v1. Save the document as PDF and re-upload.')
  }
  throw new Error(`Unsupported MIME type: ${mimeType}. Supported: application/pdf, text/plain.`)
}

async function extractPdf(buffer: ArrayBuffer): Promise<Page[]> {
  // unpdf is a pure-JS PDF text extractor designed for serverless/edge runtimes.
  const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: false })
  // text is string[] when mergePages: false
  const pages = (text as string[]).map((t, i) => ({ pageNum: i + 1, text: t || '' }))
  return pages
}

// ── Chunker w/ page tracking ────────────────────────────────────────────────

export function chunkPages(pages: Page[]): { chunks: Chunk[]; totalChars: number } {
  // Concatenate pages with explicit boundaries; remember each page's start offset.
  let fullText = ''
  const offsets: { pageNum: number | null; start: number; end: number }[] = []
  for (const p of pages) {
    const start = fullText.length
    fullText += (p.text || '') + '\n\n'
    offsets.push({ pageNum: p.pageNum, start, end: fullText.length })
  }
  fullText = fullText.trimEnd()

  const chunks: Chunk[] = []
  let i = 0
  let idx = 0
  while (i < fullText.length) {
    const end = Math.min(i + CHUNK_SIZE, fullText.length)
    const text = fullText.slice(i, end)
    chunks.push({ index: idx, start: i, end, text, page: pageForOffset(offsets, i) })
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
  for (const o of offsets) {
    if (off >= o.start && off < o.end) return o.pageNum
  }
  return offsets[offsets.length - 1]?.pageNum ?? null
}

// ── Claude call with retry ──────────────────────────────────────────────────

export async function callClaude(opts: {
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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export async function callClaudeWithRetry(opts: Parameters<typeof callClaude>[0]) {
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return await callClaude(opts)
    } catch (e: any) {
      const is429 = e.status === 429 || /rate_limit|429/i.test(e.body || e.message || '')
      if (!is429 || attempt >= RETRY_MAX) throw e
      // Exponential backoff with jitter: 30s, 60s, 120s base + ~0–10s jitter.
      const base = 30_000 * Math.pow(2, attempt)
      const jitter = Math.floor(Math.random() * 10_000)
      const wait = base + jitter
      console.log(`[extract] 429 on attempt ${attempt + 1}, waiting ${wait}ms`)
      await sleep(wait)
    }
  }
  throw new Error('unreachable')
}

// ── Dedup ────────────────────────────────────────────────────────────────────

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

function normalize(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function dedupe(candidates: Candidate[]): Candidate[] {
  // Tier 1 — exact source_excerpt match. Keep first occurrence.
  const seen1 = new Set<string>()
  const tier1: Candidate[] = []
  for (const c of candidates) {
    const key = c.source_excerpt
    if (key && seen1.has(key)) continue
    seen1.add(key)
    tier1.push(c)
  }

  // Tier 2 — (type + normalized title + first 60 chars of normalized content).
  // On collision, keep the higher-confidence candidate's payload but preserve
  // the first occurrence's source_excerpt + source_page (canonical citation).
  const seen2 = new Map<string, Candidate>()
  const tier2: Candidate[] = []
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
      const merged: Candidate = {
        ...c,
        source_excerpt: existing.source_excerpt,
        source_page: existing.source_page,
      }
      const idx = tier2.indexOf(existing)
      if (idx >= 0) tier2[idx] = merged
      seen2.set(key, merged)
    }
    // else: tie or lower — keep existing, drop new.
  }

  return tier2
}

// ── Top-level pipeline ──────────────────────────────────────────────────────

export type RunPipelineOpts = {
  buffer: ArrayBuffer
  mimeType: string
  meta: ExtractMeta
  apiKey: string
  model: string
  log?: (msg: string) => void
}

export async function runPipeline(opts: RunPipelineOpts): Promise<ExtractionResult> {
  const log = opts.log || (() => {})
  const t0 = Date.now()

  log(`[pipeline] extracting text (mime=${opts.mimeType})…`)
  const pages = await extractText(opts.buffer, opts.mimeType)

  log(`[pipeline] ${pages.length} page(s) extracted; chunking…`)
  const { chunks, totalChars } = chunkPages(pages)

  log(`[pipeline] ${chunks.length} chunk(s), ${totalChars} chars total`)
  if (chunks.length > MAX_CHUNKS_V1) {
    throw new Error(
      `Document is too long for v1: ${chunks.length} chunks (max ${MAX_CHUNKS_V1}). `
      + `Split the document and re-upload.`,
    )
  }

  const allCandidates: Candidate[] = []
  let failed = 0
  for (const c of chunks) {
    log(`[pipeline] chunk ${c.index + 1}/${chunks.length} (page ${c.page ?? '-'}, ${c.text.length} chars)`)
    try {
      const { candidates, ms, usage } = await callClaudeWithRetry({
        chunk: c.text,
        meta: opts.meta,
        source_section: c.page ? `Page ${c.page}` : `Chunk ${c.index + 1}`,
        source_page: c.page,
        apiKey: opts.apiKey,
        model: opts.model,
      })
      log(`[pipeline]   → ${candidates.length} cand, ${ms}ms, in=${usage?.input_tokens}/out=${usage?.output_tokens}`)
      for (const cand of candidates) {
        allCandidates.push({
          ...cand,
          source_page: c.page,
          source_section: c.page ? `Page ${c.page}` : `Chunk ${c.index + 1}`,
          _chunk: c.index + 1,
        })
      }
    } catch (e: any) {
      failed++
      log(`[pipeline]   ✗ chunk ${c.index + 1} failed after retries: ${e?.message || e}`)
    }
  }

  log(`[pipeline] dedup: ${allCandidates.length} raw…`)
  const deduped = dedupe(allCandidates)
  log(`[pipeline] dedup: ${deduped.length} kept (${allCandidates.length - deduped.length} dropped)`)

  return {
    candidates: deduped,
    raw_count: allCandidates.length,
    deduped_count: deduped.length,
    total_chunks: chunks.length,
    failed_chunks: failed,
    total_ms: Date.now() - t0,
  }
}
