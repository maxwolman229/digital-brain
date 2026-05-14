-- =============================================================================
-- 041_query_search_fulltext.sql
-- Rewrites the user-facing `hybrid_search_fulltext(query_text, match_plant_id,
-- match_count)` overload to use tokenized OR-semantics instead of
-- `websearch_to_tsquery` AND-semantics.
--
-- Why:
--   Migration 023 created this overload with `websearch_to_tsquery('english',
--   query_text)`, which AND-joins every word in the question. So
--   "What's the LF exit temperature for stainless steel?" requires every
--   one of {lf, exit, temperature, stainless, steel} to appear in a rule's
--   search_vector. R-BEV-066 ("LF exit temperature target for Stainless 304
--   series…") has "stainless" but not the literal token "steel", so the
--   AND breaks and the rule is invisible — Claude then truthfully reports
--   "No rules in the knowledge bank cover this situation."
--
--   We already fixed the same bug for the contradiction-check overload in
--   migration 039 (tokenize → strip stopwords → OR-join → rank). This
--   applies the same approach to the user-facing query overload, keeping
--   its return shape (item_type, description, etc.) unchanged so the
--   `query` edge function needs no code change.
-- =============================================================================

DROP FUNCTION IF EXISTS hybrid_search_fulltext(text, uuid, integer);

CREATE OR REPLACE FUNCTION hybrid_search_fulltext(
  query_text     text,
  match_plant_id uuid,
  match_count    int DEFAULT 20
)
RETURNS TABLE (
  id           text,
  display_id   text,
  item_type    text,
  title        text,
  status       text,
  process_area text,
  category     text,
  rationale    text,
  scope        text,
  description  text,
  tags         text[],
  rank         real
)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  -- Same stopword list as 039 — English filler + domain terms that are
  -- everywhere in this corpus and don't differentiate. "steel" is the
  -- prime offender: every rule is about steel, so demanding it match
  -- excludes most of them and breaks AND-joined queries.
  v_stopwords text[] := ARRAY[
    'the','and','for','with','from','that','this','have','has','had',
    'are','was','were','will','would','could','should','shall','may',
    'when','what','where','which','who','why','how','all','any','one','two','three',
    'into','onto','than','then','also','some','only','more','less','most','least',
    'rule','operator','always','never','must','should','use','used','using',
    'set','setting','ensure','keep','make','do','does','done',
    'steel','process','plant','operation','operations'
  ];
  v_tokens  text[];
  v_tsquery tsquery;
BEGIN
  -- Tokenise: lowercase, split on non-alphanumeric, drop stopwords + tokens
  -- shorter than 3 chars. DISTINCT so a token can't double-count its weight.
  SELECT array_agg(DISTINCT t) INTO v_tokens
  FROM unnest(regexp_split_to_array(lower(coalesce(query_text, '')), '[^a-z0-9]+')) AS t
  WHERE length(t) >= 3
    AND NOT (t = ANY(v_stopwords));

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN;  -- no usable tokens → no retrieval (caller falls back to recents)
  END IF;

  -- OR-join. Tokens are lowercased ASCII so no escaping needed.
  v_tsquery := to_tsquery('english', array_to_string(v_tokens, ' | '));

  RETURN QUERY
  WITH rules_matches AS (
    SELECT
      r.id::text                   AS id,
      coalesce(r.display_id, r.id) AS display_id,
      'rule'::text                 AS item_type,
      r.title,
      r.status,
      r.process_area,
      r.category,
      r.rationale,
      r.scope,
      NULL::text                   AS description,
      r.tags,
      ts_rank(r.search_vector, v_tsquery) AS rank
    FROM rules r
    WHERE r.plant_id = match_plant_id
      AND r.search_vector @@ v_tsquery
      AND r.status NOT IN ('Retired', 'Superseded')
  ),
  assertion_matches AS (
    SELECT
      a.id::text,
      coalesce(a.display_id, a.id),
      'assertion'::text,
      a.title,
      a.status,
      a.process_area,
      a.category,
      a.rationale,
      a.scope,
      NULL::text,
      a.tags,
      ts_rank(a.search_vector, v_tsquery)
    FROM assertions a
    WHERE a.plant_id = match_plant_id
      AND a.search_vector @@ v_tsquery
      AND a.status NOT IN ('Retired', 'Superseded')
  ),
  event_matches AS (
    SELECT
      ev.id::text,
      coalesce(ev.display_id, ev.id),
      'event'::text,
      ev.title,
      ev.status,
      ev.process_area,
      NULL::text,
      NULL::text,
      NULL::text,
      ev.description,
      ev.tags,
      ts_rank(ev.search_vector, v_tsquery)
    FROM events ev
    WHERE ev.plant_id = match_plant_id
      AND ev.search_vector @@ v_tsquery
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
END
$fn$;

-- Same grants as 023. The query edge function uses the service-role client.
REVOKE ALL ON FUNCTION hybrid_search_fulltext(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hybrid_search_fulltext(text, uuid, integer) TO service_role, authenticated;
