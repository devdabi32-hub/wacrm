# Deploy on Vercel (Free Hobby Tier)

Vercel is the recommended way to run WaCRM in production. The Hobby tier is
**free forever** — no credit card required, includes custom domains, SSL, and
automatic Git-based deploys.

This walkthrough assumes you have completed
[getting-started](./getting-started.md), [supabase-setup](./supabase-setup.md),
and [whatsapp-setup](./whatsapp-setup.md) — i.e., your fork builds locally
and you have your Supabase + Meta credentials ready.

---

## 1. Prerequisites

- A **GitHub account** with your forked repo pushed (or directly imported).
- A **Vercel account** — sign up at <https://vercel.com> using your GitHub
  account (free, no card needed).
- All environment variables ready (see [environment-variables.md](./environment-variables.md)).

---

## 2. Import the Project

1. Go to <https://vercel.com/new>.
2. Click **Import Git Repository** → select your GitHub fork.
3. Vercel auto-detects Next.js. Accept the default build settings:
   - **Framework:** Next.js
   - **Build command:** `npm run build`
   - **Output directory:** `.next` (auto)
   - **Install command:** `npm ci`
4. Do **NOT** click Deploy yet — set environment variables first (Step 3).

---

## 3. Set Environment Variables

In the Vercel import screen, scroll down to **Environment Variables**.
Add **all** of these before clicking Deploy:

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abc.supabase.co` | From Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Supabase anon key — public, safe |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **Server-only secret** — never expose to browser |
| `ENCRYPTION_KEY` | `a3f9...` (64 hex chars) | **SECRET** — generate fresh per client (see below) |
| `META_APP_SECRET` | `abc123...` | From Meta App → Settings → Basic → App Secret |
| `NEXT_PUBLIC_SITE_URL` | `https://yourclient.vercel.app` | No trailing slash; update after deploy if using custom domain |
| `NEXT_PUBLIC_SITE_NAME` | `Sunshine Tours CRM` | Client brand name |
| `AUTOMATION_CRON_SECRET` | `xyz...` | **SECRET** — generate fresh per client (see below) |

> **⚠️ The build FAILS without the two `NEXT_PUBLIC_SUPABASE_*` vars.** They are
> baked in at **build time**, and `next build` prerenders the auth pages
> (`/accept-invite`, `/login`, `/forgot-password`, `/reset-password`), each of
> which creates a Supabase client. If the URL or anon key is missing, the build
> errors during prerender with:
>
> ```
> @supabase/ssr: Your project's URL and API key are required to create a Supabase client!
> Export encountered an error on /(auth)/accept-invite/page: /accept-invite, exiting the build.
> ```
>
> Set both **before** deploying, scoped to **Production** (tick Production, not
> just Preview). This is a config issue, not a code bug — do not "fix" it by
> forcing those pages dynamic: `NEXT_PUBLIC_*` still bake in at build, so a
> missing key would just move the same failure to runtime (login breaks in the
> browser) and ship a silently-broken app.
>
> Changed an env var later? Vercel does **not** auto-rebuild, and `NEXT_PUBLIC_*`
> only bake in at build — trigger a manual **Redeploy** (Deployments → ⋯ →
> Redeploy).

### Generate `ENCRYPTION_KEY` and `AUTOMATION_CRON_SECRET`

Run in a terminal (Node.js required):

```bash
# ENCRYPTION_KEY — exactly 64 hex chars
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# AUTOMATION_CRON_SECRET — any secure random string
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Copy each output → paste into Vercel. Do NOT reuse across clients.

> **Security rule:** `ENCRYPTION_KEY` is the master key for all WhatsApp token
> encryption. If it leaks or changes, all stored tokens stop working. Treat it like
> a database password — Vercel dashboard access only.

---

## 4. Deploy

Click **Deploy**. Vercel builds and deploys. First build takes ~2-3 minutes.

When it finishes, you get a URL like `https://your-project.vercel.app`. That
is your live CRM — hit it in a browser and confirm the login page loads.

---

## 5. Disable Preview Deployments

> **Do this immediately after first deploy.** This is a security step.

By default, Vercel creates a public preview URL for every branch push. A preview
deployment is fully connected to the same Supabase database as production —
meaning anyone with that preview URL can access real client data.

**How to disable:**

Vercel Dashboard → your project → **Settings → Git → Preview Deployments**:

Option A (recommended): **Disable** all preview deployments entirely.

Option B (if you need previews for testing): Set **Password Protection** on
previews — Vercel Authentication adds a password gate before the preview loads.
This requires a Vercel Pro plan ($20/mo).

> For single-developer client deployments, **Option A is always correct**.
> There is no staging/review workflow that justifies exposing client data via
> a public URL.

---

## 6. Configure the Meta Webhook

Back in **Meta for Developers → your app → WhatsApp → Configuration →
Webhook**:

- **Callback URL:** `https://your-project.vercel.app/api/whatsapp/webhook`
  (or your custom domain from Step 7)
- **Verify Token:** the same string you entered in the CRM Settings page
- Click **Verify and save**
- Subscribe to: `messages`, `message_template_status_update`

---

## 7. Custom Domain (Optional — Free)

Vercel supports custom domains on the Hobby plan at no cost.

In the Vercel Dashboard → your project → **Settings → Domains**:

1. Enter your domain (e.g., `crm.clientdomain.com`).
2. Add the DNS records shown — typically a CNAME pointing to `cname.vercel-dns.com`.
3. SSL provisions automatically within ~1 minute.

After adding the domain:

- Update `NEXT_PUBLIC_SITE_URL` to `https://crm.clientdomain.com` in Vercel
  environment variables.
- **Redeploy** (Settings → Deployments → Redeploy latest) so the new URL bakes
  into the client bundle.
- Update the Meta webhook callback URL to the new domain.

---

## 8. Schedule the Automations Cron

Vercel Hobby does not include built-in cron jobs (Pro-only feature). Use
**UptimeRobot** instead — it's free and already mentioned in the CLAUDE.md.

1. Sign up at <https://uptimerobot.com> (free tier: 50 monitors, 5-min intervals).
2. Add a new monitor: **HTTP(S)** type.
3. URL: `https://your-domain/api/automations/cron?secret=YOUR_AUTOMATION_CRON_SECRET`

   Paste the literal secret in the URL — UptimeRobot does not support custom
   headers on the free tier.

4. Monitoring interval: **5 minutes**.
5. Save. The cron starts running immediately.

> This pings the cron endpoint every 5 minutes, which drains any pending
> automation Wait steps. See [automations-and-cron.md](./automations-and-cron.md).

---

## 9. Deploying Updates

When you push code to the `main` branch, Vercel automatically rebuilds and
deploys. Zero manual steps.

If you updated environment variables:
1. Change the value in Vercel Dashboard → Settings → Environment Variables.
2. **Redeploy** manually (Deployments → three-dot menu → Redeploy) — Vercel
   does NOT auto-redeploy when env vars change, only when code changes.

If the Supabase schema changed (new migration):
1. Apply the migration in Supabase SQL Editor first.
2. Then push any code changes — Vercel redeploys automatically.

---

## 10. Vercel Hobby Tier Limits to Know

| Limit | Hobby Value | Impact |
|---|---|---|
| Serverless function timeout | 10 seconds (response) | Webhook handler responds immediately via `waitUntil`; background processing continues |
| Bandwidth | 100 GB/month | Ample for a CRM |
| Build minutes | 6,000/month | ~200 deploys/month — more than enough |
| Cron jobs | Not included | Use UptimeRobot (free) |
| Custom domains | Unlimited | Free |
| SSL | Automatic | Free |

**On function timeout:** The webhook route returns `200 OK` immediately and
processes messages in the background via Vercel's `waitUntil`. This means
AI replies (which take 2-5 seconds from Groq) complete without hitting the
10-second response timeout. If you switch to a slow AI provider, monitor
response times.

---

## 11. Vercel Account Security

- Enable **2FA** on your Vercel account (Account Settings → Security → Two-factor authentication).
- Vercel is the only place your `SUPABASE_SERVICE_ROLE_KEY` and `ENCRYPTION_KEY`
  exist outside of Supabase itself. If a malicious actor gains access to your Vercel
  account, they can read all env vars in plaintext.
- Do not share Vercel account login. Use Vercel **Teams** if multiple people need
  access (Teams require a paid plan; for solo agency work, single account is fine).

---

## Where to Go Next

- [Automations cron →](./automations-and-cron.md) — required if any automation uses a Wait step.
- [WhatsApp setup →](./whatsapp-setup.md) — if you haven't wired the webhook yet.
- [Troubleshooting →](./troubleshooting.md) — common deploy issues.
