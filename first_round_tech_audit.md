# First Round Technical Audit

## Executive Summary

MD1 Knowledge Bank is a strong prototype with unusually clear product instincts for manufacturing knowledge management. The core idea is sharp: capture experienced-worker knowledge, govern it through lifecycle states, connect it to events and evidence, and make it queryable through a plant-specific assistant.

The main risk is not that the app chose Vite instead of Next.js, or npm instead of pnpm. The main risk is that the app has become production-shaped before its trust boundaries, retrieval architecture, code structure, and verification habits have caught up.

Today's priority should be hardening the current architecture, not debating frameworks. Vite + React + Supabase Edge Functions is a legitimate architecture. It can support this product if the backend responsibilities are clear: browser for UI, Supabase/Postgres/RLS for data isolation, Supabase Edge Functions for AI and server-only secrets.

## What Is Strong

- The product wedge is clear: "The operational brain that never retires" maps well to a real manufacturing pain.
- The domain model is promising. Rules, assertions, events, questions, responses, comments, verifications, evidence, versions, notifications, embeddings, and links are the right primitives.
- The knowledge graph foundation is good. The `links` table can support relationship reasoning, contradiction tracking, impact analysis, and future graph traversal.
- The prototype covers a lot of expected workflows: capture, event filing, threaded questions, verification, contradiction surfacing, graph view, query assistant, notifications, profile stats, plant membership, and document ingestion.
- The design system is coherent: industrial, restrained, and well matched to the plant-operations context.
- There are signs of real debugging and iteration: migrations document fixes, eval scripts exist, and earlier data-isolation bugs have been identified rather than ignored.

## What Is Weak

### Security And Data Isolation

- Several RLS policies are too broad for a multi-tenant manufacturing app.
- Comments, links, responses, evidence, versions, and verifications have policies that allow broad authenticated-user access in some migrations.
- The app has already had cross-plant contamination, documented in `019_fix_plant_isolation.sql`.
- Any customer-facing version needs plant/org isolation proven by tests, not assumed from UI behavior.

### Auth And Session Handling

- The app bypasses normal Supabase auth client flow and manually stores JWT and refresh tokens.
- Access and refresh tokens are stored in browser storage.
- Custom auth plumbing can work, but this is a high-risk area to improvise in. It should be simplified or deliberately tested.

### AI Query Architecture

- The documented architecture says hybrid vector search plus full-text search with reciprocal rank fusion.
- The current user-facing query function appears to run full-text search plus fallback and contradiction injection, not true vector plus full-text RRF.
- The embedding function and vector RPC exist, but they are not clearly wired into the main query path.
- There appears to be a potential embedding dimension mismatch: early schema uses `vector(1536)`, while later Voyage search expects `vector(1024)`.

### Code Structure

- `src/lib/db.js` is too large and owns too many responsibilities.
- Several components are close to or above 1,000 lines.
- Inline styles dominate the UI, making consistency and reuse harder as the app grows.
- Prototype fallbacks and production data paths are mixed together.
- Debug logging is scattered through frontend and Edge Function code.

Concrete examples:

- `src/lib/db.js` handles rules, assertions, events, questions, comments, verifications, links, profiles, plant settings, notifications, photo storage, and plant deletion. That should be split by domain.
- `RulesView.jsx` and `AssertionsView.jsx` appear to duplicate substantial list/detail/form behavior. That is a good candidate for shared item-list and item-detail primitives.
- `QueryView.jsx` contains chat state, history persistence, source citation parsing, item detail rendering, event detail rendering, and ask-the-team behavior. It would be easier to reason about if query transport, message rendering, citation handling, and modals were separated.
- Several code paths soft-fail by logging and returning empty arrays. That makes demos smooth but hides broken data access, missing migrations, and RLS mistakes.

### Infrastructure And Testing

- `package.json` has only `dev`, `build`, and `preview` scripts.
- There is no obvious lint, test, typecheck, integration test, migration test, or CI workflow.
- Eval scripts exist, but they are not integrated into a regular verification pipeline.
- Build verification could not be run in this environment because `npm` and `node_modules` were unavailable locally.

### Enterprise Account Model

- The schema has `organisations`, and each plant belongs to an organisation.
- The actual account-management model is plant-scoped: users join `plant_memberships`, invites are `plant_invites`, roles are per plant, and the settings surface is plant settings.
- There does not appear to be a real enterprise workspace/team/account layer above plants.
- There is no obvious organisation-level admin, organisation-level user directory, enterprise role model, SSO/SAML/SCIM, domain claiming, audit log, or central policy layer.
- For a large enterprise design partner, this is likely an important product gap rather than a small implementation detail.

Current behavior examples:

- New plant creation creates or finds an organisation, then creates a plant and makes the creator plant admin.
- Membership roles are `admin`, `contributor`, and `viewer` on `plant_memberships`.
- Plant invites target a specific `plant_id`, and invited users accept into that single plant.
- Plant Settings exposes members, pending invites, governance settings, and delete controls for one plant at a time.

## Architecture Read

This is not a Next.js app. It is a React + Vite single-page app deployed as static frontend on Vercel. `vercel.json` rewrites all routes to `index.html`.

The backend layer is Supabase:

- Postgres for data
- Row Level Security for tenant isolation
- Auth for identity
- Storage for documents/photos
- Supabase Edge Functions for server-side AI calls

Supabase Edge Functions run on Deno. That is why files under `supabase/functions/*` use `Deno.serve(...)` and `Deno.env.get(...)`.

## Environment Variables And Secrets

These Vercel variables have different meanings:

- `VITE_SUPABASE_URL`: expected to be public in a Vite app.
- `VITE_SUPABASE_ANON_KEY`: expected to be public in a Vite app. The anon key is safe only if RLS is correct.
- `ANTHROPIC_API_KEY`: should not be in the browser bundle or needed by Vercel for the current architecture.

The correct current flow is:

```text
Browser React app
  -> calls Supabase Edge Function
      -> Edge Function reads ANTHROPIC_API_KEY from Supabase secrets
      -> Edge Function calls Anthropic
      -> Edge Function returns result to browser
```

The app still "calls Anthropic" from the user's perspective, but the browser never sees the key. The browser calls your server-side function, and the function calls Anthropic.

If the current architecture stays Vite + Supabase Edge Functions, `ANTHROPIC_API_KEY` should live in Supabase function secrets, not Vercel frontend env vars. The frontend should only use the Supabase URL and anon key.

## Framework And Language Decisions

### TypeScript

Adding TypeScript is high ROI. It should be prioritized ahead of a Next.js migration.

This app has many shape-sensitive objects: rules, assertions, events, questions, links, evidence, versions, citations, memberships, document candidates, and AI responses. TypeScript would catch a lot of quiet breakage in normalization and API payloads.

Best path:

- Add shared domain types first.
- Convert data-access modules as they are split out of `src/lib/db.js`.
- Keep JSX screens in JavaScript until nearby work touches them.
- Tighten Supabase Edge Function request/response types.

TypeScript does not need to be a dramatic rewrite. It can be incremental and practical.

### Next.js

Do not migrate to Next.js just because Next feels more "serious" or scalable.

Next.js would help if the team wants:

- Vercel API routes or server actions as the backend-for-frontend layer
- SSR or route-level server data loading
- server-mediated auth/session handling
- one Vercel-hosted place for server-only secrets
- tighter coupling between frontend routes and backend handlers

But this app already has a backend: Supabase Edge Functions. Migrating to Next now could create two backend layers unless the team is intentional.

Recommendation: defer a Next.js migration until there is a specific server-side need that Supabase Edge Functions do not satisfy well.

### npm, pnpm, And Supply Chain

The repo currently uses npm: it has `package-lock.json` and no `pnpm-lock.yaml`.

The current dependency tree does not appear to include `@tanstack/*`, so it does not look directly affected by the recent TanStack npm supply-chain incident.

Migrating to pnpm is not an urgent security response. pnpm can improve install speed, dependency strictness, and future monorepo ergonomics, but it does not automatically protect against intentionally compromised package versions.

Higher-value supply-chain steps:

- Keep a committed lockfile.
- Use deterministic installs in CI.
- Review lockfile diffs.
- Enable dependency alerts.
- Run audit tooling.
- Avoid casual dependency churn.
- Be cautious with install scripts where practical.

## What We Should Do Today

### 1. Move Anthropic Secrets To The Right Place

Remove `ANTHROPIC_API_KEY` from Vercel unless a Vercel server function actually uses it. Set it as a Supabase Edge Function secret instead.

Why: this is the fastest concrete security cleanup. The browser should never need the Anthropic key, and the current code already expects Edge Functions to read it with `Deno.env.get(...)`.

Done means:

- Supabase functions have `ANTHROPIC_API_KEY` configured.
- Vercel only has public Vite variables needed by the frontend.
- A quick grep confirms no frontend code references `ANTHROPIC_API_KEY`.

### 2. Audit RLS For Actual Tenant Isolation

Review every table by sensitivity and parent plant relationship.

Highest priority tables:

- `comments`
- `links`
- `responses`
- `evidence`
- `versions`
- `verifications`
- `notifications`
- `documents`
- `extraction_candidates`

Why: manufacturing knowledge is tenant-sensitive. Broad authenticated access is not acceptable just because rows feel secondary or "not sensitive." Comments and links can reveal operational practices, failures, disagreements, and personnel behavior.

Done means:

- Every table has a clear access rule.
- Tables without direct `plant_id` are protected through parent joins or schema changes.
- There is no authenticated-wide read/write policy unless it is explicitly harmless.

### 3. Clarify Enterprise Account Fit For The Design Partner

Write down what the current account model supports and what it does not.

Current likely support:

- multiple plants
- plant-specific membership
- plant-specific roles
- plant-specific invites
- plant-specific settings

Current likely gaps:

- enterprise workspace dashboard
- organisation-level admins
- organisation-wide user directory
- adding a user to multiple plants at once
- central policy controls
- enterprise audit log
- SSO/SAML/SCIM
- domain-based account linking
- team/workspace-level billing or contracts

Why: a large enterprise will often think in terms of company account, sites/plants, user directory, permissions, security review, and lifecycle management. If the app only thinks in terms of individual plants, onboarding a design partner may feel brittle even if the core knowledge product is good.

Done means:

- The design partner conversation has an explicit "enterprise readiness" section.
- The team knows whether plant-level access is acceptable for the first pilot.
- If not acceptable, the next data model addition is organisation membership, not more plant UI.

### 4. Verify The Query Engine Honestly

Decide whether current query is:

- full-text search plus fallback, or
- real hybrid search with vector + full-text + RRF.

Why: the product promise depends on trustworthy retrieval. If the app says "no rule covers this," but retrieval is incomplete, the assistant becomes actively misleading.

Done means:

- Current behavior is documented accurately.
- If hybrid is claimed, vector search is wired into the user-facing `query` function.
- Embedding dimensions are confirmed and consistent.
- Newly created/updated knowledge items get embedded automatically or through a reliable job.

### 5. Add A Minimal Verification Baseline

Add basic scripts for:

- build
- lint
- typecheck once TypeScript starts
- dependency audit
- one smoke test or integration test path

Why: this app is now too large to change safely by hand inspection alone.

Done means:

- CI can prove the app builds.
- CI can catch obvious syntax and dependency issues.
- There is a place to add RLS and retrieval tests next.

### 6. Write Down The Architecture Boundary

Create a short architecture note:

- Vite frontend is public/browser-only.
- Supabase Edge Functions are server-side/Deno.
- Supabase anon key is public by design.
- Provider API keys live only in server-side function secrets.
- RLS is the tenant isolation mechanism.

Why: this prevents repeated confusion about whether Vite env vars are "leaks" and where backend logic belongs.

## What We Might Do Today

### 1. Start Splitting `src/lib/db.js`

Do not refactor the whole app at once. Start by extracting one low-risk domain:

- `src/lib/notifications.js`
- `src/lib/comments.js`
- `src/lib/verifications.js`
- `src/lib/links.js`

Why: this begins reducing the biggest maintainability bottleneck without stopping product work.

Good rule: only move code first. Avoid changing behavior during the first extraction.

### 2. Add Domain Types

Start a small `src/lib/types.ts` or `src/types/domain.ts` and define the main shapes.

Why: this helps future TypeScript migration and gives the team a shared vocabulary without forcing a full conversion.

Best first types:

- `Rule`
- `Assertion`
- `Event`
- `Question`
- `Link`
- `Membership`
- `Profile`
- `CitationSource`

### 3. Remove Or Gate Debug Logging

There are many `console.log` calls in auth, query, data fetching, and Edge Functions.

Why: logs are useful during prototype work, but noisy logs make production debugging worse and can expose operational context.

Good approach:

- Keep server errors.
- Gate verbose logs behind a debug flag.
- Remove logs that print user IDs, plant IDs, question snippets, or internal timing unless intentionally needed.

### 4. Document The Current AI Retrieval Gap

If implementing hybrid today is too much, still document the current state.

Why: it is better to be honest that the current query path is full-text first than to let future decisions rely on an architecture that does not exist yet.

### 5. Sketch An Enterprise Account Model

Do this as a lightweight design, not an implementation project.

Possible additions:

- `organisation_memberships`
- organisation roles like `owner`, `admin`, `member`, `viewer`
- mapping users to one or more plants through org-level administration
- organisation-level invite flow with optional plant assignment
- organisation-level audit events
- SSO/domain metadata fields for future enterprise auth

Why: this is important for a large design partner, but it should be shaped by their actual pilot requirements. A one-page model is enough today.

## What We Might Do Later

### 1. Migrate Incrementally To TypeScript

Do this after the domain boundaries are clearer.

Why later: TypeScript is valuable, but converting giant unstructured files directly can turn into annotation theater. It is better paired with module extraction.

### 2. Consider Next.js

Revisit Next.js if the app needs a Vercel-hosted backend-for-frontend, SSR, server actions, or more centralized server-side auth/session mediation.

Why later: Next would not automatically fix RLS, retrieval, auth design, or code quality. It could help architecture later, but it is not the first bottleneck.

### 3. Consider pnpm

Migrate to pnpm if the repo becomes a monorepo, install speed matters, or the team wants stricter dependency behavior.

Why later: it is a fine engineering preference, but it does not address the highest product/security risks today.

### 4. Consolidate Styling

Eventually move repeated inline styles into reusable components and design primitives.

Why later: the UI is not the most dangerous area right now. But long term, repeated inline styling will make product iteration slower.

### 5. Build A Real Eval Harness For Retrieval

Turn the existing eval scripts into a repeatable test suite for query quality.

Why later: query correctness is core to the product. Once the retrieval architecture is clear, this should become part of normal development.

### 6. Build Enterprise Administration

Add organisation-level administration once a design partner confirms they need it.

Likely features:

- org admin dashboard
- manage all plants in one org
- user directory across plants
- invite user to organisation and assign plant access
- transfer plant ownership
- audit log for invites, role changes, data exports, deletes, and governance settings
- SSO/SAML/SCIM if required by the buyer

Why later: the current pilot might be plant-scoped. But if the first design partner is a large enterprise, this may move from later to today very quickly.

## What Is Not Important Right Now

- A Vite versus Next.js religious debate.
- Migrating to pnpm as a security reaction.
- Rewriting the UI because inline styles are aesthetically imperfect.
- Adding more product features before trust boundaries are fixed.
- Optimizing graph traversal before the basic `links` model and RLS are proven.
- Deep performance optimization before correctness and isolation are tested.
- Assuming that "organisation" in the schema means enterprise readiness. It does not unless there is an org-level membership, admin, policy, and lifecycle model.

## Practical North Star

The next milestone should be trust, not feature count.

The app should be able to answer these questions confidently:

- Can a user from Plant A read or mutate any Plant B data?
- Can the browser ever see an AI provider key?
- When the assistant says no rule covers a situation, do we trust the retrieval path?
- Can we change code without manually clicking through the whole app?
- Are rules, assertions, events, links, evidence, and versions shaped consistently enough that the codebase can keep growing?
- Can a large enterprise understand who owns the account, who can invite users, who can administer multiple plants, and how access is revoked?

If the answer to those becomes yes, the product has a much better shot. The prototype already has the imagination. Now it needs the guardrails.
