-- =============================================================================
-- 040_query_chat_history.sql
-- Persistent chat history for the Query interface.
--
-- One row per message. Per-user and per-plant: a user's history in Plant A
-- never leaks into Plant B. Hard-deleted on "Clear chat history".
-- Recent rows are sent back to the query edge function as conversational
-- context so follow-ups like "what about for peritectic grades?" resolve.
-- =============================================================================

CREATE TABLE IF NOT EXISTS query_chat_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id      uuid NOT NULL REFERENCES plants(id)     ON DELETE CASCADE,
  message_text  text NOT NULL,
  -- 'user_question' or 'system_response'
  message_type  text NOT NULL CHECK (message_type IN ('user_question', 'system_response')),
  -- Cited rule/assertion/event display_ids + db ids (assistant messages only).
  -- Stored as JSON so we can re-render the source chips without re-fetching.
  citations     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The dominant read pattern is "last N messages for this user in this plant,
-- newest first" — composite index ordered DESC matches it exactly.
CREATE INDEX IF NOT EXISTS query_chat_history_user_plant_created_idx
  ON query_chat_history (user_id, plant_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE query_chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qch_select_own ON query_chat_history;
CREATE POLICY qch_select_own ON query_chat_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS qch_insert_own ON query_chat_history;
CREATE POLICY qch_insert_own ON query_chat_history
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS qch_delete_own ON query_chat_history;
CREATE POLICY qch_delete_own ON query_chat_history
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
