# Supabase setup

This template uses Supabase for Postgres, authentication, row-level security (RLS),
and (optionally) storage. You need one Supabase project per deployment.

## 1. Create the project

1. Sign in at <https://supabase.com> and create a **new project**.
2. Pick the region closest to your users. Save the database password shown
   at creation time — you will not see it again.
3. Wait for the project to provision (about a minute).

## 2. Grab your keys

Open **Project Settings → API** in the Supabase dashboard. Copy:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

Paste them into `.env.local`.

> **Do not commit the service-role key.** It bypasses RLS entirely. The
> repo's `.gitignore` already excludes `.env.local` — keep it that way.

## 3. Run the migrations

All schema changes live in `supabase/migrations/` as plain SQL and are
idempotent (safe to re-run). The simplest way to apply them:

### Option A — SQL Editor (quickest)

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the contents of **`supabase/install.sql`** and run it. This single file is
   the entire schema — every migration (`001`…`013`) concatenated in numeric order,
   plus the `uuid-ossp` extension line. It is idempotent (safe to re-run) and needs
   no existing user.
3. That's the whole schema in one paste. It runs top-to-bottom and reports its status.

> `install.sql` is **generated** from `supabase/migrations/` via
> `npm run build:install-sql` — do not hand-edit it. After adding a migration,
> regenerate it; `npm run check:install` fails in CI if it goes stale, and
> `npm run check:bom` guards against UTF-8 BOMs that would break the concatenation.

### Option B — Supabase CLI

```bash
npm install --global supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

The CLI applies every file in `supabase/migrations/` on top of the linked
project.

## 4. Verify

Open **Table Editor** in the Supabase dashboard. You should see tables
including `profiles`, `contacts`, `conversations`, `messages`, `pipelines`,
`broadcasts`, `automations`, and `whatsapp_config`. If any are missing, a
migration failed — re-run it and check the SQL output.

## 5. Auth settings

Under **Authentication → Providers**, confirm:

- **Email** is enabled (default).
- **Confirm email** is on for production, off for local if you want
  frictionless testing.

Under **Authentication → URL Configuration**, add your production URL
(e.g., `https://crm.example.com`) to the allow-list so password-reset
emails link back correctly.

## 6. (Optional) Storage

The app downloads WhatsApp® media through Meta's `/download` endpoint and
currently relays it on demand rather than caching it in Supabase Storage.
No bucket setup is required for a default install.

## Next step

[WhatsApp setup →](./whatsapp-setup.md)
