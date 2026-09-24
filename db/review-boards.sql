-- T4 review boards (lib/review-board.ts), per workspace like every table here. `document` is a
-- ReviewBoard: title, grouping and the items with their group headings. Structural writes are
-- optimistic: UPDATE ... WHERE id = $1 AND version = $expected, and zero rows is a conflict.
-- Each reviewer answer is its own row, upserted as the reviewer clicks, so an answer never
-- conflicts with the agent adding items. Not applied to any database yet; add it to
-- scripts/migrate-authoring.mjs with the release that ships review boards.
CREATE TABLE IF NOT EXISTS review_boards (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS review_boards_updated_idx ON review_boards(updated_at DESC);

CREATE TABLE IF NOT EXISTS review_board_answers (
  board_id text NOT NULL REFERENCES review_boards(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  document jsonb NOT NULL,
  decided_at bigint NOT NULL,
  decided_by text NOT NULL,
  PRIMARY KEY (board_id, item_key)
);
