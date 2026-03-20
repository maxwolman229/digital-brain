# MD1 Knowledge Bank — System Workflows

_Documents what actually exists and works right now. Last updated: 2026-03-19._

---

## 1. USER SIGNUP & ONBOARDING — ✅ WORKING

### Step by step

1. User visits `/` (landing page) and clicks **"Get Started"** or navigates to `/auth`.
2. On the **Sign Up** tab: enters Display Name, Email, Password, Confirm Password.
3. `signUp(email, password)` is called → Supabase auth creates user + issues JWT.
   - JWT and refresh token stored in `localStorage`.
   - `onNeedsOnboarding(user, displayName)` fires → App navigates to `/onboarding`.
4. **Onboarding page** (`/onboarding`): pre-fills Display Name from signup, user confirms.
   - `createProfile(userId, displayName, null, null, 'member')` is called.
   - **Writes to**: `profiles` (user_id, display_name, role='member', plant_id=null, org_id=null, is_super_admin=false).
5. User lands on `/plants` (Plant Home).

### Emails sent
- **None.** Email confirmation is disabled. Users are logged in immediately after signup.

### Where they land
- `/plants` — must join or create a plant before accessing the knowledge bank.

### Tables written
- `auth.users` (Supabase-managed)
- `profiles`

---

## 2. BEVCAN APPLICATION FLOW — ✅ WORKING

### Path: `/bevcan`

Three states on the BevCan landing page:
1. **Not logged in** → Login or Apply tab
2. **Logged in, no BevCan membership** → Apply form
3. **Has BevCan membership** → auto-redirects to `/app` with BevCan active

### New applicant (not logged in)

**Apply tab fields:**
- Full Name (required, stored in application record, not public)
- Display Nickname (required, public display name)
- Current Position (required)
- Current Company (optional)
- Year Joined Industry (dropdown, optional)
- Past Positions (add multiple, optional)
- Brief Bio (optional)
- Checkbox: "I agree to the knowledge-sharing agreement" (required to submit)
- Email (required)
- Password (required, min 8 chars)
- Confirm Password (required)

**On submit** → calls edge function `bevcan-admin` action=`register_applicant`:
- Creates `auth.users` entry with email_confirm=true (no confirmation email)
- **Writes to**: `profiles` (display_name=nickname)
- **Writes to**: `bevcan_applications` (user_id, full_name, nickname, current_position, company, past_positions, bio, status='pending', created_at)
- Navigates to `/bevcan/pending`

### Logged-in user without BevCan membership

Same form (minus email/password). On submit:
- `createBevcanApplication(userId, {...fields})`
- **Writes to**: `bevcan_applications` (same as above)
- Navigates to `/bevcan/pending`

### Who gets notified of a new application
- **Nobody automatically.** The `bevcan-admin` edge function does not send email or create notifications. Admins must manually check the Pending tab in Plant Settings.
- Pending count badge in KnowledgeBank header refreshes every time an admin opens the app (polls on mount if `isPlantAdmin && activePlantId === BEVCAN_PLANT_ID`).

### How an admin approves / rejects

From **Plant Settings → Pending tab** (visible to admins of the BevCan plant only):

**Approve** → calls edge function `bevcan-admin` action=`approve`:
- **Writes to**: `plant_memberships` (user_id, plant_id=dddd, role='contributor')
- **Updates**: `bevcan_applications` (status='approved', reviewed_at, reviewed_by)
- Removes from pending list in UI, decrements badge count.

**Reject** → calls edge function `bevcan-admin` action=`reject`:
- **Updates**: `bevcan_applications` (status='rejected', reviewed_at, reviewed_by)
- User sees rejection message on next login attempt via `/bevcan`.

### After approval
- User logs in via `/bevcan` → edge function checks application status → redirects to `/app` with BevCan plant active.
- No approval email is sent to the applicant.

---

## 3. DEMO LOGIN FLOW — ✅ WORKING

### Path: Landing page → "See Demo" button → password gate

1. User clicks **"See Demo"** on landing page (`/`).
2. Password gate modal appears — password is `"digitalbrain"` (hardcoded in LandingPage.jsx).
3. Correct password → navigates to `/auth`.
4. Auth page has a **"Try Demo"** button with hardcoded credentials:
   - Email: `demo@md1.app`
   - Password: `digitalbrain`
5. Signs in → loads profile → loads memberships.

### Demo account access
- **One plant only**: MD1 EAF Plant (`bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`)
- **Role**: `contributor` — no admin controls visible
- **Visible UI**: full knowledge bank, all tabs, capture, query
- **Hidden UI**: Plant Settings (⚙ button), Members & Requests, Super Admin link, Delete Plant
- **Cannot**: create plants, manage members, approve BevCan applications, access `/admin`

---

## 4. KNOWLEDGE CAPTURE SESSION — ✅ WORKING

### Trigger
User clicks the **"Capture"** tab in the sidebar → `CaptureView` mounts.

### Phase 1: Setup
**Fields:**
- Process Area (required, typeahead from plant vocabulary)
- Topic to discuss (required)
- Operator Name (pre-filled from logged-in display name, editable)

On "Start Interview":
1. `fetchCaptureContext(plantId, processArea, topic)` — queries existing rules on this topic + generates a knowledge gaps summary.
2. Calls edge function **`capture`** with the first user message and full context object.

### Phase 2: Interview (multi-turn)

Each turn:
- User types answer (or clicks `[SKIP]`)
- Full conversation history sent to edge function **`capture`** (POST `/functions/v1/capture`)
- Edge function sends history + system prompt to Claude
- Claude returns JSON: `{ question, done, extracted[] }`
- Extracted items (rules/assertions) appear as cards during the session
- Interview ends after ~12–18 turns or when Claude sets `done: true`

Gamification (UI only, not persisted):
- Progress bar, streak counter, XP counter, difficulty level indicator
- Flash animations on extraction events

### Phase 3: Review
- All extracted items shown with type badge (rule/assertion), title, rationale, confidence, scope
- User can edit any field inline
- Items can be rejected (excluded from save)
- "Share to Knowledge Bank" button saves approved items

### What happens when approved
For each approved item, calls `createRule()` or `createAssertion()` with `plantId` passed explicitly:

**Tables written (rules):**
- `rules` (id=R-[random6], plant_id, title, category, process_area, scope, rationale, status='Proposed', confidence, created_by=userId, created_at, tags=[], capture_source='Knowledge capture interview — [date]')
- `versions` (target_type='rule', target_id, version_num=1, date, author, change_note='Initial version', snapshot_title)

**Tables written (assertions):**
- `assertions` (same pattern, id=A-[random6])
- `versions`

### Notifications triggered
- None on capture save.

### Embeddings
- Edge function `embed` exists but is **not called automatically** from the frontend on save. Embeddings are not populated for newly captured items currently.

---

## 5. ADD RULE / ADD ASSERTION (MANUAL) — ✅ WORKING

### Trigger
Header **"+ Add Rule"** or **"+ Add Assertion"** button (or equivalent in Assertions tab).

### Add Rule form fields
| Field | Required | Notes |
|---|---|---|
| Title | Yes | Free text, under 80 chars recommended |
| Category | No | Typeahead: Material, Process, Equipment, People, Measurement, Environment |
| Process Area | No | Typeahead from plant vocabulary |
| Status | No | Proposed (default), Active, Verified, Established, Stale, Contradicted, Retired |
| Confidence | No | Low, Medium, High, Very High |
| Scope | No | Textarea |
| Rationale | No | Textarea |
| Tags | No | Comma-separated |

### Tables written
- `rules` (plant_id passed explicitly from `activePlantId`)
- `versions` (version_num=1, change_note='Initial version')

### Notifications triggered
- None on create.
- When **status changes** on edit → `notifyUser` fires to rule's `created_by` with: "[R-001] status changed to [status]", navigates to 'rules' view.

### Narrative Input (alternative)
**"+ Narrative Input"** button → modal with free-text field. Calls edge function **`extract`** which sends the narrative to Claude and returns suggested rules/assertions. User reviews and saves. Same DB writes as manual add.

---

## 6. REPORT EVENT — ✅ WORKING

### Two methods

#### Method A: Quick Form
**"+ Report Event"** button → `EventsView` opens a modal form.

**Fields:**
| Field | Required | Notes |
|---|---|---|
| Title | Yes | Descriptive event name |
| Outcome | Yes | Positive, Negative |
| Process Area | Yes | Typeahead |
| Impact | No | Low, Moderate, High, Critical |
| Description | No | Narrative text |
| Ishikawa Root Cause | No | 6 categories: Material, Process, Equipment, People, Measurement, Environment — each a list of text entries |
| Resolution | No | What was done |
| Tagged People | No | Multi-select from plant members |
| Tags | No | Comma-separated |

On submit → `addEvent(ev)`:
- **Writes to**: `events` (plant_id, title, date=now, outcome, impact, process_area, description, status='Open', root_cause=jsonb, resolution, reported_by=userId, tags, tagged_people, created_at)

#### Method B: Guided Interview
**"+ Report Event"** (if EventCaptureView available) → multi-step AI interview. Calls edge function **`event-interview`** (POST `/functions/v1/event-interview`) which drives an adaptive incident investigation via Claude, then extracts the structured event + linked rules/assertions.

On completion:
- **Writes to**: `events` (same as Method A)
- **Writes to**: `rules` and/or `assertions` (any extracted from the incident)
- **Writes to**: `links` (event → rules/assertions, relationship_type='relates_to')

### Notifications triggered
- None on event creation.

### Adding knowledge links to an existing event
From event detail modal → "Add Link" → search for rule/assertion → **Writes to**: `links` (source_type='event', source_id=event_id, target_type, target_id, relationship_type='relates_to', created_by).

---

## 7. ASK THE BANK (QUERY) — ✅ WORKING (full-text only)

### Trigger
User clicks **"⌕ Ask the Bank"** tab or the M/D/1 logo → `QueryView` mounts.

### Flow
1. User types question, presses Enter or clicks Send.
2. Calls edge function **`query`** (POST `/functions/v1/query`) with `{ question, plant_id }`.

### Inside the `query` edge function
1. Attempts RPC `hybrid_search_fulltext(query_text, match_plant_id, match_count=20)` — full-text search across rules, assertions, events.
2. If RPC returns 0 results, falls back to direct `SELECT` (top 12 rules + top 8 assertions, no ranking).
3. Sends up to 15 retrieved items as context to Claude with the question.
4. Claude answers the question, citing items as `[R-001]`, `[A-002]`, etc.
5. Returns `{ answer, sources[], totalRetrieved, mode }`.

### Current limitation
- **Vector search is not active.** The `embed` edge function exists but is never called from the frontend, so the `embeddings` table is empty. The query falls back to full-text search only.
- Results are good for exact terminology but may miss semantically related content.

### Response display
- Answer text rendered with clickable `[R-001]` citation links
- Source chips below answer — click to open detail modal
- Can click further linked items from within the detail modal (stacked modals)

### Follow-ups
- Follow-up questions sent as new independent queries (no conversation memory between turns).

### Ask the Team (from Query)
- "Ask the Team" button in query UI → opens question creation form → creates a `questions` row.

---

## 8. ASK THE TEAM (QUESTIONS) — ✅ WORKING

### Trigger
User clicks **"Questions"** tab or "Ask the Team" from query view.

### Ask a Question form fields
| Field | Required | Notes |
|---|---|---|
| Question | Yes | The question text |
| Detail | No | Supporting context, supports @-mentions |
| Process Area | No | Typeahead |
| Tagged People | No | Multi-select from plant members |

On submit → `addQuestion({...})`:
- **Writes to**: `questions` (plant_id, question, detail, process_area, asked_by=userId, status='open', tagged_people, created_at)

### Notifications triggered
- None on question creation (tagged people are not notified — limitation).

### Answering a question
1. Click question card → detail modal opens.
2. Answer textarea with @-mention support.
3. "Post" → `saveResponse(questionId, text, replyTo)`:
   - **Writes to**: `responses` (question_id, text, by=userId, parent_id=replyTo or null, created_at)
   - **Updates**: `questions` status to 'answered'
   - **Notification**: `notifyUser` fires to question's `asked_by` with "answered your question [Q-001]", links to 'questions' view.

### Threaded replies
- Reply button under any response → sets `replyTo` → creates response with `parent_id` set.
- Displayed indented under parent response.

### Extract knowledge from answers
1. "Extract Knowledge" button appears once answers exist.
2. Calls edge function **`extract`** (POST `/functions/v1/extract`) with narrative = question + all answers concatenated.
3. Returns suggested rules/assertions.
4. User reviews and approves each item.
5. On approve → `addRuleFromExtraction()` / `addAssertionFromExtraction()`:
   - **Writes to**: `rules` or `assertions` (tags=['from-question', questionId], capture_source='Extracted from Question [id]')
   - **Writes to**: `versions`

---

## 9. COMMENTS — ✅ WORKING

### Where comments exist
- Rules (target_type='rule')
- Assertions (target_type='assertion')
- Events (target_type='event')

### Flow
1. Open detail modal for any rule/assertion/event.
2. Scroll to Comments section (loads on demand).
3. Type comment, supports @-mentions (shows plant member dropdown).
4. "Post" → `addComment(targetType, targetId, text)`:
   - **Writes to**: `comments` (target_type, target_id, text, by=displayName, created_at)
5. Comment appears immediately (optimistic UI).

### Who gets notified
- `notifyCreatorOf(targetType, targetId, plantId, "[name] commented on [id]: [preview]", view)` fires.
- Notifies the **creator** of the rule/assertion/event (not other commenters).
- The commenter is excluded from their own notification.

---

## 10. VERIFICATIONS — ✅ WORKING

### Where verifications exist
- Rules and Assertions only.

### Flow
1. Open detail modal.
2. Click **"Verify from Experience"** button.
3. `addVerification(targetType, targetId, verifiedBy)`:
   - **Writes to**: `verifications` (target_type, target_id, verified_by=displayName, created_at)
4. Count increments immediately, button disabled for this session.

### Who gets notified
- `notifyCreatorOf` fires → creator of the rule/assertion is notified: "[name] verified [id] from experience", links to 'rules'/'assertions' view.

### Deduplication
- No DB-level uniqueness constraint — a user can verify the same item multiple times across sessions. Button is only disabled within a session.

---

## 11. LINKS — ✅ WORKING

### How links are created manually
1. Open rule or assertion detail modal.
2. Link Editor section → search field → select target item → choose relationship type → optional comment → "Add Link".
3. `saveLink(sourceType, sourceId, targetType, targetId, relType, comment, createdBy)`:
   - **Writes to**: `links` (source_type, source_id, target_type, target_id, relationship_type, weight=1.0, auto_generated=false, comment, created_by, created_at)

### Relationship types available
`relates_to` (default), `contradicts`, `supports`, `derived_from`, `supersedes`, `caused_by`, `mitigates`

### What happens when a contradiction link is added
- Rule/assertion cards show a **"⚠ Contradiction"** warning badge.
- Detail modal shows contradiction warning with the conflicting item linked.
- Health Dashboard **"Needs Review"** section surfaces contradicted items.
- No notification is sent.

### Automatic link creation
- When an event interview (EventCaptureView) extracts rules/assertions, links are auto-created between the event and those items (`auto_generated=false` currently — treated as manual).
- No other auto-linking is implemented (knowledge graph inference is designed but not built).

### Links from query citations
- Clicking a cited item in query results opens a detail modal — does not create a link.

---

## 12. NOTIFICATIONS — ✅ WORKING

### How notifications work
- Stored in `notifications` table (user_id, text, read=false, target_view, target_id, plant_id, created_at).
- Bell icon in header shows unread count badge.
- Clicking bell opens popover with notification list.
- Clicking a notification → marks as read + navigates to the relevant view + opens the item.

### Complete list of notification triggers

| Event | Who is notified | Text |
|---|---|---|
| Comment posted on a rule/assertion/event | Creator of that item | "[Name] commented on [id]: [preview]" |
| Verification posted on a rule/assertion | Creator of that item | "[Name] verified [id] from experience" |
| Response posted on a question | Asker of that question | "[Name] answered your question [Q-001]" |
| Rule status changed (on edit) | Creator of that rule | "[R-001] status changed to [status]" |
| Assertion status changed (on edit) | Creator of that assertion | "[A-001] status changed to [status]" |
| New link created | Creators of both items | "[Name] linked [source-id] to [target-id]" |

### What is NOT notified
- New question asked (tagged people get no notification)
- New rule/assertion created
- BevCan application approved/rejected (no email, no in-app notification)
- Plant membership role change

---

## 13. PROFILE & SETTINGS — ✅ WORKING (view only)

### Profile dropdown (top right)
- Shows display name + role
- Links: "My Profile", "Settings" (opens Plant Settings if admin), logout

### My Profile view
- Displays: display name, role, plant memberships with join dates
- Contribution stats: rules, assertions, events, questions created; verifications given
- Time filter: last 7 days / 30 days / all time
- Recent activity list
- **Nothing is editable.** Display name changes are not supported in the UI.

### User Profile Modal
- Opened by clicking any author name in a detail view
- Shows that user's contribution stats and recent items
- BevCan profiles show position, company, years in industry if available

---

## 14. PLANT MANAGEMENT — ✅ WORKING

### Creating a plant
- From `/plants` → "Create Plant" → Organisation Name + Plant Name + Industry (optional)
- `findOrCreateOrg(orgName)` → case-insensitive lookup, creates if missing
- `createPlant(orgId, plantName, industry)` → **Writes to**: `plants` (org_id, name, industry, invite_code=[8-char random uppercase], created_at)
- `createMembership(userId, plantId, 'admin')` → **Writes to**: `plant_memberships`
- Creator becomes admin immediately.

### How invite codes work
- Each plant has an 8-character uppercase invite code (generated at plant creation, visible in Plant Settings → Invite tab).
- Any user can join with the code from `/plants` → Join Plant form.
- `joinPlantByCode(inviteCode)` → case-insensitive lookup → inserts membership with role='contributor'.
- No approval required — immediate access.

### Plant Settings (admin only)
Opened via ⚙ icon in header. Tabs:

**Pending** (BevCan plant only):
- Lists pending `bevcan_applications`
- Approve → creates membership + updates application status
- Reject → updates application status

**Members**:
- Lists all `plant_memberships` for this plant
- Change role dropdown → `updateMemberRole()` → **Updates**: `plant_memberships`
- Remove (×) button with confirmation → `removeMember()` → **Deletes**: from `plant_memberships`

**Invite**:
- Shows invite code with copy-to-clipboard button

**Danger Zone** (super-admin only):
- Delete plant — requires typing plant name to confirm
- `deletePlant(plantId)` cascade-deletes all linked data: rules, assertions, events, questions, responses, comments, verifications, links, versions, evidence, notifications, memberships
- Navigates back to `/plants` on success

### Admin-only actions
| Action | Role required |
|---|---|
| View Plant Settings | admin or super-admin |
| Manage members (role change, remove) | admin or super-admin |
| Approve/reject BevCan applications | admin or super-admin |
| Delete plant | super-admin only |
| Access `/admin` dashboard | super-admin only (is_super_admin=true on profile) |

---

## 15. EDGE FUNCTIONS REFERENCE

| Function | Status | Trigger | Purpose |
|---|---|---|---|
| `capture` | ✅ Deployed | CaptureView (each turn) | Multi-turn knowledge capture interview via Claude |
| `extract` | ✅ Deployed | NarrativeInput, QuestionsView | Extracts rules/assertions from free text via Claude |
| `query` | ✅ Deployed | QueryView | Full-text search + Claude answer generation |
| `event-interview` | ✅ Deployed | EventCaptureView | AI-driven incident investigation interview |
| `bevcan-admin` | ✅ Deployed | BevCanSignup, PlantSettings | BevCan applicant registration and admin actions |
| `embed` | ✅ Deployed | **Never called** | Generates vector embeddings — exists but not triggered |

### embed is not triggered
The `embed` function exists and is complete but nothing in the frontend calls it after create/update. As a result:
- The `embeddings` table is empty
- Hybrid search in `query` falls back to full-text only
- Vector similarity search is not active

---

## 16. KNOWLEDGE HEALTH DASHBOARD — ✅ WORKING

### Path
"♥ Health" tab in sidebar.

### Sections
- **Needs Review**: Rules/assertions with status 'Contradicted' or 'Stale'
- **Top Knowledge**: Items ranked by verification count, with time filter (7d / 30d / all time)
- **Archive**: Items with status 'Retired' or 'Superseded'

Click any item → opens detail modal (same as Rules/Assertions view).

---

## 17. RELATIONSHIP GRAPH — ✅ WORKING

### Path
"⬡ Graph" tab in sidebar.

### Behaviour
- Loads all rules, assertions, events, questions + links for active plant
- Canvas-based force-directed layout
- Nodes coloured by type; size reflects connection count
- Labels scale with zoom level (fixed world-space size, up to 16px screen size)
- Click node → opens detail modal
- Hover → tooltip with ID and title
- "View in Graph" from any detail modal → highlights that node

---

## KNOWN GAPS & LIMITATIONS

| Area | Issue |
|---|---|
| Embeddings | `embed` edge function never called; vector search inactive |
| Notifications | Tagged people on questions are not notified |
| Verifications | No uniqueness constraint — same user can verify multiple times |
| Display name edit | Not exposed in UI |
| BevCan approval notification | Applicants receive no email or in-app notification when approved/rejected |
| Question notifications | No notification when a new question is asked |
| Auto-linking | Knowledge graph inference not implemented (links table is designed for it) |
| Email sending | No transactional email configured anywhere in the system |
