-- =============================================================================
-- 031_accept_invite_rename_outparam.sql
-- Renames accept_invite() OUT parameter from plant_id → accepted_plant_id to
-- avoid Postgres "column reference plant_id is ambiguous" errors when the
-- function INSERTs into plant_memberships (which also has a plant_id column).
--
-- The function's body is unchanged. Only the OUT parameter name changes,
-- which means we must DROP + CREATE (CREATE OR REPLACE can't change return type).
-- =============================================================================

DROP FUNCTION IF EXISTS accept_invite(text);

CREATE OR REPLACE FUNCTION accept_invite(p_token text)
RETURNS TABLE (success boolean, accepted_plant_id uuid, message text)
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
