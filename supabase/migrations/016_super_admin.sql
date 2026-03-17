-- =============================================================================
-- 016_super_admin.sql
-- Adds is_super_admin flag to profiles and grants it to mw@korfsteel.com.
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

UPDATE profiles
SET is_super_admin = true
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'mw@korfsteel.com'
);
