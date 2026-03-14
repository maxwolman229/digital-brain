# MD1 Knowledge Bank

## Project overview
A knowledge management platform for manufacturing plants that captures,
structures, and governs operational knowledge from experienced workers.
The tagline: "The operational brain that never retires."

## Current state
- prototype.html contains the full working React prototype (single file,
  in-memory state, no persistence, no auth)
- Need to migrate to production stack while preserving all features and styling

## Tech stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Supabase (Postgres, Auth, Edge Functions, Row Level Security)
- Deployment: Vercel
- AI: Claude API via Supabase Edge Functions (keep API key server-side only)
- Fonts: IBM Plex Sans + IBM Plex Mono (Google Fonts)

## Supabase connection
- Credentials in .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

## Design system
- Primary navy: #062044
- Background: #f4f1ed (warm off-white)
- Border/muted: #D8CEC3
- Accent teal: #4FA89A
- Text: #1F1F1F
- Muted text: #8a8278, #b0a898
- Font heading: 'IBM Plex Sans', weight 700-900
- Font mono: 'IBM Plex Mono'
- Status colors: Proposed=#D8CEC3, Active=#b8e0d8, Verified=#4FA89A, Established=#2d6b5e (white text)
- Minimal border radius (2-4px), no heavy shadows, industrial aesthetic

## Database schema

### organisations
id (uuid pk), name (text), created_at (timestamptz)

### plants
id (uuid pk), org_id (uuid fk→organisations), name (text), process_areas (text[]), created_at (timestamptz)

### profiles
id (uuid pk), user_id (uuid fk→auth.users), display_name (text), role (text), plant_id (uuid fk→plants), org_id (uuid fk→organisations), created_at (timestamptz)

### rules
id (text pk, e.g. "R-001"), plant_id (uuid fk→plants), title (text), category (text), process_area (text), scope (text), rationale (text), status (text), confidence (text), created_by (text), created_at (timestamptz), updated_at (timestamptz)

### assertions
id (text pk, e.g. "A-001"), plant_id (uuid fk→plants), title (text), category (text), process_area (text), scope (text), status (text), confidence (text), created_by (text), created_at (timestamptz), updated_at (timestamptz)

### events
id (text pk, e.g. "E-001"), plant_id (uuid fk→plants), title (text), date (date), process_area (text), outcome (text), impact (text), root_cause (jsonb), description (text), reported_by (text), tags (text[]), tagged_people (text[]), created_at (timestamptz)

### questions
id (text pk, e.g. "Q-001"), plant_id (uuid fk→plants), question (text), detail (text), process_area (text), status (text), asked_by (text), tagged_people (text[]), created_at (timestamptz)

### responses
id (uuid pk), question_id (text fk→questions), text (text), by (text), parent_id (uuid fk→responses, nullable), created_at (timestamptz)

### comments
id (uuid pk), target_type (text: 'rule'|'assertion'|'event'), target_id (text), text (text), by (text), created_at (timestamptz)

### verifications
id (uuid pk), target_type (text: 'rule'|'assertion'), target_id (text), verified_by (text), created_at (timestamptz)

### links
id (uuid pk), source_type (text), source_id (text), target_type (text), target_id (text), relationship_type (text default 'relates_to'), weight (float default 1.0), auto_generated (boolean default false), comment (text), created_by (text), created_at (timestamptz)

### notifications
id (uuid pk), user_id (uuid fk→auth.users), text (text), read (boolean default false), target_view (text), target_id (text), created_at (timestamptz)

### evidence
id (uuid pk), parent_type (text: 'rule'|'assertion'), parent_id (text), type (text), text (text), date (date), source (text)

### versions
id (uuid pk), target_type (text), target_id (text), version_num (int), date (timestamptz), author (text), change_note (text), snapshot_title (text)

### embeddings
id (uuid pk), target_type (text: 'rule'|'assertion'|'event'|'question'), target_id (text), embedding (vector(1536)), content_text (text), content_hash (text), created_at (timestamptz), updated_at (timestamptz)

Note: Enable pgvector extension in Supabase (Extensions → vector → Enable).
Add a tsvector column called `search_vector` to rules, assertions, events, and questions tables for full-text search. Create a GIN index on each search_vector column and an ivfflat or hnsw index on the embeddings table.

## Hybrid search architecture (AI Query Engine)

The query engine uses hybrid search: vector similarity + full-text keyword search combined via reciprocal rank fusion (RRF).

### Flow
1. Operator types a question in the Query tab
2. Frontend calls the Supabase Edge Function `query`
3. Edge function:
   a. Embeds the question using Anthropic's embedding model (or OpenAI ada-002)
   b. Runs TWO searches in parallel:
      - **Vector search**: cosine similarity against embeddings table, returns top 20 matches
      - **Full-text search**: ts_rank against search_vector columns, returns top 20 matches
   c. Combines results using Reciprocal Rank Fusion:
      - RRF score = 1/(k + rank_vector) + 1/(k + rank_fulltext), where k=60
      - Items appearing in both result sets get boosted
   d. Takes top 10-15 combined results
   e. Sends those items as context to Claude API with the operator's question
   f. Claude returns answer citing specific rule/assertion IDs
4. Frontend displays the answer with clickable citations

### Embedding generation
- When a rule/assertion/event/question is created or updated, an Edge Function
  generates and stores its embedding
- The content_text field stores the text that was embedded (title + rationale + scope + category)
- The content_hash field detects when re-embedding is needed (md5 of content_text)
- Batch re-embedding function for initial seed data

### Full-text search setup
- search_vector column on rules: to_tsvector('english', title || ' ' || coalesce(rationale,'') || ' ' || coalesce(scope,'') || ' ' || category || ' ' || process_area)
- Auto-updated via trigger on insert/update
- Query uses plainto_tsquery or websearch_to_tsquery for operator-friendly input

### Why hybrid
- Vector alone misses exact terminology (grade names, equipment IDs, rule numbers)
- Full-text alone misses semantic meaning ("dirty scrap" won't match "contaminated charge materials")
- RRF combination outperforms either method alone with zero tuning required

## Knowledge graph (future — design for it now)

The links table already captures explicit relationships between rules, assertions, events, and questions. This is the foundation of a full knowledge graph. Design decisions now should make it easy to layer in graph querying later.

### Current state (links table)
The links table stores typed, directed edges:
- source_type + source_id → target_type + target_id
- Each link has an optional comment and creator
- This already supports: rule→assertion, rule→rule, assertion→event, etc.

### Graph-ready schema additions
Add these columns to the links table for future graph traversal:
- relationship_type (text): e.g. 'supports', 'contradicts', 'derived_from', 'supersedes', 'relates_to', 'caused_by', 'mitigates'
- weight (float, default 1.0): strength of relationship, can be auto-calculated from co-occurrence, shared evidence, or user reinforcement
- auto_generated (boolean, default false): distinguishes human-created links from system-inferred links

### Future graph capabilities (do NOT build yet, but design schema to support)
- **Graph traversal queries**: "Show me everything connected to R-003 within 2 hops"
- **Auto-link inference**: When a new rule is added, use embeddings to suggest related items and auto-create weak links (auto_generated=true, low weight)
- **Causal chains**: Follow relationship_type='caused_by' edges to trace root causes across events→assertions→rules
- **Knowledge clusters**: Community detection to identify tightly connected knowledge areas that may represent a single domain expert's knowledge (risk if they leave)
- **Impact analysis**: "If we change R-005, what else is affected?" — traverse all outgoing edges recursively
- **Apache AGE**: Supabase runs Postgres, which supports Apache AGE (a graph extension for Postgres). When ready, enable AGE and query the links table as a graph using openCypher syntax — no migration needed, same data, graph query layer on top.

### Design rules for now
- Always store both directions of a relationship (or use undirected flag)
- Always include relationship_type on new links — default to 'relates_to'
- Store the links table with enough metadata that a graph engine can consume it later without transformation
- The force-directed relationship graph in the frontend is a preview of this — it already visualises the link topology

## Row Level Security
- All data tables filtered by plant_id → org_id
- Users see only their own organisation's data
- All authenticated users in an org can read everything
- Authenticated users can insert and update
- Only creator or admin role can delete
- Notifications filtered by user_id (users see only their own)

## Key features (all in prototype.html — preserve all of them)
- Landing page: navy background, M/D/1 logo in white box, "Get in Touch" (mailto) and "See Demo" (password gate: "digitalbrain")
- Knowledge lifecycle: Proposed → Active → Verified → Established (also Stale, Contradicted, Retired)
- Both rules AND assertions have status lifecycle
- Contradiction detection between rules
- Relationship graph (force-directed, canvas-based)
- AI query engine (deterministic retrieval from knowledge bank, cites rule/assertion IDs)
- Comments on rules, assertions, and events
- Verification voting ("Verify from Experience")
- Event filing with Ishikawa root cause analysis and linked rules
- Tag people on events and questions
- Open questions with threaded Reddit-style responses
- Extract rule/assertion from question answers
- Knowledge health dashboard: needs review (contradicted + stale), top knowledge (with time filter), archive
- Notifications with bell icon, unread count, click-to-navigate
- Profile dropdown with contribution stats
- Edit with version history tracking
- Link editor: link rules to assertions and vice versa, with optional comment
- Filter pills: status, category, process area, confidence
- Search across all fields
- Detail view as centered modal popup (640px), not sidebar

## Coding conventions
- Functional React components with hooks
- Keep components in src/components/
- Keep Supabase queries in src/lib/
- Tailwind for styling, matching the design system above
- No TypeScript for now — plain JSX to move fast