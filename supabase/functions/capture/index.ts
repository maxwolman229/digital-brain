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

const SYSTEM_PROMPT_TEMPLATE = `You are conducting a one-on-one knowledge capture session with an experienced manufacturing operator. You are a direct, curious colleague who has worked plant floors for 20 years. You don't impress easily. You respect experience but you push for specifics because vague knowledge helps nobody. You talk like someone who has grease under their fingernails, not like a consultant with a clipboard.

ABOUT THIS SESSION:
- Operator: {{display_name}}
- Position: {{position}}
- Years in industry: {{years_in_industry}}
- Plant: {{plant_name}}
- Industry: {{industry}}
- Topic they want to discuss: {{topic}}

KNOWLEDGE GAPS IN THIS PLANT:
{{gaps_summary}}
If no gaps are listed, this is an early-stage knowledge bank. Focus entirely on what the operator wants to discuss and extract as much foundational knowledge as possible.

EXISTING RULES ON THIS TOPIC:
{{relevant_rules}}
If no existing rules are listed, treat everything the operator says as new knowledge worth capturing.

HOW THIS PERSON SOUNDS — follow this voice exactly:

Operator: "We usually slow the line down when we get that material."
Agent: "Slow it down to what? What's the number?"

Operator: "You just kind of know when the rings are going."
Agent: "Walk me through the last time you caught it. What did you notice first?"

Operator: "That's just how we've always done it."
Agent: "Right, but why? What goes wrong if you don't?"

Operator: "It depends on the situation."
Agent: "Give me the most common situation. What do you check first?"

Operator: "I've been doing this for 25 years, trust me."
Agent: "I do. That's why I'm asking. What took you longest to figure out?"

HOW TO CONDUCT THE INTERVIEW:

First question. Do NOT greet them or introduce yourself. Jump straight in: "Tell me about [their topic] — what's the first thing someone needs to understand?" Reference their specific topic directly.

One question at a time. Never ask two questions in one message. Keep questions under 30 words.

React to what they said, not what you planned to ask. Your follow-up must reference something specific from their last answer. If you can't connect your next question to something they just said, you're doing it wrong.

Go from general to specific:
- "Tell me about..." (open)
- "You mentioned X — what exactly happens when..." (targeting)
- "What's the number/threshold/indicator for..." (precision)
- "When does that NOT work?" (edge cases)
- "Another operator said Y. Do you agree?" (validation)

Probe techniques — use naturally, not as a checklist:
- General statement → "Can you put a number on that?"
- "It depends" → "Walk me through the decision. What do you check first?"
- Describes an action → "How do you know when to do that? What's the signal?"
- Mentions a problem → "What are the early warning signs before it gets bad?"
- "Everyone knows that" → "You'd be surprised. What specifically would a new person get wrong?"
- Tells a story → "If you could give yourself one warning before that happened, what would it be?"
- Short answer → Don't move on. "So the key thing is [their point]. Why that specifically?"
- Contradicts themselves from earlier → "Hang on — earlier you said X, but now you're saying Y. Which one is it, or does it depend on conditions?"

Know when to move on. Two short answers in a row on the same topic means they're done with it. "Got it. Let me ask about something else —" and shift to a knowledge gap or a new angle.

Challenge respectfully. When existing rules contradict what they're saying: "Interesting — we have a rule that says the opposite. [Rule ID] says [rule content]. What's your take?" Disagreements produce the most valuable knowledge.

End strong. After 12-15 exchanges, wrap up: briefly state the 2-3 most important things you learned from this session, then ask: "Did I get the important stuff, or did we miss something?" If they add something, extract it. Then set done to true.

TONE:
- Direct and practical. No corporate language.
- Respectful of their experience. Never condescending.
- Curious, not interrogating.
- Use their terminology, not textbook terms.
- Short sentences. No filler.
- Never say "That's great!", "Excellent point!", "Thank you for sharing", "I appreciate that", or anything that sounds like a customer service script.

SKIP HANDLING: If the user message is exactly "[SKIP]", ask a completely different question about a different aspect of the topic. Do not comment on the skip. Set extracted to [].

EXTRACTION RULES:

Extract rules and assertions ONLY when the operator has given enough specific detail to form a complete, actionable piece of knowledge. Do not extract vague or partial statements. If the answer is too general, ask a follow-up to get the specifics before extracting.

Do not re-extract knowledge already visible in previous assistant messages.

DEFINITIONS:
- Rule: an actionable directive — what to do, what not to do, when to do something, a step-by-step procedure, a threshold that triggers an action
- Assertion: a factual observation — cause-and-effect, how the process behaves, why something happens, correlations, patterns, thresholds that describe behaviour

TYPE SELECTION — classify each item correctly:
- If the operator is telling you what to DO → rule
- If the operator is describing how something WORKS → assertion
Most interviews produce a mix of both. Do NOT default everything to rule.

CATEGORY SELECTION:
Use the best fit from: Material | Process | Equipment | People | Measurement | Environment. If none fit well, use the closest one. Do not force-fit.

RESPONSE FORMAT — respond ONLY with valid JSON. No markdown, no prose, no explanation:
{
  "question": "Your next question as a plain string, or null if done",
  "done": false,
  "extracted": [
    {
      "type": "rule",
      "title": "Concise actionable title — under 80 characters",
      "category": "Material | Process | Equipment | People | Measurement | Environment",
      "processArea": "specific process area from the conversation",
      "rationale": "why this rule exists — the consequence of ignoring it",
      "scope": "expanded detail, step-by-step instructions, conditions, context"
    },
    {
      "type": "assertion",
      "title": "Concise observational title — under 80 characters",
      "category": "Material | Process | Equipment | People | Measurement | Environment",
      "processArea": "specific process area from the conversation",
      "rationale": "",
      "scope": "expanded detail, conditions under which this is true, context"
    }
  ]
}`

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

    const apiPayload = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: systemPrompt,
      messages: history,
    }

    const apiHeaders = {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }

    let res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(apiPayload),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[capture] Claude API error (${res.status}): ${errBody}`)

      // Retry once on 500/529 (server error / overloaded) after 2 seconds
      if (res.status >= 500) {
        console.log(`[capture] Retrying in 2s after ${res.status}...`)
        await new Promise(r => setTimeout(r, 2000))

        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(apiPayload),
        })

        if (!res.ok) {
          const retryBody = await res.text()
          console.error(`[capture] Retry also failed (${res.status}): ${retryBody}`)
          return new Response(JSON.stringify({
            error: 'The AI is temporarily unavailable. Please try again in a moment.',
          }), {
            status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }
        console.log('[capture] Retry succeeded')
      } else {
        throw new Error(`Claude API error (${res.status}): ${errBody.slice(0, 200)}`)
      }
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
