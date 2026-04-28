-- =============================================================================
-- 035_documents_storage.sql
-- Private Supabase Storage bucket for uploaded documents.
--
-- Path layout: {plant_id}/{document_id}/{filename}
--
-- Access pattern:
--   • Upload  — admins, via authenticated client (path[1] must be a plant they admin)
--   • Read    — admins only, via signed URLs minted server-side or by the client
--   • Delete  — admins only
--
-- The bucket is private; clients never get a public URL. The UI fetches a
-- short-lived signed URL when the user clicks "View original document".
-- =============================================================================

-- ── 1. Create the bucket (idempotent) ────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('plant-documents', 'plant-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Storage RLS policies ──────────────────────────────────────────────────
-- storage.objects.name has the form "{plant_id}/{document_id}/{filename}".
-- We use storage.foldername(name)[1] to extract the plant_id segment, cast to
-- uuid, and check is_plant_admin().

-- Read (used by signed-URL minting).
CREATE POLICY "Admins read plant documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'plant-documents'
    AND is_plant_admin( (storage.foldername(name))[1]::uuid )
  );

-- Upload.
CREATE POLICY "Admins upload plant documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'plant-documents'
    AND is_plant_admin( (storage.foldername(name))[1]::uuid )
  );

-- Update (e.g. metadata; we don't overwrite content in current flow).
CREATE POLICY "Admins update plant documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'plant-documents'
    AND is_plant_admin( (storage.foldername(name))[1]::uuid )
  );

-- Delete (cleanup when a document row is removed).
CREATE POLICY "Admins delete plant documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'plant-documents'
    AND is_plant_admin( (storage.foldername(name))[1]::uuid )
  );
