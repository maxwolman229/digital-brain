-- =============================================================================
-- 039_hybrid_search_fulltext.sql
-- Full-text retrieval for the contradiction-check edge function.
--
-- Why this exists:
--   The previous code in supabase/functions/contradiction-check/index.ts called
--   PostgREST .textSearch('search_vector', title, { type: 'websearch' }), which
--   uses websearch_to_tsquery. websearch_to_tsquery AND-joins whitespace-
--   separated words. A new rule's title almost always contains at least one
--   distinguishing word the existing candidates don't share — and a single
--   distinguishing word is enough to break the AND, so retrieval silently
--   returned zero candidates and contradictions never reached the LLM.
--
-- Diagnosed empirically: a new rule "Allow work roll differential cooling up
-- to 25 °C across the barrel" failed to retrieve R-EAF-037 ("Keep work roll
-- differential cooling within 1 °C across the barrel") because tokens like
-- "allow"/"25"/"degrees"/"celsius" don't appear in any existing rule's
-- search_vector — and AND requires every token to match.
--
-- Fix: tokenise the title client-side here in SQL, drop stopwords + tokens
-- shorter than 3 chars, OR them, then rank by ts_rank and threshold-out
-- low-quality matches. Same-process-area rows sort first.
-- =============================================================================

CREATE OR REPLACE FUNCTION hybrid_search_fulltext(
  p_plant_id     uuid,
  p_title        text,
  p_process_area text DEFAULT NULL,
  p_limit        int  DEFAULT 5,
  -- 0.02 tuned empirically: ts_rank on title-only matches lands in 0.04–0.07
  -- for the cluster of meaningfully-related rules and 0.016–0.020 for
  -- tangential single-word hits. 0.02 keeps the cluster, drops the noise.
  p_min_rank     real DEFAULT 0.02
)
RETURNS TABLE (
  id           text,
  display_id   text,
  type         text,
  title        text,
  scope        text,
  rationale    text,
  status       text,
  process_area text,
  rank         real
)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  -- Stopwords: English filler + domain words that don't differentiate inside
  -- this corpus (process names like "steel" are everywhere; "rule"/"operator"
  -- describe form not content). Easy to extend as we learn what's noise.
  v_stopwords text[] := ARRAY[
    -- English filler
    'the','and','for','with','from','that','this','have','has','had',
    'are','was','were','will','would','could','should','shall','may',
    'when','what','where','which','who','why','how','all','any','one','two','three',
    'into','onto','than','then','also','some','only','more','less','most','least',
    -- Imperatives / hedges
    'rule','operator','always','never','must','should','use','used','using',
    'set','setting','ensure','keep','make','do','does','done',
    -- Steel-context high-frequency
    'steel','process','plant','operation','operations'
  ];
  v_tokens  text[];
  v_tsquery tsquery;
BEGIN
  -- Tokenise: lowercase, split on non-alphanumeric, drop stopwords + <3 chars.
  -- DISTINCT to prevent repeated tokens from amplifying their rank weight.
  SELECT array_agg(DISTINCT t) INTO v_tokens
  FROM unnest(regexp_split_to_array(lower(coalesce(p_title, '')), '[^a-z0-9]+')) AS t
  WHERE length(t) >= 3
    AND NOT (t = ANY(v_stopwords));

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN;  -- no usable tokens (e.g. title is "Set the rule") → no retrieval
  END IF;

  -- OR them. to_tsquery requires the | operator; tokens are already lowercase
  -- ASCII so they're safe to interpolate without escaping.
  v_tsquery := to_tsquery('english', array_to_string(v_tokens, ' | '));

  RETURN QUERY
  WITH hits AS (
    SELECT
      r.id::text                                                   AS id,
      coalesce(r.display_id, r.id)                                 AS display_id,
      'rule'::text                                                 AS type,
      r.title                                                      AS title,
      r.scope                                                      AS scope,
      r.rationale                                                  AS rationale,
      r.status                                                     AS status,
      r.process_area                                               AS process_area,
      ts_rank(r.search_vector, v_tsquery)                          AS rank
    FROM rules r
    WHERE r.plant_id = p_plant_id
      AND r.status NOT IN ('Retired', 'Superseded')
      AND r.search_vector @@ v_tsquery
    UNION ALL
    SELECT
      a.id::text,
      coalesce(a.display_id, a.id),
      'assertion'::text,
      a.title,
      a.scope,
      a.rationale,
      a.status,
      a.process_area,
      ts_rank(a.search_vector, v_tsquery)
    FROM assertions a
    WHERE a.plant_id = p_plant_id
      AND a.status NOT IN ('Retired', 'Superseded')
      AND a.search_vector @@ v_tsquery
  )
  SELECT
    h.id, h.display_id, h.type, h.title, h.scope, h.rationale,
    h.status, h.process_area, h.rank
  FROM hits h
  WHERE h.rank >= p_min_rank
  ORDER BY
    -- Same process area first — contradictions almost always live in the
    -- same operational domain. NULLs handled by IS NOT DISTINCT FROM.
    (h.process_area IS NOT DISTINCT FROM p_process_area) DESC,
    h.rank DESC
  LIMIT p_limit;
END
$fn$;

-- The edge function uses the service-role client which bypasses RLS, so we
-- only need to grant EXECUTE for service_role. Authenticated and anon don't
-- need this — they shouldn't be calling search RPCs directly.
REVOKE ALL ON FUNCTION hybrid_search_fulltext(uuid, text, text, int, real) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hybrid_search_fulltext(uuid, text, text, int, real) TO service_role;
