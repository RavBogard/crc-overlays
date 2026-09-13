CREATE TABLE IF NOT EXISTS source_change_reviews (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL CHECK (status IN ('pending','deferred','rejected','accepted')),
  detected_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS source_change_reviews_status_updated_idx
  ON source_change_reviews(status,updated_at DESC);
