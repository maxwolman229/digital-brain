-- =============================================================================
-- 014_bevcan_admin_membership.sql
-- Grant mw@korfsteel.com admin membership to the BevCan 1.0 plant.
-- Also sets up a trigger so this survives even if the account is recreated.
-- =============================================================================

-- ── Backfill: grant immediately if account already exists ─────────────────────

INSERT INTO plant_memberships (user_id, plant_id, role)
SELECT
  u.id,
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'admin'
FROM auth.users u
WHERE u.email = 'mw@korfsteel.com'
  AND EXISTS (SELECT 1 FROM plants WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')
ON CONFLICT (user_id, plant_id) DO NOTHING;

-- ── Trigger: auto-grant on any future signup with admin email ─────────────────

CREATE OR REPLACE FUNCTION public.auto_grant_bevcan_admin_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email = 'mw@korfsteel.com' THEN
    IF EXISTS (SELECT 1 FROM plants WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') THEN
      INSERT INTO plant_memberships (user_id, plant_id, role)
      VALUES (NEW.id, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin')
      ON CONFLICT (user_id, plant_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_bevcan_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_bevcan_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_grant_bevcan_admin_membership();
