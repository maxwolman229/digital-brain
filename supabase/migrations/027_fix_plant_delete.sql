-- =============================================================================
-- 027_fix_plant_delete.sql
-- Fixes profiles.plant_id FK to allow SET NULL when a plant is deleted.
-- =============================================================================

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plant_id_fkey;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_plant_id_fkey
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE SET NULL;
