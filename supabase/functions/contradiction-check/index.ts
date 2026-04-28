/**
 * contradiction-check — Supabase Edge Function
 *
 * Called BEFORE saving a new rule or assertion. Two-stage check:
 *   Stage A — retrieve up to 5 most similar existing items in the same plant
 *             (vector if embeddings populated, else full-text fallback)
 *   Stage B — ask Claude to classify each pair as one of:
 *             contradicts | refines | complements | unrelated
 *
 * POST body:
 *   {
 *     plant_id:      string  (uuid)
 *     type:          'rule' | 'assertion'
 *     title:         string
 *     scope?:        string
 *     rationale?:    string  (rules only)
 *     process_area?: string
 *     category?:     string
 *   }
 *
 * Returns:
 *   {
 *     candidates_considered: number,
 *     retrieval_mode:        'vector' | 'fulltext' | 'none',
 *     results: [
 *       {
 *         candidate_id:       string  (display_id),
 *         candidate_type:     'rule' | 'assertion',
 *         candidate_title:    string,
 *         candidate_internal_id: string,   // PK, used by frontend to create links
 *         relationship:       'contradicts' | 'refines' | 'complements' | 'unrelated',
 *         confidence:         'high' | 'medium' | 'low',
 *         explanation:        string,
 *         conditions_differ:  boolean,
 *         shared_conditions:  string  // empty if relationship !== contradicts/refines
 *       }
 *     ]
 *   }
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL                (auto)
 *   SUPABASE_SERVICE_ROLE_KEY   (auto)
 *   VOYAGE_API_KEY              (optional — enables vector retrieval)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// ─── System prompt ──────────────────────────────────────────────────────────────
// Tone matches the operator capture interview: direct, plant-floor terminology,
// no academic prose. Skepticism rule favours false-negatives over false-positives.

const SYSTEM_PROMPT = `You are a senior steel-plant engineer reviewing a new piece of operational
knowledge before it enters a shared knowledge bank. Your only job is to
classify how the new statement relates to each candidate from the existing
knowledge base.

CONTEXT:

- Plant: {{plant_name}}
- Industry: {{industry}}
- Process area: {{process_area}}

NEW STATEMENT (about to be added):

  Type:      {{type}}
  Title:     {{title}}
  Scope:     {{scope}}
  Rationale: {{rationale}}

EXISTING CANDIDATES (top 5 most similar items already in the bank):

{{candidates_block}}

YOUR TASK:

For each candidate, classify the relationship between the NEW STATEMENT and
that candidate, choosing exactly one label:

  "contradicts" — They prescribe genuinely incompatible actions or describe
                  genuinely incompatible facts under the same conditions.
                  Example A: "Tap at 1620°C minimum" vs "Never tap above 1610°C".
                  Example B: "Late aluminium addition raises tap temperature" vs
                            "Late aluminium addition lowers tap temperature".
                  An item being older or newer is NOT contradiction by itself —
                  the content must conflict.

  "refines"     — The new statement narrows, clarifies, or specifies the
                  scope of the candidate. They agree, but the new one is more
                  specific. Example: candidate says "Slow casting on bad scrap",
                  new says "Slow casting by 15% when Sims scrap exceeds 50%".

  "complements" — Both statements are true at the same time and cover related
                  ground without overlap or conflict. Example: rule about
                  scrap charging order and a separate rule about lance flow rate
                  during meltdown.

  "unrelated"   — Despite surface similarity (shared keywords, same process
                  area), the statements address fundamentally different
                  decisions. Default to this when in doubt — false-positive
                  contradictions are worse than false-negatives.

DECISION RULES:

1. Two statements with DIFFERENT operating conditions are NOT contradicting,
   even if their actions look opposite. Read the scope/rationale carefully.
   Example: "Reduce casting speed for high-Cu heats" and "Increase casting
   speed during DRI campaigns" are both rules about speed, but apply in
   different conditions → "complements" (or "unrelated"), not "contradicts".

2. Treat an assertion (a factual observation) as contradicting a rule
   (an action) only if the assertion would force the action to fail or
   reverse. Two assertions contradict only if they make incompatible factual
   claims about the same phenomenon under the same conditions.

3. Numeric thresholds: a difference of <20% on the same metric in the same
   conditions is NOT a contradiction unless one explicitly forbids what the
   other prescribes. Example: "stir 3-5 minutes" vs "stir 4-6 minutes" →
   "refines" or "complements", not "contradicts".

4. Status of the candidate matters. If the candidate is "Retired" or
   "Superseded", the new statement does NOT contradict it — return
   "unrelated". (We filter these out before they reach you, but treat any
   that slip through this way.)

5. Be skeptical of your own contradiction calls. Ask yourself: "Could a
   reasonable plant engineer believe both statements are true at the same
   time?" If yes → it's not a contradiction.

6. If the two statements share keywords but the new statement is about a
   different process area, equipment, or grade, classify as "unrelated".
   Surface similarity alone is not enough.

7. Near-duplicates: if the new statement is functionally identical to a
   candidate (same action, same conditions, same threshold), classify as
   "unrelated" and START the explanation with "Near-duplicate of
   [candidate_id]:". The frontend treats these as a separate "this looks
   like an existing rule" warning, not as a contradiction.

OUTPUT FORMAT:

Respond ONLY with valid JSON. No markdown, no prose, no explanation outside
the JSON. Use exactly this shape:

{
  "results": [
    {
      "candidate_id": "R-EAF-014",
      "relationship": "contradicts",
      "confidence": "high",
      "explanation": "New rule says tap above 1620°C, candidate says never tap above 1610°C. Same metric, same conditions, opposing thresholds.",
      "conditions_differ": false,
      "shared_conditions": "Tap temperature target on standard structural grades, EAF process area, all heat sizes."
    }
  ]
}

FIELD CONSTRAINTS:

- "candidate_id": exactly the display_id of the candidate, as given in the
  list above.
- "relationship": exactly one of "contradicts", "refines", "complements",
  "unrelated".
- "confidence": "high" | "medium" | "low".
- "explanation": 1-2 sentences, max 200 characters, in plain English using
  the operator's terminology (not academic prose).
- "conditions_differ": true if the two statements would both be valid under
  different conditions (shift, scrap mix, grade, equipment, etc.); false
  otherwise. The frontend uses this to suggest "save as relates_to in
  different conditions" vs "save and flag for resolution".
- "shared_conditions": when relationship is "contradicts" or "refines", a
  one-sentence summary of the conditions both statements apply to (grade,
  equipment, scrap mix, etc.). When relationship is "complements" or
  "unrelated", return an empty string.
- One result per candidate, in the same order as the candidates were given.

Do not invent candidates that weren't provided. Do not skip candidates.`

// ─── Retrieval ──────────────────────────────────────────────────────────────────

interface Candidate {
  id: string             // PK
  display_id: string     // R-EAF-001 etc.
  type: 'rule' | 'assertion'
  title: string
  scope: string | null
  rationale: string | null
  status: string
  process_area: string | null
}

// Vector retrieval — only works once embeddings are populated for this plant
// AND the table dimension matches the embed pipeline. Returns null on any
// failure so we fall through to full-text.
async function retrieveByVector(
  admin: ReturnType<typeof createClient>,
  plantId: string,
  query: string,
  voyageKey: string,
): Promise<Candidate[] | null> {
  try {
    const embRes = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${voyageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voyage-3', input: [query], input_type: 'query' }),
    })
    if (!embRes.ok) return null
    const embData = await embRes.json()
    const queryEmbedding = embData?.data?.[0]?.embedding
    if (!queryEmbedding?.length) return null

    const { data, error } = await admin.rpc('hybrid_search_vector', {
      query_embedding: queryEmbedding,
      match_plant_id: plantId,
      match_count: 8,  // grab a bit extra so we can filter to 5 after type-checking
    })
    if (error || !data) return null

    return data
      .filter((r: Record<string, unknown>) => r.item_type === 'rule' || r.item_type === 'assertion')
      .filter((r: Record<string, unknown>) => r.status !== 'Retired' && r.status !== 'Superseded')
      .slice(0, 5)
      .map((r: Record<string, unknown>) => ({
        id: r.id as string,
        display_id: (r.display_id as string) || (r.id as string),
        type: r.item_type as 'rule' | 'assertion',
        title: r.title as string,
        scope: (r.scope as string) || null,
        rationale: (r.rationale as string) || null,
        status: r.status as string,
        process_area: (r.process_area as string) || null,
      }))
  } catch (err) {
    console.warn('[contradiction-check] vector retrieval failed:', err)
    return null
  }
}

// Full-text retrieval — uses Postgres tsvector ILIKE matching on title.
// Always works, doesn't depend on embeddings. Less precise than vector but
// good enough for most exact-keyword overlap cases.
async function retrieveByFulltext(
  admin: ReturnType<typeof createClient>,
  plantId: string,
  title: string,
  processArea: string | null,
): Promise<Candidate[]> {
  // Build a websearch tsquery from the title (lets Postgres handle stop words).
  // Same-process-area items get a strong preference; cross-process-area only
  // surface if no same-area matches exist.
  const out: Candidate[] = []

  for (const table of ['rules', 'assertions'] as const) {
    const q = admin
      .from(table)
      .select('id, display_id, title, scope, ' + (table === 'rules' ? 'rationale, ' : '') + 'status, process_area')
      .eq('plant_id', plantId)
      .not('status', 'in', '("Retired","Superseded")')
      .textSearch('search_vector', title, { type: 'websearch', config: 'english' })
      .limit(5)

    const { data } = await q
    for (const r of (data || []) as Record<string, unknown>[]) {
      out.push({
        id: r.id as string,
        display_id: (r.display_id as string) || (r.id as string),
        type: table === 'rules' ? 'rule' : 'assertion',
        title: r.title as string,
        scope: (r.scope as string) || null,
        rationale: (r.rationale as string) || null,
        status: r.status as string,
        process_area: (r.process_area as string) || null,
      })
    }
  }

  // Sort: same-process-area first, then by raw similarity-of-title.
  // Trim to 5.
  const sameArea = out.filter(c => processArea && c.process_area === processArea)
  const otherArea = out.filter(c => !processArea || c.process_area !== processArea)
  return [...sameArea, ...otherArea].slice(0, 5)
}

// ─── Prompt builder ─────────────────────────────────────────────────────────────

function fillTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '')
}

function buildCandidatesBlock(candidates: Candidate[]): string {
  return candidates.map((c, i) => {
    return [
      `  --- Candidate ${i + 1} ---`,
      `  ID:        ${c.display_id}`,
      `  Type:      ${c.type}`,
      `  Status:    ${c.status}`,
      `  Title:     ${c.title}`,
      `  Scope:     ${c.scope || '(none)'}`,
      `  Rationale: ${c.rationale || '(none)'}`,
    ].join('\n')
  }).join('\n\n')
}

// ─── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Body must be JSON' }, 400)

    const {
      plant_id, type, title, scope, rationale, process_area, category,
    } = body as Record<string, string>

    // Eval-only: when present, skip retrieval and use these candidates directly.
    // Used by eval/contradiction-check/run.mjs to A/B-test models with controlled
    // inputs. Production callers should never set this.
    const evalCandidates = (body as Record<string, unknown>).__eval_candidates as Candidate[] | undefined

    if (!plant_id || !type || !title) {
      return json({ error: 'plant_id, type, and title are required' }, 400)
    }
    if (type !== 'rule' && type !== 'assertion') {
      return json({ error: "type must be 'rule' or 'assertion'" }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const voyageKey = Deno.env.get('VOYAGE_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const admin = createClient(supabaseUrl, serviceKey)

    // ── Stage A: retrieve candidates ────────────────────────────────────────
    const queryText = [title, scope, rationale, process_area, category].filter(Boolean).join(' ')

    let candidates: Candidate[] | null = null
    let retrievalMode: 'vector' | 'fulltext' | 'none' | 'eval' = 'none'

    if (Array.isArray(evalCandidates) && evalCandidates.length > 0) {
      candidates = evalCandidates
      retrievalMode = 'eval'
    } else {
      if (voyageKey) {
        candidates = await retrieveByVector(admin, plant_id, queryText, voyageKey)
        if (candidates && candidates.length > 0) retrievalMode = 'vector'
      }
      if (!candidates || candidates.length === 0) {
        candidates = await retrieveByFulltext(admin, plant_id, title, process_area || null)
        if (candidates.length > 0) retrievalMode = 'fulltext'
      }
    }

    if (!candidates || candidates.length === 0) {
      // No candidates at all — nothing to compare against, save can proceed.
      return json({
        candidates_considered: 0,
        retrieval_mode: 'none',
        results: [],
      })
    }

    // ── Plant + industry context for the prompt ────────────────────────────
    const { data: plant } = await admin
      .from('plants')
      .select('name, industry')
      .eq('id', plant_id)
      .single()

    // ── Stage B: ask Claude ────────────────────────────────────────────────
    const systemPrompt = fillTemplate(SYSTEM_PROMPT, {
      plant_name: plant?.name || 'this plant',
      industry: plant?.industry || 'manufacturing',
      process_area: process_area || 'unspecified',
      type,
      title,
      scope: scope || '(none)',
      rationale: rationale || '(none)',
      candidates_block: buildCandidatesBlock(candidates),
    })

    // Audit-friendly content hash for the new statement — lets us correlate a
    // soft-fail log line back to the rule the user was trying to create.
    const contentHashSrc = `${type}|${title}|${scope || ''}|${rationale || ''}`
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contentHashSrc))
    const contentHash = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12)

    console.log(`[contradiction-check] plant=${plant_id} hash=${contentHash} retrieved=${candidates.length} via=${retrievalMode}`)

    const llmStart = Date.now()
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Default selected after side-by-side eval — see
        // eval/contradiction-check/RESULTS.md. Haiku 4.5 hit 100%
        // contradiction recall and 0 false positives on a 20-case set,
        // ~17% faster median latency and ~70% cheaper than Sonnet 4.
        // Override via CONTRADICTION_CHECK_MODEL env var if needed.
        model: Deno.env.get('CONTRADICTION_CHECK_MODEL') || 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Return the JSON now.' }],
      }),
    })

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      const llmMs = Date.now() - llmStart
      console.error(`[contradiction-check] SOFT_FAIL plant=${plant_id} hash=${contentHash} retrieved=${candidates.length} mode=${retrievalMode} llm_status=${claudeRes.status} llm_ms=${llmMs} error=${JSON.stringify(errBody).slice(0, 200)}`)
      return json({
        candidates_considered: candidates.length,
        retrieval_mode: retrievalMode,
        results: [],
        error: 'Contradiction check unavailable; proceeding without it.',
      })
    }

    const claudeData = await claudeRes.json()
    const txt = (claudeData.content ?? [])
      .map((b: { type: string; text?: string }) => b.type === 'text' ? b.text : '')
      .join('')

    let parsed: { results?: unknown[] }
    try {
      let clean = txt.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
      const start = clean.indexOf('{')
      const end = clean.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No JSON object in response')
      parsed = JSON.parse(clean.slice(start, end + 1))
    } catch (e) {
      const llmMs = Date.now() - llmStart
      console.error(`[contradiction-check] SOFT_FAIL plant=${plant_id} hash=${contentHash} retrieved=${candidates.length} mode=${retrievalMode} llm_ms=${llmMs} error=parse_failure raw=${JSON.stringify(txt.slice(0, 300))}`)
      return json({
        candidates_considered: candidates.length,
        retrieval_mode: retrievalMode,
        results: [],
        error: 'LLM response was unparseable; proceeding without it.',
      })
    }

    // Normalise: zip the LLM's results back together with the candidate metadata
    // so the frontend has internal IDs (for link creation) without trusting the
    // LLM not to have mangled the order.
    type RawResult = {
      candidate_id?: string
      relationship?: string
      confidence?: string
      explanation?: string
      conditions_differ?: boolean
      shared_conditions?: string
    }
    const candidateByDisplay = new Map<string, Candidate>()
    candidates.forEach(c => { candidateByDisplay.set(c.display_id, c) })

    const VALID_REL = new Set(['contradicts', 'refines', 'complements', 'unrelated'])
    const VALID_CONF = new Set(['high', 'medium', 'low'])

    const results = ((parsed.results || []) as RawResult[])
      .map(r => {
        const cand = candidateByDisplay.get(r.candidate_id || '')
        if (!cand) return null
        const relationship = VALID_REL.has(r.relationship || '') ? r.relationship : 'unrelated'
        const confidence = VALID_CONF.has(r.confidence || '') ? r.confidence : 'low'
        return {
          candidate_id: cand.display_id,
          candidate_internal_id: cand.id,
          candidate_type: cand.type,
          candidate_title: cand.title,
          relationship,
          confidence,
          explanation: (r.explanation || '').slice(0, 240),
          conditions_differ: !!r.conditions_differ,
          shared_conditions: (r.shared_conditions || '').slice(0, 240),
        }
      })
      .filter(r => r !== null)

    const llmMs = Date.now() - llmStart
    const flagged = results.filter(r => r && r.relationship === 'contradicts').length
    console.log(`[contradiction-check] OK plant=${plant_id} hash=${contentHash} retrieved=${candidates.length} flagged=${flagged} llm_ms=${llmMs}`)

    return json({
      candidates_considered: candidates.length,
      retrieval_mode: retrievalMode,
      results,
    })

  } catch (err) {
    console.error(`[contradiction-check] SOFT_FAIL_UNHANDLED error=${String(err).slice(0, 200)}`)
    return json({
      candidates_considered: 0,
      retrieval_mode: 'none',
      results: [],
      error: String(err),
    }, 200)
  }
})
