# MD1 Knowledge Bank — Changelog

## March 13, 2026

---

### New Components

| File | What it does |
|---|---|
| `src/components/Auth.jsx` | Sign-in / sign-up form; live Supabase connection debug panel; demo sign-in button (`demo@md1.app`) |
| `src/components/Onboarding.jsx` | Display name capture for new users after sign-up; calls `createProfileSimple` then redirects to `/plants` |
| `src/components/LandingPage.jsx` | Public landing page (navy, M/D/1 logo, password gate for demo access); routed as `/` |
| `src/components/PlantHome.jsx` | Authenticated plant selection screen; lists user's current plants with Enter button; join-by-invite-code panel; create-new-plant panel with process area selector |
| `src/components/PlantSettings.jsx` | Admin-only settings panel for a plant; shows invite code for sharing |
| `src/components/NarrativeInput.jsx` | Narrative knowledge capture modal; accepts freeform operator text |

---

### Modified Components

| File | Changes |
|---|---|
| `src/App.jsx` | Full rewrite: React Router (`BrowserRouter`) with 5 routes (`/`, `/auth`, `/onboarding`, `/plants`, `/app`); session restoration on mount via `getRestoredSession()`; auth state machine; `DebugPanel` overlay in app route |
| `src/components/KnowledgeBank.jsx` | Plant switcher dropdown in header; `graphHighlight` state; `onViewInGraph` prop wiring to RulesView and AssertionsView; PlantSettings modal integration; font fixes (nav buttons → FNT) |
| `src/components/RulesView.jsx` | **View in Graph**: closes modal, switches tab, highlights node; **Version in title**: modal title now shows `R-001 · v3`; removed "Versions: X" footer line; removed "Created By"/"Edited By" inputs; authorship auto-set from `getDisplayName()`; `sourceMeta` passed to LinkEditor for context-aware suggestions |
| `src/components/AssertionsView.jsx` | Same changes as RulesView |
| `src/components/RelationshipGraph.jsx` | Accepts `highlightId` and `onClearHighlight` props; highlighted node gets dashed orange ring with radial glow and is nudged to canvas centre; canvas node ID labels changed to IBM Plex Mono |
| `src/components/LinkEditor.jsx` | **Suggested links**: fetches top 5 context-aware suggestions (same process area, same category prioritised) when edit mode opens; one-click "Link" button per suggestion; auto-authorship from `getDisplayName()` |
| `src/components/shared.jsx` | Font fixes: `PillFilter` section labels and `Field` labels → FNT (IBM Plex Sans) |

---

### New Library Files

| File | What it does |
|---|---|
| `src/lib/auth.js` | `signIn`, `signUp`, `signOut`, `loadProfile`, `createProfileSimple`, `getRestoredSession`; `fetchMemberships` (with profile fallback: auto-migrates users whose `profiles.plant_id` has no matching membership row); `createMembership`, `joinPlantByCode`, `findOrCreateOrg`, `createPlant` |
| `src/lib/userContext.js` | Module-level store (not a React context); `setUserContext`, `getDisplayName`, `getActivePlantId`, `clearUserContext`, `getStoredActivePlant`; used to propagate current user identity to db.js and components without prop drilling |

---

### Modified Library Files

| File | Changes |
|---|---|
| `src/lib/db.js` | Added `fetchSuggestedLinks(sourceType, sourceId, processArea, category)` — queries rules + assertions in same process area, sorts same-category first, returns top 5 excluding self |
| `src/lib/constants.js` | **Bug fix**: `FNTM` was incorrectly set to `'IBM Plex Sans'`; corrected to `'IBM Plex Mono', 'Courier New', monospace` |

---

### Database Migrations

| Migration | What it does |
|---|---|
| `003_auth_setup.sql` | Removes anon-permissive read policies added March 12; revokes `SELECT` from anon role on all tables; seeds demo org (`aaaaaaaa…`) and plant (`bbbbbbbb…`); adds service-role INSERT + per-user SELECT/UPDATE policies on notifications |
| `004_simplified_rls.sql` | Simplified RLS policies on core data tables for authenticated access |
| `005_simplified_rls_links_responses.sql` | Adds authenticated-user RLS policies for `links` and `responses` tables |
| `006_plant_memberships.sql` | Adds `invite_code` (unique, auto-generated 8-char code) to `plants`; creates `plant_memberships` table with `user_id`, `plant_id`, `role`, `joined_at`, `invited_by`; `is_plant_member()` and `is_plant_admin()` RLS helper functions (SECURITY DEFINER); RLS policies for memberships; migrates existing `profiles.plant_id` rows |
| `007_membership_rls.sql` | Replaces profile-based plant RLS with membership-based RLS on rules, assertions, events, questions, evidence, versions |
| `008_demo_membership.sql` | Backfills any profile with plant_id into plant_memberships; ensures `demo@md1.app` has admin membership for the seed plant |
| `009_catchup_006_007_008.sql` | Combined idempotent script applying 006+007+008 for instances that only had 001–005; used to fix the live Supabase instance; all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING |

---

### Bug Fixes

| Bug | Fix |
|---|---|
| **Login broken after migration** — demo@md1.app redirected to join/create screen instead of app | Root cause: `plant_memberships` table didn't exist, so `fetchMemberships` returned 0 rows. Fix: (1) `fetchMemberships` now checks `profiles.plant_id` as fallback and auto-inserts a membership row; (2) migration 009 applied to Supabase to create the table and seed demo user's membership |
| **`plant_memberships` relation does not exist (42P01)** when running migration 008 directly | Migrations 006 and 007 had never been applied. Fixed by creating 009 as a single combined idempotent script covering all three |
| **`FNTM` constant wrong** — all components importing `FNTM` from `constants.js` rendered IBM Plex Sans for monospace elements | `FNTM` was set to `'IBM Plex Sans'` instead of `'IBM Plex Mono'`. Corrected in `constants.js` |
| **Sidebar nav using IBM Plex Mono** | Nav tab buttons had `fontFamily: FNTM`; changed to `FNT` (IBM Plex Sans) |

---

### Features Added

- **View in Graph** — "View in Graph" button in rule/assertion detail modals now works: closes the modal, switches the sidebar to the Relationship Graph tab, and highlights the node with a dashed orange ring and radial glow; node is nudged to canvas centre
- **Version numbering in modal title** — rule/assertion detail modal title now shows current version inline (e.g., `R-001 · v3`); the redundant "Versions: X" footer line was removed
- **Suggested links** — clicking "Edit Links" now shows a "Suggested" section above the search bar with top 5 context-aware items (same process area, same category prioritised); one-click "Link" button per item
- **Auto-authorship** — "Created By" and "Edited By" inputs removed from all add/edit forms; author is always set from the logged-in user's display name via `getDisplayName()`; no manual entry possible

---

### Font Audit

| Location | Issue | Fix |
|---|---|---|
| `src/lib/constants.js` | `FNTM` was `'IBM Plex Sans'` — every component importing it used the wrong font for monospace | Changed to `'IBM Plex Mono', 'Courier New', monospace` |
| `src/components/KnowledgeBank.jsx` | Sidebar nav buttons used `FNTM` (should be regular text) | Changed to `FNT` |
| `src/components/KnowledgeBank.jsx` | Sidebar query description text used `FNTM` | Changed to `FNT` |
| `src/components/shared.jsx` `PillFilter` | Section label ("Status", "Category") used `FNTM` | Changed to `FNT` |
| `src/components/shared.jsx` `Field` | Form field labels used `FNTM` | Changed to `FNT` |
| `src/components/RelationshipGraph.jsx` | Canvas node ID labels used `IBM Plex Sans` | Changed to `IBM Plex Mono` |
| `index.html` | Already correct: Google Fonts import includes IBM Plex Sans (400–900) + IBM Plex Mono (400–700) | No change needed |
| `src/index.css` | Already correct: `body { font-family: 'IBM Plex Sans', sans-serif }` | No change needed |
| `tailwind.config.js` | Already correct: `font-sans: IBM Plex Sans`, `font-mono: IBM Plex Mono` | No change needed |

---

## March 12, 2026

---

### Frontend Components

| File | What it does |
|---|---|
| `src/App.jsx` | Root app — renders KnowledgeBank |
| `src/main.jsx` | Vite entry point |
| `src/components/KnowledgeBank.jsx` | Shell: header, sidebar nav, status bar, tab routing |
| `src/components/RulesView.jsx` | Rules list + detail modal (status/filters/search/comments/verifications/links) |
| `src/components/AssertionsView.jsx` | Assertions list + detail modal (same pattern as rules) |
| `src/components/EventsView.jsx` | Events list + detail modal with full Ishikawa 6M root cause editor; Report Event form |
| `src/components/QuestionsView.jsx` | Open questions list + ask/answer flow |
| `src/components/HealthDashboard.jsx` | Contradiction detection, staleness check, top-knowledge ranking, knowledge archive |
| `src/components/RelationshipGraph.jsx` | Canvas-based force-directed graph; rules = rectangles, assertions = circles; double-click opens detail |
| `src/components/QueryView.jsx` | Chat UI calling the hybrid search edge function; citation links; source chips |
| `src/components/LinkEditor.jsx` | Bidirectional link editor embedded in rule/assertion detail modals; search + rel-type dropdown + optional comment; saves to Supabase links table |
| `src/components/Notifications.jsx` | Bell icon + dropdown with unread count; `forwardRef`/`useImperativeHandle` for close() |
| `src/components/Comments.jsx` | Per-item comment thread; persists to Supabase |
| `src/components/Verifications.jsx` | Per-item verification list; persists to Supabase |
| `src/components/shared.jsx` | `Badge`, `Tag`, `Modal`, `PillFilter`, `Field`, `TypeaheadInput` |
| `src/lib/constants.js` | Colours, font names, status/category/process-area constants, date formatter |
| `src/lib/db.js` | All Supabase queries; camelCase normalisation; INITIAL_* fallbacks for unauthenticated use |
| `src/lib/data.js` | In-memory seed arrays (INITIAL_RULES, INITIAL_ASSERTIONS, INITIAL_EVENTS, INITIAL_QUESTIONS) |
| `src/lib/supabase.js` | Creates and exports the Supabase JS client |

---

### Database Schema

**15 tables** in Supabase (Postgres 15, West US Oregon):

| Table | Purpose |
|---|---|
| `organisations` | Top-level org entity |
| `plants` | Plant within an org; scopes all knowledge |
| `profiles` | User profile linked to `auth.users`; role, display name |
| `rules` | Operational rules (R-001…R-022); status, confidence, category, process_area, tsvector |
| `assertions` | Underlying assertions (A-001…A-010); same shape as rules |
| `events` | Incidents and positive events (E-001…E-008); Ishikawa root_cause JSONB |
| `questions` | Open questions (Q-001…Q-005) |
| `responses` | Threaded answers to questions |
| `comments` | Comments on rules, assertions, events |
| `verifications` | Who verified a rule or assertion |
| `links` | Knowledge graph edges; relationship_type enum; bidirectional by convention |
| `evidence` | Evidence rows attached to rules/assertions |
| `versions` | Change history (version_num, author, change_note, snapshot_title) |
| `notifications` | User-scoped notifications |
| `embeddings` | pgvector(1024) embeddings for hybrid search; HNSW index |

**Extensions:** `vector` (pgvector 0.8.0), `uuid-ossp`

**tsvector triggers** on rules, assertions, events, questions — auto-populate `search_vector` on INSERT/UPDATE.

**Row Level Security** on all tables. Anon-permissive read policies added on March 12 for demo use (no auth required).

**Seed data** (`supabase/seed.sql`): 22 rules, 10 assertions, 8 events, 5 questions, 9 verifications, 3 comments, 57 links, 36 evidence rows, 33 version rows.

---

### Edge Functions (Supabase Deno)

| Function | Purpose |
|---|---|
| `supabase/functions/query/index.ts` | Hybrid search: Voyage AI vector search + Postgres full-text search, combined via Reciprocal Rank Fusion (k=60), answered by Claude Haiku. Deployed with `--no-verify-jwt`. |
| `supabase/functions/embed/index.ts` | Generates Voyage AI `voyage-3` embeddings (1024-dim) for rules/assertions/events; SHA-256 content hash to skip unchanged items; upserts into `embeddings` table. |

---

### Configuration

| File | Purpose |
|---|---|
| `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `vite.config.js` | Vite + React plugin |
| `package.json` | React 18, Vite 6, @supabase/supabase-js |
| `supabase/migrations/001_initial_schema.sql` | Full schema + RLS policies |
| `supabase/migrations/002_hybrid_search_functions.sql` | tsvector triggers, GIN indexes, `hybrid_search_vector` and `hybrid_search_fulltext` RPCs |
| `CLAUDE.md` | Architecture notes and development guidelines |

---

### Features Working

- Rules list with search, status/category/process-area filters
- Rule detail modal: scope, rationale, evidence, version history, comments, verifications, **link editor**
- Assertions list with same filters
- Assertion detail modal: same feature set including **link editor**
- Link editor: bidirectional display, search-to-link, relationship_type dropdown, optional comment, delete links, click linked item to open its detail (stacked modal)
- Events list + detail with full Ishikawa 6M editor, report-event form
- Open Questions tab with ask + answer flow
- Knowledge Health dashboard: contradiction detection (OPPOSE regex), staleness (90-day), top-knowledge ranking, archive
- Relationship Graph: canvas force-directed physics, node colours by process area, double-click opens detail
- Notifications: bell icon + dropdown, unread count
- Query tab: chat UI with source citations
- Hybrid search edge function deployed and returning 200
- All seed data loaded: 22 rules, 10 assertions, 8 events, 5 questions

### Features Not Yet Working / Known Issues

- **Query engine returns "No rules cover this"** — the `embeddings` table has 0 rows. The `embed` edge function has not been called yet. Full-text search also appears to return 0 results when tested against the live DB; suspect the `hybrid_search_fulltext` RPC is filtering by `plant_id` but not matching data correctly.
- **Auth not implemented** — app runs entirely as anonymous user. RLS is bypassed via anon-permissive policies added today. No login/signup flow exists.
- **Notifications are hardcoded** — the 5 notification items in `Notifications.jsx` are in-memory seed data, not from the `notifications` table.
- **"+ Add Rule / Assertion" buttons** are placeholders — no create form implemented.
- **"+ Narrative Input" button** is a placeholder.
- **"View in Graph" button** in rule/assertion detail modals does nothing.
- **Edit button** in rule/assertion detail modals does nothing.
- **Embed edge function not wired to triggers** — embeddings must be manually refreshed by calling the `embed` function.
- **`GraphView.jsx`** exists but is not used — `RelationshipGraph.jsx` is the active graph component.
- **`LandingPage.jsx`** exists but is not routed — react-router-dom is not configured in App.jsx.
- **Duplicate GIN indexes** on rules/assertions/events/questions — migrations 001 and 002 both create them. Harmless but untidy.
