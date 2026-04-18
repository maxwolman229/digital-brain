-- =============================================================================
-- 028_simplify_roles.sql
-- Simplifies role system: removes super_admin, leaves admin/contributor/viewer.
-- =============================================================================

-- ── 1. Fix any super_admin memberships ──────────────────────────────────────

UPDATE plant_memberships SET role = 'admin' WHERE role = 'super_admin';

-- ── 2. Replace plant DELETE policy ──────────────────────────────────────────
-- Old: super admins only (via profiles.is_super_admin).
-- New: plant admins (via plant_memberships).

DROP POLICY IF EXISTS "Super admins can delete plants" ON plants;

CREATE POLICY "Admins can delete plants" ON plants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM plant_memberships
      WHERE plant_memberships.plant_id = plants.id
        AND plant_memberships.user_id = auth.uid()
        AND plant_memberships.role = 'admin'
    )
  );

-- ── 3. Add UPDATE policy on plants for admins ───────────────────────────────
-- (was missing — admins should be able to edit plant settings)

CREATE POLICY "Admins can update plants" ON plants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM plant_memberships
      WHERE plant_memberships.plant_id = plants.id
        AND plant_memberships.user_id = auth.uid()
        AND plant_memberships.role = 'admin'
    )
  );

-- ── 4. Drop the is_super_admin column from profiles ─────────────────────────

ALTER TABLE profiles DROP COLUMN IF EXISTS is_super_admin;
