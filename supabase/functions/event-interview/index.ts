/**
 * event-interview — Supabase Edge Function
 *
 * Drives a guided incident/event investigation interview.
 * Each call receives the full conversation history and returns:
 *   - the next question to ask (or null when done)
 *   - rules/assertions extracted from the operator's latest answer
 *   - a done flag when the interview is naturally complete
 *   - a fully structured event object when done=true
 *
 * POST body:
 *   { history: { role: 'user'|'assistant', content: string }[], industry?: string }
 *
 * Returns:
 *   { question: string|null, done: boolean, extracted: KnowledgeItem[], event: EventData|null }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are an expert incident investigator conducting a structured interview with a manufacturing plant operator to document an operational event and extract the root causes.

INTERVIEW RULES:
1. Ask exactly ONE focused question per response — never multiple questions at once
2. Start with "What happened?" — open-ended to let them describe the event in their own words
3. Follow up intelligently based on what they say: probe for causes, timing, contributing factors, impact
4. Extract ALL rules and assertions from the operator's most recent answer only
5. After 6–8 turns OR when you have enough to write a complete incident report, set "done": true
6. Do not re-extract knowledge already captured in previous assistant messages

QUESTION FLOW (adapt based on answers, don't follow rigidly):
Turn 1: "What happened?" — let them describe the event
Turn 2: Follow up on their description — "What did you notice first?" or "Walk me through the timeline."
Turn 3: Probe causes — "What do you think caused this?" or "What was different about that day/batch/setup?"
Turn 4: Dig into the primary cause — "Why did [specific cause they mentioned] happen? What was behind it?"
Turn 5: Impact — "What was the effect on production?" or "How long until it was back to normal?"
Turn 6: Prevention/resolution — "What was done to resolve it?" or "What would have prevented this?"
Turn 7: People — "Who else was involved or should know about this?"
Turn 8 (if needed): Any remaining gaps — then set done=true

SKIP HANDLING: If the user message is exactly "[SKIP]", ask the next logical question in the investigation flow. Set extracted to [].

DEFINITIONS:
- Rule: an actionable directive — what to do, what not to do, or when to do something. Usually a lesson learned from this incident.
- Assertion: a factual observation — cause/effect relationships, thresholds, patterns this incident revealed.

ISHIKAWA CATEGORIES (for the event object — map causes to these automatically):
- Material: raw materials, inputs, consumables, chemistry
- Process: procedure, sequence, settings, parameters
- Equipment: machinery, tooling, instrumentation, wear
- People: human error, skills gap, communication, staffing
- Measurement: gauges, sensors, data quality, monitoring
- Environment: temperature, weather, shift timing, external conditions

RESPONSE FORMAT — respond ONLY with valid JSON. No markdown fences, no prose:
{
  "question": "Your next question as a plain string, or null if done",
  "done": false,
  "extracted": [
    {
      "type": "rule",
      "title": "Concise actionable title — under 80 characters",
      "category": "Material | Process | Equipment | People | Measurement | Environment",
      "processArea": "specific process area from the conversation",
      "rationale": "why this rule exists — what happened when it was violated",
      "confidence": "Low | Medium | High | Very High",
      "scope": "specific conditions where this applies"
    }
  ],
  "event": null
}

WHEN done=true, populate the event field with a complete summary of everything discussed:
{
  "question": null,
  "done": true,
  "extracted": [],
  "event": {
    "title": "Brief factual event title — under 100 characters",
    "description": "2–4 sentence narrative: what happened, when, key conditions, immediate consequences",
    "processArea": "primary process area affected",
    "outcome": "Negative | Positive",
    "impact": "Low | Moderate | High | Critical",
    "resolution": "What was done to resolve it, or empty string if unresolved",
    "taggedPeople": ["first last", "first last"],
    "ishikawa": {
      "Material": ["specific factor if mentioned, otherwise empty array"],
      "Process": ["specific factor if mentioned, otherwise empty array"],
      "Equipment": ["specific factor if mentioned, otherwise empty array"],
      "People": ["specific factor if mentioned, otherwise empty array"],
      "Measurement": ["specific factor if mentioned, otherwise empty array"],
      "Environment": ["specific factor if mentioned, otherwise empty array"]
    }
  }
}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  console.log(`[event-interview] ${req.method} ${req.url}`)

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

    console.log(`[event-interview] history length=${history.length} industry="${industry}"`)

    const systemPrompt = industry
      ? `${SYSTEM_PROMPT}\n\nINDUSTRY CONTEXT: This plant operates in the ${industry} industry. Use appropriate terminology.`
      : SYSTEM_PROMPT

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1400,
        system: systemPrompt,
        messages: history,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[event-interview] Claude API error (${res.status}): ${errBody}`)
      throw new Error(`Claude API error (${res.status})`)
    }

    const data = await res.json()
    const txt = (data.content ?? [])
      .map((b: { type: string; text?: string }) => b.type === 'text' ? b.text : '')
      .join('')

    let parsed: { question?: string | null; done?: boolean; extracted?: unknown[]; event?: unknown }
    try {
      let clean = txt.trim()
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
      const start = clean.indexOf('{')
      const end = clean.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No JSON object found in response')
      parsed = JSON.parse(clean.slice(start, end + 1))
    } catch (e) {
      console.error('[event-interview] Failed to parse Claude response:', txt.slice(0, 500))
      throw new Error('Claude returned invalid JSON: ' + (e as Error).message)
    }

    const result = {
      question: parsed.question ?? null,
      done: parsed.done ?? false,
      extracted: parsed.extracted ?? [],
      event: parsed.event ?? null,
    }

    console.log(`[event-interview] turn done=${result.done} extracted=${(result.extracted as unknown[]).length} event=${result.event ? 'yes' : 'null'}`)

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = (err as Error).message
    console.error(`[event-interview] Unhandled error: ${message}`)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
