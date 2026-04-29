-- =============================================================================
-- 038_assertions_rationale.sql
-- Adds rationale column to assertions to mirror rules.
--
-- Why: extraction candidates of type 'assertion' include a "why is this true /
-- important" rationale that was being dropped during promotion because the
-- target table had no place to store it. Promotion now preserves it. The
-- AssertionsView UI already conditionally renders item.rationale, so the
-- field becomes visible the moment the column exists.
--
-- Also updates the assertions search_vector trigger to include rationale so
-- full-text search across assertions matches content in the rationale field
-- (rules already include it).
-- =============================================================================

ALTER TABLE assertions
  ADD COLUMN IF NOT EXISTS rationale text;

-- Replace the search_vector trigger function so future inserts/updates
-- include rationale. Existing rows have NULL rationale so their stored
-- search_vector is unaffected.
CREATE OR REPLACE FUNCTION assertions_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title,'')        || ' ' ||
    coalesce(NEW.scope,'')        || ' ' ||
    coalesce(NEW.rationale,'')    || ' ' ||
    coalesce(NEW.category,'')     || ' ' ||
    coalesce(NEW.process_area,'')
  );
  RETURN NEW;
END $$;
