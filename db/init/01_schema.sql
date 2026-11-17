-- CivicWatch Africa schema
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE municipalities (
  id            serial PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  province      text NOT NULL,
  kind          text NOT NULL,                -- e.g. Metropolitan municipality
  is_pilot      boolean NOT NULL DEFAULT false,
  wards_note    text,
  integration   boolean NOT NULL DEFAULT false -- official "send to municipality" integration available
);

CREATE TABLE wards (
  id              serial PRIMARY KEY,
  municipality_id int NOT NULL REFERENCES municipalities(id),
  code            text NOT NULL,
  name            text NOT NULL,
  suburb          text NOT NULL,
  geom            geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX wards_geom_idx ON wards USING gist (geom);

CREATE TABLE categories (
  slug  text PRIMARY KEY,
  name  text NOT NULL,
  sort  int  NOT NULL
);

CREATE TABLE users (
  id              serial PRIMARY KEY,
  email           text UNIQUE NOT NULL,
  password_hash   text NOT NULL,
  pseudonym       text NOT NULL,             -- public label, e.g. "Resident 482"
  role            text NOT NULL DEFAULT 'resident'
                  CHECK (role IN ('resident','official','moderator','admin')),
  municipality_id int REFERENCES municipalities(id), -- for officials
  verified        boolean NOT NULL DEFAULT false,     -- verified official account
  warnings        int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- Municipality datasets (kept separate by design) ----------
CREATE TABLE responsibilities (
  id              serial PRIMARY KEY,
  municipality_id int NOT NULL REFERENCES municipalities(id),
  service         text NOT NULL,
  categories      text[] NOT NULL DEFAULT '{}',
  responsible     text NOT NULL,
  channel         text NOT NULL,
  verification    text NOT NULL DEFAULT 'To verify',
  sort            int NOT NULL DEFAULT 0
);

CREATE TABLE dataset_sources (
  id              serial PRIMARY KEY,
  municipality_id int NOT NULL REFERENCES municipalities(id),
  dataset         text NOT NULL,   -- responsibilities | elections | council
  source          text NOT NULL,
  url             text,
  last_checked    text,
  verification    text NOT NULL
);

CREATE TABLE elections (
  id              serial PRIMARY KEY,
  municipality_id int NOT NULL REFERENCES municipalities(id),
  year            int NOT NULL,
  level           text NOT NULL,
  is_sample       boolean NOT NULL DEFAULT true
);

CREATE TABLE election_results (
  id          serial PRIMARY KEY,
  election_id int NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  party       text NOT NULL,
  votes       int  NOT NULL,
  seats       int  NOT NULL,
  sort        int  NOT NULL DEFAULT 0
);

CREATE TABLE council_snapshots (
  id               serial PRIMARY KEY,
  municipality_id  int NOT NULL REFERENCES municipalities(id),
  as_of            date NOT NULL,
  verification     text NOT NULL,
  arrangement_type text NOT NULL,
  executive_mayor  text NOT NULL,
  effective_from   text NOT NULL,
  source           text NOT NULL
);

CREATE TABLE council_seats (
  id          serial PRIMARY KEY,
  snapshot_id int NOT NULL REFERENCES council_snapshots(id) ON DELETE CASCADE,
  party       text NOT NULL,
  seats_now   int  NOT NULL,
  change      int  NOT NULL DEFAULT 0,
  sort        int  NOT NULL DEFAULT 0
);

CREATE TABLE council_changes (
  id              serial PRIMARY KEY,
  municipality_id int NOT NULL REFERENCES municipalities(id),
  effective_date  text NOT NULL,
  description     text NOT NULL,
  source_url      text
);

CREATE TABLE service_targets (
  id              serial PRIMARY KEY,
  municipality_id int NOT NULL REFERENCES municipalities(id),
  category        text NOT NULL REFERENCES categories(slug),
  target_days     numeric NOT NULL,
  source          text NOT NULL,
  verified        boolean NOT NULL DEFAULT false
);

-- ---------- Reports ----------
CREATE TABLE reports (
  id               serial PRIMARY KEY,
  author_id        int NOT NULL REFERENCES users(id),
  municipality_id  int REFERENCES municipalities(id),
  ward_id          int REFERENCES wards(id),
  category         text NOT NULL REFERENCES categories(slug),
  title            text NOT NULL,
  description      text NOT NULL,
  street           text,
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  geom             geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
  sensitive        boolean NOT NULL DEFAULT false,
  observed_on      date NOT NULL,
  status           text NOT NULL DEFAULT 'submitted',
  status_source    text NOT NULL DEFAULT 'user_reported',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  duplicate_of     int REFERENCES reports(id),
  hidden           boolean NOT NULL DEFAULT false,
  sent_to_municipality boolean NOT NULL DEFAULT false,
  is_sample        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_geom_idx ON reports USING gist (geom);
CREATE INDEX reports_cat_idx ON reports (category);
CREATE INDEX reports_status_idx ON reports (status);

CREATE TABLE report_photos (
  id          serial PRIMARY KEY,
  report_id   int NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id     int NOT NULL REFERENCES users(id),
  path        text,                 -- null for sample placeholders
  kind        text NOT NULL DEFAULT 'author', -- author | community
  hidden      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE status_events (
  id           serial PRIMARY KEY,
  report_id    int NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('submitted','acknowledged','in_progress','resolved','reopened','needs_info','duplicate')),
  source       text NOT NULL CHECK (source IN ('user_reported','official')),
  recorded_by  int REFERENCES users(id),
  recorder_kind text NOT NULL,      -- author | community | official | moderator
  note         text,
  evidence     text,
  reference    text,
  state        text NOT NULL DEFAULT 'approved' CHECK (state IN ('approved','pending','rejected')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX status_events_report_idx ON status_events (report_id, created_at);

CREATE TABLE follows (
  user_id   int REFERENCES users(id),
  report_id int REFERENCES reports(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, report_id)
);

CREATE TABLE same_problem (
  user_id   int REFERENCES users(id),
  report_id int REFERENCES reports(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, report_id)
);

CREATE TABLE comments (
  id          serial PRIMARY KEY,
  report_id   int NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  parent_id   int REFERENCES comments(id),
  user_id     int NOT NULL REFERENCES users(id),
  body        text NOT NULL,
  is_official boolean NOT NULL DEFAULT false,
  state       text NOT NULL DEFAULT 'visible' CHECK (state IN ('visible','removed','redacted')),
  removed_rule text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comment_votes (
  user_id    int REFERENCES users(id),
  comment_id int REFERENCES comments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, comment_id)
);

-- ---------- Moderation ----------
CREATE TABLE flags (
  id          serial PRIMARY KEY,
  target_type text NOT NULL CHECK (target_type IN ('report','comment','photo')),
  target_id   int NOT NULL,
  user_id     int NOT NULL REFERENCES users(id),
  reason      text NOT NULL,
  details     text,
  state       text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flags_target_idx ON flags (target_type, target_id);

CREATE TABLE moderation_actions (     -- append-only audit log
  id           serial PRIMARY KEY,
  moderator_id int NOT NULL REFERENCES users(id),
  target_type  text NOT NULL,
  target_id    int NOT NULL,
  action       text NOT NULL,
  reason_code  text NOT NULL,
  note         text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'moderation_actions is append-only';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER moderation_actions_append_only
  BEFORE UPDATE OR DELETE ON moderation_actions
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

CREATE TABLE escalations (
  id          serial PRIMARY KEY,
  target_type text NOT NULL,
  target_id   int NOT NULL,
  action_id   int REFERENCES moderation_actions(id),
  state       text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appeals (
  id            serial PRIMARY KEY,
  action_id     int NOT NULL REFERENCES moderation_actions(id),
  user_id       int NOT NULL REFERENCES users(id),
  reason        text NOT NULL,
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open','upheld','overturned')),
  decided_by    int REFERENCES users(id),
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);

CREATE TABLE corrections (
  id          serial PRIMARY KEY,
  target_type text NOT NULL,     -- report | municipality | responsibility | election | council
  target_id   int NOT NULL,
  user_id     int REFERENCES users(id),
  details     text NOT NULL,
  state       text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','declined')),
  decided_by  int REFERENCES users(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
