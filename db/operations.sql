CREATE TABLE IF NOT EXISTS operations_usage_reports (
  provider text PRIMARY KEY CHECK (provider IN ('Vercel','Neon','Cloudflare')),
  used double precision NOT NULL CHECK (used >= 0),
  limit_value double precision NOT NULL CHECK (limit_value > 0),
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 20),
  window_label text NOT NULL CHECK (length(window_label) BETWEEN 1 AND 100),
  measured_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  updated_by text NOT NULL
);
