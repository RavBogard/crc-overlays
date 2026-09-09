CREATE TABLE IF NOT EXISTS state(id integer PRIMARY KEY CHECK(id=1),revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),cue text,mode text NOT NULL DEFAULT 'animate',updated bigint NOT NULL DEFAULT 0);
INSERT INTO state(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS commands(id text PRIMARY KEY,action text NOT NULL,cue text,created bigint NOT NULL);
CREATE TABLE IF NOT EXISTS controllers(id text PRIMARY KEY,sequence bigint NOT NULL CHECK(sequence BETWEEN 0 AND 9007199254740991));
CREATE TABLE IF NOT EXISTS renderers(id text PRIMARY KEY,revision bigint NOT NULL,cue text,phase text NOT NULL,seen bigint NOT NULL);
CREATE INDEX IF NOT EXISTS renderers_seen ON renderers(seen);
