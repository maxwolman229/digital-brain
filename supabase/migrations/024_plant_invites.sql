-- =============================================================================
-- 024_plant_invites.sql
-- Email-based invite system: replaces invite codes.
-- Flow: member invites by email → admin approves → membership created.
-- =============================================================================

-- ── 1. Create plant_invites table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plant_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id    uuid        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_plant_invites_plant  ON plant_invites(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_invites_email  ON plant_invites(email);
CREATE INDEX IF NOT EXISTS idx_plant_invites_status ON plant_invites(plant_id, status);

ALTER TABLE plant_invites ENABLE ROW LEVEL SECURITY;

-- ── 2. RLS policies ─────────────────────────────────────────────────────────

-- All plant members can view invites for their plant
CREATE POLICY "Members can view plant invites" ON plant_invites
  FOR SELECT USING (is_plant_member(plant_id));

-- Any plant member can create an invite
CREATE POLICY "Members can create invites" ON plant_invites
  FOR INSERT TO authenticated WITH CHECK (is_plant_member(plant_id));

-- Only admins can update invites (approve/reject)
CREATE POLICY "Admins can update invites" ON plant_invites
  FOR UPDATE USING (is_plant_admin(plant_id));

-- Only admins can delete invites
CREATE POLICY "Admins can delete invites" ON plant_invites
  FOR DELETE USING (is_plant_admin(plant_id));

-- ── 3. Update plant_memberships RLS so all members see the member list ──────

-- Drop the admin-only policy and replace with member-visible
DROP POLICY IF EXISTS "Admins can view plant member list" ON plant_memberships;

CREATE POLICY "Members can view plant member list" ON plant_memberships
  FOR SELECT USING (is_plant_member(plant_id));

-- ── 4. Remove invite_code NOT NULL constraint ───────────────────────────────
-- Keep the column for now (don't drop data) but make it optional.

ALTER TABLE plants ALTER COLUMN invite_code DROP NOT NULL;

-- ── 5. Helper: look up auth user ID by email ────────────────────────────────
-- Used by approveInvite to create membership if user already signed up.

CREATE OR REPLACE FUNCTION get_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM auth.users WHERE email = lower(lookup_email) LIMIT 1;
$$;
