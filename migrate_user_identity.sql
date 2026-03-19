-- ═══════════════════════════════════════════════════════════════════════
-- MD1 User Identity Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Fix 1: Migrate all "by" text fields from display_name → user_id ──────────
--
-- For each table, updates rows where the stored value matches a known
-- display_name in profiles. Rows where the value is already a UUID
-- (e.g. already migrated) are skipped via the NOT SIMILAR TO check.
-- Rows where no profile matches are left unchanged (graceful fallback).

-- rules.created_by
UPDATE rules r
SET created_by = p.user_id::text
FROM profiles p
WHERE p.display_name = r.created_by
  AND r.created_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- assertions.created_by
UPDATE assertions a
SET created_by = p.user_id::text
FROM profiles p
WHERE p.display_name = a.created_by
  AND a.created_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- events.reported_by
UPDATE events e
SET reported_by = p.user_id::text
FROM profiles p
WHERE p.display_name = e.reported_by
  AND e.reported_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- questions.asked_by
UPDATE questions q
SET asked_by = p.user_id::text
FROM profiles p
WHERE p.display_name = q.asked_by
  AND q.asked_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- responses.by
UPDATE responses r
SET by = p.user_id::text
FROM profiles p
WHERE p.display_name = r.by
  AND r.by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- comments.by
UPDATE comments c
SET by = p.user_id::text
FROM profiles p
WHERE p.display_name = c.by
  AND c.by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- verifications.verified_by
UPDATE verifications v
SET verified_by = p.user_id::text
FROM profiles p
WHERE p.display_name = v.verified_by
  AND v.verified_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- links.created_by
UPDATE links l
SET created_by = p.user_id::text
FROM profiles p
WHERE p.display_name = l.created_by
  AND l.created_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- versions.author
UPDATE versions v
SET author = p.user_id::text
FROM profiles p
WHERE p.display_name = v.author
  AND v.author NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- evidence.source
UPDATE evidence e
SET source = p.user_id::text
FROM profiles p
WHERE p.display_name = e.source
  AND e.source NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';


-- ── Fix 2: Set super admin flag ───────────────────────────────────────────────

UPDATE profiles
SET is_super_admin = true
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'mw@korfsteel.com'
);


-- ── Verify results ────────────────────────────────────────────────────────────

-- Check how many records still have display names (non-UUID) in key fields:
SELECT
  'rules' AS tbl,
  COUNT(*) FILTER (WHERE created_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') AS display_name_count,
  COUNT(*) AS total
FROM rules
UNION ALL
SELECT 'assertions', COUNT(*) FILTER (WHERE created_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), COUNT(*) FROM assertions
UNION ALL
SELECT 'events', COUNT(*) FILTER (WHERE reported_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), COUNT(*) FROM events
UNION ALL
SELECT 'questions', COUNT(*) FILTER (WHERE asked_by NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), COUNT(*) FROM questions;

-- Check super admin set correctly:
SELECT user_id, display_name, is_super_admin FROM profiles WHERE is_super_admin = true;
