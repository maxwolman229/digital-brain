-- =============================================================================
-- 042_plant_settings_insert_policy.sql
-- Allows plant admins to INSERT into plant_settings.
--
-- Migration 032 created SELECT (members) and UPDATE (admins) policies but no
-- INSERT policy. The settings UI calls `updatePlantSettings` which uses
-- supabase-js `.upsert()`, and PostgREST upserts send
-- `INSERT ... ON CONFLICT DO UPDATE`. Postgres checks INSERT permission first,
-- even when the row already exists — so the toggle fails with
-- "new row violates row-level security policy for table plant_settings"
-- regardless of whether a settings row was pre-seeded by the trigger.
--
-- Also adds a WITH CHECK clause on UPDATE so an admin can't rewrite plant_id
-- to point at a plant they aren't admin of (defensive — the UI never does this).
-- =============================================================================

DROP POLICY IF EXISTS "Admins can insert plant settings" ON plant_settings;
CREATE POLICY "Admins can insert plant settings" ON plant_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_plant_admin(plant_id));

DROP POLICY IF EXISTS "Admins can update plant settings" ON plant_settings;
CREATE POLICY "Admins can update plant settings" ON plant_settings
  FOR UPDATE TO authenticated
  USING      (is_plant_admin(plant_id))
  WITH CHECK (is_plant_admin(plant_id));
