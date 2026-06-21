-- ============================================================
-- 013  workspace_members.invited_name
-- ============================================================
-- Lets the owner record the member's name at invite time so the
-- Team list shows it even before the invite is accepted. The name
-- is also passed into the invite as user metadata, so handle_new_user()
-- (migration 012) copies it into the member's profile on signup.
-- Idempotent.
-- ============================================================

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS invited_name TEXT;
