-- ============================================================
-- 012  TEAM / USER ACCESS — shared workspace + email invites
-- ============================================================
-- Idempotent. Adds a "workspace" layer on top of the existing
-- per-user model so an OWNER (the original account) can invite
-- MEMBERS who, once active, share the owner's data.
--
-- Mechanism: every data table is scoped by `user_id`. We replace the
-- RLS predicate `auth.uid() = user_id` with `app_owner_id() = user_id`,
-- where app_owner_id() resolves to:
--   • the owner's id      → if the caller is an active member
--   • auth.uid() (self)   → otherwise (a normal/owner account)
-- Solo accounts with no membership rows behave EXACTLY as before
-- (fallback = auth.uid()), so this is fully backward-compatible.
--
-- `profiles` is intentionally NOT changed — every member keeps their
-- own profile row (name / avatar / email).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- WORKSPACE_MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'revoked')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One invite per email per owner.
  UNIQUE (owner_id, invited_email)
);

-- A given auth user can be an active member of only ONE workspace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_members_member
  ON workspace_members(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_members_owner
  ON workspace_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_email
  ON workspace_members(invited_email);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- app_owner_id() — the workspace owner for the current caller.
-- SECURITY DEFINER so the lookup bypasses RLS on workspace_members
-- (prevents recursion when this function is used inside RLS policies).
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT owner_id
       FROM public.workspace_members
      WHERE member_id = auth.uid()
        AND status = 'active'
      LIMIT 1),
    auth.uid()
  );
$$;

ALTER FUNCTION public.app_owner_id() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.app_owner_id() TO authenticated, anon, service_role;

-- workspace_members policies (depend on app_owner_id, so defined after it).
-- Owner = a top-level account (its own owner). Members cannot invite.
DROP POLICY IF EXISTS "Owners manage workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Members read own membership" ON workspace_members;
CREATE POLICY "Owners manage workspace members" ON workspace_members FOR ALL
  USING (owner_id = auth.uid() AND public.app_owner_id() = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND public.app_owner_id() = auth.uid());
CREATE POLICY "Members read own membership" ON workspace_members FOR SELECT
  USING (member_id = auth.uid());

DROP TRIGGER IF EXISTS set_updated_at ON workspace_members;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RE-SCOPE RLS: auth.uid() = user_id  ->  app_owner_id() = user_id
-- (profiles is deliberately left untouched.)
-- ============================================================

-- Direct user_id tables --------------------------------------
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;
CREATE POLICY "Users can manage own contacts" ON contacts FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own tags" ON tags;
CREATE POLICY "Users can manage own tags" ON tags FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own custom fields" ON custom_fields;
CREATE POLICY "Users can manage own custom fields" ON custom_fields FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own notes" ON contact_notes;
CREATE POLICY "Users can manage own notes" ON contact_notes FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
CREATE POLICY "Users can manage own conversations" ON conversations FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own config" ON whatsapp_config;
CREATE POLICY "Users can manage own config" ON whatsapp_config FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own templates" ON message_templates;
CREATE POLICY "Users can manage own templates" ON message_templates FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own pipelines" ON pipelines;
CREATE POLICY "Users can manage own pipelines" ON pipelines FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own deals" ON deals;
CREATE POLICY "Users can manage own deals" ON deals FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own broadcasts" ON broadcasts;
CREATE POLICY "Users can manage own broadcasts" ON broadcasts FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own automations" ON automations;
CREATE POLICY "Users can manage own automations" ON automations FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can view own automation logs" ON automation_logs;
CREATE POLICY "Users can view own automation logs" ON automation_logs FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

DROP POLICY IF EXISTS "Users can manage own destinations" ON destinations;
CREATE POLICY "Users can manage own destinations" ON destinations FOR ALL
  USING (public.app_owner_id() = user_id)
  WITH CHECK (public.app_owner_id() = user_id);

-- Join-based tables (scope via parent.user_id) ---------------
DROP POLICY IF EXISTS "Users can manage contact tags" ON contact_tags;
CREATE POLICY "Users can manage contact tags" ON contact_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM contacts
                  WHERE contacts.id = contact_tags.contact_id
                    AND contacts.user_id = public.app_owner_id()));

DROP POLICY IF EXISTS "Users can manage custom values" ON contact_custom_values;
CREATE POLICY "Users can manage custom values" ON contact_custom_values FOR ALL
  USING (EXISTS (SELECT 1 FROM contacts
                  WHERE contacts.id = contact_custom_values.contact_id
                    AND contacts.user_id = public.app_owner_id()));

DROP POLICY IF EXISTS "Users can view own messages" ON messages;
CREATE POLICY "Users can view own messages" ON messages FOR ALL
  USING (EXISTS (SELECT 1 FROM conversations
                  WHERE conversations.id = messages.conversation_id
                    AND conversations.user_id = public.app_owner_id()));
-- (the separate "Service role can insert messages" policy is unchanged)

DROP POLICY IF EXISTS "Users can manage pipeline stages" ON pipeline_stages;
CREATE POLICY "Users can manage pipeline stages" ON pipeline_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM pipelines
                  WHERE pipelines.id = pipeline_stages.pipeline_id
                    AND pipelines.user_id = public.app_owner_id()));

DROP POLICY IF EXISTS "Users can manage broadcast recipients" ON broadcast_recipients;
CREATE POLICY "Users can manage broadcast recipients" ON broadcast_recipients FOR ALL
  USING (EXISTS (SELECT 1 FROM broadcasts
                  WHERE broadcasts.id = broadcast_recipients.broadcast_id
                    AND broadcasts.user_id = public.app_owner_id()));

DROP POLICY IF EXISTS "Users can manage steps of own automations" ON automation_steps;
CREATE POLICY "Users can manage steps of own automations" ON automation_steps FOR ALL
  USING (EXISTS (SELECT 1 FROM automations a
                  WHERE a.id = automation_steps.automation_id
                    AND a.user_id = public.app_owner_id()));

-- ============================================================
-- Link a pending invite to the new auth user on signup.
-- Extends the existing handle_new_user() (profile auto-create).
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );

  -- Attach any pending workspace invite addressed to this email.
  UPDATE public.workspace_members
     SET member_id   = NEW.id,
         status      = 'active',
         accepted_at = NOW(),
         updated_at  = NOW()
   WHERE invited_email = LOWER(NEW.email)
     AND member_id IS NULL
     AND status = 'invited';

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to provision new user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
