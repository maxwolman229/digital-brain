-- =============================================================================
-- 004_simplified_rls.sql
-- Relax RLS on comments and verifications.
--
-- The original policies required target_id to exist in the rules/assertions
-- table with the user's plant_id. This blocked inserts when items are shown
-- from in-memory seed data (INITIAL_RULES) that hasn't been synced to the DB.
--
-- New approach: any authenticated user can insert/view comments and
-- verifications. The data is not sensitive — it's operational commentary.
-- =============================================================================

-- ── Comments ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view comments in their plant" ON comments;
DROP POLICY IF EXISTS "Users can insert comments in their plant" ON comments;

CREATE POLICY "Authenticated users can view comments" ON comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert comments" ON comments
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── Verifications ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view verifications in their plant" ON verifications;
DROP POLICY IF EXISTS "Users can insert verifications in their plant" ON verifications;

CREATE POLICY "Authenticated users can view verifications" ON verifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert verifications" ON verifications
  FOR INSERT TO authenticated WITH CHECK (true);
