-- =============================================================================
-- 008_demo_membership.sql
-- Ensure the demo user (demo@md1.app) has a plant_membership for the seed
-- plant. Runs idempotently — safe to re-apply.
-- =============================================================================

-- Also ensure all existing profiles that have a plant_id but no matching
-- plant_memberships row are backfilled. This catches accounts created before
-- the new onboarding flow (which uses createProfileSimple) was deployed.
INSERT INTO plant_memberships (user_id, plant_id, role, joined_at)
SELECT
  p.user_id,
  p.plant_id,
  COALESCE(NULLIF(TRIM(p.role), ''), 'admin'),
  COALESCE(p.created_at, now())
FROM profiles p
WHERE p.plant_id IS NOT NULL
ON CONFLICT (user_id, plant_id) DO NOTHING;

-- Ensure the demo user specifically has membership for the seed plant,
-- in case their profile was created without a plant_id.
INSERT INTO plant_memberships (user_id, plant_id, role)
SELECT
  u.id,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'admin'
FROM auth.users u
WHERE u.email = 'demo@md1.app'
  AND EXISTS (
    SELECT 1 FROM plants
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
ON CONFLICT (user_id, plant_id) DO NOTHING;
