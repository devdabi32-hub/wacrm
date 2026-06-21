# Possible Updates — Low-Effort / No-Major-Change Ideas

Ye list un features/improvements ki hai jo **existing architecture ke andar fit ho jaate hain** —
koi naya table-redesign, naya module, ya bada refactor nahi chahiye. Har item ke saamne effort
aur kis client-package mein upsell ho sakta hai, woh likha hai.

Verified: in sab features ka koi version abhi codebase mein NAHI hai (checked before listing).

---

## 1. Inbox

- **Canned responses / quick replies** (Low) — Agents ke liye saved short replies (`/hi`, `/closing`
  jaisi slash-shortcuts ya ek dropdown). `message_templates` table already hai, bas inbox composer
  mein ek picker add karna hai.
- **"Assigned to me" filter** (Low) — Status filter (`all/open/...`) already hai
  (`conversation-list.tsx`), bas ek aur filter option add karna hai.
- **Pin/star important conversations** (Low) — Ek `is_pinned` column + sort-to-top. Simple migration
  + UI toggle.
- **Browser desktop notification** on new message (Low) — `Notification` API, sirf permission ask +
  realtime hook (`use-realtime`) mein call jodo.

## 2. Contacts

- **Bulk actions** — multi-select checkboxes + bulk tag-add / bulk delete (Low-Medium). CSV import
  already hai, export missing hai — **Export to CSV** (Low) bhi easy add hai (reverse of import-modal
  ka parser).
- **Contact activity timeline** in detail view — agar abhi sirf notes dikhte hain, to deals +
  messages + tags-changed ko ek merged timeline mein dikhana (Medium, dashboard ke `activity-feed.tsx`
  ka pattern reuse ho sakta hai).

## 3. Broadcasts

- **Recurring broadcasts** (Medium) — abhi sirf one-time scheduled send hai (`step4-schedule-send.tsx`).
  Weekly/monthly repeat add karna automation cron ke saath ho sakta hai, lekin scope thoda bada hai.
- **Broadcast report export (CSV)** (Low) — delivered/read/failed counts already track ho rahe hain,
  bas ek download button.

## 4. Automations / AI Engine

- **Per-destination quick-reply buttons** in WhatsApp (Low-Medium) — Meta's interactive button/list
  messages use karke AI replies mein "Book Now / More Info" jaise buttons (abhi plain text replies
  hain).
- **CSAT / feedback automation** (Low) — conversation close hone par ek automated "Rate us 1-5"
  follow-up — existing automation engine (`trigger: status changed`) se hi ban sakta hai, naya step
  type nahi chahiye agar webhook/send_message se kaam chal jaye.

## 5. Pipelines

- **Deal aging / stale-deal flag** (Low) — agar ek deal X din se same stage mein hai to ek visual
  badge ("Stuck 5d"). Pure frontend computation, koi schema change nahi.

## 6. Settings / White-label (resale-specific)

- **Single accent-color picker** (Low) — abhi `#0084ff` kahin-kahin hardcoded hai; ek
  `business_settings.accent_color` column + CSS variable se white-label ka rang har client ke liye
  badalna easy ho jayega bina code-edit ke.
- **PWA support** (Low) — `manifest.json` + icons add karke phone par "Add to Home Screen" se app
  jaisa feel milega. Is session mein mobile-responsive kaam already ho chuka hai, ye uska natural
  next step hai.

## 7. General / Infra

- **Hindi/English UI toggle** (Medium) — Indian SMB clients ke liye localized labels. Bada nahi hai
  agar sirf static UI strings translate karni hain (forms/buttons), AI replies already
  language-agnostic hain (prompt-driven).

---

## Recommended order (sabse kam effort → zyada value)

1. Contacts CSV export
2. Inbox "assigned to me" filter + pin conversation
3. Canned responses
4. PWA manifest
5. Accent-color white-label setting
6. Broadcast report CSV export
7. Bulk contact actions
8. CSAT automation
9. Deal aging badge
10. Recurring broadcasts / Hindi toggle (bigger ones, plan separately)

---

## 8. Tour & Travel — Pre-built Automation Templates

Existing engine sirf 4 generic templates deta hai (`src/lib/automations/templates.ts`):
Welcome Message, Out of Office, Lead Qualifier, Follow-up Reminder — koi bhi tour/travel-specific
nahi hai. Engine already ye triggers/steps support karta hai, naya step-type ya schema change
**bilkul nahi chahiye** — bas niche diye templates ko `AUTOMATION_TEMPLATES` mein add karna hai aur
agency-owner ek click mein activate kar sake (jaisे abhi 4 templates UI mein dikhte hain waise hi):

Available triggers: `new_message_received`, `first_inbound_message`, `keyword_match`,
`new_contact_created`, `conversation_assigned`, `tag_added`, `field_updated`, `time_based`
Available steps: `send_message`, `send_template`, `send_media`, `add_tag`, `remove_tag`,
`assign_conversation`, `update_contact_field`, `create_deal`, `wait`, `condition`, `send_webhook`,
`close_conversation`

### 8.1 Itinerary Follow-Up (sabse high-impact)
Tour agencies ka sabse bada leak: itinerary bhej diya, customer reply nahi karta, koi follow-up nahi
hota — lead mar jaati hai.
- **Trigger:** `field_updated` — pipeline stage = "Itinerary Sent"
- **Steps:** `wait` 24h → `condition` (stage abhi bhi "Itinerary Sent" hai?) → yes:
  `send_message` ("Sir/Ma'am, itinerary mil gayi? Koi sawal ho to batayein 🙂") →
  `wait` 48h → `condition` (still same stage?) → yes: `assign_conversation` (round robin, agent ko
  manually call karne ke liye) + `add_tag` "needs-manual-followup"

### 8.2 Payment Reminder
Booking confirm hua, advance payment pending reh jaata hai.
- **Trigger:** `field_updated` — custom field `payment_status` = "Pending"
- **Steps:** `wait` 1 day → `condition` (`payment_status` abhi bhi Pending?) → yes:
  `send_message` (UPI/payment link reminder — `whatsapp_config.upi_id` se already aata hai AI brain
  mein, yahi reuse hoga) → `wait` 2 days → yes (still pending): `send_message` (urgency wala 2nd
  reminder) + `assign_conversation`

### 8.3 Document Collection
Booking confirm hone ke baad ID-proof/passport copy maangna agent bhool jaata hai.
- **Trigger:** `field_updated` — stage = "Booking Confirmed"
- **Steps:** `send_message` ("Booking confirm! 🎉 Travel ke liye ID proof (Aadhaar/Passport) ki copy
  bhej dein.") → `add_tag` "docs-pending" → `wait` 3 days → `condition` (tag "docs-pending" abhi bhi
  laga hai?) → yes: `send_message` (reminder)

### 8.4 Pre-Trip Reminder (T-3 days)
- **Trigger:** `time_based` (per-deal/contact custom field `travel_date` se 3 din pehle —
  engine already `time_based` support karta hai schedule ke liye)
- **Steps:** `send_message` (checklist: documents, packing, reporting time/location) →
  `send_media` (agar PDF itinerary attach karni ho)

### 8.5 Day-of-Travel Wishes + Support Number
- **Trigger:** `time_based` — travel date ke din subah
- **Steps:** `send_message` ("Aapki trip aaj shuru ho rahi hai! Safe travels 🧳 Koi bhi help chahiye
  ho to is number par call karein: {support_phone}" — `whatsapp_config.support_phone` already
  available hai)

### 8.6 Post-Trip Review + Referral (existing WF4 ko extend karna)
CLAUDE.md ke hisaab se Post-Trip review automation (WF4) already ban chuka hai. Isko ek step aage
badhaya ja sakta hai:
- **Trigger:** `field_updated` — stage = "Post-Trip" (existing)
- **New steps add karo:** review ke baad → `wait` 7 days → `add_tag` "past-customer" →
  `create_deal` nahi, sirf tag — taaki future broadcasts (seasonal offers) is tag ko target kar
  sakein.

### 8.7 Group / Corporate Lead Routing
"10 log", "group", "corporate trip" jaisी inquiries normal leads se alag handle honi chahiye —
inka ticket size bada hota hai.
- **Trigger:** `keyword_match` — keywords: `["group", "corporate", "10 people", "team outing"]`
- **Steps:** `add_tag` "group-lead" → `create_deal` (pipeline: default, stage: "New Inquiry") →
  `assign_conversation` (specific senior agent, round_robin se off rakh ke ek fixed agent bhi ho
  sakta hai agar engine support kare)

### 8.8 Win-Back Campaign (off-season repeat business)
- **Trigger:** `tag_added` — tag "past-customer" (8.6 se aayega) ya `time_based` (90 din since last
  booking)
- **Steps:** `send_message` ("Aapki pichli trip kaisi rahi? Is season naye destinations pe special
  discount hai — interested?") → `add_tag` "win-back-sent"

### 8.9 High-Value Lead Alert (owner ko)
Bada deal (e.g. ₹50k+ group booking) aaye to owner ko turant pata chale, agent ke bharose na rahe.
- **Trigger:** `field_updated` — deal `value` > threshold (condition step check karega)
- **Steps:** `condition` (deal value > 50000) → yes: `send_webhook` (owner ke WhatsApp/Telegram/Slack
  alert — `send_webhook` step already exists, koi naya integration nahi chahiye)

---

**Implementation note:** sab 9 templates `templates.ts` ke `AUTOMATION_TEMPLATES` object mein naye
entries ke roop mein add honge — same shape jo `welcome_message` / `out_of_office` already use karte
hain. Engine, validate.ts, ya UI mein koi change nahi chahiye, bas `TEMPLATE_ORDER` array aur
icon-map mein naye slugs add karne honge. Sabse pehle 8.1 (Itinerary Follow-Up) aur 8.3 (Document
Collection) banwana — ye do agency owners ke liye sabse direct revenue-saving hain.
