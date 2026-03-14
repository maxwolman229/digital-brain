-- =============================================================================
-- 006_plant_memberships.sql
-- Multi-plant access: invite codes, plant_memberships table, updated RLS
-- helpers and policies for the membership tables.
-- =============================================================================

-- ── Add invite_code to plants ─────────────────────────────────────────────────

ALTER TABLE plants ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

UPDATE plants
SET invite_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE invite_code IS NULL;

ALTER TABLE plants ALTER COLUMN invite_code SET NOT NULL;

-- Auto-generate invite_code on every new plant insert
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

-- ── Create plant_memberships ──────────────────────────────────────────────────

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

-- ── Migrate existing profile rows to plant_memberships ────────────────────────

INSERT INTO plant_memberships (user_id, plant_id, role, joined_at)
SELECT
  user_id,
  plant_id,
  COALESCE(NULLIF(TRIM(role), ''), 'admin'),
  COALESCE(created_at, now())
FROM profiles
WHERE plant_id IS NOT NULL
ON CONFLICT (user_id, plant_id) DO NOTHING;

-- ── RLS helper functions ──────────────────────────────────────────────────────

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

-- ── plant_memberships RLS policies ───────────────────────────────────────────

-- Users see their own memberships (for plant switcher)
CREATE POLICY "Users can view own memberships" ON plant_memberships
  FOR SELECT USING (user_id = auth.uid());

-- Admins see all memberships in their plants (member list)
CREATE POLICY "Admins can view plant member list" ON plant_memberships
  FOR SELECT USING (is_plant_admin(plant_id));

-- Users can join plants themselves (invite code flow)
CREATE POLICY "Users can join plants" ON plant_memberships
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Admins can add others to their plants
CREATE POLICY "Admins can add members" ON plant_memberships
  FOR INSERT TO authenticated WITH CHECK (is_plant_admin(plant_id));

-- Admins can remove members
CREATE POLICY "Admins can remove members" ON plant_memberships
  FOR DELETE USING (is_plant_admin(plant_id));

-- Admins can update member roles
CREATE POLICY "Admins can update member roles" ON plant_memberships
  FOR UPDATE USING (is_plant_admin(plant_id));

-- ── organisations: any authenticated user can view / insert ──────────────────
-- Needed so users can find or create orgs when joining/creating plants.

DROP POLICY IF EXISTS "Users can view their org" ON organisations;
CREATE POLICY "Authenticated users can view orgs" ON organisations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert orgs" ON organisations
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── plants: any authenticated user can view / insert ─────────────────────────
-- Needed so users can look up a plant by invite code before they're members.

DROP POLICY IF EXISTS "Users can view plants in their org" ON plants;
CREATE POLICY "Authenticated users can view plants" ON plants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert plants" ON plants
  FOR INSERT TO authenticated WITH CHECK (true);
