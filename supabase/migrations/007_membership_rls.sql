-- =============================================================================
-- 007_membership_rls.sql
-- Replace profile-based plant RLS with membership-based RLS on all data tables.
-- Depends on is_plant_member() / is_plant_admin() from migration 006.
-- =============================================================================

-- ── rules ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view rules in their plant" ON rules;
DROP POLICY IF EXISTS "Users can insert rules in their plant" ON rules;
DROP POLICY IF EXISTS "Users can update rules in their plant" ON rules;
DROP POLICY IF EXISTS "Admins and creators can delete rules" ON rules;

CREATE POLICY "Members can view rules" ON rules
  FOR SELECT USING (is_plant_member(plant_id));

CREATE POLICY "Members can insert rules" ON rules
  FOR INSERT WITH CHECK (is_plant_member(plant_id));

CREATE POLICY "Members can update rules" ON rules
  FOR UPDATE USING (is_plant_member(plant_id));

CREATE POLICY "Admins and creators can delete rules" ON rules
  FOR DELETE USING (
    is_plant_admin(plant_id)
    OR created_by = (SELECT display_name FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── assertions ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view assertions in their plant" ON assertions;
DROP POLICY IF EXISTS "Users can insert assertions in their plant" ON assertions;
DROP POLICY IF EXISTS "Users can update assertions in their plant" ON assertions;
DROP POLICY IF EXISTS "Admins and creators can delete assertions" ON assertions;

CREATE POLICY "Members can view assertions" ON assertions
  FOR SELECT USING (is_plant_member(plant_id));

CREATE POLICY "Members can insert assertions" ON assertions
  FOR INSERT WITH CHECK (is_plant_member(plant_id));

CREATE POLICY "Members can update assertions" ON assertions
  FOR UPDATE USING (is_plant_member(plant_id));

CREATE POLICY "Admins and creators can delete assertions" ON assertions
  FOR DELETE USING (
    is_plant_admin(plant_id)
    OR created_by = (SELECT display_name FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── events ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view events in their plant" ON events;
DROP POLICY IF EXISTS "Users can insert events in their plant" ON events;
DROP POLICY IF EXISTS "Users can update events in their plant" ON events;
DROP POLICY IF EXISTS "Admins and reporters can delete events" ON events;

CREATE POLICY "Members can view events" ON events
  FOR SELECT USING (is_plant_member(plant_id));

CREATE POLICY "Members can insert events" ON events
  FOR INSERT WITH CHECK (is_plant_member(plant_id));

CREATE POLICY "Members can update events" ON events
  FOR UPDATE USING (is_plant_member(plant_id));

CREATE POLICY "Admins and reporters can delete events" ON events
  FOR DELETE USING (
    is_plant_admin(plant_id)
    OR reported_by = (SELECT display_name FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── questions ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view questions in their plant" ON questions;
DROP POLICY IF EXISTS "Users can insert questions in their plant" ON questions;
DROP POLICY IF EXISTS "Users can update questions in their plant" ON questions;

CREATE POLICY "Members can view questions" ON questions
  FOR SELECT USING (is_plant_member(plant_id));

CREATE POLICY "Members can insert questions" ON questions
  FOR INSERT WITH CHECK (is_plant_member(plant_id));

CREATE POLICY "Members can update questions" ON questions
  FOR UPDATE USING (is_plant_member(plant_id));

-- ── evidence: any authenticated user can read/write ──────────────────────────
-- Security comes from the parent rule/assertion being plant-restricted.

DROP POLICY IF EXISTS "Users can view evidence in their plant" ON evidence;
DROP POLICY IF EXISTS "Users can insert evidence in their plant" ON evidence;

CREATE POLICY "Authenticated users can view evidence" ON evidence
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert evidence" ON evidence
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── versions: any authenticated user can read/write ──────────────────────────

DROP POLICY IF EXISTS "Users can view versions in their plant" ON versions;
DROP POLICY IF EXISTS "Users can insert versions in their plant" ON versions;

CREATE POLICY "Authenticated users can view versions" ON versions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert versions" ON versions
  FOR INSERT TO authenticated WITH CHECK (true);
