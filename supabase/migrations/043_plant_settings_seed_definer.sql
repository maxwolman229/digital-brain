-- =============================================================================
-- 043_plant_settings_seed_definer.sql
-- Lets the plant_settings auto-seed trigger bypass RLS.
--
-- After 042 added an INSERT policy gated on is_plant_admin(plant_id), creating
-- a new plant started failing: the AFTER INSERT trigger on `plants` fires
-- during plant creation, before the creator has been written into
-- plant_memberships, so is_plant_admin(new_plant_id) is false and the
-- system-managed seed insert fails RLS.
--
-- The seed is bookkeeping that must always succeed for a newly-created plant,
-- regardless of who created it. SECURITY DEFINER runs the function as its
-- owner (postgres), which bypasses RLS. The function body is fixed — it only
-- inserts a row keyed by NEW.id from the trigger, so there's no SQL-injection
-- surface to worry about.
-- =============================================================================

CREATE OR REPLACE FUNCTION plant_settings_seed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO plant_settings (plant_id) VALUES (NEW.id)
  ON CONFLICT (plant_id) DO NOTHING;
  RETURN NEW;
END $$;
