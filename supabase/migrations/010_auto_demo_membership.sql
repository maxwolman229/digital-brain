-- =============================================================================
-- 010_auto_demo_membership.sql
-- Permanently fix RLS data loss on the EAF demo plant by ensuring every
-- authenticated user automatically gets a membership row for it.
--
-- Root cause: is_plant_member() checks plant_memberships. Users who sign in
-- with any account other than demo@md1.app have no row → all queries return
-- 0 rows silently, making the plant appear empty even though data exists.
-- =============================================================================

-- ── Trigger: auto-grant any new auth.users row membership to the demo plant ──

CREATE OR REPLACE FUNCTION public.auto_grant_demo_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM plants WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN
    INSERT INTO plant_memberships (user_id, plant_id, role)
    VALUES (NEW.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'contributor')
    ON CONFLICT (user_id, plant_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_demo_membership ON auth.users;
CREATE TRIGGER on_auth_user_created_demo_membership
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_grant_demo_membership();

-- ── Backfill: grant membership to all existing users who don't have one ───────

INSERT INTO plant_memberships (user_id, plant_id, role)
SELECT
  u.id,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'contributor'
FROM auth.users u
WHERE EXISTS (SELECT 1 FROM plants WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  AND NOT EXISTS (
    SELECT 1 FROM plant_memberships
    WHERE user_id = u.id
      AND plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
ON CONFLICT (user_id, plant_id) DO NOTHING;
