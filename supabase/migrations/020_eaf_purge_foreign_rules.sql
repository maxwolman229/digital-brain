-- =============================================================================
-- 020_eaf_purge_foreign_data.sql
-- Removes every rule, assertion, and event from the EAF demo plant that is
-- NOT part of the original seed data.
--
-- EAF plant:  bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- Allowed rules:      R-001 … R-022
-- Allowed assertions: A-001 … A-010
-- Allowed events:     E-001 … E-008
--
-- Everything else on this plant is foreign data that arrived via the old
-- PLANT_ID() fallback bug and must be purged.
-- =============================================================================

DO $$
DECLARE
  eaf_plant       text := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  keep_rules      text[] := ARRAY[
    'R-001','R-002','R-003','R-004','R-005','R-006','R-007','R-008',
    'R-009','R-010','R-011','R-012','R-013','R-014','R-015','R-016',
    'R-017','R-018','R-019','R-020','R-021','R-022'
  ];
  keep_assertions text[] := ARRAY[
    'A-001','A-002','A-003','A-004','A-005',
    'A-006','A-007','A-008','A-009','A-010'
  ];
  keep_events     text[] := ARRAY[
    'E-001','E-002','E-003','E-004',
    'E-005','E-006','E-007','E-008'
  ];
  bad_rule_ids   text[];
  bad_assert_ids text[];
  bad_event_ids  text[];
BEGIN

  -- ── Collect foreign rows ───────────────────────────────────────────────────
  SELECT array_agg(id) INTO bad_rule_ids
    FROM rules WHERE plant_id = eaf_plant::uuid AND id != ALL(keep_rules);

  SELECT array_agg(id) INTO bad_assert_ids
    FROM assertions WHERE plant_id = eaf_plant::uuid AND id != ALL(keep_assertions);

  SELECT array_agg(id) INTO bad_event_ids
    FROM events WHERE plant_id = eaf_plant::uuid AND id != ALL(keep_events);

  RAISE NOTICE 'Foreign rules to purge (%): %',    array_length(bad_rule_ids,   1), bad_rule_ids;
  RAISE NOTICE 'Foreign assertions to purge (%): %', array_length(bad_assert_ids, 1), bad_assert_ids;
  RAISE NOTICE 'Foreign events to purge (%): %',    array_length(bad_event_ids,  1), bad_event_ids;

  -- ── Cascade-delete foreign rules ──────────────────────────────────────────
  IF bad_rule_ids IS NOT NULL THEN
    DELETE FROM links         WHERE source_id = ANY(bad_rule_ids) OR target_id = ANY(bad_rule_ids);
    DELETE FROM comments      WHERE target_id = ANY(bad_rule_ids);
    DELETE FROM verifications WHERE target_id = ANY(bad_rule_ids);
    DELETE FROM versions      WHERE target_id = ANY(bad_rule_ids);
    DELETE FROM evidence      WHERE parent_id  = ANY(bad_rule_ids);
    DELETE FROM rules         WHERE id         = ANY(bad_rule_ids);
    RAISE NOTICE 'Deleted % foreign rules.', array_length(bad_rule_ids, 1);
  ELSE
    RAISE NOTICE 'No foreign rules on EAF — nothing to delete.';
  END IF;

  -- ── Cascade-delete foreign assertions ─────────────────────────────────────
  IF bad_assert_ids IS NOT NULL THEN
    DELETE FROM links         WHERE source_id = ANY(bad_assert_ids) OR target_id = ANY(bad_assert_ids);
    DELETE FROM comments      WHERE target_id = ANY(bad_assert_ids);
    DELETE FROM verifications WHERE target_id = ANY(bad_assert_ids);
    DELETE FROM versions      WHERE target_id = ANY(bad_assert_ids);
    DELETE FROM evidence      WHERE parent_id  = ANY(bad_assert_ids);
    DELETE FROM assertions    WHERE id         = ANY(bad_assert_ids);
    RAISE NOTICE 'Deleted % foreign assertions.', array_length(bad_assert_ids, 1);
  ELSE
    RAISE NOTICE 'No foreign assertions on EAF — nothing to delete.';
  END IF;

  -- ── Cascade-delete foreign events ─────────────────────────────────────────
  IF bad_event_ids IS NOT NULL THEN
    DELETE FROM links    WHERE source_id = ANY(bad_event_ids) OR target_id = ANY(bad_event_ids);
    DELETE FROM comments WHERE target_id = ANY(bad_event_ids);
    DELETE FROM versions WHERE target_id = ANY(bad_event_ids);
    DELETE FROM events   WHERE id        = ANY(bad_event_ids);
    RAISE NOTICE 'Deleted % foreign events.', array_length(bad_event_ids, 1);
  ELSE
    RAISE NOTICE 'No foreign events on EAF — nothing to delete.';
  END IF;

END $$;

-- ── Verify: only seed data remains ────────────────────────────────────────────
SELECT 'rules'      AS entity, id, title FROM rules      WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid ORDER BY id;
SELECT 'assertions' AS entity, id, title FROM assertions WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid ORDER BY id;
SELECT 'events'     AS entity, id, title FROM events     WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid ORDER BY id;
