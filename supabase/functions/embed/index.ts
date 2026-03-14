/**
 * embed — Supabase Edge Function
 *
 * Generates and stores embeddings for rules, assertions, events, and questions.
 * Called after any create/update on those tables.
 *
 * POST body:
 *   { target_type: 'rule'|'assertion'|'event'|'question', target_id: string }
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY  — Anthropic API key (server-side only)
 *   SUPABASE_URL       — injected automatically by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_TYPES = ['rule', 'assertion', 'event', 'question'] as const
type TargetType = typeof ALLOWED_TYPES[number]

// Build the text that will be embedded for each item type
function buildContentText(item: Record<string, unknown>, type: TargetType): string {
  switch (type) {
    case 'rule':
      return [
        item.id,
        item.title,
        item.rationale,
        item.scope,
        item.category,
        item.process_area,
        (item.tags as string[] | null)?.join(' '),
      ].filter(Boolean).join(' | ')

    case 'assertion':
      return [
        item.id,
        item.title,
        item.scope,
        item.category,
        item.process_area,
        (item.tags as string[] | null)?.join(' '),
      ].filter(Boolean).join(' | ')

    case 'event':
      return [
        item.id,
        item.title,
        item.description,
        item.process_area,
        item.outcome,
        item.resolution,
        (item.tags as string[] | null)?.join(' '),
      ].filter(Boolean).join(' | ')

    case 'question':
      return [
        item.id,
        item.question,
        item.detail,
        item.process_area,
      ].filter(Boolean).join(' | ')
  }
}

// Simple MD5-like hash for change detection (using Web Crypto)
async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: text }],
    }),
  })

  // Anthropic doesn't expose a standalone embeddings endpoint yet — use voyage-3 via voyageai
  // or fall back to OpenAI text-embedding-3-small if configured.
  // For now we use the Voyage AI embeddings endpoint (recommended by Anthropic for RAG).
  throw new Error('Use embedText via Voyage AI — see below')
}

async function embedTextVoyage(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: [text],
      input_type: 'document',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Voyage embedding error: ${err}`)
  }
  const data = await res.json()
  return data.data[0].embedding as number[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { target_type, target_id } = await req.json() as {
      target_type: TargetType
      target_id: string
    }

    if (!ALLOWED_TYPES.includes(target_type)) {
      return new Response(JSON.stringify({ error: 'Invalid target_type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const voyageKey = Deno.env.get('VOYAGE_API_KEY')
    if (!voyageKey) {
      return new Response(JSON.stringify({ error: 'VOYAGE_API_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch the target item
    const table = target_type === 'rule' ? 'rules'
      : target_type === 'assertion' ? 'assertions'
      : target_type === 'event' ? 'events'
      : 'questions'

    const { data: item, error: fetchErr } = await supabase
      .from(table)
      .select('*')
      .eq('id', target_id)
      .single()

    if (fetchErr || !item) {
      return new Response(JSON.stringify({ error: `Item not found: ${fetchErr?.message}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const contentText = buildContentText(item, target_type)
    const contentHash = await hashText(contentText)

    // Check if embedding is already up to date
    const { data: existing } = await supabase
      .from('embeddings')
      .select('content_hash')
      .eq('target_type', target_type)
      .eq('target_id', target_id)
      .single()

    if (existing?.content_hash === contentHash) {
      return new Response(JSON.stringify({ status: 'unchanged', target_id }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Generate embedding
    const embedding = await embedTextVoyage(contentText, voyageKey)

    // Upsert into embeddings table
    const { error: upsertErr } = await supabase
      .from('embeddings')
      .upsert({
        target_type,
        target_id,
        embedding,
        content_text: contentText,
        content_hash: contentHash,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'target_type,target_id' })

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ status: 'ok', target_id, dims: embedding.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
