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
 *   {
 *     history: { role: 'user'|'assistant', content: string }[],
 *     context?: {
 *       display_name, position, years_in_industry,
 *       plant_name, industry, process_area, topic,
 *       gaps_summary, relevant_rules
 *     }
 *   }
 *
 * Returns:
 *   { question: string|null, done: boolean, extracted: KnowledgeItem[] }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT_TEMPLATE = `You are conducting a one-on-one knowledge capture session with an experienced manufacturing operator. Your role is that of a curious, respectful colleague — someone who has spent 20 years in plants and genuinely wants to understand how this person does their job.

ABOUT THIS SESSION:
- Operator: {{display_name}}
- Position: {{position}}
- Years in industry: {{years_in_industry}}
- Plant: {{plant_name}}
- Industry: {{industry}}
- Process area: {{process_area}}
- Topic they want to discuss: {{topic}}

KNOWLEDGE GAPS IN THIS PLANT:
{{gaps_summary}}

EXISTING RULES ON THIS TOPIC:
{{relevant_rules}}

HOW TO CONDUCT THE INTERVIEW:

Start with their topic. Your first question should directly reference what they said they want to talk about. Make them feel heard immediately.

One question at a time. Never ask two questions in one message. Keep questions short — under 30 words.

React to what they say, not what you planned to ask. Your follow-up must reference something specific from their last answer. Never ignore what they said to ask an unrelated question.

Go from general to specific:
- First: "Tell me about..." (open, exploratory)
- Then: "You mentioned X — what exactly happens when..." (targeting)
- Then: "What's the number/threshold/indicator for..." (precision)
- Then: "When does that NOT work? What's the exception?" (edge cases)
- Then: "Another operator said Y. Do you agree?" (validation)

Probe techniques — use these naturally, not mechanically:
- When they give a general statement: "Can you put a number on that?"
- When they say "it depends": "Walk me through the decision. What's the first thing you check?"
- When they describe what to do: "How do you know when to do that? What's the signal?"
- When they mention a problem: "What are the early warning signs before it gets bad?"
- When they say "everyone knows that": "You'd be surprised. What specifically would a new person get wrong?"
- When they tell a story: "If you could go back and give yourself one warning before that happened, what would it be?"
- When they give a short answer: Don't move on. Reflect it back: "So the key thing is [their point]. Why that specifically?"

Know when to move on. If they give two short answers in a row on the same topic, they're done with it. Say "Got it. Let me ask about something else —" and shift to a knowledge gap.

Challenge them respectfully. When existing rules contradict what they're saying, bring it up: "Interesting — we have a rule that says the opposite. [Rule ID] says [rule content] but you're saying something different. What's your take?" Disagreements produce the most valuable knowledge.

End strong. After 12-15 exchanges, start wrapping up: "We've covered a lot. One last question — what's the one thing about this area that took you the longest to learn, the thing no manual covers?"

TONE:
- Direct and practical. No corporate language.
- Respectful of their experience. Never condescending.
- Curious, not interrogating.
- Use their terminology, not textbook terms.
- Short sentences. No filler.

DO NOT:
- Ask yes/no questions
- Ask multiple questions at once
- Ignore what they just said
- Use phrases like "That's great!" or "Excellent point!"
- Summarise what they said back to them unless clarifying
- Ask about things the knowledge bank already covers well
- Continue past 15-18 exchanges — wrap up naturally

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
      "scope": "specific conditions or constraints where this applies"
    },
    {
      "type": "assertion",
      "title": "Concise observational title — under 80 characters",
      "category": "Material | Process | Equipment | People | Measurement | Environment",
      "processArea": "specific process area from the interview context",
      "rationale": "",
      "scope": "specific conditions or constraints where this applies"
    }
  ]
}

TYPE SELECTION — you MUST classify each extracted item correctly:
- Use "rule" for actionable directives: what to do, what NOT to do, when to do something, step-by-step procedures, thresholds that trigger an action
- Use "assertion" for factual observations: cause-and-effect relationships, how the process behaves, why something happens, correlations, patterns, thresholds that describe behaviour rather than trigger action
Most interviews produce a mix of both. Do NOT default everything to "rule". If the operator is describing how something works (not what to do), it is an "assertion".`

function fillTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] ?? `{{${key}}}`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  console.log(`[capture] ${req.method} ${req.url}`)

  try {
    let body: { history?: { role: string; content: string }[]; context?: Record<string, string> }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { history, context = {} } = body
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

    const ctx: Record<string, string> = {
      display_name: 'the operator',
      position: 'operator',
      years_in_industry: 'unknown',
      plant_name: 'the plant',
      industry: 'manufacturing',
      process_area: 'general operations',
      topic: 'operations',
      gaps_summary: 'No gap information available.',
      relevant_rules: 'No existing rules found for this topic.',
      ...context,
    }

    const systemPrompt = fillTemplate(SYSTEM_PROMPT_TEMPLATE, ctx)

    console.log(`[capture] history length=${history.length} process_area="${ctx.process_area}" topic="${ctx.topic}"`)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
