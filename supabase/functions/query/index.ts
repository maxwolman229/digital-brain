/**
 * query — Supabase Edge Function
 *
 * Full-text search across rules, assertions, and events, answered by Claude
 * using only the retrieved knowledge items.
 *
 * POST body:
 *   { question: string, plant_id: string }
 *
 * Returns:
 *   { answer: string, sources: Source[], totalRetrieved: number, mode: string }
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY        — Claude API key (required)
 *   SUPABASE_URL             — injected automatically by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase runtime
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── CORS headers ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KnowledgeItem {
  id: string
  displayId: string
  type: 'rule' | 'assertion' | 'event'
  title: string
  status: string
  processArea: string
  category?: string
  rationale?: string
  scope?: string
  description?: string
  tags?: string[]
}

// ─── Normalise a DB row → KnowledgeItem ───────────────────────────────────────

function normalise(row: Record<string, unknown>): KnowledgeItem {
  const id = row.id as string
  return {
    id,
    displayId: (row.display_id as string) || id,
    type: row.item_type as 'rule' | 'assertion' | 'event',
    title: row.title as string,
    status: row.status as string,
    processArea: (row.process_area as string) ?? '',
    category: row.category as string | undefined,
    rationale: row.rationale as string | undefined,
    scope: row.scope as string | undefined,
    description: row.description as string | undefined,
    tags: row.tags as string[] | undefined,
  }
}

function normaliseRule(r: Record<string, unknown>): KnowledgeItem {
  return { ...normalise({ ...r, item_type: 'rule' }) }
}

function normaliseAssertion(a: Record<string, unknown>): KnowledgeItem {
  return { ...normalise({ ...a, item_type: 'assertion' }) }
}

// ─── Build Claude context block ───────────────────────────────────────────────

function buildContext(items: KnowledgeItem[]): string {
  if (items.length === 0) return '(No knowledge items retrieved)'
  return items.map(item => {
    const lines: string[] = [`[${item.displayId}] ${item.type.toUpperCase()} — ${item.title}`]
    if (item.status) lines.push(`Status: ${item.status}`)
    if (item.processArea) lines.push(`Process area: ${item.processArea}`)
    if (item.category) lines.push(`Category: ${item.category}`)
    if (item.rationale) lines.push(`Rationale: ${item.rationale}`)
    if (item.scope) lines.push(`Scope: ${item.scope}`)
    if (item.description) lines.push(`Description: ${item.description}`)
    if (item.tags?.length) lines.push(`Tags: ${item.tags.join(', ')}`)
    return lines.join('\n')
  }).join('\n\n---\n\n')
}

// ─── Flagged contradictions — always surfaced regardless of FTS hits ──────────
//
// The links table stores typed edges between rules/assertions. A row with
// relationship_type='contradicts' is a human-flagged contradiction in the
// knowledge bank. We pull these directly so the assistant can answer questions
// like "are there any contradictions?" without relying on FTS keyword overlap.

async function fetchContradictionsForPlant(
  supabase: ReturnType<typeof createClient>,
  plant_id: string,
): Promise<{ block: string; items: KnowledgeItem[] }> {
  const empty = { block: '', items: [] as KnowledgeItem[] }
  const { data: links, error } = await supabase
    .from('links')
    .select('source_type, source_id, target_type, target_id, comment')
    .eq('relationship_type', 'contradicts')
    .limit(50)

  if (error) {
    console.error(`[query] contradictions lookup error: ${error.message}`)
    return empty
  }
  if (!links || links.length === 0) return empty

  // Collect ids per table so we can fetch full fields in batches.
  const ruleIds = new Set<string>()
  const assertionIds = new Set<string>()
  for (const l of links as Array<Record<string, string>>) {
    if (l.source_type === 'rule') ruleIds.add(l.source_id)
    else if (l.source_type === 'assertion') assertionIds.add(l.source_id)
    if (l.target_type === 'rule') ruleIds.add(l.target_id)
    else if (l.target_type === 'assertion') assertionIds.add(l.target_id)
  }

  const [rulesRes, assertRes] = await Promise.all([
    ruleIds.size > 0
      ? supabase
          .from('rules')
          .select('id, display_id, title, status, process_area, category, rationale, scope, tags, plant_id')
          .in('id', [...ruleIds])
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    assertionIds.size > 0
      ? supabase
          .from('assertions')
          .select('id, display_id, title, status, process_area, category, scope, tags, plant_id')
          .in('id', [...assertionIds])
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])

  const lookup = new Map<string, { item: KnowledgeItem; plant_id: string }>()
  for (const r of (rulesRes.data ?? []) as Array<Record<string, unknown>>) {
    lookup.set(`rule:${r.id as string}`, { item: normaliseRule(r), plant_id: r.plant_id as string })
  }
  for (const a of (assertRes.data ?? []) as Array<Record<string, unknown>>) {
    lookup.set(`assertion:${a.id as string}`, { item: normaliseAssertion(a), plant_id: a.plant_id as string })
  }

  const lines: string[] = []
  const cited = new Map<string, KnowledgeItem>()
  for (const l of links as Array<Record<string, string>>) {
    const src = lookup.get(`${l.source_type}:${l.source_id}`)
    const tgt = lookup.get(`${l.target_type}:${l.target_id}`)
    if (!src || !tgt) continue
    // Both endpoints must belong to this plant.
    if (src.plant_id !== plant_id || tgt.plant_id !== plant_id) continue
    const comment = l.comment ? ` — ${l.comment}` : ''
    lines.push(`  • [${src.item.displayId}] "${src.item.title}" CONTRADICTS [${tgt.item.displayId}] "${tgt.item.title}"${comment}`)
    cited.set(src.item.id, src.item)
    cited.set(tgt.item.id, tgt.item)
  }

  console.log(`[query] contradictions: ${lines.length} flagged for plant ${plant_id}`)
  if (lines.length === 0) return empty
  const block = `\n\nFLAGGED CONTRADICTIONS IN THE KNOWLEDGE BANK (always available — refer to these whenever the user asks about contradictions, conflicts, disagreements, or inconsistencies):\n${lines.join('\n')}`
  return { block, items: [...cited.values()] }
}

// ─── Direct table fallback — returns top items without text filtering ──────────

async function fetchFallbackItems(
  supabase: ReturnType<typeof createClient>,
  plant_id: string,
): Promise<KnowledgeItem[]> {
  console.log('[query] Running direct table fallback')
  const [rulesRes, assertRes] = await Promise.all([
    supabase
      .from('rules')
      .select('id, display_id, title, status, process_area, category, rationale, scope, tags')
      .eq('plant_id', plant_id)
      .not('status', 'in', '("Retired","Superseded")')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('assertions')
      .select('id, display_id, title, status, process_area, category, scope, tags')
      .eq('plant_id', plant_id)
      .not('status', 'in', '("Retired","Superseded")')
      .order('created_at', { ascending: false })
      .limit(8),
  ])
  const items: KnowledgeItem[] = [
    ...(rulesRes.data ?? []).map(normaliseRule),
    ...(assertRes.data ?? []).map(normaliseAssertion),
  ]
  console.log(`[query] Fallback: got ${items.length} items`)
  return items
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS })
  }

  console.log(`[query] ${req.method} ${req.url}`)

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: {
      question?: string
      plant_id?: string
      industry?: string
      // Conversational context — last few {role, text} turns. The frontend
      // already trims to ~10; we cap again here as a safety net.
      history?: Array<{ role: string; text: string }>
    }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { question, plant_id, industry, history } = body
    console.log(`[query] question="${question?.slice(0, 80)}" plant_id="${plant_id}" industry="${industry}" history_turns=${history?.length ?? 0}`)

    if (!question?.trim()) {
      return new Response(JSON.stringify({ error: 'question is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    if (!plant_id) {
      return new Response(JSON.stringify({ error: 'plant_id is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Env vars ──────────────────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    console.log(`[query] ANTHROPIC_API_KEY=${anthropicKey ? 'SET' : 'MISSING'}`)

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl!, serviceKey!)

    // ── Full-text search via RPC ───────────────────────────────────────────────
    console.log('[query] Running full-text search RPC')
    const { data: textData, error: textError } = await supabase.rpc('hybrid_search_fulltext', {
      query_text: question,
      match_plant_id: plant_id,
      match_count: 20,
    })

    let items: KnowledgeItem[]
    let mode: string

    if (textError) {
      console.error(`[query] FTS RPC error: ${textError.message}`)
      items = await fetchFallbackItems(supabase, plant_id)
      mode = 'fallback'
    } else {
      const ftsItems = (textData ?? []).map(normalise)
      console.log(`[query] FTS returned ${ftsItems.length} results`)

      if (ftsItems.length === 0) {
        // FTS found nothing (query too vague or no keyword overlap) — use all items
        console.log('[query] FTS returned 0 — using direct table fallback')
        items = await fetchFallbackItems(supabase, plant_id)
        mode = 'fallback'
      } else {
        items = ftsItems.slice(0, 15)
        mode = 'fulltext'
      }
    }

    // Always pull flagged contradictions so the model can answer
    // "are there any contradictions?" even when FTS finds nothing. The cited
    // items are merged into `items` so their IDs resolve in the sources list.
    const { block: contradictionsBlock, items: contradictionItems } =
      await fetchContradictionsForPlant(supabase, plant_id)
    if (contradictionItems.length > 0) {
      const seen = new Set(items.map(i => i.id))
      for (const ci of contradictionItems) {
        if (!seen.has(ci.id)) { items.push(ci); seen.add(ci.id) }
      }
    }

    console.log(`[query] Sending ${items.length} items to Claude (mode: ${mode})`)
    return await answerWithClaude(question, items, anthropicKey, mode, CORS, industry, contradictionsBlock, history)

  } catch (err) {
    const message = (err as Error).message
    console.error(`[query] Unhandled error: ${message}`)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Ask Claude with retrieved context ────────────────────────────────────────

async function answerWithClaude(
  question: string,
  items: KnowledgeItem[],
  apiKey: string,
  mode: string,
  cors: Record<string, string>,
  industry?: string,
  contradictionsBlock = '',
  history: Array<{ role: string; text: string }> = [],
): Promise<Response> {
  const knowledgeContext = buildContext(items)
  console.log(`[claude] Sending ${items.length} items as context (mode: ${mode}); contradictions block ${contradictionsBlock ? 'present' : 'empty'}; history turns=${history.length}`)

  const plantDescription = industry ? `a ${industry} plant` : 'a manufacturing plant'
  const systemPrompt = `You are a knowledge assistant for ${plantDescription}. You answer questions ONLY from the knowledge items provided below. You do not guess or improvise.

KNOWLEDGE ITEMS (retrieved by ${mode} search):
${knowledgeContext}${contradictionsBlock}

RULES FOR YOUR RESPONSE:
1. Answer directly and specifically based ONLY on the knowledge items above.
2. Cite every rule or assertion you use with its ID in square brackets, e.g. [R-EAF-003] or [A-BEV-007]. Use the exact IDs shown in the knowledge items above.
3. If multiple items are relevant, cite all of them.
4. If an item has status "Proposed", note that it is not yet verified.
5. If nothing in the knowledge items matches the question, say exactly: "No rules in the knowledge bank cover this situation." Then suggest filing an open question.
6. Keep your answer concise — 2-5 sentences unless the question requires more detail.
7. NEVER invent rules or knowledge not in the items above.
8. NEVER reference general industry knowledge — only reference what is documented above.
9. If there are contradictions between items, flag them explicitly.
10. When the user asks about contradictions, conflicts, disagreements, or inconsistencies, ALWAYS use the "FLAGGED CONTRADICTIONS" block above (if present) as the authoritative answer — list every flagged pair with their IDs. Do not substitute redundancies or near-duplicates for true contradictions.
11. Previous conversation messages may contain context relevant to the current question. Use that context to resolve ambiguous references, follow-up questions, and pronouns (e.g. "what about for peritectic grades?" or "and the cooling adjustment?"). Always answer the CURRENT question directly while using prior context to enrich the answer. If the current question is unrelated to prior turns, answer it as a fresh question without forcing continuity.`

  // Prepend prior turns as alternating user/assistant messages so Claude has
  // them as conversational context. Anthropic's API requires alternating
  // roles starting with 'user'; we sanitise to that shape.
  const priorMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const turn of history) {
    if (!turn?.text?.trim()) continue
    const role = turn.role === 'assistant' ? 'assistant' : 'user'
    const last = priorMessages[priorMessages.length - 1]
    // Collapse same-role runs to keep the alternating-role invariant.
    if (last && last.role === role) {
      last.content += '\n\n' + turn.text
    } else {
      priorMessages.push({ role, content: turn.text })
    }
  }
  // The final API message must be the user's current question. If the last
  // prior turn was already a user message, fold it into the new question.
  let trailingUserPrefix = ''
  if (priorMessages.length > 0 && priorMessages[priorMessages.length - 1].role === 'user') {
    trailingUserPrefix = priorMessages.pop()!.content + '\n\n'
  }
  const messages = [
    ...priorMessages,
    { role: 'user' as const, content: trailingUserPrefix + question },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[claude] API error (${res.status}): ${errBody}`)
    throw new Error(`Claude API error (${res.status}): ${errBody}`)
  }

  const data = await res.json()
  const answer = data.content[0].text as string
  console.log(`[claude] Got answer (${answer.length} chars)`)

  const citedIds = [...answer.matchAll(/\[(?:R|A|E)-[A-Z]{2,4}-\d{3,}\]/g)].map(m => m[0].slice(1, -1))
  const sources = items
    .filter(i => citedIds.includes(i.displayId))
    .map(({ id, displayId, type, title, status, processArea }) => ({ id, displayId, type, title, status, processArea }))

  return new Response(JSON.stringify({ answer, sources, totalRetrieved: items.length, mode }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
