-- =============================================================================
-- 034_rules_assertions_source.sql
-- Adds source-citation columns to rules and assertions so a promoted candidate
-- carries its document provenance (excerpt, edit flag) into the live bank.
--
-- Behaviour on document deletion:
--   • The FK uses ON DELETE SET NULL — the rule survives, but loses its link.
--   • A BEFORE DELETE trigger on `documents` flags affected rules/assertions
--     with source_document_deleted=true so the UI can show "source removed".
-- =============================================================================

-- ── 1. Source columns on rules ───────────────────────────────────────────────

ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS source_document_id              uuid
    REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_excerpt                  text,
  ADD COLUMN IF NOT EXISTS source_extraction_candidate_id  uuid
    REFERENCES extraction_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS was_edited_from_source          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_document_deleted         boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rules_source_document_id
  ON rules(source_document_id) WHERE source_document_id IS NOT NULL;

-- ── 2. Source columns on assertions ──────────────────────────────────────────

ALTER TABLE assertions
  ADD COLUMN IF NOT EXISTS source_document_id              uuid
    REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_excerpt                  text,
  ADD COLUMN IF NOT EXISTS source_extraction_candidate_id  uuid
    REFERENCES extraction_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS was_edited_from_source          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_document_deleted         boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_assertions_source_document_id
  ON assertions(source_document_id) WHERE source_document_id IS NOT NULL;

-- ── 3. BEFORE DELETE trigger: flag dependents before FK SET NULL nulls them ──

CREATE OR REPLACE FUNCTION documents_flag_orphaned_sources()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE rules      SET source_document_deleted = true WHERE source_document_id = OLD.id;
  UPDATE assertions SET source_document_deleted = true WHERE source_document_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS documents_flag_orphans ON documents;
CREATE TRIGGER documents_flag_orphans
  BEFORE DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_flag_orphaned_sources();
