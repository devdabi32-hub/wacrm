-- ============================================================
-- 010_business_settings.sql — Per-client business/payment/support config
--
-- Extends whatsapp_config (the per-client config row that already holds
-- Meta creds + AI config) with brand, support, and payment fields the
-- AI brain needs:
--   business_name  -> brand used in WhatsApp messages
--   support_phone  -> number the AI gives on human-handoff
--   upi_id / payment_qr_url / payment_note -> send_payment action
--
-- ai_system_prompt already exists on whatsapp_config (AI persona), so it
-- is intentionally NOT added here.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS, safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS business_name   TEXT,
  ADD COLUMN IF NOT EXISTS support_phone   TEXT,
  ADD COLUMN IF NOT EXISTS upi_id          TEXT,
  ADD COLUMN IF NOT EXISTS payment_qr_url  TEXT,
  ADD COLUMN IF NOT EXISTS payment_note    TEXT;
