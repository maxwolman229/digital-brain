-- =============================================================================
-- 037_extraction_watchdog.sql
-- pg_cron watchdog that drives extraction continuation when the in-function
-- self-trigger fails or a worker dies mid-pipeline.
--
-- DESIGN
-- Every minute the watchdog scans for documents stuck in status='extracting'
-- with updated_at older than 90s. For each, it fires a continuation HTTP call
-- to the extract-from-document edge function. The function picks up where
-- extraction_progress left off (per-chunk checkpoints already in place).
--
-- 90s window rationale: a healthy invocation processes 1-2 chunks in 30-120s
-- and updates updated_at on each chunk. 90s without update strongly suggests
-- the chain has broken.
--
-- PRE-REQUISITES (run these in the Supabase dashboard SQL Editor before this
-- migration):
--
--   1. Enable pg_cron and pg_net extensions:
--      Database → Extensions → enable pg_cron and pg_net
--
--   2. Store the service-role key in Supabase Vault so the watchdog can
--      authenticate to the edge function:
--
--        SELECT vault.create_secret(
--          '<paste service_role key here>',
--          'service_role_key'
--        );
--
--      (You can verify with:
--        SELECT name FROM vault.decrypted_secrets WHERE name='service_role_key';
--      )
-- =============================================================================

-- ── 1. Single-document continuation helper ─────────────────────────────────

CREATE OR REPLACE FUNCTION extraction_continue_document(p_document_id uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        text := 'https://itcbcolpqcbvkfktwatq.supabase.co/functions/v1/extract-from-document';
  v_key        text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE WARNING
      'extraction_continue_document: service_role_key not found in vault. '
      'Run: SELECT vault.create_secret(''<key>'', ''service_role_key'');';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'content-type',  'application/json',
                 'authorization', 'Bearer ' || v_key,
                 'apikey',        v_key
               ),
    body    := jsonb_build_object(
                 'document_id', p_document_id,
                 '_continue',   true
               )
  ) INTO v_request_id;

  RETURN v_request_id;
END $$;

-- ── 2. Watchdog tick (run every minute) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION extraction_watchdog_tick()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r   record;
  cnt integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM documents
    WHERE status = 'extracting'
      AND updated_at < now() - interval '90 seconds'
  LOOP
    PERFORM extraction_continue_document(r.id);
    cnt := cnt + 1;
  END LOOP;

  IF cnt > 0 THEN
    RAISE NOTICE 'extraction_watchdog_tick: nudged % stuck document(s)', cnt;
  END IF;
  RETURN cnt;
END $$;

-- ── 3. Schedule the cron job ────────────────────────────────────────────────
-- Idempotent: drop any prior schedule with the same name first.

DO $$
BEGIN
  PERFORM cron.unschedule('extraction_watchdog');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not scheduled yet, fine
END $$;

SELECT cron.schedule(
  'extraction_watchdog',
  '* * * * *',                           -- every minute
  'SELECT extraction_watchdog_tick();'
);
