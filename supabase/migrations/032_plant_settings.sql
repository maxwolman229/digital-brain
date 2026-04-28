-- =============================================================================
-- 032_plant_settings.sql
-- Per-plant feature toggles. First entry: contradiction_check_enabled.
-- Plants can disable contradiction detection during initial bulk import or
-- if they don't want the workflow.
-- =============================================================================

CREATE TABLE plant_settings (
  plant_id                     uuid        PRIMARY KEY REFERENCES plants(id) ON DELETE CASCADE,
  contradiction_check_enabled  boolean     NOT NULL DEFAULT true,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION plant_settings_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER plant_settings_updated_at
  BEFORE UPDATE ON plant_settings
  FOR EACH ROW EXECUTE FUNCTION plant_settings_touch_updated_at();

-- Backfill: every existing plant gets a row with defaults.
INSERT INTO plant_settings (plant_id)
SELECT id FROM plants
ON CONFLICT (plant_id) DO NOTHING;

-- Auto-create settings for new plants.
CREATE OR REPLACE FUNCTION plant_settings_seed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO plant_settings (plant_id) VALUES (NEW.id)
  ON CONFLICT (plant_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS plants_seed_settings ON plants;
CREATE TRIGGER plants_seed_settings
  AFTER INSERT ON plants
  FOR EACH ROW EXECUTE FUNCTION plant_settings_seed();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE plant_settings ENABLE ROW LEVEL SECURITY;

-- Members can read their plant's settings (so the contradiction check can
-- be skipped client-side when disabled).
CREATE POLICY "Members can read plant settings" ON plant_settings
  FOR SELECT USING (is_plant_member(plant_id));

-- Only admins can change settings.
CREATE POLICY "Admins can update plant settings" ON plant_settings
  FOR UPDATE USING (is_plant_admin(plant_id));
