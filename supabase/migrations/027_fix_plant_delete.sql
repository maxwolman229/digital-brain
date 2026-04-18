-- =============================================================================
-- 027_fix_plant_delete.sql
-- Fixes plant deletion: adds DELETE RLS policy and fixes FK constraint.
--
-- Problem: plants table had no DELETE RLS policy, so frontend deletes
-- were silently blocked. Also, profiles.plant_id FK lacked ON DELETE SET NULL.
-- =============================================================================

-- ── 1. Add DELETE policy for super admins ────────────────────────────────────

CREATE POLICY "Super admins can delete plants" ON plants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

-- ── 2. Fix profiles.plant_id FK to allow SET NULL on plant delete ────────────

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plant_id_fkey;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_plant_id_fkey
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE SET NULL;
