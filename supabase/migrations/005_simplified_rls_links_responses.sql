-- =============================================================================
-- 005_simplified_rls_links_responses.sql
-- Relax RLS on links and responses.
--
-- The original policies required source_id / question_id to exist in the
-- relevant tables with the user's plant_id. This blocks inserts when items
-- are from in-memory seed data (INITIAL_RULES, INITIAL_QUESTIONS) that
-- hasn't been synced to the DB.
--
-- New approach: any authenticated user can insert/view links and responses.
-- =============================================================================

-- ── Links ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view links in their plant" ON links;
DROP POLICY IF EXISTS "Users can insert links in their plant" ON links;

CREATE POLICY "Authenticated users can view links" ON links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert links" ON links
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── Responses ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view responses to their plant's questions" ON responses;
DROP POLICY IF EXISTS "Users can insert responses to their plant's questions" ON responses;

CREATE POLICY "Authenticated users can view responses" ON responses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert responses" ON responses
  FOR INSERT TO authenticated WITH CHECK (true);
