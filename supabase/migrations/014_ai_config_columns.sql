-- ============================================================
-- 014_ai_config_columns.sql — AI brain config on whatsapp_config
--                             + per-conversation AI pause flag
--
-- WHY THIS EXISTS
--   These columns were originally applied to the master/production DB
--   DIRECTLY via the Supabase SQL Editor and were never captured in a
--   migration file. As a result a fresh client provisioned from
--   install.sql got a whatsapp_config table WITHOUT any AI columns, so
--   saving AI config (POST /api/ai/config) failed with
--   `column "ai_enabled" does not exist` and the entire AI brain — the
--   premium selling point — was broken on every fresh install.
--
--   This migration back-fills that gap so install.sql (regenerated from
--   the migrations) provisions a complete, AI-ready schema.
--
-- COLUMNS (read/written by src/lib/automations/ai-engine.ts and
--   src/app/api/ai/config/route.ts):
--   whatsapp_config:
--     ai_enabled       — GLOBAL AI on/off for this client
--     ai_provider      — 'groq' | 'gemini' | 'openai' | 'deepseek' | ...
--     ai_model         — provider-specific model id (nullable)
--     ai_api_key       — provider key, AES-256-GCM encrypted at rest
--     ai_system_prompt — AI persona / instructions (nullable)
--     ai_webhook_url   — optional external webhook (nullable)
--     welcome_enabled  — send welcome_text on first inbound message
--     welcome_text     — the welcome message body (nullable)
--     ooo_enabled      — out-of-office auto-reply toggle
--     ooo_start/ooo_end— "HH:MM" IST window bounds (TEXT — parsed as
--                        strings by isInOOOWindow(); overnight windows OK)
--     ooo_text         — out-of-office message body (nullable)
--   conversations:
--     ai_paused        — PER-CONVERSATION handoff switch. TRUE = human
--                        took over, AI stays silent for this chat only
--                        (whatsapp_config.ai_enabled is the GLOBAL switch).
--
-- Idempotent — ADD COLUMN IF NOT EXISTS. No-op on the master (columns
-- already present), safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS ai_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_provider      TEXT    NOT NULL DEFAULT 'groq',
  ADD COLUMN IF NOT EXISTS ai_model         TEXT,
  ADD COLUMN IF NOT EXISTS ai_api_key       TEXT,
  ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS ai_webhook_url   TEXT,
  ADD COLUMN IF NOT EXISTS welcome_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS welcome_text     TEXT,
  ADD COLUMN IF NOT EXISTS ooo_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ooo_start        TEXT,
  ADD COLUMN IF NOT EXISTS ooo_end          TEXT,
  ADD COLUMN IF NOT EXISTS ooo_text         TEXT;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT FALSE;
