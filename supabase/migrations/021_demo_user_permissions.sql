-- =============================================================================
-- 021_demo_user_permissions.sql
-- Locks down the demo@md1.app account:
--   - Remove access to BevCan plant
--   - Set role to 'contributor' on EAF plant (no admin controls)
--   - Ensure profile has no super admin flag
-- =============================================================================

-- ── 1. Remove BevCan membership ───────────────────────────────────────────────
DELETE FROM plant_memberships
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'demo@md1.app')
  AND plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid;

-- ── 2. Set EAF role to contributor ────────────────────────────────────────────
UPDATE plant_memberships
SET role = 'contributor'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'demo@md1.app')
  AND plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;

-- ── 3. Clear super admin on profile ───────────────────────────────────────────
UPDATE profiles
SET role = 'contributor', is_super_admin = false
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'demo@md1.app');

-- ── Verify ─────────────────────────────────────────────────────────────────────
SELECT pm.plant_id, pm.role, p.name AS plant_name
FROM plant_memberships pm
JOIN plants p ON p.id = pm.plant_id
WHERE pm.user_id = (SELECT id FROM auth.users WHERE email = 'demo@md1.app');
