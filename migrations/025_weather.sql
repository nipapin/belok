CREATE TABLE IF NOT EXISTS weather_hours (
  time timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('forecast', 'archive')),
  temperature double precision NOT NULL,
  precipitation double precision NOT NULL CHECK (precipitation >= 0),
  condition text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (time, source)
);
CREATE TABLE IF NOT EXISTS weather_cache (
  key text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS weather_api_usage (
  day date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0 CHECK (calls BETWEEN 0 AND 900)
);
