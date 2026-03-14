-- ============================================================
-- Hybrid search SQL functions for the query edge function
-- ============================================================

-- Ensure pgvector and full-text indexes are in place:
--   CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
--   CREATE INDEX ON rules    USING GIN (search_vector);
--   CREATE INDEX ON assertions USING GIN (search_vector);
--   CREATE INDEX ON events   USING GIN (search_vector);

-- ── search_vector trigger helpers ─────────────────────────────────────────────

ALTER TABLE rules      ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE assertions ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE events     ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE questions  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE rules SET search_vector =
  to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(rationale,'') || ' ' ||
    coalesce(scope,'') || ' ' || coalesce(category,'') || ' ' || coalesce(process_area,''));

UPDATE assertions SET search_vector =
  to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(scope,'') || ' ' ||
    coalesce(category,'') || ' ' || coalesce(process_area,''));

UPDATE events SET search_vector =
  to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
    coalesce(resolution,'') || ' ' || coalesce(process_area,''));

UPDATE questions SET search_vector =
  to_tsvector('english',
    coalesce(question,'') || ' ' || coalesce(detail,'') || ' ' || coalesce(process_area,''));

-- Triggers to keep search_vector current
CREATE OR REPLACE FUNCTION rules_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.rationale,'') || ' ' ||
    coalesce(NEW.scope,'') || ' ' || coalesce(NEW.category,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION assertions_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.scope,'') || ' ' ||
    coalesce(NEW.category,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION events_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'') || ' ' ||
    coalesce(NEW.resolution,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION questions_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.question,'') || ' ' || coalesce(NEW.detail,'') || ' ' || coalesce(NEW.process_area,''));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rules_search_vector_trig    ON rules;
DROP TRIGGER IF EXISTS assertions_search_vector_trig ON assertions;
DROP TRIGGER IF EXISTS events_search_vector_trig   ON events;
DROP TRIGGER IF EXISTS questions_search_vector_trig ON questions;

CREATE TRIGGER rules_search_vector_trig
  BEFORE INSERT OR UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION rules_search_vector_update();

CREATE TRIGGER assertions_search_vector_trig
  BEFORE INSERT OR UPDATE ON assertions
  FOR EACH ROW EXECUTE FUNCTION assertions_search_vector_update();

CREATE TRIGGER events_search_vector_trig
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_search_vector_update();

CREATE TRIGGER questions_search_vector_trig
  BEFORE INSERT OR UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION questions_search_vector_update();

-- GIN indexes for full-text search
CREATE INDEX IF NOT EXISTS idx_rules_fts        ON rules        USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_assertions_fts   ON assertions   USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_events_fts       ON events       USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_questions_fts    ON questions    USING GIN (search_vector);

-- Embeddings table unique constraint + HNSW index
DO $$ BEGIN
  ALTER TABLE embeddings ADD CONSTRAINT embeddings_target_unique UNIQUE (target_type, target_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── Vector search RPC ──────────────────────────────────────────────────────────
-- Returns top N items from rules + assertions + events ranked by cosine similarity.

CREATE OR REPLACE FUNCTION hybrid_search_vector(
  query_embedding vector(1024),  -- voyage-3 outputs 1024-dim vectors
  match_plant_id  uuid,
  match_count     int DEFAULT 20
)
RETURNS TABLE (
  id          text,
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

-- ── Full-text search RPC ───────────────────────────────────────────────────────
-- Returns top N items from rules + assertions + events ranked by ts_rank.

CREATE OR REPLACE FUNCTION hybrid_search_fulltext(
  query_text      text,
  match_plant_id  uuid,
  match_count     int DEFAULT 20
)
RETURNS TABLE (
  id          text,
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
      r.id, 'rule'::text AS item_type,
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
      a.id, 'assertion'::text AS item_type,
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
      ev.id, 'event'::text AS item_type,
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
