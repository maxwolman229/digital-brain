-- Add photos jsonb column to rules and assertions
ALTER TABLE rules ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE assertions ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;

-- Create storage bucket for knowledge photos
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-photos', 'knowledge-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies: authenticated users can upload/delete, anyone can view (public bucket)
CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'knowledge-photos');

CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'knowledge-photos');

CREATE POLICY "Anyone can view photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'knowledge-photos');
