-- ============================================================
-- MD1 Knowledge Bank — Initial Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE organisations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plants (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  process_areas  text[]      NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plants_org_id ON plants(org_id);

CREATE TABLE profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  role          text        NOT NULL DEFAULT 'member',  -- 'member' | 'admin'
  plant_id      uuid        REFERENCES plants(id),
  org_id        uuid        REFERENCES organisations(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_user_id  ON profiles(user_id);
CREATE INDEX idx_profiles_org_id   ON profiles(org_id);
CREATE INDEX idx_profiles_plant_id ON profiles(plant_id);

-- ============================================================
-- KNOWLEDGE TABLES
-- ============================================================

CREATE TABLE rules (
  id           text        PRIMARY KEY,  -- e.g. "R-001"
  plant_id     uuid        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  category     text,
  process_area text,
  scope        text,
  rationale    text,
  status       text        NOT NULL DEFAULT 'Proposed',
  confidence   text        NOT NULL DEFAULT 'Low',
  tags         text[]      NOT NULL DEFAULT '{}',
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector
);
CREATE INDEX idx_rules_plant_id      ON rules(plant_id);
CREATE INDEX idx_rules_status        ON rules(status);
CREATE INDEX idx_rules_process_area  ON rules(process_area);
CREATE INDEX idx_rules_search_vector ON rules USING GIN(search_vector);

CREATE TABLE assertions (
  id           text        PRIMARY KEY,  -- e.g. "A-001"
  plant_id     uuid        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  category     text,
  process_area text,
  scope        text,
  status       text        NOT NULL DEFAULT 'Proposed',
  confidence   text        NOT NULL DEFAULT 'Low',
  tags         text[]      NOT NULL DEFAULT '{}',
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector
);
CREATE INDEX idx_assertions_plant_id      ON assertions(plant_id);
CREATE INDEX idx_assertions_process_area  ON assertions(process_area);
CREATE INDEX idx_assertions_search_vector ON assertions USING GIN(search_vector);

CREATE TABLE events (
  id             text        PRIMARY KEY,  -- e.g. "E-001"
  plant_id       uuid        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  date           timestamptz NOT NULL DEFAULT now(),
  process_area   text,
  outcome        text        NOT NULL DEFAULT 'Negative',  -- 'Positive' | 'Negative'
  impact         text        NOT NULL DEFAULT 'Moderate',  -- 'Minor' | 'Moderate' | 'Significant' | 'Major'
  status         text        NOT NULL DEFAULT 'Open',      -- 'Open' | 'Investigating' | 'Closed'
  root_cause     jsonb       NOT NULL DEFAULT '{}',        -- Ishikawa map: {Material:[], Process:[], ...}
  description    text,
  resolution     text,
  reported_by    text,
  tags           text[]      NOT NULL DEFAULT '{}',
  tagged_people  text[]      NOT NULL DEFAULT '{}',
  photos         jsonb       NOT NULL DEFAULT '[]',        -- [{name, data}]
  created_at     timestamptz NOT NULL DEFAULT now(),
  search_vector  tsvector
);
CREATE INDEX idx_events_plant_id      ON events(plant_id);
CREATE INDEX idx_events_outcome       ON events(outcome);
CREATE INDEX idx_events_process_area  ON events(process_area);
CREATE INDEX idx_events_search_vector ON events USING GIN(search_vector);

CREATE TABLE questions (
  id             text        PRIMARY KEY,  -- e.g. "Q-001"
  plant_id       uuid        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  question       text        NOT NULL,
  detail         text,
  process_area   text,
  status         text        NOT NULL DEFAULT 'open',  -- 'open' | 'answered'
  asked_by       text,
  tagged_people  text[]      NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  search_vector  tsvector
);
CREATE INDEX idx_questions_plant_id      ON questions(plant_id);
CREATE INDEX idx_questions_status        ON questions(status);
CREATE INDEX idx_questions_search_vector ON questions USING GIN(search_vector);

-- ============================================================
-- SUPPORTING TABLES
-- ============================================================

CREATE TABLE responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  text        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text         text        NOT NULL,
  by           text,
  parent_id    uuid        REFERENCES responses(id),  -- threaded replies
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_responses_question_id ON responses(question_id);
CREATE INDEX idx_responses_parent_id   ON responses(parent_id);

CREATE TABLE comments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type  text        NOT NULL CHECK (target_type IN ('rule','assertion','event')),
  target_id    text        NOT NULL,
  text         text        NOT NULL,
  by           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_target ON comments(target_type, target_id);

CREATE TABLE verifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type  text        NOT NULL CHECK (target_type IN ('rule','assertion')),
  target_id    text        NOT NULL,
  verified_by  text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, verified_by)
);
CREATE INDEX idx_verifications_target ON verifications(target_type, target_id);

-- ============================================================
-- LINKS (knowledge graph edges)
-- relationship_type: 'relates_to' | 'supports' | 'contradicts' |
--                    'derived_from' | 'supersedes' | 'caused_by' | 'mitigates'
-- ============================================================

CREATE TABLE links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type       text        NOT NULL,  -- 'rule' | 'assertion' | 'event' | 'question'
  source_id         text        NOT NULL,
  target_type       text        NOT NULL,
  target_id         text        NOT NULL,
  relationship_type text        NOT NULL DEFAULT 'relates_to',
  weight            float       NOT NULL DEFAULT 1.0,
  auto_generated    boolean     NOT NULL DEFAULT false,
  comment           text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, target_type, target_id, relationship_type)
);
CREATE INDEX idx_links_source ON links(source_type, source_id);
CREATE INDEX idx_links_target ON links(target_type, target_id);
CREATE INDEX idx_links_relationship_type ON links(relationship_type);
CREATE INDEX idx_links_auto_generated ON links(auto_generated);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text         text        NOT NULL,
  read         boolean     NOT NULL DEFAULT false,
  target_view  text,
  target_id    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read    ON notifications(user_id, read);

-- ============================================================
-- EVIDENCE
-- ============================================================

CREATE TABLE evidence (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type  text        NOT NULL CHECK (parent_type IN ('rule','assertion')),
  parent_id    text        NOT NULL,
  type         text        NOT NULL,  -- 'human_note' | 'event_analysis' | 'llm_extraction' | 'lab_data' | 'validated' | 'event_corroboration'
  text         text,
  date         date,
  source       text
);
CREATE INDEX idx_evidence_parent ON evidence(parent_type, parent_id);

-- ============================================================
-- VERSIONS
-- ============================================================

CREATE TABLE versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type     text        NOT NULL,  -- 'rule' | 'assertion'
  target_id       text        NOT NULL,
  version_num     int         NOT NULL,
  date            timestamptz NOT NULL DEFAULT now(),
  author          text,
  change_note     text,
  snapshot_title  text,
  diffs           jsonb       NOT NULL DEFAULT '[]',   -- [{field, from, to}]
  fields_changed  text[]      NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_versions_target ON versions(target_type, target_id);

-- ============================================================
-- EMBEDDINGS (pgvector)
-- ============================================================

CREATE TABLE embeddings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type   text        NOT NULL,  -- 'rule' | 'assertion' | 'event' | 'question'
  target_id     text        NOT NULL,
  embedding     vector(1536),
  content_text  text,
  content_hash  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id)
);
CREATE INDEX idx_embeddings_target    ON embeddings(target_type, target_id);
-- HNSW index for fast approximate nearest-neighbour cosine search
CREATE INDEX idx_embeddings_hnsw ON embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- SEARCH VECTOR TRIGGERS
-- ============================================================

-- Rules
CREATE OR REPLACE FUNCTION update_rules_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '')        || ' ' ||
    coalesce(NEW.rationale, '')    || ' ' ||
    coalesce(NEW.scope, '')        || ' ' ||
    coalesce(NEW.category, '')     || ' ' ||
    coalesce(NEW.process_area, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rules_search_vector_update
  BEFORE INSERT OR UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION update_rules_search_vector();

-- Assertions
CREATE OR REPLACE FUNCTION update_assertions_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '')        || ' ' ||
    coalesce(NEW.scope, '')        || ' ' ||
    coalesce(NEW.category, '')     || ' ' ||
    coalesce(NEW.process_area, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER assertions_search_vector_update
  BEFORE INSERT OR UPDATE ON assertions
  FOR EACH ROW EXECUTE FUNCTION update_assertions_search_vector();

-- Events
CREATE OR REPLACE FUNCTION update_events_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '')        || ' ' ||
    coalesce(NEW.description, '')  || ' ' ||
    coalesce(NEW.resolution, '')   || ' ' ||
    coalesce(NEW.process_area, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_search_vector_update
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_events_search_vector();

-- Questions
CREATE OR REPLACE FUNCTION update_questions_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.question, '')     || ' ' ||
    coalesce(NEW.detail, '')       || ' ' ||
    coalesce(NEW.process_area, '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER questions_search_vector_update
  BEFORE INSERT OR UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_questions_search_vector();

-- ============================================================
-- PROFILE CREATION TRIGGER
-- Automatically creates a profile row when a new user signs up
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, display_name)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_plant_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT plant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_display_name()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT display_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organisations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE links          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence       ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings     ENABLE ROW LEVEL SECURITY;

-- organisations: users can view their own org
CREATE POLICY "Users can view their org" ON organisations
  FOR SELECT USING (id = get_user_org_id());

-- plants: users can view plants in their org
CREATE POLICY "Users can view plants in their org" ON plants
  FOR SELECT USING (org_id = get_user_org_id());

-- profiles: users can view all profiles in their org, edit own
CREATE POLICY "Users can view profiles in their org" ON profiles
  FOR SELECT USING (org_id = get_user_org_id() OR user_id = auth.uid());

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Service role can insert profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- rules
CREATE POLICY "Users can view rules in their plant" ON rules
  FOR SELECT USING (plant_id = get_user_plant_id());

CREATE POLICY "Users can insert rules in their plant" ON rules
  FOR INSERT WITH CHECK (plant_id = get_user_plant_id());

CREATE POLICY "Users can update rules in their plant" ON rules
  FOR UPDATE USING (plant_id = get_user_plant_id());

CREATE POLICY "Admins and creators can delete rules" ON rules
  FOR DELETE USING (
    plant_id = get_user_plant_id() AND (
      created_by = get_user_display_name()
      OR get_user_role() = 'admin'
    )
  );

-- assertions
CREATE POLICY "Users can view assertions in their plant" ON assertions
  FOR SELECT USING (plant_id = get_user_plant_id());

CREATE POLICY "Users can insert assertions in their plant" ON assertions
  FOR INSERT WITH CHECK (plant_id = get_user_plant_id());

CREATE POLICY "Users can update assertions in their plant" ON assertions
  FOR UPDATE USING (plant_id = get_user_plant_id());

CREATE POLICY "Admins and creators can delete assertions" ON assertions
  FOR DELETE USING (
    plant_id = get_user_plant_id() AND (
      created_by = get_user_display_name()
      OR get_user_role() = 'admin'
    )
  );

-- events
CREATE POLICY "Users can view events in their plant" ON events
  FOR SELECT USING (plant_id = get_user_plant_id());

CREATE POLICY "Users can insert events in their plant" ON events
  FOR INSERT WITH CHECK (plant_id = get_user_plant_id());

CREATE POLICY "Users can update events in their plant" ON events
  FOR UPDATE USING (plant_id = get_user_plant_id());

CREATE POLICY "Admins and reporters can delete events" ON events
  FOR DELETE USING (
    plant_id = get_user_plant_id() AND (
      reported_by = get_user_display_name()
      OR get_user_role() = 'admin'
    )
  );

-- questions
CREATE POLICY "Users can view questions in their plant" ON questions
  FOR SELECT USING (plant_id = get_user_plant_id());

CREATE POLICY "Users can insert questions in their plant" ON questions
  FOR INSERT WITH CHECK (plant_id = get_user_plant_id());

CREATE POLICY "Users can update questions in their plant" ON questions
  FOR UPDATE USING (plant_id = get_user_plant_id());

-- responses: allow if parent question is in user's plant
CREATE POLICY "Users can view responses to their plant's questions" ON responses
  FOR SELECT USING (
    question_id IN (SELECT id FROM questions WHERE plant_id = get_user_plant_id())
  );

CREATE POLICY "Users can insert responses to their plant's questions" ON responses
  FOR INSERT WITH CHECK (
    question_id IN (SELECT id FROM questions WHERE plant_id = get_user_plant_id())
  );

-- comments: allow if target is in user's plant
CREATE POLICY "Users can view comments in their plant" ON comments
  FOR SELECT USING (
    (target_type = 'rule'      AND target_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'assertion' AND target_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'event'     AND target_id IN (SELECT id FROM events     WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Users can insert comments in their plant" ON comments
  FOR INSERT WITH CHECK (
    (target_type = 'rule'      AND target_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'assertion' AND target_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'event'     AND target_id IN (SELECT id FROM events     WHERE plant_id = get_user_plant_id()))
  );

-- verifications
CREATE POLICY "Users can view verifications in their plant" ON verifications
  FOR SELECT USING (
    (target_type = 'rule'      AND target_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'assertion' AND target_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Users can insert verifications in their plant" ON verifications
  FOR INSERT WITH CHECK (
    (target_type = 'rule'      AND target_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'assertion' AND target_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Users can delete own verifications" ON verifications
  FOR DELETE USING (verified_by = get_user_display_name());

-- links
CREATE POLICY "Users can view links in their plant" ON links
  FOR SELECT USING (
    (source_type = 'rule'      AND source_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (source_type = 'assertion' AND source_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
    OR (source_type = 'event'     AND source_id IN (SELECT id FROM events     WHERE plant_id = get_user_plant_id()))
    OR (source_type = 'question'  AND source_id IN (SELECT id FROM questions  WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Users can insert links in their plant" ON links
  FOR INSERT WITH CHECK (
    (source_type = 'rule'      AND source_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (source_type = 'assertion' AND source_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
    OR (source_type = 'event'     AND source_id IN (SELECT id FROM events     WHERE plant_id = get_user_plant_id()))
    OR (source_type = 'question'  AND source_id IN (SELECT id FROM questions  WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Users can delete links they created or admins" ON links
  FOR DELETE USING (
    created_by = get_user_display_name()
    OR get_user_role() = 'admin'
  );

-- notifications: users see only their own
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Service role can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- evidence
CREATE POLICY "Users can view evidence in their plant" ON evidence
  FOR SELECT USING (
    (parent_type = 'rule'      AND parent_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (parent_type = 'assertion' AND parent_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Users can insert evidence in their plant" ON evidence
  FOR INSERT WITH CHECK (
    (parent_type = 'rule'      AND parent_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (parent_type = 'assertion' AND parent_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
  );

-- versions
CREATE POLICY "Users can view versions in their plant" ON versions
  FOR SELECT USING (
    (target_type = 'rule'      AND target_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'assertion' AND target_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Users can insert versions in their plant" ON versions
  FOR INSERT WITH CHECK (
    (target_type = 'rule'      AND target_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'assertion' AND target_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
  );

-- embeddings: readable by any authenticated user in the plant
CREATE POLICY "Users can view embeddings in their plant" ON embeddings
  FOR SELECT USING (
    (target_type = 'rule'      AND target_id IN (SELECT id FROM rules      WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'assertion' AND target_id IN (SELECT id FROM assertions WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'event'     AND target_id IN (SELECT id FROM events     WHERE plant_id = get_user_plant_id()))
    OR (target_type = 'question'  AND target_id IN (SELECT id FROM questions  WHERE plant_id = get_user_plant_id()))
  );

CREATE POLICY "Service role can manage embeddings" ON embeddings
  FOR ALL USING (true);
