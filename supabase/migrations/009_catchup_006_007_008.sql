-- =============================================================================
-- 009_catchup_006_007_008.sql
-- Safe combined apply of migrations 006 + 007 + 008 for instances that only
-- have migrations 001-005. Every statement is idempotent (IF NOT EXISTS /
-- IF EXISTS / ON CONFLICT DO NOTHING).
-- Paste the entire file into Supabase Dashboard → SQL Editor → Run.
-- =============================================================================


-- ─── 006: invite codes + plant_memberships ────────────────────────────────────

ALTER TABLE plants ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

UPDATE plants
SET invite_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE invite_code IS NULL;

-- Make invite_code NOT NULL now that all rows have a value
DO $$
BEGIN
  BEGIN
    ALTER TABLE plants ALTER COLUMN invite_code SET NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- Auto-generate invite_code on new plant inserts
CREATE OR REPLACE FUNCTION set_plant_invite_code()
RETURNS TRIGGER AS $$
DECLARE
  attempt   int  := 0;
  candidate text;
BEGIN
  IF NEW.invite_code IS NULL THEN
    LOOP
      candidate := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM plants WHERE invite_code = candidate);
      attempt := attempt + 1;
      IF attempt > 20 THEN
        RAISE EXCEPTION 'Could not generate a unique invite code after 20 attempts';
      END IF;
    END LOOP;
    NEW.invite_code := candidate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plants_set_invite_code ON plants;
CREATE TRIGGER plants_set_invite_code
  BEFORE INSERT ON plants
  FOR EACH ROW EXECUTE FUNCTION set_plant_invite_code();

-- plant_memberships table
CREATE TABLE IF NOT EXISTS plant_memberships (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id    uuid        NOT NULL REFERENCES plants(id)      ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'contributor'
                          CHECK (role IN ('admin', 'contributor', 'viewer')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  invited_by  text,
  UNIQUE(user_id, plant_id)
);

CREATE INDEX IF NOT EXISTS idx_plant_memberships_user  ON plant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_plant_memberships_plant ON plant_memberships(plant_id);

ALTER TABLE plant_memberships ENABLE ROW LEVEL SECURITY;

-- Migrate existing profiles.plant_id rows
INSERT INTO plant_memberships (user_id, plant_id, role, joined_at)
SELECT
  user_id,
  plant_id,
  COALESCE(NULLIF(TRIM(role), ''), 'admin'),
  COALESCE(created_at, now())
FROM profiles
WHERE plant_id IS NOT NULL
ON CONFLICT (user_id, plant_id) DO NOTHING;

-- RLS helper functions
CREATE OR REPLACE FUNCTION is_plant_member(check_plant_id uuid)
RETURNS boolean
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM plant_memberships
    WHERE user_id = auth.uid() AND plant_id = check_plant_id
  );
$$;

CREATE OR REPLACE FUNCTION is_plant_admin(check_plant_id uuid)
RETURNS boolean
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM plant_memberships
    WHERE user_id = auth.uid() AND plant_id = check_plant_id AND role = 'admin'
  );
$$;

-- plant_memberships RLS policies
DROP POLICY IF EXISTS "Users can view own memberships" ON plant_memberships;
CREATE POLICY "Users can view own memberships" ON plant_memberships
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view plant member list" ON plant_memberships;
CREATE POLICY "Admins can view plant member list" ON plant_memberships
  FOR SELECT USING (is_plant_admin(plant_id));

DROP POLICY IF EXISTS "Users can join plants" ON plant_memberships;
CREATE POLICY "Users can join plants" ON plant_memberships
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can add members" ON plant_memberships;
CREATE POLICY "Admins can add members" ON plant_memberships
  FOR INSERT TO authenticated WITH CHECK (is_plant_admin(plant_id));

DROP POLICY IF EXISTS "Admins can remove members" ON plant_memberships;
CREATE POLICY "Admins can remove members" ON plant_memberships
  FOR DELETE USING (is_plant_admin(plant_id));

DROP POLICY IF EXISTS "Admins can update member roles" ON plant_memberships;
CREATE POLICY "Admins can update member roles" ON plant_memberships
  FOR UPDATE USING (is_plant_admin(plant_id));

-- organisations: any authenticated user can view / insert
DROP POLICY IF EXISTS "Users can view their org" ON organisations;
DROP POLICY IF EXISTS "Authenticated users can view orgs" ON organisations;
CREATE POLICY "Authenticated users can view orgs" ON organisations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert orgs" ON organisations;
CREATE POLICY "Authenticated users can insert orgs" ON organisations
  FOR INSERT TO authenticated WITH CHECK (true);

-- plants: any authenticated user can view / insert
DROP POLICY IF EXISTS "Users can view plants in their org" ON plants;
DROP POLICY IF EXISTS "Authenticated users can view plants" ON plants;
CREATE POLICY "Authenticated users can view plants" ON plants
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert plants" ON plants;
CREATE POLICY "Authenticated users can insert plants" ON plants
  FOR INSERT TO authenticated WITH CHECK (true);

-- Grant table access to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON plant_memberships TO authenticated;


-- ─── 007: membership-based RLS on data tables ─────────────────────────────────

-- rules
DROP POLICY IF EXISTS "Users can view rules in their plant" ON rules;
DROP POLICY IF EXISTS "Users can insert rules in their plant" ON rules;
DROP POLICY IF EXISTS "Users can update rules in their plant" ON rules;
DROP POLICY IF EXISTS "Admins and creators can delete rules" ON rules;
DROP POLICY IF EXISTS "Members can view rules" ON rules;
DROP POLICY IF EXISTS "Members can insert rules" ON rules;
DROP POLICY IF EXISTS "Members can update rules" ON rules;

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

-- assertions
DROP POLICY IF EXISTS "Users can view assertions in their plant" ON assertions;
DROP POLICY IF EXISTS "Users can insert assertions in their plant" ON assertions;
DROP POLICY IF EXISTS "Users can update assertions in their plant" ON assertions;
DROP POLICY IF EXISTS "Admins and creators can delete assertions" ON assertions;
DROP POLICY IF EXISTS "Members can view assertions" ON assertions;
DROP POLICY IF EXISTS "Members can insert assertions" ON assertions;
DROP POLICY IF EXISTS "Members can update assertions" ON assertions;

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

-- events
DROP POLICY IF EXISTS "Users can view events in their plant" ON events;
DROP POLICY IF EXISTS "Users can insert events in their plant" ON events;
DROP POLICY IF EXISTS "Users can update events in their plant" ON events;
DROP POLICY IF EXISTS "Admins and reporters can delete events" ON events;
DROP POLICY IF EXISTS "Members can view events" ON events;
DROP POLICY IF EXISTS "Members can insert events" ON events;
DROP POLICY IF EXISTS "Members can update events" ON events;

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

-- questions
DROP POLICY IF EXISTS "Users can view questions in their plant" ON questions;
DROP POLICY IF EXISTS "Users can insert questions in their plant" ON questions;
DROP POLICY IF EXISTS "Users can update questions in their plant" ON questions;
DROP POLICY IF EXISTS "Members can view questions" ON questions;
DROP POLICY IF EXISTS "Members can insert questions" ON questions;
DROP POLICY IF EXISTS "Members can update questions" ON questions;

CREATE POLICY "Members can view questions" ON questions
  FOR SELECT USING (is_plant_member(plant_id));
CREATE POLICY "Members can insert questions" ON questions
  FOR INSERT WITH CHECK (is_plant_member(plant_id));
CREATE POLICY "Members can update questions" ON questions
  FOR UPDATE USING (is_plant_member(plant_id));

-- evidence: any authenticated user
DROP POLICY IF EXISTS "Users can view evidence in their plant" ON evidence;
DROP POLICY IF EXISTS "Users can insert evidence in their plant" ON evidence;
DROP POLICY IF EXISTS "Authenticated users can view evidence" ON evidence;
DROP POLICY IF EXISTS "Authenticated users can insert evidence" ON evidence;

CREATE POLICY "Authenticated users can view evidence" ON evidence
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert evidence" ON evidence
  FOR INSERT TO authenticated WITH CHECK (true);

-- versions: any authenticated user
DROP POLICY IF EXISTS "Users can view versions in their plant" ON versions;
DROP POLICY IF EXISTS "Users can insert versions in their plant" ON versions;
DROP POLICY IF EXISTS "Authenticated users can view versions" ON versions;
DROP POLICY IF EXISTS "Authenticated users can insert versions" ON versions;

CREATE POLICY "Authenticated users can view versions" ON versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert versions" ON versions
  FOR INSERT TO authenticated WITH CHECK (true);


-- ─── 008: seed demo user membership ──────────────────────────────────────────

-- Backfill any profile that has plant_id but no membership row
INSERT INTO plant_memberships (user_id, plant_id, role, joined_at)
SELECT
  p.user_id,
  p.plant_id,
  COALESCE(NULLIF(TRIM(p.role), ''), 'admin'),
  COALESCE(p.created_at, now())
FROM profiles p
WHERE p.plant_id IS NOT NULL
ON CONFLICT (user_id, plant_id) DO NOTHING;

-- Ensure demo user has admin access to the seed plant
INSERT INTO plant_memberships (user_id, plant_id, role)
SELECT
  u.id,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'admin'
FROM auth.users u
WHERE u.email = 'demo@md1.app'
  AND EXISTS (SELECT 1 FROM plants WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (user_id, plant_id) DO NOTHING;
