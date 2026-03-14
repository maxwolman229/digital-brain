-- =============================================================================
-- 003_auth_setup.sql
-- Tighten RLS: remove anonymous-permissive read policies added on 2026-03-12.
-- Set up demo organisation, plant, and profile.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Remove any anonymous-permissive policies that were added for demo use.
--    (These were added ad-hoc via the dashboard. Names may vary — drop by
--    the patterns below and adjust if needed.)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname ILIKE '%anon%'
        OR policyname ILIKE '%public read%'
        OR policyname ILIKE '%open read%'
        OR policyname ILIKE '%allow all%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Ensure all tables require authentication (belt-and-suspenders).
--    The 001 migration already creates auth-only policies. This just closes
--    any accidental gaps added since then.
-- -----------------------------------------------------------------------------

-- Revoke public SELECT on all data tables so anon key cannot bypass RLS.
-- (Supabase grants SELECT to the anon role by default; we remove it here.)
REVOKE SELECT ON TABLE
  organisations, plants, profiles, rules, assertions,
  events, questions, responses, comments, verifications,
  links, evidence, versions, notifications, embeddings
FROM anon;

-- Authenticated users still get full access via RLS policies from 001.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  organisations, plants, profiles, rules, assertions,
  events, questions, responses, comments, verifications,
  links, evidence, versions, notifications, embeddings
TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. Demo organisation and plant (seed UUIDs match existing seed data).
--    These rows must exist BEFORE the demo user profile can be created.
-- -----------------------------------------------------------------------------

INSERT INTO organisations (id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Demo Corp')
ON CONFLICT (id) DO NOTHING;

INSERT INTO plants (id, org_id, name, process_areas)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Demo Steel Plant',
  ARRAY['EAF', 'Casting', 'Rolling', 'Ladle Furnace', 'Scrap Yard', 'Quality Lab']
)
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. Demo user account setup.
--
--    The demo user (demo@md1.app / digitalbrain) must be created through
--    Supabase Auth — it cannot be inserted directly into auth.users via SQL.
--
--    MANUAL STEP — run once in Supabase Dashboard > Authentication > Users:
--      Email:    demo@md1.app
--      Password: digitalbrain
--      ✓ Auto Confirm User
--
--    Then grab the generated user UUID and run:
--
--      INSERT INTO public.profiles (user_id, display_name, role, org_id, plant_id)
--      VALUES (
--        '<paste-uuid-here>',
--        'Demo User',
--        'admin',
--        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
--      )
--      ON CONFLICT (user_id) DO NOTHING;
--
--    The demo user will then be able to sign in and see all seed data.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 5. Notifications table: allow service role to insert, users to read own.
--    (Belt-and-suspenders — these policies exist in 001 but included here
--    for clarity in case of policy drift.)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
CREATE POLICY "Service role can insert notifications" ON notifications
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
