-- =============================================================================
-- 019_fix_plant_isolation.sql
-- Fixes cross-plant data contamination between EAF demo plant (bbbb) and
-- BevCan plant (dddd).
--
-- Root cause: PLANT_ID() in db.js fell back to 'bbbbbbbb' when userContext
-- wasn't populated, causing items created during knowledge capture sessions
-- to be saved to the EAF plant regardless of which plant was active.
--
-- EAF demo plant:  bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- BevCan plant:    dddddddd-dddd-dddd-dddd-dddddddddddd
-- =============================================================================

-- ── DIAGNOSTIC: show what is on each plant before cleanup ─────────────────────
-- (Commented out — uncomment to inspect before running)
--
-- SELECT 'EAF rules' AS label, id, title FROM rules
--   WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
--
-- SELECT 'BevCan rules' AS label, id, title FROM rules
--   WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
--
-- SELECT 'EAF assertions' AS label, id, title FROM assertions
--   WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
--
-- SELECT 'BevCan assertions' AS label, id, title FROM assertions
--   WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';


-- ── 1. Move BC-xxx rules from EAF plant → BevCan plant ────────────────────────
-- These are BevCan reference rules that were accidentally seeded / saved to the
-- EAF demo plant. If an identical BC-xxx already exists on dddd, delete the dup;
-- otherwise re-assign the plant_id.

-- Delete duplicates (same id already exists correctly on dddd)
DELETE FROM rules
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id LIKE 'BC-%'
  AND id IN (
    SELECT id FROM rules WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  );

-- Re-assign any remaining BC-xxx on EAF to BevCan
UPDATE rules
SET plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id LIKE 'BC-%';


-- ── 2. Move BC-xxx assertions from EAF plant → BevCan plant ──────────────────

DELETE FROM assertions
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id LIKE 'BC-%'
  AND id IN (
    SELECT id FROM assertions WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  );

UPDATE assertions
SET plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id LIKE 'BC-%';


-- ── 3. Remove R-xxx / A-xxx items accidentally created on BevCan plant ────────
-- These are EAF-style IDs (R-xxxxxx, A-xxxxxx) that ended up on dddd because
-- the user had the BevCan plant active during a knowledge capture session.
-- These items are orphaned: they are not EAF data and do not belong on BevCan.
-- Cascade-delete all dependent rows first.

DO $$
DECLARE
  bad_rule_ids text[];
  bad_assertion_ids text[];
  bad_event_ids text[];
  bad_question_ids text[];
BEGIN

  -- Collect misrouted IDs on BevCan
  SELECT array_agg(id) INTO bad_rule_ids
    FROM rules
    WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      AND id ~ '^R-[a-z0-9]+$';   -- matches R-xxxxxx random-suffix IDs

  SELECT array_agg(id) INTO bad_assertion_ids
    FROM assertions
    WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      AND id ~ '^A-[a-z0-9]+$';

  SELECT array_agg(id) INTO bad_event_ids
    FROM events
    WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  SELECT array_agg(id) INTO bad_question_ids
    FROM questions
    WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  -- Delete dependent data for bad rules
  IF bad_rule_ids IS NOT NULL THEN
    DELETE FROM links    WHERE source_id = ANY(bad_rule_ids) OR target_id = ANY(bad_rule_ids);
    DELETE FROM comments WHERE target_id = ANY(bad_rule_ids);
    DELETE FROM verifications WHERE target_id = ANY(bad_rule_ids);
    DELETE FROM versions WHERE target_id = ANY(bad_rule_ids);
    DELETE FROM evidence WHERE parent_id = ANY(bad_rule_ids);
    DELETE FROM rules    WHERE id = ANY(bad_rule_ids);
  END IF;

  -- Delete dependent data for bad assertions
  IF bad_assertion_ids IS NOT NULL THEN
    DELETE FROM links    WHERE source_id = ANY(bad_assertion_ids) OR target_id = ANY(bad_assertion_ids);
    DELETE FROM comments WHERE target_id = ANY(bad_assertion_ids);
    DELETE FROM verifications WHERE target_id = ANY(bad_assertion_ids);
    DELETE FROM versions WHERE target_id = ANY(bad_assertion_ids);
    DELETE FROM evidence WHERE parent_id = ANY(bad_assertion_ids);
    DELETE FROM assertions WHERE id = ANY(bad_assertion_ids);
  END IF;

  -- Delete dependent data for bad events
  IF bad_event_ids IS NOT NULL THEN
    DELETE FROM links    WHERE source_id = ANY(bad_event_ids) OR target_id = ANY(bad_event_ids);
    DELETE FROM comments WHERE target_id = ANY(bad_event_ids);
    DELETE FROM versions WHERE target_id = ANY(bad_event_ids);
    DELETE FROM events   WHERE id = ANY(bad_event_ids);
  END IF;

  -- Delete dependent data for bad questions
  IF bad_question_ids IS NOT NULL THEN
    DELETE FROM responses WHERE question_id = ANY(bad_question_ids);
    DELETE FROM questions  WHERE id = ANY(bad_question_ids);
  END IF;

END $$;


-- ── 4. Null-out any notifications on BevCan that reference bad items ──────────
-- (Notifications that pointed to now-deleted items are stale anyway)
DELETE FROM notifications
WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  AND target_id NOT IN (
    SELECT id FROM rules      WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    UNION ALL
    SELECT id FROM assertions WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    UNION ALL
    SELECT id FROM events     WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    UNION ALL
    SELECT id FROM questions  WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  );


-- ── 5. Verification: show final state ─────────────────────────────────────────
-- After running, both queries below should contain ONLY the correct IDs.

-- EAF plant should have: R-xxx and A-xxx style IDs (EAF-domain rules)
-- SELECT 'EAF final' AS label, id, title FROM rules
--   WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- BevCan plant should have: BC-001 to BC-020 only
-- SELECT 'BevCan final' AS label, id, title FROM rules
--   WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
