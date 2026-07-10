@AGENTS.md
# WaCRM — Project Knowledge Base (CLAUDE.md)
# Brand: Replora · White-label WhatsApp CRM for Indian SMBs · Niche: Tour & Travel
# Last updated: June 2026 (data-driven AI brain era)
# Paste into: /CLAUDE.md in VS Code repo root

---

## gstack Skills (Available in Claude Code)

Use these slash commands in Claude Code sessions:
- `/office-hours` — Feature planning, use BEFORE building anything new
- `/investigate` — Root cause debugging (Vercel, Meta webhook, engine.ts)
- `/cso` — Security audit, run before client resell
- `/review` — Code review before every commit
- `/ship` — Git sync + PR workflow
- `/qa` — Live browser testing on devdabi.shop
- `/guard` — Max safety mode for engine.ts or migrations
- `/autoplan` — Full planning chain in one shot

**Rule:** New feature → /office-hours first. Commit → /review. Resell → /cso.

## 0. CLAUDE OPERATING RULES (ALWAYS FOLLOW — NON-NEGOTIABLE)

### 0a. Source of Truth — Always Check Git First
- Project files in Claude's context are BASE CODE ONLY — not the latest version.
- Before ANY code change, ask: *"Share the current file from your local repo."*
- The authoritative source is the local Git repo in VS Code. Never assume a file is unchanged from base.

### 0b. Backend Cross-Check Before Every Change
Before writing new code, verify:
1. What Supabase tables/columns already exist (check migrations + live DB — they differ).
2. What API routes already exist (`src/app/api/`).
3. What types are already defined (`src/types/index.ts`).
4. What the automation engine already handles (`src/lib/engine.ts`) and the AI engine (`src/lib/automations/ai-engine.ts`).
Never create duplicate tables, routes, or types. If unsure → ask to see the file first.

### 0c. Conflict Prevention Protocol
- For shared files (`globals.css`, `layout.tsx`, `types/index.ts`, `engine.ts`, `ai-engine.ts`) — read the FULL file before editing.
- State explicitly what you are changing and why. Flag anything that could break an existing feature.
- Mental check: *"Does this touch inbox / contacts / pipelines / broadcasts / automations / AI brain?"* If yes → extra caution.

### 0d. VS Code + Git Workflow
- All development in VS Code only. Push to Git before moving to the next task.
- Commit format: `feat: <what>` / `fix: <what>` / `chore: <what>` (Windows PowerShell syntax).
- Git is the single source of truth — Claude, VS Code, and Notion must reflect the same state.
- Windows `npx` ps1 wrapper bug → use `npx.cmd tsc --noEmit`. Local `tsc` green ≠ deployed green; push ALL changed files (incl `types/index.ts`).

### 0e. Notion Page — Always Update After Changes
- Notion URL: https://app.notion.com/p/warcm_tour_travel-379fc7b8a9e280eaae7dc777bde1dc8f (page id `379fc7b8a9e280eaae7dc777bde1dc8f`).
- After every completed task: what was done, files changed, status checkbox, new decisions.
- `insert_content` with `position: start` to prepend; `update_content` (old_str/new_str) for surgical edits. A `<page url="...">` tag must be on its own line standalone.

### 0f. Step-by-Step Execution Only
- Never multiple big changes in one shot. Always: **Plan → Confirm → Execute → Verify → Push → Log.**
- One change at a time; surgical find-and-replace over full-file rewrites.
- Ask for confirmation before destructive operations (schema changes, file deletes).

---

## 1. PROJECT IDENTITY

```
Product       : WaCRM — white-label WhatsApp CRM for Indian SMBs
Brand         : Replora (primary #0084ff)
First niche   : Tour & Travel companies
Repo          : devdabi32-hub/wacrm (branch: main) — forked & heavily customised from ArnasDon/wacrm
Production     : https://devdabi.shop (Vercel, region sin1)
Local dev     : http://localhost:3000
Supabase ref   : mqksxbxtnnbvhyalsrcv (Seoul) — production + master template, SAME project
                 (tnjmuoredgmakxbktxbh = secondary/unused; ignore)
WhatsApp       : 8989568529 = production (Meta-attached) · 9111828003 = test/trigger number
Meta           : direct Cloud API (no BSP), Graph API v21.0, permanent token configured
Notion log     : https://app.notion.com/p/warcm_tour_travel-379fc7b8a9e280eaae7dc777bde1dc8f
```

### Business Model (CRITICAL — this is NOT SaaS)
One-time setup fee + optional AMC. **Build once, sell to many.** Each client gets their OWN
Supabase project + OWN hosting (Vercel/Hostinger) + OWN Meta App credentials + OWN domain.
We deploy once via `seed_tour_travel.sql` (replace `CLIENT_USER_ID`). No monthly SaaS charges.

| Package      | Price          | Includes                                                        |
|--------------|----------------|-----------------------------------------------------------------|
| Floor deal   | ₹10k–₹20k      | Tour & Travel niche package                                      |
| Basic        | ₹15k–₹25k      | Install + branding + Supabase + Meta API                        |
| Standard     | ₹35k–₹50k      | Basic + automation workflows                                    |
| Premium      | ₹75k–₹1,00,000 | Standard + AI brain / custom modules / training                 |
| AMC (opt.)   | ₹3k–₹5k/mo     | Updates, support, Meta template help, new features              |

---

## 2. TECH STACK (exact)

| Layer       | Tech                                          | Version                 |
|-------------|-----------------------------------------------|-------------------------|
| Framework   | Next.js (App Router)                          | 16.2.4                  |
| UI          | React                                         | 19.2.4                  |
| Language    | TypeScript                                    | ^5 (strict, no `any`)   |
| Styling     | Tailwind CSS                                  | v4 (CSS vars, no config)|
| Components   | shadcn/ui                                      | base-nova, ^4.2.0       |
| Icons       | lucide-react                                  | ^1.8.0                  |
| DnD         | @dnd-kit/core + sortable                      | ^6 / ^10                |
| Database    | Supabase (Postgres + Auth + RLS + Realtime)   | ^2.103.3                |
| WhatsApp    | Meta Cloud API (direct)                       | Graph v21.0             |
| Deploy      | Vercel / Hostinger                            | sin1                    |

Path alias `@/` → `./src/` · CSS entry `src/app/globals.css` · RTL false.
> Next.js 16 has breaking changes from older versions. Read `node_modules/next/dist/docs/` before Next-specific code.

---

## 3. ARCHITECTURE — Data-Driven AI Brain (current direction)

**Strategic pivot (June 2026):** abandoned per-destination keyword workflows (don't scale) for a
**data-driven, AI-brained architecture**, built resell-ready from day one.

> **Core principle:** content = **DB rows + admin UI**, never hardcoded in workflows/code.
> At client delivery = zero code change (new Supabase + env + seed only).

### 3-layer model
1. **AI brain** (sole inbound handler) — reads the client's `destinations` table + settings;
   handles greet/menu, destination, payment, off-script Q&A, and human handoff. One brain,
   scales by data (10 or 100 destinations = just more rows).
2. **Deterministic delivery** — AI decides intent only; backend sends the exact asset from DB
   (no hallucinated links/prices).
3. **Human handoff** — `handoff` action gives the support number + pauses AI for that conversation.

### How it works (`src/lib/automations/ai-engine.ts`)
- AI returns strict JSON `{reply, action}` — provider-agnostic via prompt (NOT native
  function-calling → one code path for Groq/Gemini/OpenAI/DeepSeek/Claude). Defensive parser
  never throws and never leaks JSON.
- `action` ∈ `send_menu` · `send_destination(slug)` · `send_payment(slug)` · `handoff(reason)`,
  executed deterministically from `destinations` + `whatsapp_config`.
- Live catalogue (destinations + business_name + support_phone) injected into the system prompt
  each turn, so the AI always knows the client's exact packages and slugs.

### Lifecycle automations stay in the no-code engine (event-driven, not inbound)
WF3 Booking-Confirmation (`field_updated`), WF4 Post-Trip review. No conflict with the AI brain.

> The original keyword niche plan (Inquiry / Follow-up / Booking / Review / Broadcast WF1–WF5) is
> SUPERSEDED by the AI brain, EXCEPT the lifecycle ones (WF3 booking-confirm, WF4 review).

---

## 4. LIVE DATABASE SCHEMA (key tables)

> **Important:** live DB ≠ migration files. AI config columns + `ai_paused` were applied directly
> via SQL Editor, NOT a migration file (actual `008` = `profile_avatars_storage`; there is no
> `008_ai_engine.sql`). All un-migrated changes must be captured in `seed_tour_travel.sql` (Step 8).

**`destinations`** (migration `009`) — per-user, RLS `FOR ALL USING (auth.uid() = user_id)`, `set_updated_at` trigger:
`id, user_id, name, slug (unique per user — stable handle for AI actions), keywords[] (jsonb, GIN-indexed),
summary, description, highlights[], departures[] (jsonb), poster_url, itinerary_url,
price_from NUMERIC(12,2), currency, nights, days, sort_order, active, imported (mig 011), timestamps`.
Partial index `(user_id, sort_order) WHERE active`.

**`whatsapp_config`** (per-client config — Meta creds + AI config + business settings):
`id, user_id, phone_number_id, waba_id, access_token (AES-256-GCM), verify_token, status, connected_at, timestamps,`
AI: `ai_enabled (default false), ai_provider (default 'groq'), ai_model, ai_api_key (encrypted), ai_system_prompt, ai_webhook_url,`
auto-reply: `welcome_enabled, welcome_text, ooo_enabled, ooo_start, ooo_end, ooo_text,`
business (mig 010): `business_name, support_phone, upi_id, payment_qr_url, payment_note`.

**`conversations`** — `assigned_agent_id`, `ai_paused` (both pause AI).
**`contact_custom_values`** — composite unique `(contact_id, custom_field_id)`.
**`automations` / `automation_steps` / `automation_logs` / `automation_pending_executions`** (mig 006).

Migrations applied: `001`–`008` (008 = profile_avatars_storage) · `009` destinations · `010` business_settings · `011` destinations.imported.

### Tour & Travel CRM data (live)
- **9 custom fields:** `tour_interest`, `travel_dates`, `group_size`, `budget_range`,
  `booking_status` (Inquiry/Quoted/Confirmed/Completed/Cancelled), `destination_preference`,
  `itinerary_link`, `quoted_price`, `travel_stage` (upcoming/ongoing/completed).
- **6 pipeline stages** (pipeline id `e5d6f5cb-f415-4652-aaaa-2cb131dd2644`):
  New Inquiry → Itinerary Sent → Follow-Up → Booking Confirmed → Trip Ongoing → Post-Trip.
- **5 tags:** `new-inquiry`, `quoted-sent`, `confirmed-traveller`, `review-requested`, `vip-traveller`.
- **Cron:** UptimeRobot pinging `/api/automations/cron` (secret via `?secret=` query param).

---

## 5. AUTOMATION ENGINE & BUILDER

`src/lib/engine.ts` (executor) · `src/components/automations/automation-builder.tsx` (UI, single source of truth for step metadata) · `src/lib/.../validate.ts`.

**Actions:** `send_message`, `send_template`, `send_media`, `add_tag`, `remove_tag`,
`assign_conversation`, `update_contact_field`, `create_deal`, `wait`, `condition` (if/else),
`send_webhook`, `close_conversation`.
**Triggers:** `new_message_received`, `first_inbound_message`, `keyword_match` (exact/contains),
`new_contact_created`, `conversation_assigned`, `tag_added`, `field_updated`, `time_based`.

Adding a new action: register in `engine.ts` + `validate.ts`, add a card in `automation-builder.tsx`
matching the existing pattern, add the config type in `types/index.ts`. Read engine.ts fully first.

`update_contact_field` supports custom fields via `custom::uuid` → upserts `contact_custom_values`.
`field_updated` fires only on a REAL value change (spam-protection) via the browser save route
`api/contacts/custom-fields`; engine-driven field updates do NOT re-fire it (loop prevention).
Automation must be `is_active=true` to fire.

---

## 6. KEY LEARNINGS & GOTCHAS

**Vercel free:** any async inside `processMessage` (runs in `waitUntil()`) MUST be `await`ed —
fire-and-forget gets torn down mid-execution (next DB query never completes, webhook status `---`).
No `setTimeout`/sleep-debounce (killed during sleep); for batching use Upstash QStash.

**AI engine:** `getConversationHistory` excludes the current message (`.neq message_id`) else AI
replies to the previous one. AI skips by design if `assigned_agent_id` set OR `ai_paused=true` OR
contact has `confirmed-traveller` tag. Reset for testing:
`update conversations set assigned_agent_id=null, ai_paused=false`. Structured output via prompt +
robust parser (strip fences → first `{…}` span → tolerate bare action → never leak JSON). Localhost
can't receive Meta webhooks — test on prod/ngrok.

**Handoff = two switches:** `ai_enabled` (whatsapp_config) is GLOBAL; `ai_paused` (conversations) is
PER-CONVERSATION. Handoff sets `ai_paused=true` → that chat goes silent (human takes over) while
other chats still get AI.

**Meta:** media-by-link needs a direct public HTTPS jpg/png — `auto=format` Unsplash URLs can serve
webp (unsupported) → use `fm=jpg`. notion.site links don't render a WhatsApp preview → send poster
separately. Free-form text/media only inside the 24h window; production entry points need approved
templates. Error `#131058` = template restricted on test numbers.

**Schema / UUID:** live DB ≠ migration files. Reference custom fields/tags by NAME, not hardcoded id
(ids vary per project). Single-char UUID mismatch = silent FK violation. `automation_pending_executions`
uses UTC (apparent cron delays = UTC vs IST).

**n8n Code nodes:** only `$json` / `$input.all()` / `$input.first()` are valid — never `$('NodeName')`
(causes 300s hang).

**Supabase MCP:** times out — run all SQL via the Dashboard SQL Editor
(`https://supabase.com/dashboard/project/mqksxbxtnnbvhyalsrcv/sql/`).

---

## 7. RESELL-READY RULES (non-negotiable)

1. Every table: `user_id` + RLS — no exceptions.
2. No hardcoded UUIDs in code/seed — always `CLIENT_USER_ID`; reference tags/fields by name.
3. Brand / site URL / keys = env vars (or admin-editable DB settings) — never hardcoded.
   (`NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL` — pending in `site-config.ts`.)
4. Every new data piece (destination, tag, field, pipeline stage, automation, AI/business column)
   goes into `seed_tour_travel.sql`.
5. `ENCRYPTION_KEY` + `AUTOMATION_CRON_SECRET` unique per client.
6. Build once, sell to many — zero rework at delivery.

---

## 8. CURRENT STATUS

### Done ✅
- Repo forked, running, login working; branding → Replora `#0084ff`.
- Meta Cloud API connected (permanent token, phone_number_id); production deployed `devdabi.shop`.
- Custom fields (9), 6 pipeline stages, 5 tags, UptimeRobot cron.
- **AI brain Steps 1–5 COMPLETE + live-tested** (all 5 intents passed on real WhatsApp 16 June):
  `hi`→menu, `manali`→poster+itinerary, `confirm`→payment, off-script→reply, `talk to agent`→handoff.
- `send_media` engine action (image/document by hosted link).
- `field_updated` trigger + WF3 Booking-Confirmation built & tested (currently `is_active=false`,
  re-enable when wiring payment-verify lifecycle).
- **Catalogue feature COMPLETE:** `Destination` type + full CRUD (`api/destinations/route.ts`,
  `[id]/route.ts`, `bulk/route.ts`), Catalogue sub-tab UI in `automations/page.tsx` (Add/Edit/Delete/
  Activate), CSV/XLSX import via SheetJS (`cdn.sheetjs.com` build — NOT npm `xlsx@0.18.5` which has
  unpatched high-severity CVEs), `imported` badge (mig 011), `slugify`/`uniqueSlug`/`toStringArray`
  in `src/lib/destinations/utils.ts`. Stale-state bugs fixed (`force-dynamic` + `no-store`).

### Pending ⏳ (priority order)
1. **Step 7 (remaining)** — Settings page (business_name / support_phone / UPI / payment QR) +
   Inbox "Resume AI / Take Over" button (`ai_paused` toggle). The zero-code-delivery enabler.
2. **Keyword-filter gap** — `buildCatalogueContext` injects ALL active destinations every turn;
   add keyword-match filter against the GIN-indexed `keywords` column before it scales.
3. **Step 8 — `seed_tour_travel.sql`** — captures destinations (+ `imported`) + business cols + AI cols
   + custom fields + pipeline + tags, all with `CLIENT_USER_ID` placeholder, name-based lookups,
   zero hardcoded UUIDs. (Finalise LAST so all features are captured.)
4. **Payment verification** — Razorpay/Cashfree link + webhook → booking_status=Confirmed → re-enable WF3.
5. **Polish** — poster+itinerary as one message (fix ordering); prompt-tuning (no over-promising;
   graceful "I've paid"); set real support_phone.
6. **Resell hardening** — `site-config.ts` env-driven; hide landing/signup for client deploys.
7. **WF4 Post-Trip review;** WF3 `send_message` → `send_template` after Meta approval.
8. **Step 6 single-reply suppression** — largely MOOT (AI is sole inbound handler); optional safety net.

---

## 9. CODING CONVENTIONS

- TypeScript strict — no `any`, no implicit types.
- Server Components by default; `'use client'` only when needed.
- RLS on every new table; new tables use `uuid_generate_v4()` + `created_at` + RLS.
- New automation actions follow the existing card pattern + register in `engine.ts` + `validate.ts`.
- Tailwind v4 via CSS variables (no `tailwind.config.js`) — configure in `globals.css`.
- shadcn/ui style `base-nova` only — don't mix styles.
- `cn()` from `@/lib/utils` for conditional classNames.
- `sonner` toasts for user-facing errors.
- API routes: `no-store` cache, validate webhook HMAC, `export const dynamic = 'force-dynamic'` where freshness matters.
- SQL-first via Supabase SQL Editor (MCP times out).
- File structure: `src/app` (pages + `api/`), `src/components` (`ui/`, `inbox/`, `contacts/`,
  `broadcasts/`, `automations/`, `pipelines/`), `src/lib` (`supabase/`, `meta/`, `engine.ts`,
  `automations/ai-engine.ts`, `destinations/utils.ts`, `utils.ts`), `src/hooks`, `src/types`.

---

## 10. SECURITY PRIMITIVES (selling points)

AES-256-GCM token encryption at rest · RLS on every table · HMAC-SHA256 webhook verification ·
CSP report-only (flip to enforce post-audit) · HSTS / X-Frame-Options / Permissions-Policy ·
rate limiting on API routes · no BSP (direct Meta Cloud API = no third-party data access).

---

## 11. META WHATSAPP PRICING (India, post-Jul 2025)

Service: **FREE** (reply within 24h of customer message) · Utility ₹0.125 · Auth ₹0.125 ·
Marketing ₹0.88. 24h service window for free-form; 72h via click-to-WhatsApp ads.
Templates (Meta-approved) required outside the 24h window.

---

## 12. n8n (deferred)

NOT in the current flow — future paid add-on. The original niche workflow plan is superseded by the
AI brain except the lifecycle automations (WF3 booking-confirmation, WF4 review). Self-hosted via
Docker + ngrok when needed. n8n Code-node rule: only `$json` / `$input` valid.

---

## 13. WHITE-LABEL CHECKLIST

- [ ] App name → brand name in UI
- [ ] Login page tagline
- [ ] Logo (SVG preferred)
- [ ] Colours via CSS variables in `globals.css`
- [ ] Favicon (`public/favicon.ico`)
- [ ] Meta tags (`src/app/layout.tsx`)
- [ ] Remove upstream repo links from visible UI
- [ ] Keep MIT LICENSE (required by upstream)

---

## 14. WORKING WITH CLAUDE — RULES

1. Communication in Hinglish (Hindi + English mix) — respond in the same style.
2. Copy-paste level commands; Windows/PowerShell local environment.
3. Always ask for the current file from the local repo before editing (project knowledge = base/stale).
4. One change at a time: Plan → Confirm → Execute → Verify → Push → Notion log.
5. Surgical find-and-replace over full-file rewrites.
6. Always check `engine.ts`, `ai-engine.ts`, `types/index.ts`, existing migrations before new code.
7. Ask for error JSON / screenshot before fixing bugs.
8. Every decision must keep the product resell-ready and move toward the first paying client.
9. Update the Notion page after every completed milestone.

---

*Replora · WaCRM · devdabi.shop 🇮🇳*

---

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, border-radius, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match `DESIGN.md`.

Key rules from DESIGN.md:
- Primary color: `#6366F1` (Indigo) — redesigned July 2026. Never use `#0084ff` or `#00A884` as primary.
- Fonts: Plus Jakarta Sans (body/UI via `--font-sans`), Geist Mono (data/tables)
- Light mode (default): `#F0F2F8` BG, `#FFFFFF` card, `#E5E7EB` border
- Dark mode (`.dark` class on html): `#0F1117` BG, `#1A1D27` card, `#252836` border
- Theme toggle in dashboard header — persisted to localStorage key `replora-theme`
- Spacing: 4px base, compact density
- Motion: minimal-functional only — no entrance animations
## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
