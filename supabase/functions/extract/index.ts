/**
 * extract — Supabase Edge Function
 *
 * Receives operator narrative text and extracts structured rules/assertions
 * using the Claude API server-side (ANTHROPIC_API_KEY never reaches the browser).
 *
 * POST body:
 *   { narrative: string, process_area: string }
 *
 * Returns:
 *   { rules: Rule[], assertions: Assertion[] }
 */

// ─── CORS headers ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}


// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS })
  }

  console.log(`[extract] ${req.method} ${req.url}`)

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: { narrative?: string; process_area?: string; industry?: string }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { narrative, process_area, industry } = body
    console.log(`[extract] process_area="${process_area}" industry="${industry}" narrative_length=${narrative?.length ?? 0}`)

    if (!narrative?.trim()) {
      return new Response(JSON.stringify({ error: 'narrative is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Env vars ──────────────────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in edge function secrets' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Call Claude ───────────────────────────────────────────────────────────
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are an operational knowledge engineer. Extract structured knowledge from operator narratives. The Ishikawa categories are: Material, Process, Equipment, People, Measurement, Environment.${industry ? ` The plant operates in the ${industry} industry — use appropriate terminology.` : ''}

Extract structured operational knowledge from this operator narrative. Return ONLY valid JSON — no markdown, no backticks, no explanation.

NARRATIVE: ${narrative}
PRIMARY PROCESS AREA: ${process_area || 'General'}${industry ? `\nINDUSTRY: ${industry}` : ''}

JSON schema:
{
  "rules": [
    {
      "title": "Short actionable directive an operator must follow",
      "category": "one of: Material | Process | Equipment | People | Measurement | Environment",
      "process_area": "use the primary process area above, or a more specific area if mentioned in the narrative",
      "scope": "specific conditions or constraints where this applies",
      "rationale": "why this rule exists — the consequence of not following it",
      "confidence": "one of: Low | Medium | High | Very High"
    }
  ],
  "assertions": [
    {
      "title": "Short factual observation about how the process behaves",
      "category": "one of: Material | Process | Equipment | People | Measurement | Environment",
      "process_area": "use the primary process area above, or a more specific area if mentioned in the narrative",
      "scope": "specific conditions under which this is true",
      "confidence": "one of: Low | Medium | High | Very High"
    }
  ]
}

Rules are directives (what to do / not do). Assertions are observations (what is true). Extract all distinct items from the narrative.`,
        }],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[extract] Claude API error (${res.status}): ${errBody}`)
      throw new Error(`Claude API error (${res.status})`)
    }

    const data = await res.json()
    const txt = (data.content ?? []).map((b: { type: string; text?: string }) => b.type === 'text' ? b.text : '').join('')

    let parsed: { rules?: unknown[]; assertions?: unknown[] }
    try {
      // Strip markdown code fences if present
      let clean = txt.trim()
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
      // Extract from first { to last }
      const start = clean.indexOf('{')
      const end = clean.lastIndexOf('}')
      if (start === -1 || end === -1) {
        console.error('[extract] No JSON object found in response. Raw:', txt.slice(0, 500))
        throw new Error('No JSON object in Claude response')
      }
      clean = clean.slice(start, end + 1)
      parsed = JSON.parse(clean)
    } catch (e) {
      console.error('[extract] Failed to parse Claude response. Raw txt:', txt.slice(0, 500))
      throw new Error('Claude returned invalid JSON: ' + (e as Error).message)
    }

    console.log(`[extract] Extracted ${parsed.rules?.length ?? 0} rules, ${parsed.assertions?.length ?? 0} assertions`)

    return new Response(JSON.stringify({
      rules: parsed.rules ?? [],
      assertions: parsed.assertions ?? [],
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = (err as Error).message
    console.error(`[extract] Unhandled error: ${message}`)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
