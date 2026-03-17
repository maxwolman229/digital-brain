/**
 * capture — Supabase Edge Function
 *
 * Drives an adaptive knowledge-capture interview.
 * Each call receives the full conversation history and returns:
 *   - the next question to ask (or null when done)
 *   - rules/assertions extracted from the operator's latest answer
 *   - a done flag when the interview is naturally complete
 *
 * POST body:
 *   { history: { role: 'user'|'assistant', content: string }[] }
 *
 * Returns:
 *   { question: string|null, done: boolean, extracted: KnowledgeItem[] }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are an expert knowledge engineer conducting a structured interview with a manufacturing plant operator to capture their tacit operational knowledge.

INTERVIEW RULES:
1. Ask exactly ONE focused question per response — never multiple questions at once
2. Extract ALL rules and assertions from the operator's most recent answer only
3. Ask smart follow-ups that dig into specifics: numbers, thresholds, failure modes, warning signs
4. After 7 turns OR when the operator has thoroughly covered the topic, set "done": true with "question": null
5. Do not re-extract knowledge already visible in previous assistant messages

QUESTION STRATEGIES (vary these based on what the operator said):
- "Tell me more about [specific thing they mentioned] — what exactly happens?"
- "What is the worst case you have seen when that goes wrong?"
- "How do you know when it is time to [action they mentioned]? Is there a number or sign you watch?"
- "What would a new operator get wrong about this on their first week?"
- "Is there a threshold — a specific value, time, or count — that matters here?"
- "What is the earliest warning sign that something is heading in the wrong direction?"
- "Has this ever failed or been done incorrectly? What happened?"

SKIP HANDLING: If the user message is exactly "[SKIP]", ask a completely different question about a different aspect of the process area. Do not comment on the skip. Set extracted to [].

DEFINITIONS:
- Rule: an actionable directive — what to do, what not to do, or when to do something
- Assertion: a factual observation about how the process behaves — cause/effect, thresholds, patterns

RESPONSE FORMAT — respond ONLY with valid JSON. No markdown fences, no prose, no explanation:
{
  "question": "Your next question as a plain string, or null if done",
  "done": false,
  "extracted": [
    {
      "type": "rule",
      "title": "Concise actionable title — under 80 characters",
      "category": "Material | Process | Equipment | People | Measurement | Environment",
      "processArea": "specific process area from the interview context",
      "rationale": "why this rule exists — the consequence of ignoring it",
      "confidence": "Low | Medium | High | Very High",
      "scope": "specific conditions or constraints where this applies"
    }
  ]
}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  console.log(`[capture] ${req.method} ${req.url}`)

  try {
    let body: { history?: { role: string; content: string }[]; industry?: string }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { history, industry } = body
    if (!Array.isArray(history) || history.length === 0) {
      return new Response(JSON.stringify({ error: 'history array is required and must not be empty' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[capture] history length=${history.length} industry="${industry}"`)

    const systemPrompt = industry
      ? `${SYSTEM_PROMPT}\n\nINDUSTRY CONTEXT: This interview is for a ${industry} plant. Frame your questions and terminology accordingly.`
      : SYSTEM_PROMPT

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: systemPrompt,
        messages: history,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[capture] Claude API error (${res.status}): ${errBody}`)
      throw new Error(`Claude API error (${res.status})`)
    }

    const data = await res.json()
    const txt = (data.content ?? [])
      .map((b: { type: string; text?: string }) => b.type === 'text' ? b.text : '')
      .join('')

    let parsed: { question?: string | null; done?: boolean; extracted?: unknown[] }
    try {
      let clean = txt.trim()
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
      const start = clean.indexOf('{')
      const end = clean.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No JSON object found in response')
      parsed = JSON.parse(clean.slice(start, end + 1))
    } catch (e) {
      console.error('[capture] Failed to parse Claude response:', txt.slice(0, 500))
      throw new Error('Claude returned invalid JSON: ' + (e as Error).message)
    }

    const result = {
      question: parsed.question ?? null,
      done: parsed.done ?? false,
      extracted: parsed.extracted ?? [],
    }

    console.log(`[capture] turn done=${result.done} extracted=${(result.extracted as unknown[]).length} question=${result.question ? 'yes' : 'null'}`)

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = (err as Error).message
    console.error(`[capture] Unhandled error: ${message}`)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
