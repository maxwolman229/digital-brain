-- =============================================================================
-- 018_bevcan_apply_rls.sql
-- Relaxes the INSERT policy on bevcan_applications so that brand-new users
-- (who may not yet have a live JWT from auth.uid() if email confirmation is
-- enabled) can still submit an application.
--
-- Rationale: bevcan_applications is a public application form — we want anyone
-- to be able to submit one. The SELECT policy still restricts reads to the
-- user's own row (or admin via service role). The edge function (bevcan-admin)
-- uses service role and bypasses RLS entirely for admin actions.
-- =============================================================================

-- Drop the overly strict policy that requires auth.uid() = user_id on INSERT.
-- This fails for fresh signups before their JWT is fully usable.
DROP POLICY IF EXISTS "bevcan_app_insert_own" ON bevcan_applications;

-- Allow any insert. The application form is public — we accept all submissions
-- and manually review them. The SELECT policy still protects reads.
CREATE POLICY "bevcan_app_insert" ON bevcan_applications
  FOR INSERT WITH CHECK (true);
