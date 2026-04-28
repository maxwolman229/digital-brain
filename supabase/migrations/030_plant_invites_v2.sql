-- =============================================================================
-- 030_plant_invites_v2.sql
-- Rebuilds plant_invites for the staged invite flow:
--   1. member invites           → status='pending_approval' (or 'approved' if member is admin)
--   2. admin approves/rejects   → status='approved' or 'rejected'
--   3. email sent on 'approved' → recipient clicks link
--   4. recipient accepts        → status='accepted'
--
-- Role on accept is selectable at invite time (contributor or viewer only).
-- Admin role requires a separate promotion by an existing admin.
-- =============================================================================

-- ── 1. Drop old table cleanly ───────────────────────────────────────────────

DROP TABLE IF EXISTS plant_invites CASCADE;

-- ── 2. New plant_invites schema ─────────────────────────────────────────────

CREATE TABLE plant_invites (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id        uuid        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  recipient_email text        NOT NULL,
  invited_by      uuid        NOT NULL REFERENCES auth.users(id),
  invited_at      timestamptz NOT NULL DEFAULT now(),

  -- Role the recipient gets when they accept. Admin is intentionally
  -- excluded — admin promotion requires a separate action.
  role            text        NOT NULL DEFAULT 'contributor'
                              CHECK (role IN ('contributor', 'viewer')),

  status          text        NOT NULL DEFAULT 'pending_approval'
                              CHECK (status IN (
                                'pending_approval',
                                'approved',
                                'rejected',
                                'accepted',
                                'expired'
                              )),

  approved_by     uuid        REFERENCES auth.users(id),
  approved_at     timestamptz,
  rejected_by     uuid        REFERENCES auth.users(id),
  rejected_at     timestamptz,
  accepted_at     timestamptz,
  accepted_by     uuid        REFERENCES auth.users(id),

  -- 32-char URL-safe random token used as the link param.
  token           text        NOT NULL UNIQUE
                              DEFAULT encode(gen_random_bytes(24), 'base64'),

  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Block duplicate active invites (one per plant + lower(email) at a time).
  -- Accepted/rejected/expired don't count, so a user can be re-invited later.
  CONSTRAINT plant_invites_no_dupe_active
    EXCLUDE USING btree (plant_id WITH =, lower(recipient_email) WITH =)
    WHERE (status IN ('pending_approval', 'approved'))
);

CREATE INDEX idx_plant_invites_plant_status ON plant_invites(plant_id, status);
CREATE INDEX idx_plant_invites_email        ON plant_invites(lower(recipient_email));
CREATE INDEX idx_plant_invites_token        ON plant_invites(token);

-- ── 3. updated_at trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION plant_invites_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER plant_invites_updated_at
  BEFORE UPDATE ON plant_invites
  FOR EACH ROW EXECUTE FUNCTION plant_invites_touch_updated_at();

-- ── 4. Row-level security ───────────────────────────────────────────────────

ALTER TABLE plant_invites ENABLE ROW LEVEL SECURITY;

-- Any plant member can view invites for their plant.
CREATE POLICY "Members can view plant invites" ON plant_invites
  FOR SELECT USING (is_plant_member(plant_id));

-- Any plant member can create invites. Status must be one of the two valid
-- entry states. (db.js sets 'pending_approval' for non-admin creators and
-- 'approved' for admin creators.)
CREATE POLICY "Members can create invites" ON plant_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    is_plant_member(plant_id)
    AND invited_by = auth.uid()
    AND status IN ('pending_approval', 'approved')
    AND role IN ('contributor', 'viewer')
  );

-- Only admins can change status (approve, reject) or otherwise update.
CREATE POLICY "Admins can update invites" ON plant_invites
  FOR UPDATE USING (is_plant_admin(plant_id));

-- Only admins can delete invites.
CREATE POLICY "Admins can delete invites" ON plant_invites
  FOR DELETE USING (is_plant_admin(plant_id));

-- ── 5. Anonymous lookup by token (for /accept-invite page) ──────────────────

CREATE OR REPLACE FUNCTION lookup_invite_by_token(p_token text)
RETURNS TABLE (
  id              uuid,
  plant_id        uuid,
  plant_name      text,
  recipient_email text,
  status          text,
  expires_at      timestamptz,
  role            text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    i.id,
    i.plant_id,
    p.name AS plant_name,
    i.recipient_email,
    i.status,
    i.expires_at,
    i.role
  FROM plant_invites i
  JOIN plants p ON p.id = i.plant_id
  WHERE i.token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION lookup_invite_by_token(text) TO anon, authenticated;

-- ── 6. accept_invite RPC (atomic, server-validated) ─────────────────────────

CREATE OR REPLACE FUNCTION accept_invite(p_token text)
RETURNS TABLE (success boolean, plant_id uuid, message text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite plant_invites%ROWTYPE;
  v_user_email text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'You must be logged in to accept this invite.';
    RETURN;
  END IF;

  SELECT * INTO v_invite FROM plant_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Invite not found.';
    RETURN;
  END IF;

  IF v_invite.status = 'accepted' THEN
    RETURN QUERY SELECT false, v_invite.plant_id, 'This invite has already been accepted.';
    RETURN;
  END IF;
  IF v_invite.status = 'rejected' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'This invite is no longer valid.';
    RETURN;
  END IF;
  IF v_invite.status <> 'approved' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'This invite has not been approved yet.';
    RETURN;
  END IF;
  IF v_invite.expires_at < now() THEN
    UPDATE plant_invites SET status = 'expired' WHERE id = v_invite.id;
    RETURN QUERY SELECT false, NULL::uuid, 'This invite has expired. Ask the plant admin to send a new one.';
    RETURN;
  END IF;

  -- Verify the logged-in user's email matches the invite recipient.
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF lower(v_user_email) <> lower(v_invite.recipient_email) THEN
    RETURN QUERY SELECT false, NULL::uuid,
      'This invite was sent to a different email address.';
    RETURN;
  END IF;

  -- Create membership (idempotent — if they already exist, just accept).
  INSERT INTO plant_memberships (user_id, plant_id, role, invited_by)
  VALUES (v_uid, v_invite.plant_id, v_invite.role, v_invite.invited_by)
  ON CONFLICT (user_id, plant_id) DO NOTHING;

  UPDATE plant_invites
    SET status = 'accepted', accepted_at = now(), accepted_by = v_uid
    WHERE id = v_invite.id;

  RETURN QUERY SELECT true, v_invite.plant_id, 'Welcome to the plant.';
END $$;

GRANT EXECUTE ON FUNCTION accept_invite(text) TO authenticated;
