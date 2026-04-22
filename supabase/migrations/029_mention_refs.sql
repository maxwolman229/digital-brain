-- =============================================================================
-- 029_mention_refs.sql
-- Adds mentioned_user_ids columns so free-text fields can carry structured
-- references to users. Text fields store tokens @[Name](user-uuid); the
-- mirrored uuid[] column is populated on save by the frontend for fast
-- "who was mentioned" lookups and notification dispatch.
-- =============================================================================

ALTER TABLE comments   ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE events     ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE questions  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE responses  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comments_mentioned_users  ON comments  USING GIN (mentioned_user_ids);
CREATE INDEX IF NOT EXISTS idx_events_mentioned_users    ON events    USING GIN (mentioned_user_ids);
CREATE INDEX IF NOT EXISTS idx_questions_mentioned_users ON questions USING GIN (mentioned_user_ids);
CREATE INDEX IF NOT EXISTS idx_responses_mentioned_users ON responses USING GIN (mentioned_user_ids);
