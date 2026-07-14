-- ============================================================
-- 009_create_destinations.sql — Destinations (data-driven travel packages)
--
-- The catalogue each client manages from the admin UI. The AI engine
-- reads these rows (service-role) to drive the whole conversational
-- flow — menu/greet, destination poster + itinerary, pricing — so
-- adding a package is a ROW, never a new workflow or code change.
--
-- Idempotent — safe to run multiple times. Follows 006_automations.sql
-- conventions: IF NOT EXISTS on tables/indexes, DROP IF EXISTS before
-- re-creating policies/triggers, RLS scoped by user_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS destinations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  keywords      JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary       TEXT,
  description   TEXT,
  highlights    JSONB NOT NULL DEFAULT '[]'::jsonb,
  departures    JSONB NOT NULL DEFAULT '[]'::jsonb,
  poster_url    TEXT,
  itinerary_url TEXT,
  price_from    NUMERIC(12,2),
  currency      TEXT NOT NULL DEFAULT 'INR',
  nights        INTEGER,
  days          INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_destinations_user_slug
  ON destinations(user_id, slug);

CREATE INDEX IF NOT EXISTS idx_destinations_user_active
  ON destinations(user_id, sort_order) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_destinations_keywords
  ON destinations USING GIN (keywords);

ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own destinations" ON destinations;
CREATE POLICY "Users can manage own destinations" ON destinations FOR ALL
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON destinations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON destinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
