# Knowledge Card Data Architecture v0

Status: draft for iteration  
Date: 2026-05-26

## MVP

1. Ingest documents.
2. Extract operational knowledge and where it applies.
3. Produce source-backed knowledge cards people can search, discuss, verify, and use.

Users do not need to see "rules" or "assertions." The user-facing object is a
**knowledge card**.

## Current Design Stance

### Keep

- Persisted `knowledge_cards`.
- Document versions and extraction runs.
- Document chunks as processing/provenance artifacts.
- Extraction candidates as pre-card AI output.
- Candidate contexts as pre-card context resolution output.
- Comments, questions, answers, and lightweight review signals for SME discovery.
- Simple `admin` gating for internal-only features.

### Simplify

- No in-depth customer roles yet. Single customer, broad access.
- No complex context-resolution workflow yet.
- No heavy review workflow yet.
- No assumption that ingestion completes in one Edge Function call.

## Confidence Map

### High Confidence

| Decision | Why |
| --- | --- |
| Store source documents in object storage, not Postgres blobs. | Standard separation of file storage from relational metadata. |
| Keep immutable `document_versions`. | Needed for auditability, re-ingestion, and source trust. |
| Track `extraction_runs`. | We need to know which model/prompt/schema produced which output. |
| Keep `extraction_candidates` separate from `knowledge_cards`. | AI output should not become product knowledge without a boundary. |
| Persist `knowledge_cards`. | Cards need stable identity for citations, comments, status, SME signals, and versions. |
| Link cards to exact `source_spans`. | Source-backed trust is central to the product. |
| Separate context entities from knowledge content. | Plants, lines, equipment, products, and materials are stable nouns; cards are contestable claims. |
| Design ingestion as resumable async work. | Real documents, OCR, rate limits, and chunked LLM calls make one-shot ingestion risky. |

### Medium Confidence

| Decision | Why |
| --- | --- |
| Use one flexible `context_entities` table. | Good MVP hedge, but some entity types may later deserve dedicated tables. |
| Store `document_chunks`. | Useful for extraction/search/retry, though exact chunk strategy will evolve. |
| Keep `extraction_candidate_contexts`. | Context staging seems important, but the review UX is still unknown. |
| Use `candidate_kind` / `card_kind`. | Type hints help extraction/rendering, but the exact enum is provisional. |
| Use fields like `rationale`, `conditions`, `consequence`, `procedure_steps`. | They cover common knowledge shapes, but real cards will teach us which fields matter. |
| Use `confidence` as a stored field. | Useful now, but may later become computed from sources, reviews, and SME signals. |
| Keep `knowledge_card_relationships`. | Contradiction/supersession will matter, but graph UX can wait. |
| Use pgvector in Supabase for MVP. | Likely enough for early scale, but retrieval architecture may evolve. |

### Low Confidence / Experimental

| Decision | Why |
| --- | --- |
| Exact `candidate_kind` values. | We need real documents before trusting the taxonomy. |
| Exact `card_kind` values. | Same concern as candidate types; keep loose. |
| `card_marks` mark types. | User behavior will determine whether marks should be votes, reviews, reactions, or something else. |
| SME scoring weights. | We know we need signals, not the right scoring formula yet. |
| Context relationship types. | Useful eventually, but early customers may not need formal graph semantics. |
| Exact status lifecycle. | Proposed/verified/challenged/retired is plausible, but product behavior should shape it. |
| Whether question answers should directly become candidates/cards. | Likely useful, but needs UX validation. |

## 1. Data Architecture

| Layer | Stores | Notes |
| --- | --- | --- |
| Object storage | Original files, OCR output, rendered pages, attachments, data snapshots | Supabase Storage for MVP; S3-compatible later |
| Postgres | Canonical relational data | Source of truth |
| Full-text search | Keyword search over cards and chunks | Exact equipment IDs, products, lines, defect names |
| Vector search | Embeddings for cards and chunks | Semantic retrieval |
| Edge functions / workers | Ingestion, extraction, embedding, query answering | Start with Edge Functions; design so we can move long jobs to workers |

Storage path:

```text
orgs/{org_id}/plants/{plant_id}/documents/{document_id}/versions/{document_version_id}/{filename}
```

Retrieval flow:

```text
question -> context filter -> full-text card search + vector card search
         -> optional chunk search -> rerank -> answer with card/source citations
```

## 2. Data Model

### Access

For MVP, keep access simple.

| Table | Why it exists | Key fields |
| --- | --- | --- |
| `organisations` | Groups all data for the customer. | `id`, `name`, `created_at` |
| `plants` | Scopes all operational knowledge to a specific manufacturing site. | `id`, `org_id`, `name`, `short_code`, `industry` |
| `profiles` | Stores user identity, display name, and simple admin/internal gates. | `id`, `user_id`, `display_name`, `is_admin`, `is_internal`, `created_at` |

Assumption:

- Everyone in the customer environment can access everything for that plant.
- `is_admin` gates destructive actions and internal-only tools.
- `is_internal` can gate MD1-only debug/admin functionality if needed.
- Defer plant-level roles until there is a real customer need.

### Context

Use one flexible table for plant nouns instead of separate MVP tables for
lines, equipment, products, materials, etc.

| Table | Why it exists | Key fields |
| --- | --- | --- |
| `context_entities` | Captures stable plant nouns that knowledge applies to. | `id`, `org_id`, `plant_id`, `entity_type`, `name`, `canonical_key`, `aliases`, `parent_id`, `metadata`, `active` |
| `context_entity_relationships` | Captures relationships between plant nouns when hierarchy alone is not enough. | `id`, `source_entity_id`, `target_entity_id`, `relationship_type` |

Initial `entity_type` values:

- `process_area`
- `line`
- `equipment`
- `product`
- `material`
- `supplier`
- `defect_type`

Example:

| entity_type | name | parent |
| --- | --- | --- |
| process_area | Bodymaking | Plant |
| line | Line 3 | Bodymaking |
| equipment | Bodymaker 3A | Line 3 |
| product | 12 oz Sleek Can | Plant |
| material | Coil stock 3104-H19 | Plant |

### Documents And Provenance

| Table | Why it exists | Key fields |
| --- | --- | --- |
| `source_documents` | Represents the logical source a user uploaded, even if the file changes over time. | `id`, `plant_id`, `uploaded_by`, `title`, `document_type`, `default_context_entity_id`, `current_version_id`, `status` |
| `document_versions` | Preserves immutable file history and points to the actual stored file. | `id`, `document_id`, `version_num`, `storage_bucket`, `storage_path`, `original_filename`, `mime_type`, `file_size_bytes`, `content_hash`, `page_count` |
| `document_chunks` | Stores bounded extraction/search units for large documents and retryable processing. | `id`, `document_version_id`, `chunk_index`, `start_page`, `end_page`, `char_start`, `char_end`, `text`, `content_hash` |
| `source_spans` | Points to the exact excerpt supporting a candidate or card. | `id`, `document_version_id`, `document_chunk_id`, `page_start`, `page_end`, `char_start`, `char_end`, `excerpt` |

Rule: never overwrite a document version. New file means a new
`document_versions` row. Cards cite `source_spans`, not just whole documents.

Storage pointer rule: `source_documents` does not point directly to Supabase
Storage. It points to the current immutable `document_versions` row, and that
version stores `storage_bucket` + `storage_path`.

## 3. Extraction Model

| Table | Why it exists | Key fields |
| --- | --- | --- |
| `extraction_runs` | Records exactly how a document version was processed. | `id`, `document_version_id`, `requested_by`, `status`, `pipeline_version`, `prompt_version`, `schema_version`, `model_provider`, `model_name`, `started_at`, `finished_at`, `error`, `metadata` |
| `extraction_candidates` | Holds AI-proposed card content before it becomes trusted product data. | `id`, `extraction_run_id`, `document_version_id`, `candidate_kind`, `title`, `statement`, `rationale`, `conditions`, `consequence`, `procedure_steps`, `confidence`, `status`, `source_span_id`, `raw_model_output`, `reviewed_by`, `reviewed_at`, `promoted_card_id` |
| `extraction_candidate_contexts` | Holds AI-proposed context links before they become trusted card context. | `id`, `candidate_id`, `raw_text`, `entity_type`, `context_entity_id`, `role`, `confidence`, `needs_review`, `created_at` |

### What are extraction candidates?

Extraction candidates are the LLM's proposed cards before we trust them.

They exist so we can:

- Keep AI output separate from approved product content.
- Show a review/edit queue.
- Reject low-quality extractions without losing run history.
- Merge duplicate or overlapping candidates into one existing card.
- Re-run extraction later and compare old/new output.
- Debug what the model actually produced.

If we skipped candidates and wrote straight to `knowledge_cards`, every
extraction mistake would become product data immediately. That is the wrong
default for a source-of-truth product.

Candidate-to-card cardinality is many-to-one. Multiple candidates can point to
the same promoted card because several chunks, documents, or extraction runs may
surface the same operational knowledge. The candidate's `promoted_card_id`
records the disposition of that model output; card provenance comes from
`knowledge_card_sources`, not from a single source candidate.

### Why `extraction_candidate_contexts`?

Context is important enough to stage explicitly. A card saying "inspect the
decorator" is much less useful if we cannot tell whether that means Line 2,
Line 3, all decorators, or a specific registration camera.

Candidate contexts let us:

- Review extracted context before it becomes trusted card context.
- Handle ambiguous mentions without cramming workflow into JSON.
- Promote only accepted context links into `knowledge_card_contexts`.
- Track raw text from the source separately from the resolved entity.
- Ask better SME questions: "Who knows this line/equipment/product?"

Keep the workflow simple:

- `context_entity_id` present means we have a proposed resolution.
- `context_entity_id` null means unresolved.
- `needs_review` flags ambiguity or low confidence.
- Do not build a complex resolution queue until real usage demands it.

### Do we need `candidate_kind`?

Weak yes, but keep it simple.

`candidate_kind` helps the extractor and UI distinguish a procedure from a
warning from a general fact. That matters because a procedure needs steps, while
a warning may need consequence and conditions.

Initial values:

- `guidance`
- `fact`
- `procedure`
- `warning`
- `parameter`
- `event_learning`

If this feels too heavy in implementation, make it nullable and default to
`guidance`. Do not build complex UX around it yet.

Confidence level: medium. The exact enum will change as we learn from real
documents. The durable decision is not the specific labels; it is keeping a
small type hint so procedures, warnings, parameters, and factual observations do
not all have to pretend to be the same shape.

## 4. Knowledge Card Model

| Table | Why it exists | Key fields |
| --- | --- | --- |
| `knowledge_cards` | Stores the curated operational claim users actually interact with. | `id`, `display_id`, `plant_id`, `card_kind`, `title`, `statement`, `rationale`, `conditions`, `consequence`, `procedure_steps`, `status`, `confidence`, `created_by`, `current_version_id`, `archived_at` |
| `knowledge_card_versions` | Preserves how a card changed after extraction and human edits. | `id`, `card_id`, `version_num`, `snapshot`, `change_note`, `changed_by`, `created_at` |
| `knowledge_card_contexts` | Normalizes where a card applies so cards can be filtered and retrieved by plant context. | `id`, `card_id`, `context_entity_id`, `role`, `confidence`, `source_span_id` |
| `knowledge_card_sources` | Links curated card content back to exact supporting evidence. | `id`, `card_id`, `source_span_id`, `relationship_type` |
| `knowledge_card_relationships` | Captures links between cards, including contradictions and supersession. | `id`, `source_card_id`, `target_card_id`, `relationship_type`, `weight`, `auto_generated`, `comment`, `created_by` |

Card statuses:

- `proposed`
- `verified`
- `challenged`
- `superseded`
- `retired`

### Why persist knowledge cards?

This is the most important modeling decision.

We should persist cards because a card is not just a rendering of source data.
It is the reviewed, user-facing unit of knowledge.

Persisted cards give us:

- Stable IDs for citations, comments, questions, votes, and SME signals.
- A place to store human edits and judgment.
- A version history independent of source document versions.
- Fast search over curated knowledge instead of raw chunks.
- A way to merge multiple source spans into one accepted card.
- A way to challenge, verify, supersede, or retire knowledge.

If cards are built only at the server layer from source data, then comments,
reviews, citations, accepted answers, and SME history have no stable object to
attach to. We would end up reinventing a persisted card identity indirectly.

There is some duplication: card text may summarize source text. That is
intentional. The card is the curated operational claim; the source span is the
evidence.

### Source data vs card data

There are three layers:

1. `source_spans` are evidence. They preserve what the document literally said.
2. `extraction_candidates` are interpretation. They are the model's proposed
   structured claim from one or more source spans.
3. `knowledge_cards` are curated product knowledge. They are the accepted,
   editable, social object users interact with.

Promotion copies candidate fields into a card:

```text
extraction_candidate
  -> knowledge_card
  -> knowledge_card_sources
  -> knowledge_card_contexts
  -> knowledge_card_versions
```

Multiple candidates can promote or merge into the same card:

```text
candidate A ┐
candidate B ├─> knowledge_card KC-001
candidate C ┘
```

That happens when the same knowledge appears in multiple source chunks,
multiple documents, or later re-ingestion runs. The card is the consolidated
current claim; the candidates remain the audit trail of what the model found.

The copied fields are not accidental duplication. They are the accepted wording
of the operational claim at the moment of promotion. After promotion, the card
can diverge from the candidate because humans can edit, clarify, merge, verify,
or challenge it.

The source span remains the evidence. The candidate remains the extraction audit
trail. The card becomes the current product-facing knowledge record.

Intentional duplication:

- Card `statement` may paraphrase source text.
- Card versions snapshot card state for audit.
- Search vectors and embeddings duplicate card/chunk text as rebuildable indexes.

Avoided duplication:

- Do not create a separate hidden "facts" table beneath cards for MVP.
- Do not store UI layout/components in the card table.
- Do not mutate cards automatically when a source is re-ingested; create review
  suggestions instead.

### Confidence in the card schema

Confidence level: medium-high for the backbone, medium-low for the exact fields.

The stable backbone is:

- A card needs one core `statement`.
- A card needs structured context links.
- A card needs source links.
- A card needs trust/lifecycle metadata.
- A card needs comments/marks/questions to support social learning and SME
  discovery.

The exact content fields are intentionally conservative:

- `statement` is required because every card must say one thing.
- `conditions` is important, but some applicability will live in
  `knowledge_card_contexts`.
- `confidence` is useful as current trust metadata, even if later computed.
- `rationale`, `consequence`, and `procedure_steps` are nullable because not
  every card is causal, risk-oriented, or procedural.

This schema should be treated as a minimum useful envelope, not a final ontology
of knowledge. If real cards do not use a field, drop it. If a field becomes more
important than expected, promote it into stronger UI and validation.

## 5. Social, Questions, And SME Discovery

Keep this lightweight. The goal is not a full review system yet. The goal is to
capture enough interaction data to learn user behavior and answer "Who knows
about this?"

| Table | Why it exists | Key fields |
| --- | --- | --- |
| `card_comments` | Captures discussion and corrections around a card. | `id`, `card_id`, `parent_id`, `body`, `created_by`, `created_at`, `updated_at` |
| `card_marks` | Captures lightweight user judgment without a heavy review workflow. | `id`, `card_id`, `user_id`, `mark_type`, `note`, `created_at` |
| `questions` | Gives users a place to ask what the knowledge base does not yet answer. | `id`, `plant_id`, `asked_by`, `title`, `body`, `status`, `created_at`, `updated_at` |
| `question_contexts` | Connects open questions to equipment, lines, products, and other context. | `id`, `question_id`, `context_entity_id`, `role` |
| `answers` | Captures SME/user responses that may later become cards. | `id`, `question_id`, `parent_id`, `body`, `answered_by`, `accepted`, `created_at`, `updated_at` |
| `user_topic_signals` | Materializes activity into ranked evidence of who knows a topic. | `id`, `user_id`, `plant_id`, `context_entity_id`, `topic_key`, `signal_type`, `signal_weight`, `source_type`, `source_id`, `created_at` |

Initial `card_marks.mark_type`:

- `verified`
- `challenged`
- `useful`
- `seen_in_practice`

This replaces a heavier `card_reviews` + `card_reactions` split for now.

SME signal examples:

| Signal | Meaning | Weight |
| --- | --- | --- |
| `created_card` | User created or promoted a card | Medium |
| `verified_card` | User verified from experience | High |
| `answered_question` | User answered a related question | High |
| `accepted_answer` | Their answer was accepted | Very high |
| `commented` | User discussed the topic | Low |
| `challenged_card` | User challenged accuracy | Medium |

SME ranking should combine:

- Activity on matching context entities.
- Activity on related context entities.
- Accepted answers.
- Verified cards.
- Recency.
- Agreement from others.
- Explicit profile SME tags later, if we add them.

Example:

```text
Best SME for "Line 3 decorator registration"
  = users with strong signals on:
    - Line 3
    - decorator equipment
    - registration / misalignment topic terms
    - accepted answers or verified cards in those areas
```

## 6. Search

| Table | Why it exists | Key fields |
| --- | --- | --- |
| `embeddings` | Stores rebuildable vector indexes for semantic retrieval. | `id`, `target_type`, `target_id`, `embedding_model`, `embedding_dimension`, `embedding`, `content_text`, `content_hash` |

Embedding targets:

- `knowledge_card`
- `document_chunk`

Full-text search should index:

- Card title, statement, rationale, conditions, consequence.
- Context entity names and aliases.
- Document chunk text.
- Source document title.

## 7. Ingestion Pipeline

1. Upload file to object storage.
2. Create `source_documents` and immutable `document_versions`.
3. Extract text into `document_chunks`.
4. Create `extraction_runs` with pipeline/prompt/schema/model versions.
5. Run extraction over chunks.
6. Create `source_spans`, `extraction_candidates`, and `extraction_candidate_contexts`.
7. Resolve or flag extracted context links.
8. User or admin approves, edits, rejects, merges, or asks an SME.
9. Promotion creates or updates cards, versions, source links, context links, relationships, and SME signals.
10. Generate full-text search vectors and embeddings.

Promotion outcomes:

- New knowledge card.
- New version of existing card.
- New source support for existing card.
- Duplicate rejected.
- Possible contradiction relationship.
- SME input requested.

## 8. Edge Function Feasibility

We should not assume ingestion completes in one Edge Function call.

Small documents may work in one call. Larger PDFs, OCR, model rate limits, or
multi-step extraction may not.

MVP-safe design:

- Edge Function starts an ingestion run.
- Work is chunked.
- Progress is stored on `extraction_runs`.
- Each chunk can be retried.
- Function can self-chain or be resumed by a watchdog/poller.
- UI shows `queued`, `extracting`, `needs_review`, `failed`.

We can confirm practical limits by testing against representative customer
documents. Until then, design for resumable async ingestion rather than
one-shot ingestion.

## 9. Re-Ingestion / Schema Changes

Never overwrite:

- source files
- document versions
- extraction runs
- knowledge card versions

If we add a field later, such as `risk_level`:

1. Increment `schema_version`.
2. Re-run extraction against the same `document_version_id`.
3. Create a new `extraction_run`.
4. Compare new candidates to existing cards.
5. Queue suggested changes for review.

Re-ingestion outcomes:

- `new_card_candidate`
- `duplicate_of_existing_card`
- `new_source_for_existing_card`
- `suggested_update_to_existing_card`
- `possible_contradiction`
- `suggested_supersession`

Matching signals:

- Same or overlapping source span.
- Similar statement.
- Same card kind.
- Same context entities.
- Similar embedding.
- Same numeric values.
- Same equipment, product, material, or line identifiers.

Do not silently mutate trusted cards from re-ingestion. Create review work.

## 10. Build Now / Defer

Build now:

- Simple user/admin access.
- Document storage and immutable versions.
- Text chunks and source spans.
- Extraction runs and candidates.
- Candidate context staging.
- Flexible context entities.
- Persisted knowledge cards.
- Card context and source links.
- Comments, marks, questions, answers.
- SME signal tracking.
- Full-text and vector search.
- Resumable ingestion.

Defer:

- Granular customer roles.
- Formal context resolution workflow.
- Heavy review workflow.
- User-facing rules/assertions.
- Full graph database.
- Complex ontology admin.
- Automated card mutation from re-ingestion.

## Core Model

```text
documents
  -> chunks
  -> extraction candidates
  -> reviewed knowledge cards
  -> context + sources + discussion + SME signals
```
