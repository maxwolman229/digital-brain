-- =============================================================================
-- 036_documents_extraction_progress.sql
-- Adds extraction_progress jsonb to documents.
--
-- The extract-from-document edge function processes chunks in small batches
-- (per-invocation budget ~150-400s wall-clock) and self-chains via HTTP.
-- extraction_progress tracks which chunks are done across invocations:
--
--   { "total_chunks": 8, "processed": [0,1,2], "failed": [], "started_at": "..." }
--
-- Cleared (set to NULL) when extraction finalises.
-- =============================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS extraction_progress jsonb;
