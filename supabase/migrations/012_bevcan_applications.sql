-- =============================================================================
-- 012_bevcan_applications.sql
-- Creates the bevcan_applications table for the BevCan 1.0 public industry
-- knowledge bank. New signups are held in pending status until manually
-- approved by an admin. On approval, a plant_membership row is created.
-- =============================================================================

CREATE TABLE IF NOT EXISTS bevcan_applications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text NOT NULL,
  full_name           text NOT NULL,
  nickname            text NOT NULL,
  current_position    text NOT NULL,
  current_company     text,
  past_positions      text[] DEFAULT '{}',
  year_joined_industry integer,
  bio                 text,
  confirmed_industry  boolean DEFAULT false,
  status              text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  applied_at          timestamptz DEFAULT now(),
  reviewed_at         timestamptz,
  reviewed_by         text
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE bevcan_applications ENABLE ROW LEVEL SECURITY;

-- Users can read their own application
CREATE POLICY "bevcan_app_select_own" ON bevcan_applications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own application
CREATE POLICY "bevcan_app_insert_own" ON bevcan_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role (used by admin edge function) bypasses RLS automatically
