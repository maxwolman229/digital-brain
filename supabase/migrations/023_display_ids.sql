-- =============================================================================
-- 023_display_ids.sql
-- Adds human-readable display IDs to all knowledge items.
-- Format: [type]-[plant_code]-[seq], e.g. R-EAF-001, A-BEV-002
--
-- The existing text PK (e.g. "R-a8699o") remains the actual primary key.
-- display_id is a user-facing label only.
-- =============================================================================

-- ── 1. Add short_code to plants ─────────────────────────────────────────────

ALTER TABLE plants ADD COLUMN IF NOT EXISTS short_code text;

UPDATE plants SET short_code = 'EAF' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND short_code IS NULL;
UPDATE plants SET short_code = 'BEV' WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' AND short_code IS NULL;
UPDATE plants SET short_code = 'BIS' WHERE id = '752c24a3-f707-450c-9b02-b0670e407037' AND short_code IS NULL;

-- Unique constraint: no two plants share a short_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_short_code ON plants(short_code);

-- ── 2. Add display_id column to item tables ─────────────────────────────────

ALTER TABLE rules      ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE assertions ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE events     ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE questions  ADD COLUMN IF NOT EXISTS display_id text;

-- Unique per plant
CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_display_id      ON rules(plant_id, display_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assertions_display_id ON assertions(plant_id, display_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_display_id     ON events(plant_id, display_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_display_id  ON questions(plant_id, display_id);

-- ── 3. Populate display_ids for existing EAF data ───────────────────────────

-- EAF rules: R-001 → R-EAF-001, R-a8699o → R-EAF-023
UPDATE rules SET display_id = 'R-EAF-' || LPAD(SUBSTRING(id FROM '[0-9]+'), 3, '0')
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id ~ '^R-\d{3}$'
  AND display_id IS NULL;

-- Random-ID EAF rules get sequential display_ids after the seed data
DO $$
DECLARE
  rec RECORD;
  seq int;
BEGIN
  seq := (SELECT COALESCE(MAX(SUBSTRING(display_id FROM '[0-9]+')::int), 0)
          FROM rules WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NOT NULL);
  FOR rec IN
    SELECT id FROM rules
    WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NULL
    ORDER BY created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE rules SET display_id = 'R-EAF-' || LPAD(seq::text, 3, '0') WHERE id = rec.id;
  END LOOP;
END $$;

-- EAF assertions: A-001 → A-EAF-001, A-tbdqbj → A-EAF-011
UPDATE assertions SET display_id = 'A-EAF-' || LPAD(SUBSTRING(id FROM '[0-9]+'), 3, '0')
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id ~ '^A-\d{3}$'
  AND display_id IS NULL;

DO $$
DECLARE
  rec RECORD;
  seq int;
BEGIN
  seq := (SELECT COALESCE(MAX(SUBSTRING(display_id FROM '[0-9]+')::int), 0)
          FROM assertions WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NOT NULL);
  FOR rec IN
    SELECT id FROM assertions
    WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NULL
    ORDER BY created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE assertions SET display_id = 'A-EAF-' || LPAD(seq::text, 3, '0') WHERE id = rec.id;
  END LOOP;
END $$;

-- EAF events: E-001 → E-EAF-001 etc.
UPDATE events SET display_id = 'E-EAF-' || LPAD(SUBSTRING(id FROM '[0-9]+'), 3, '0')
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id ~ '^E-\d{3}$'
  AND display_id IS NULL;

DO $$
DECLARE
  rec RECORD;
  seq int;
BEGIN
  seq := (SELECT COALESCE(MAX(SUBSTRING(display_id FROM '[0-9]+')::int), 0)
          FROM events WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NOT NULL);
  FOR rec IN
    SELECT id FROM events
    WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NULL
    ORDER BY created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE events SET display_id = 'E-EAF-' || LPAD(seq::text, 3, '0') WHERE id = rec.id;
  END LOOP;
END $$;

-- EAF questions: Q-001 → Q-EAF-001 etc.
UPDATE questions SET display_id = 'Q-EAF-' || LPAD(SUBSTRING(id FROM '[0-9]+'), 3, '0')
WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND id ~ '^Q-\d{3}$'
  AND display_id IS NULL;

DO $$
DECLARE
  rec RECORD;
  seq int;
BEGIN
  seq := (SELECT COALESCE(MAX(SUBSTRING(display_id FROM '[0-9]+')::int), 0)
          FROM questions WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NOT NULL);
  FOR rec IN
    SELECT id FROM questions
    WHERE plant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND display_id IS NULL
    ORDER BY created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE questions SET display_id = 'Q-EAF-' || LPAD(seq::text, 3, '0') WHERE id = rec.id;
  END LOOP;
END $$;

-- ── 4. Populate display_ids for existing BevCan data ────────────────────────

-- BevCan rules: BC-001 → R-BEV-001 etc.
UPDATE rules SET display_id = 'R-BEV-' || LPAD(SUBSTRING(id FROM '[0-9]+'), 3, '0')
WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  AND id ~ '^BC-\d{3}$'
  AND display_id IS NULL;

-- Catch any random-ID BevCan items
DO $$
DECLARE
  tbl text;
  prefix text;
  rec RECORD;
  seq int;
BEGIN
  FOR tbl, prefix IN VALUES ('rules', 'R'), ('assertions', 'A'), ('events', 'E'), ('questions', 'Q')
  LOOP
    EXECUTE format(
      'SELECT COALESCE(MAX(SUBSTRING(display_id FROM ''[0-9]+'')::int), 0) FROM %I WHERE plant_id = $1 AND display_id IS NOT NULL',
      tbl
    ) INTO seq USING 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid;

    FOR rec IN EXECUTE format(
      'SELECT id FROM %I WHERE plant_id = $1 AND display_id IS NULL ORDER BY created_at ASC', tbl
    ) USING 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid
    LOOP
      seq := seq + 1;
      EXECUTE format('UPDATE %I SET display_id = $1 WHERE id = $2', tbl)
        USING prefix || '-BEV-' || LPAD(seq::text, 3, '0'), rec.id;
    END LOOP;
  END LOOP;
END $$;

-- ── 5. Catch-all: populate any remaining plants (Bishopville etc.) ──────────

DO $$
DECLARE
  plant RECORD;
  tbl text;
  prefix text;
  rec RECORD;
  seq int;
BEGIN
  FOR plant IN SELECT id, short_code FROM plants WHERE short_code IS NOT NULL
  LOOP
    FOR tbl, prefix IN VALUES ('rules', 'R'), ('assertions', 'A'), ('events', 'E'), ('questions', 'Q')
    LOOP
      EXECUTE format(
        'SELECT COALESCE(MAX(SUBSTRING(display_id FROM ''[0-9]+'')::int), 0) FROM %I WHERE plant_id = $1 AND display_id IS NOT NULL',
        tbl
      ) INTO seq USING plant.id;

      FOR rec IN EXECUTE format(
        'SELECT id FROM %I WHERE plant_id = $1 AND display_id IS NULL ORDER BY created_at ASC', tbl
      ) USING plant.id
      LOOP
        seq := seq + 1;
        EXECUTE format('UPDATE %I SET display_id = $1 WHERE id = $2', tbl)
          USING prefix || '-' || plant.short_code || '-' || LPAD(seq::text, 3, '0'), rec.id;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ── 6. Atomic sequence generator function ───────────────────────────────────
-- Called from the frontend to get the next display_id for a new item.
-- Uses advisory locks to prevent race conditions.

CREATE OR REPLACE FUNCTION next_display_id(
  p_plant_id uuid,
  p_type     text  -- 'rule', 'assertion', 'event', 'question'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  code   text;
  prefix text;
  tbl    text;
  seq    int;
  result text;
BEGIN
  -- Get plant short_code
  SELECT short_code INTO code FROM plants WHERE id = p_plant_id;
  IF code IS NULL THEN
    RAISE EXCEPTION 'Plant % has no short_code', p_plant_id;
  END IF;

  -- Map type to prefix and table
  CASE p_type
    WHEN 'rule'      THEN prefix := 'R'; tbl := 'rules';
    WHEN 'assertion'  THEN prefix := 'A'; tbl := 'assertions';
    WHEN 'event'      THEN prefix := 'E'; tbl := 'events';
    WHEN 'question'   THEN prefix := 'Q'; tbl := 'questions';
    ELSE RAISE EXCEPTION 'Invalid type: %', p_type;
  END CASE;

  -- Advisory lock keyed on plant_id + type to serialise concurrent inserts
  PERFORM pg_advisory_xact_lock(hashtext(p_plant_id::text || p_type));

  -- Find current max sequence number
  EXECUTE format(
    'SELECT COALESCE(MAX(SUBSTRING(display_id FROM ''[0-9]+'')::int), 0) FROM %I WHERE plant_id = $1 AND display_id IS NOT NULL',
    tbl
  ) INTO seq USING p_plant_id;

  seq := seq + 1;
  result := prefix || '-' || code || '-' || LPAD(seq::text, 3, '0');
  RETURN result;
END;
$$;

-- ── 7. Update search_vector triggers to include display_id ──────────────────

CREATE OR REPLACE FUNCTION rules_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.display_id,'') || ' ' ||
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.rationale,'') || ' ' ||
    coalesce(NEW.scope,'') || ' ' || coalesce(NEW.category,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION assertions_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.display_id,'') || ' ' ||
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.scope,'') || ' ' ||
    coalesce(NEW.category,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION events_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.display_id,'') || ' ' ||
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'') || ' ' ||
    coalesce(NEW.resolution,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION questions_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.display_id,'') || ' ' ||
    coalesce(NEW.question,'') || ' ' || coalesce(NEW.detail,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

-- Re-run search_vector population now that display_ids exist
UPDATE rules SET search_vector = search_vector WHERE display_id IS NOT NULL;
UPDATE assertions SET search_vector = search_vector WHERE display_id IS NOT NULL;
UPDATE events SET search_vector = search_vector WHERE display_id IS NOT NULL;
UPDATE questions SET search_vector = search_vector WHERE display_id IS NOT NULL;

-- ── 8. Update hybrid search functions to return display_id ──────────────────
-- Must drop first because the return type changed (added display_id column)

DROP FUNCTION IF EXISTS hybrid_search_vector(vector, uuid, integer);
DROP FUNCTION IF EXISTS hybrid_search_fulltext(text, uuid, integer);

CREATE OR REPLACE FUNCTION hybrid_search_vector(
  query_embedding vector(1024),
  match_plant_id  uuid,
  match_count     int DEFAULT 20
)
RETURNS TABLE (
  id          text,
  display_id  text,
  item_type   text,
  title       text,
  status      text,
  process_area text,
  category    text,
  rationale   text,
  scope       text,
  description text,
  tags        text[],
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    e.target_id       AS id,
    COALESCE(r.display_id, a.display_id, ev.display_id) AS display_id,
    e.target_type     AS item_type,
    COALESCE(r.title, a.title, ev.title)           AS title,
    COALESCE(r.status, a.status, ev.status)        AS status,
    COALESCE(r.process_area, a.process_area, ev.process_area) AS process_area,
    COALESCE(r.category, a.category)               AS category,
    r.rationale,
    COALESCE(r.scope, a.scope)                     AS scope,
    ev.description,
    COALESCE(r.tags, a.tags, ev.tags)              AS tags,
    1 - (e.embedding <=> query_embedding)          AS similarity
  FROM embeddings e
  LEFT JOIN rules      r  ON r.id  = e.target_id AND e.target_type = 'rule'       AND r.plant_id  = match_plant_id
  LEFT JOIN assertions a  ON a.id  = e.target_id AND e.target_type = 'assertion'  AND a.plant_id  = match_plant_id
  LEFT JOIN events     ev ON ev.id = e.target_id AND e.target_type = 'event'      AND ev.plant_id = match_plant_id
  WHERE
    (r.id IS NOT NULL OR a.id IS NOT NULL OR ev.id IS NOT NULL)
    AND COALESCE(r.status, a.status, ev.status) NOT IN ('Retired', 'Superseded')
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION hybrid_search_fulltext(
  query_text      text,
  match_plant_id  uuid,
  match_count     int DEFAULT 20
)
RETURNS TABLE (
  id          text,
  display_id  text,
  item_type   text,
  title       text,
  status      text,
  process_area text,
  category    text,
  rationale   text,
  scope       text,
  description text,
  tags        text[],
  rank        float
)
LANGUAGE sql STABLE AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', query_text) AS tsq
  ),
  rules_matches AS (
    SELECT
      r.id, r.display_id, 'rule'::text AS item_type,
      r.title, r.status, r.process_area, r.category,
      r.rationale, r.scope,
      NULL::text AS description,
      r.tags,
      ts_rank(r.search_vector, q.tsq) AS rank
    FROM rules r, q
    WHERE r.plant_id = match_plant_id
      AND r.search_vector @@ q.tsq
      AND r.status NOT IN ('Retired', 'Superseded')
  ),
  assertion_matches AS (
    SELECT
      a.id, a.display_id, 'assertion'::text AS item_type,
      a.title, a.status, a.process_area, a.category,
      NULL::text AS rationale, a.scope,
      NULL::text AS description,
      a.tags,
      ts_rank(a.search_vector, q.tsq) AS rank
    FROM assertions a, q
    WHERE a.plant_id = match_plant_id
      AND a.search_vector @@ q.tsq
      AND a.status NOT IN ('Retired', 'Superseded')
  ),
  event_matches AS (
    SELECT
      ev.id, ev.display_id, 'event'::text AS item_type,
      ev.title, ev.status, ev.process_area,
      NULL::text AS category,
      NULL::text AS rationale, NULL::text AS scope,
      ev.description,
      ev.tags,
      ts_rank(ev.search_vector, q.tsq) AS rank
    FROM events ev, q
    WHERE ev.plant_id = match_plant_id
      AND ev.search_vector @@ q.tsq
  )
  SELECT * FROM (
    SELECT * FROM rules_matches
    UNION ALL
    SELECT * FROM assertion_matches
    UNION ALL
    SELECT * FROM event_matches
  ) combined
  ORDER BY rank DESC
  LIMIT match_count;
$$;
