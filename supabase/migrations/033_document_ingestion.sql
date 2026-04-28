-- =============================================================================
-- 033_document_ingestion.sql
-- Document Ingestion: admins upload manuals/SOPs/bulletins; the extract-from-
-- document edge function pulls structured rule/assertion candidates which sit
-- in a staging area until an admin promotes them to the live knowledge bank.
--
-- This migration:
--   1. documents              — uploaded files + extraction status
--   2. extraction_candidates  — staged rules/assertions awaiting review
--   3. extraction_candidate_edits — audit trail of reviewer edits
--   4. RLS (admin-only on all three)
--   5. updated_at + version-numbering triggers
--
-- See 034_rules_assertions_source.sql for the source-citation columns added
-- to rules/assertions, and 035_documents_storage.sql for the storage bucket.
-- =============================================================================

-- ── 1. documents ─────────────────────────────────────────────────────────────

CREATE TABLE documents (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id            uuid        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  uploaded_by         uuid        NOT NULL REFERENCES auth.users(id),

  title               text        NOT NULL,
  document_type       text        NOT NULL
                                  CHECK (document_type IN (
                                    'manual',
                                    'sop',
                                    'technical_bulletin',
                                    'commissioning_report',
                                    'training_material',
                                    'other'
                                  )),
  process_area        text,
  equipment_reference text,

  file_path           text        NOT NULL,
  file_size_bytes     bigint      NOT NULL,
  mime_type           text        NOT NULL,
  page_count          integer,

  status              text        NOT NULL DEFAULT 'uploading'
                                  CHECK (status IN (
                                    'uploading',
                                    'extracting',
                                    'ready_for_review',
                                    'review_in_progress',
                                    'review_complete',
                                    'failed'
                                  )),
  extraction_error    text,

  candidate_count     integer     NOT NULL DEFAULT 0,
  approved_count      integer     NOT NULL DEFAULT 0,
  rejected_count      integer     NOT NULL DEFAULT 0,
  promoted_count      integer     NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_plant_id      ON documents(plant_id);
CREATE INDEX idx_documents_status        ON documents(status);
CREATE INDEX idx_documents_plant_created ON documents(plant_id, created_at DESC);

-- ── 2. extraction_candidates ─────────────────────────────────────────────────

CREATE TABLE extraction_candidates (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id        uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  type               text        NOT NULL CHECK (type IN ('rule', 'assertion')),
  title              text        NOT NULL,
  content            text        NOT NULL,
  scope              text,
  rationale          text,

  source_excerpt     text        NOT NULL,
  source_page        integer,
  source_section     text,

  confidence         text        NOT NULL DEFAULT 'medium'
                                 CHECK (confidence IN ('high', 'medium', 'low')),

  status             text        NOT NULL DEFAULT 'pending_review'
                                 CHECK (status IN (
                                   'pending_review',
                                   'approved',
                                   'rejected',
                                   'promoted'
                                 )),

  reviewed_by        uuid        REFERENCES auth.users(id),
  reviewed_at        timestamptz,

  promoted_at        timestamptz,
  -- rules/assertions PKs are text (e.g. "R-EAF-001"), not uuid — see 001_initial_schema.sql.
  promoted_to_id     text,
  promoted_to_type   text        CHECK (promoted_to_type IS NULL
                                        OR promoted_to_type IN ('rule', 'assertion')),

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ec_document_id     ON extraction_candidates(document_id);
CREATE INDEX idx_ec_status          ON extraction_candidates(document_id, status);
CREATE INDEX idx_ec_type            ON extraction_candidates(document_id, type);
CREATE INDEX idx_ec_promoted_lookup ON extraction_candidates(promoted_to_type, promoted_to_id)
  WHERE promoted_to_id IS NOT NULL;

-- ── 3. extraction_candidate_edits ────────────────────────────────────────────

CREATE TABLE extraction_candidate_edits (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    uuid        NOT NULL REFERENCES extraction_candidates(id) ON DELETE CASCADE,

  edited_by       uuid        NOT NULL REFERENCES auth.users(id),
  edited_at       timestamptz NOT NULL DEFAULT now(),

  -- shape: { "title": {"old":"…","new":"…"}, "content": {...}, ... }
  field_changes   jsonb       NOT NULL,
  reason          text        NOT NULL CHECK (length(trim(reason)) > 0),

  version_number  integer     NOT NULL,

  UNIQUE (candidate_id, version_number)
);

CREATE INDEX idx_ece_candidate_id ON extraction_candidate_edits(candidate_id);

-- Auto-assign version_number sequentially per candidate.
CREATE OR REPLACE FUNCTION extraction_candidate_edits_assign_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number = 0 THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO NEW.version_number
      FROM extraction_candidate_edits
      WHERE candidate_id = NEW.candidate_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ece_assign_version
  BEFORE INSERT ON extraction_candidate_edits
  FOR EACH ROW EXECUTE FUNCTION extraction_candidate_edits_assign_version();

-- ── 4. updated_at triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION documents_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_touch_updated_at();

CREATE OR REPLACE FUNCTION extraction_candidates_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER ec_updated_at
  BEFORE UPDATE ON extraction_candidates
  FOR EACH ROW EXECUTE FUNCTION extraction_candidates_touch_updated_at();

-- ── 5. Row-level security (admin-only) ───────────────────────────────────────

ALTER TABLE documents                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_candidates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_candidate_edits   ENABLE ROW LEVEL SECURITY;

-- documents: full CRUD restricted to plant admins.
CREATE POLICY "Admins read documents" ON documents
  FOR SELECT USING (is_plant_admin(plant_id));

CREATE POLICY "Admins insert documents" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (is_plant_admin(plant_id) AND uploaded_by = auth.uid());

CREATE POLICY "Admins update documents" ON documents
  FOR UPDATE USING (is_plant_admin(plant_id));

CREATE POLICY "Admins delete documents" ON documents
  FOR DELETE USING (is_plant_admin(plant_id));

-- extraction_candidates: cascade through document → plant.
CREATE POLICY "Admins read candidates" ON extraction_candidates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM documents d
            WHERE d.id = extraction_candidates.document_id
              AND is_plant_admin(d.plant_id))
  );

CREATE POLICY "Admins insert candidates" ON extraction_candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM documents d
            WHERE d.id = extraction_candidates.document_id
              AND is_plant_admin(d.plant_id))
  );

CREATE POLICY "Admins update candidates" ON extraction_candidates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM documents d
            WHERE d.id = extraction_candidates.document_id
              AND is_plant_admin(d.plant_id))
  );

CREATE POLICY "Admins delete candidates" ON extraction_candidates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM documents d
            WHERE d.id = extraction_candidates.document_id
              AND is_plant_admin(d.plant_id))
  );

-- extraction_candidate_edits: read by admins of the parent plant; insert by
-- admins on candidates they can update.
CREATE POLICY "Admins read candidate edits" ON extraction_candidate_edits
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM extraction_candidates c
            JOIN documents d ON d.id = c.document_id
            WHERE c.id = extraction_candidate_edits.candidate_id
              AND is_plant_admin(d.plant_id))
  );

CREATE POLICY "Admins insert candidate edits" ON extraction_candidate_edits
  FOR INSERT TO authenticated
  WITH CHECK (
    edited_by = auth.uid()
    AND EXISTS (SELECT 1 FROM extraction_candidates c
                JOIN documents d ON d.id = c.document_id
                WHERE c.id = extraction_candidate_edits.candidate_id
                  AND is_plant_admin(d.plant_id))
  );

-- No UPDATE/DELETE policy on edits — they're append-only audit history.
