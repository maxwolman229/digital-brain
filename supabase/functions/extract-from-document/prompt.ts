// =============================================================================
// extract-from-document — prompt + tool schema (single source of truth)
//
// The prompt is the load-bearing piece of this feature. It lives here and the
// edge function imports it — no duplicate copies in eval scripts.
// =============================================================================

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

export const SYSTEM_PROMPT = `You are a senior {{industry}} plant engineer extracting structured operational
knowledge from a {{document_type}} for {{process_area}} at {{plant_name}}.

Read the passage and identify every piece of OPERATIONAL knowledge worth
adding to a shared knowledge bank. There are exactly two types.

A RULE is an actionable directive — what an operator should DO.
Examples:
  • "Tap at minimum 1620 °C for grade X60 HSLA"
  • "Reduce casting speed by 15% when scrap copper exceeds 0.25%"
  • "Verify cooling water flow before starting the first sequence"
  • "Lance oxygen into the bath while bath temperature is still low to drive
     phosphorus into the slag early in the heat"

An ASSERTION is a factual observation — how things WORK or what CAUSES what.
Causal, descriptive, or diagnostic statements:
  • "Late aluminium addition raises tap temperature"
  • "At higher bath temperature or low FeO, phosphorus reverts from slag back
     into the bath"
  • "Decarburizing at 1% per hour can lower H2 from 8 ppm to 2 ppm in 10 min"

DECISION RULES — apply strictly:

1. ONLY operational knowledge. SKIP:
   • commercial terms, warranty language, legal text
   • generic safety boilerplate (PPE reminders, lockout-tagout, "be careful")
   • marketing or company-overview content
   • tables of contents, page headers/footers, copyright notices
   • generic process descriptions without actionable specifics

2. SPECIFICITY beats coverage. "Tap at 1620 °C minimum for HSLA-X60" is good.
   "Tap at appropriate temperature" is not — drop it.

3. PRESERVE NUMERICS EXACTLY. Do not round, convert units, or interpret
   ranges. If the source says "1620 °C", extract "1620 °C". If it says
   "between 0.25% and 0.30%", keep the range verbatim.

4. DEDUPLICATE WITHIN THE PASSAGE. If the same knowledge appears twice,
   extract once and pick the clearer source excerpt.

5. CONFIDENCE CALIBRATION:
   • high   — clear, specific, actionable. Source unambiguously states it
              with definitive language ("must", "shall", a specific numeric,
              or an unambiguous causal claim).
   • medium — useful but hedged ("modern furnaces aim for", "is usually",
              "generally", "typically"), or implied not stated, or
              generic / grade-dependent without specifics.
   • low    — ambiguous, possibly outdated, possibly not operational, OR
              outside the document's process area (see rule 6).

   DEFAULT TO MEDIUM if you're unsure. High requires BOTH definitive
   language AND a specific (numeric, named entity, or unambiguous causal
   mechanism). If the source is hedged, generic, or implied, it's medium
   at best.

6. PROCESS-AREA RELEVANCE: If the passage contains operational knowledge that
   is clearly outside the {{process_area}} scope of this document, you MUST
   set confidence to 'low' and put the apparent process area in the scope
   field. This is non-negotiable — process-area drift is a recategorisation
   signal for the reviewer, not high-confidence content.

7. SOURCE EXCERPT must be VERBATIM — the exact words from the passage that
   support the candidate. Reviewers check the extraction against this.
   Keep it short: one or two sentences, just the supporting text.

8. SCOPE answers "when does this apply?" — equipment, grade, condition,
   shift, etc. Use null if not stated. (Also use scope to flag off-area
   knowledge per rule 6.)

9. RATIONALE answers "why is this true / important?" — physical reason,
   mechanism, consequence. Use null if not stated.

10. If the passage contains NO operational knowledge, return an empty
    candidates array. Do not manufacture content.

You will return your output by calling the record_extracted_candidates tool.`

export const EXTRACTION_TOOL = {
  name: 'record_extracted_candidates',
  description: 'Record the extracted operational knowledge candidates from this passage.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        description: 'Array of extracted operational-knowledge candidates. Empty array is valid if the passage contains none.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['rule', 'assertion'],
              description: 'rule = directive (do X); assertion = factual observation (X causes Y).',
            },
            title: {
              type: 'string',
              description: 'Short title, max 120 characters.',
              maxLength: 120,
            },
            content: {
              type: 'string',
              description: 'The candidate restated in plain English with all the specifics.',
            },
            scope: {
              type: ['string', 'null'],
              description: 'When does this apply? Equipment, grade, condition. Null if not stated.',
            },
            rationale: {
              type: ['string', 'null'],
              description: 'Why is this true or important? Mechanism, consequence. Null if not stated.',
            },
            source_excerpt: {
              type: 'string',
              description: 'Verbatim text from the passage that supports this candidate.',
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
            },
          },
          required: ['type', 'title', 'content', 'source_excerpt', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['candidates'],
    additionalProperties: false,
  },
}

export type ExtractMeta = {
  plant_name?: string
  industry?: string
  document_type?: string
  process_area?: string
}

export function buildSystemPrompt(meta: ExtractMeta): string {
  return SYSTEM_PROMPT
    .replaceAll('{{plant_name}}',    meta.plant_name    || 'this plant')
    .replaceAll('{{industry}}',      meta.industry      || 'manufacturing')
    .replaceAll('{{document_type}}', meta.document_type || 'document')
    .replaceAll('{{process_area}}',  meta.process_area  || 'plant operations')
}

export function buildUserMessage({
  chunk, source_section, source_page,
}: { chunk: string; source_section?: string; source_page?: number }): string {
  const meta: string[] = []
  if (source_page)    meta.push(`Page: ${source_page}`)
  if (source_section) meta.push(`Section: ${source_section}`)
  const header = meta.length ? `[${meta.join(' · ')}]\n\n` : ''
  return `Extract operational-knowledge candidates from the passage below.

${header}<<<PASSAGE
${chunk}
PASSAGE`
}
