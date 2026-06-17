-- ============================================================
-- 011_destinations_import_source.sql — track manual vs CSV/XLSX import origin
--
-- Adds an `imported` flag so the Catalogue UI can show an "Imported"
-- badge on rows created via bulk CSV/XLSX import (Step 4), distinct
-- from rows added manually through the Add Destination dialog. Purely
-- cosmetic — the AI engine and every other query treat both the same.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS, safe to re-run.
-- ============================================================

ALTER TABLE destinations
  ADD COLUMN IF NOT EXISTS imported BOOLEAN NOT NULL DEFAULT FALSE;
