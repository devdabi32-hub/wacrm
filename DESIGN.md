# Design System — Replora

## Product Context
- **What this is:** White-label WhatsApp CRM dashboard for Indian SMB Tour & Travel operators. Shared inbox, contacts, pipelines, broadcasts, automations, and AI brain.
- **Who it's for:** Tour operators and their agents who manage hundreds of WhatsApp conversations daily. Built to be resold to clients who white-label under their own brand.
- **Space/industry:** WhatsApp-first CRM, Tour & Travel, Indian SMB
- **Project type:** B2B dashboard / web app
- **Memorable thing:** "WhatsApp-first. India-built."

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with warmth — function-first, data-dense, not cold
- **Decoration level:** Intentional — barely-there texture on surfaces; no decorative blobs, gradient heroes, or icon-grid layouts
- **Mood:** Serious operator tool. The kind of software a tour agency owner shows their team with pride. Every pixel earns its place. Warmth comes from the palette and typography, not from decoration.
- **Reference:** WhatsApp dark mode surfaces (the visual language your users already trust on their phone)

## Typography
- **Display/Hero:** Satoshi — geometric, confident, slightly editorial. Used for dashboard stat values, page headers, empty-state titles, any moment of authority. Weight 700–900, letter-spacing -0.02em to -0.03em.
- **Body/UI:** Plus Jakarta Sans — warmer than Inter, handles Indian names and Hindi-English mixed strings cleanly at 12–14px. Nav items, form labels, conversation previews, contact names, button text, body copy. Weight 400–700.
- **Data/Tables:** Geist Mono — tabular-nums enabled. Timestamps, phone numbers, IDs, prices, metrics, inbox list rows. Weight 400–500, font-variant-numeric: tabular-nums.
- **Loading:** Google Fonts CDN for Plus Jakarta Sans and Geist Mono; Fontshare CDN for Satoshi (`https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,900&display=swap`)
- **Scale:**
  - xs: 10px (table headers, badges, labels)
  - sm: 12px (timestamps, muted meta, secondary labels)
  - base: 13–14px (body, nav, conversation items)
  - md: 15–16px (section subheadings, card titles)
  - lg: 20–24px (page titles, panel headers)
  - xl: 32–40px (stat values)
  - 2xl: 48–72px (hero display)

## Color
- **Approach:** Modern SaaS — indigo primary, light-default dual-mode, semantic colors clean. Switched from WhatsApp green to indigo in July 2026 (user-approved full redesign).
- **Primary:** `#6366F1` (oklch 0.585 0.235 264) — Indigo. Gradient buttons use `linear-gradient(135deg, #6366F1, #8B5CF6)`. Active states, unread badges, AI-active status.
- **Primary bg:** `rgba(99,102,241,0.10)` — icon well backgrounds, info banners
- **Light mode (default):**
  - Background: `#F0F2F8` (oklch 0.954 0.007 265)
  - Card/Sidebar: `#FFFFFF`
  - Border: `#E5E7EB` (oklch 0.916 0.003 265)
  - Text: `#111827` (oklch 0.131 0.02 265)
  - Muted text: `#6B7280` (oklch 0.503 0.012 265)
- **Dark mode (`.dark` class on `<html>`):**
  - Background: `#0F1117` (oklch 0.088 0.013 265)
  - Card: `#1A1D27` (oklch 0.122 0.015 265)
  - Sidebar: `#13151F` (oklch 0.094 0.015 265)
  - Border: `#252836` (oklch 0.172 0.02 265)
  - Text: `#F1F5F9` (oklch 0.969 0.004 265)
  - Muted text: `#64748B` (oklch 0.494 0.019 265)
- **Success:** `#10B981` (oklch 0.696 0.17 162)
- **Warning:** `#F59E0B` (oklch 0.769 0.188 70)
- **Error:** `#EF4444` (oklch 0.628 0.257 29)
- **Theme persistence:** `localStorage` key `replora-theme` (`'dark'`/`'light'`). Anti-FOUC inline script in `layout.tsx`. Toggle button in dashboard header.

## Spacing
- **Base unit:** 4px
- **Density:** Compact — operators managing 200 conversations need information density, not whitespace
- **Scale:**
  - 2xs: 2px
  - xs: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - xl: 32px
  - 2xl: 48px
  - 3xl: 64px

## Layout
- **Approach:** Grid-disciplined — strict three-column scaffold for the main app (icon rail 64px → conversation list 320px → main panel flex-1). Slight editorial looseness for dashboard stat areas where numbers are the hero.
- **Grid:** 12-column at ≥1280px, 8-column at ≥768px, 4-column at <768px
- **Max content width:** 1440px (dashboard views); no max on three-column inbox layout
- **Border radius:**
  - sm: 4px (tags, badges, small inputs)
  - md: 8px (buttons, cards, inputs, pipeline cards)
  - lg: 12px (modals, large panels, the app shell)
  - full: 9999px (avatar circles, pill badges, search bars)

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension. No entrance animations. This is an operator tool, not a marketing site.
- **Easing:** enter: ease-out, exit: ease-in, move: ease-in-out
- **Duration:**
  - micro: 50–100ms (button color, icon swap)
  - short: 150–250ms (card hover, tooltip, tag highlight)
  - medium: 250–400ms (drawer open, tab switch, panel slide)
  - long: 400–700ms (page-level transition, modal open)
- **What moves:** `border-color`, `background`, `color`, `transform: translateY(-2px)` on card hover. Nothing else moves without a reason.

## White-label Notes
- All colors are CSS custom properties in `globals.css`. Per-client delivery = swap `--primary` and `--primary-dim` only.
- Font stack is replaceable without touching component code (only `--font-display`, `--font-body`, `--font-data` need changing).
- Replora brand (#00A884 green) is the default. Clients who want a different primary get a CSS variable override in their env.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-08 | WhatsApp green (#00A884) as primary instead of Meta blue (#0084ff) | Owns the channel identity rather than borrowing the platform brand. Every competitor uses Meta blue. |
| 2026-07-08 | WhatsApp dark surface palette (#111B21 / #1E2B31) instead of generic charcoal | Surfaces echo the chat UI users already know from their phone. Visual handshake between mobile WA and desktop CRM. |
| 2026-07-08 | Satoshi + Plus Jakarta Sans over Inter | Inter is overused. Plus Jakarta Sans handles Indian names and mixed-script content better at 12–14px. Satoshi gives display moments editorial authority. |
| 2026-07-08 | Compact density (4px base) | Operators managing 200+ conversations need data, not whitespace. Power users always prefer density. |
| 2026-07-08 | Minimal-functional motion only | This is a tool, not a product site. Animations that don't reduce confusion are noise. |
| 2026-07-08 | Initial design system created | Created by /design-consultation. Memorable thing: "WhatsApp-first. India-built." |
| 2026-07-09 | **REDESIGN APPROVED** — Indigo #6366F1 primary, light-default + dark-mode toggle | User approved full upgrade after reviewing HTML previews (replora-preview.html + automations-preview.html). Modern SaaS aesthetic over WhatsApp dark-only. globals.css, layout.tsx, header.tsx all updated. |
