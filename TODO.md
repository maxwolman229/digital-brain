# MD1 Knowledge Bank — TODO

*Ordered by priority. Updated March 13, 2026.*

---

## P0 — Fix before demo

- [ ] **Fix hybrid search returning no results** — debug `hybrid_search_fulltext` RPC against live DB; check that `plant_id` filter matches seed data; test with `curl` or SQL editor
- [ ] **Generate embeddings** — call `supabase/functions/embed` for all item types so vector search works:
  ```bash
  curl -X POST https://itcbcolpqcbvkfktwatq.supabase.co/functions/v1/embed \
    -H "Content-Type: application/json" \
    -d '{"plant_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","target_type":"rule"}'
  # repeat for assertion, event, question
  ```
- [ ] **Remove DebugPanel from App.jsx** — the floating debug overlay is still rendered in the `/app` route; remove before demo

---

## P1 — Core features missing

- [ ] **Wire notifications to DB** — fetch from `notifications` table instead of hardcoded seed array in `Notifications.jsx`; mark read on click; insert rows when rules are created/verified
- [ ] **Embed on write** — trigger `embed` edge function when a rule/assertion is created or updated (Supabase Database Webhook → Edge Function, or call from `db.js` after insert/update)

---

## P2 — UX improvements

- [ ] **Link editor: show linked item detail inline** — instead of opening a stacked modal, show a compact summary card on hover
- [ ] **Query tab: show which search mode was used** — "hybrid" vs "fulltext" vs "fallback" badge on each answer
- [ ] **Query tab: clicking a source opens its detail** — currently source chips have no click behaviour
- [ ] **Events: link rules/assertions from event detail** — EventsView has no link editor; `linkedRules`/`linkedAssertions` stored in legacy columns, not the `links` table
- [ ] **Relationship Graph: show link rel-type on edges** — currently edges are plain lines; label with `supports`, `contradicts`, etc.
- [ ] **Health Dashboard: live contradiction detection** — replace naive OPPOSE-word regex with actual `contradicts` links from the `links` table

---

## P3 — Multi-user / notifications

- [ ] **Notifications: per-user** — store `user_id` on notification rows; show only current user's notifications; currently hardcoded seed data in `Notifications.jsx`

---

## P4 — Cleanup

- [ ] **Remove `GraphView.jsx`** — dead file, superseded by `RelationshipGraph.jsx`
- [ ] **Remove duplicate GIN indexes** — drop the duplicate `idx_*_fts` indexes from migration 002 (001 already creates them)
- [ ] **Migrate events.linked_rules / linked_assertions** — legacy columns on the events table; migrate to use the `links` table consistently and drop the columns; update `normaliseEvent` in `db.js`

---

## Completed ✓

*Moved here when done. Not deleted so there's a record.*

- [x] **Auth — sign-in/sign-up** *(March 13)* — `Auth.jsx`, `Onboarding.jsx`, full React Router routing in `App.jsx`, `src/lib/auth.js`
- [x] **Remove anon-permissive RLS** *(March 13)* — migration 003 revokes `anon` from all data tables; migrations 006–009 add membership-based RLS
- [x] **User attribution** *(March 13)* — all "Created By"/"Edited By" inputs removed; authorship auto-set from `getDisplayName()` in `userContext.js`
- [x] **"View in Graph" button** *(March 13)* — closes modal, switches to graph tab, highlights node with dashed orange ring and radial glow; nudges node to canvas centre
- [x] **Version number in modal title** *(March 13)* — `R-001 · v3` format; increments on edit; removed redundant "Versions: X" footer line
- [x] **Suggested links** *(March 13)* — top 5 context-aware suggestions in LinkEditor when edit mode opens; same process area, category-prioritised; one-click Link button per suggestion
- [x] **Multi-plant support** *(March 13)* — `plant_memberships` table, invite codes, `PlantHome` join/create flow, plant switcher in header, `PlantSettings` panel
- [x] **Add Rule / Add Assertion forms** *(March 13)* — full create forms wired to Supabase
- [x] **Edit Rule / Edit Assertion** *(March 13)* — pre-populated edit forms; creates a version row on save
- [x] **Wire `LandingPage.jsx`** *(March 13)* — routed at `/` with React Router; password gate for demo access
- [x] **Font audit** *(March 13)* — fixed `FNTM` constant (was `'IBM Plex Sans'`, now `'IBM Plex Mono'`); sidebar nav + filter labels + form field labels → IBM Plex Sans; graph node IDs → IBM Plex Mono
