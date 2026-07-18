/**
 * ai-engine.ts
 *
 * WaCRM AI Engine — ported from Replora's webhook-receiver Edge Function.
 *
 * Handles:
 *  1. Welcome message (first-ever message from a contact)
 *  2. Out-of-Office auto-reply (time-window based)
 *  3. AI auto-reply (Groq / Gemini / OpenAI / DeepSeek / Claude / n8n webhook)
 *     — with full conversation history context
 *
 * Called from: src/app/api/whatsapp/webhook/route.ts → processMessage()
 * Config stored in: whatsapp_config table (ai_* + welcome_* + ooo_* columns)
 *
 * Key differences from Replora:
 *  - Uses WaCRM's whatsapp_config table (not connected_phone_numbers)
 *  - API key encrypted with AES-256-GCM (uses WaCRM's decrypt())
 *  - Uses WaCRM's engineSendText() for outbound (not direct Meta API call)
 *  - Checks conversations.ai_paused instead of human_takeover
 *  - Checks conversations.assigned_agent_id for human takeover
 *  - WaCRM schema: messages.content_text (not message_text), sender_type='bot'
 */

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { engineSendText, engineSendTyping, engineSendMedia } from '@/lib/automations/meta-send'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AIReplyInput {
    userId: string
    contactId: string
    conversationId: string
    messageText: string
    wasNewContact: boolean
    currentMessageId?: string
    currentMessageCreatedAt?: string
}

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

// Structured AI output (Step 3): model returns { reply, action }.
// action=null for plain replies; else a typed action the engine runs (Step 4).
export type AIActionType = 'send_menu' | 'send_destination' | 'send_payment' | 'handoff'

export interface AIAction {
    type: AIActionType
    /** slug/name of destination, for send_destination / send_payment. */
    destination?: string
    /** short reason, for handoff. */
    reason?: string
}

export interface AIResult {
    reply: string
    action: AIAction | null
}

// ─────────────────────────────────────────────
// Provider / Model constants (mirrors Replora UI)
// ─────────────────────────────────────────────

const DEFAULT_MODELS: Record<string, string> = {
    groq: 'llama-3.1-8b-instant',
    gemini: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini',
    deepseek: 'deepseek-chat',
    claude: 'claude-3-haiku-20240307',
}

const DEFAULT_SYSTEM_PROMPT =
    'You are a helpful WhatsApp assistant for a Tour & Travel company. Keep replies short, clear, and friendly. Maximum 2-3 sentences. Always reply in the same language the customer uses.'

// How many past messages the AI keeps in context each turn (customer + bot +
// human-agent replies). Bumped 5 → 15 so the assistant remembers more of the
// conversation. 15 short WhatsApp turns ≈ 1-2k tokens, well within every
// provider's context window.
const HISTORY_LIMIT = 15

// ─────────────────────────────────────────────
// OOO helper — mirrors Replora's isInOOOWindow()
// ─────────────────────────────────────────────

function isInOOOWindow(start: string, end: string): boolean {
    const now = new Date()
    // Use IST (UTC+5:30) for Indian market
    const istOffset = 5.5 * 60 * 60 * 1000
    const ist = new Date(now.getTime() + istOffset)
    const curMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()

    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const s = sh * 60 + sm
    const e = eh * 60 + em

    // Handles overnight windows e.g. 20:00–09:00
    return s <= e ? curMinutes >= s && curMinutes <= e : curMinutes >= s || curMinutes <= e
}

// ─────────────────────────────────────────────
// Conversation history — last N messages for context
// ─────────────────────────────────────────────

async function getConversationHistory(
    conversationId: string,
    currentMessageId?: string,
    limit = HISTORY_LIMIT
): Promise<ChatMessage[]> {
    const db = supabaseAdmin()
    let query = db
        .from('messages')
        .select('message_id, content_text, sender_type')
        .eq('conversation_id', conversationId)
        .in('sender_type', ['customer', 'bot', 'agent'])
        .order('created_at', { ascending: false })
        .limit(limit + 1) // fetch one extra in case we filter out current

    // Exclude the current incoming message so it isn't double-counted
    // (it's passed separately as userMessage to callAI).
    if (currentMessageId) {
        query = query.neq('message_id', currentMessageId)
    }

    const { data, error } = await query

    if (error || !data || data.length === 0) return []

    // Trim back to limit, reverse so oldest first (chronological for LLM)
    return data
        .slice(0, limit)
        .reverse()
        .map((msg) => ({
            // bot + human agent are both "our side" → assistant; customer → user
            role: msg.sender_type === 'customer' ? 'user' : 'assistant',
            content: msg.content_text || '',
        }))
}

// ─────────────────────────────────────────────
// callAI — Ported directly from Replora's Edge Function
// Supports: groq, gemini, openai, deepseek, claude
// ─────────────────────────────────────────────

async function callAI(
    provider: string,
    apiKey: string,
    model: string | null,
    systemPrompt: string,
    userMessage: string,
    history: ChatMessage[] = []
): Promise<string> {

    const resolvedModel = model || DEFAULT_MODELS[provider] || ''

    // ── Gemini ──────────────────────────────────────────────────────
    if (provider === 'gemini') {
        const contents: Array<{ role: string; parts: { text: string }[] }> = []
        for (const h of history) {
            contents.push({
                role: h.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: h.content }],
            })
        }
        contents.push({ role: 'user', parts: [{ text: userMessage }] })

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents,
                    generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
                }),
            }
        )
        if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`)
        const d = await res.json()
        return d.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't respond."
    }

    // ── OpenAI-compatible (groq, openai, deepseek) ──────────────────
    if (['groq', 'openai', 'deepseek'].includes(provider)) {
        const BASE_URLS: Record<string, string> = {
            groq: 'https://api.groq.com/openai/v1',
            openai: 'https://api.openai.com/v1',
            deepseek: 'https://api.deepseek.com/v1',
        }
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: userMessage },
        ]
        const res = await fetch(`${BASE_URLS[provider]}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: resolvedModel,
                messages,
                max_tokens: 300,
                temperature: 0.7,
            }),
        })
        if (!res.ok) throw new Error(`${provider} error: ${await res.text()}`)
        const d = await res.json()
        return d.choices?.[0]?.message?.content || "Sorry, I couldn't respond."
    }

    // ── Anthropic Claude ─────────────────────────────────────────────
    if (provider === 'claude') {
        const messages = [
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: userMessage },
        ]
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: resolvedModel,
                max_tokens: 300,
                system: systemPrompt,
                messages,
            }),
        })
        if (!res.ok) throw new Error(`Claude error: ${await res.text()}`)
        const d = await res.json()
        return d.content?.[0]?.text || "Sorry, I couldn't respond."
    }

    throw new Error(`Unknown AI provider: ${provider}`)
}

// ─────────────────────────────────────────────
// runAIReply — Main entry point
// Called from webhook route after automations fire
// ─────────────────────────────────────────────

// Structured-output contract + defensive parser (Step 3). JSON via prompt
// (provider-agnostic — one code path), parser never throws: bad output
// degrades to a plain-text reply.
const RESPONSE_FORMAT_INSTRUCTION = `Respond with a SINGLE valid JSON object and nothing else — no markdown, no code fences, no text before or after.
Schema: {"reply": "<message to the customer>", "action": null}
Set "action" only when the customer's intent clearly calls for it; otherwise keep it null and just answer in "reply". Allowed actions:
- {"type":"send_menu"} — customer greets, asks what packages/tours are available, or wants options.
- {"type":"send_destination","destination":"<slug>"} — customer picks/asks about a specific destination (send its poster + itinerary).
- {"type":"send_payment","destination":"<slug>"} — customer wants to book/confirm/pay.
- {"type":"handoff","reason":"<short reason>"} — customer asks to talk to a human/agent or call.
When you set an action, keep "reply" to a short natural lead-in (the system sends the poster/itinerary/payment separately). If unsure, use action null.`

function parseAIResult(raw: string): AIResult {
    const text = (raw ?? '').trim()
    // Never leak raw JSON to the customer: if the model returned something
    // JSON-ish we ultimately can't use, show a friendly line instead.
    const looksLikeJson = text.startsWith('{') || text.startsWith('[')
    const fallback: AIResult = {
        reply: looksLikeJson
            ? 'Sorry, thoda dobara bata sakte hain? 🙏'
            : text || "Sorry, I couldn't respond right now.",
        action: null,
    }
    if (!text) return fallback

    // Extract JSON: strip ```json fences, else take first {...last} span.
    let candidate = text
    const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fence) candidate = fence[1].trim()
    if (!candidate.startsWith('{')) {
        const first = candidate.indexOf('{')
        const last = candidate.lastIndexOf('}')
        if (first === -1 || last === -1 || last <= first) return fallback
        candidate = candidate.slice(first, last + 1)
    }

    try {
        const obj = JSON.parse(candidate) as {
            reply?: unknown
            action?: { type?: unknown; destination?: unknown; reason?: unknown } | null
            type?: unknown
            destination?: unknown
            reason?: unknown
        }
        const reply = typeof obj.reply === 'string' ? obj.reply.trim() : ''

        // Normal envelope is { reply, action }. Some models drop the envelope
        // and emit the bare action object ({ type, destination }). Tolerate it.
        const a =
            obj.action && typeof obj.action === 'object'
                ? obj.action
                : typeof obj.type === 'string'
                    ? { type: obj.type, destination: obj.destination, reason: obj.reason }
                    : null
        let action: AIAction | null = null
        if (a && typeof a === 'object' && typeof a.type === 'string') {
            const allowed: AIActionType[] = ['send_menu', 'send_destination', 'send_payment', 'handoff']
            if ((allowed as string[]).includes(a.type)) {
                action = {
                    type: a.type as AIActionType,
                    destination: typeof a.destination === 'string' ? a.destination : undefined,
                    reason: typeof a.reason === 'string' ? a.reason : undefined,
                }
            }
        }

        if (!reply && !action) return fallback
        return { reply, action }
    } catch {
        return fallback
    }
}

// ── Action execution (Step 4) ──────────────────────────────
// Turns a parsed AIAction into real WhatsApp sends, all data-driven from
// the destinations table + whatsapp_config settings. Best-effort: a media
// failure never blocks the follow-up text.

interface DestinationRow {
    id: string
    name: string
    slug: string
    keywords: string[] | null
    summary: string | null
    highlights: string[] | null
    departures: string[] | null
    poster_url: string | null
    itinerary_url: string | null
    price_from: number | null
    currency: string | null
    nights: number | null
    days: number | null
}

interface ActionCfg {
    business_name?: string | null
    support_phone?: string | null
    upi_id?: string | null
    payment_qr_url?: string | null
    payment_note?: string | null
}

interface ActionContext {
    userId: string
    conversationId: string
    contactId: string
    cfg: ActionCfg
}

/** Resolve an AI/customer destination reference (slug, name, keyword, phrase). */
async function findDestination(userId: string, ref: string): Promise<DestinationRow | null> {
    const needle = (ref ?? '').trim().toLowerCase()
    if (!needle) return null
    const { data } = await supabaseAdmin()
        .from('destinations')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
    const rows = (data ?? []) as DestinationRow[]
    if (rows.length === 0) return null
    return (
        rows.find((d) => d.slug?.toLowerCase() === needle) ??
        rows.find((d) => d.name?.toLowerCase() === needle) ??
        rows.find((d) => (d.keywords ?? []).some((k) => String(k).toLowerCase() === needle)) ??
        rows.find(
            (d) =>
                d.name?.toLowerCase().includes(needle) ||
                (d.keywords ?? []).some((k) => needle.includes(String(k).toLowerCase())),
        ) ??
        null
    )
}

async function actionSendMenu(ctx: ActionContext): Promise<void> {
    const { data } = await supabaseAdmin()
        .from('destinations')
        .select('name, summary, price_from, currency, nights, days')
        .eq('user_id', ctx.userId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
    const rows = (data ?? []) as DestinationRow[]

    if (rows.length === 0) {
        await engineSendText({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            contactId: ctx.contactId,
            text: 'Abhi koi package available nahi hai. Thodi der baad try karein. 🙏',
        })
        return
    }

    const brand = ctx.cfg.business_name?.trim() || 'our travel desk'
    const lines = rows.map((d) => {
        const dur = d.nights && d.days ? ` ${d.nights}N/${d.days}D` : ''
        const price = d.price_from ? ` · from ${d.currency || 'INR'} ${d.price_from}` : ''
        const summary = d.summary ? ` — ${d.summary}` : ''
        return `*${d.name}*${dur}${price}${summary}`
    })
    const text = `✨ *${brand}* — our packages 👇\n\n${lines.join('\n')}\n\nReply with a destination name to get its poster + full itinerary.`
    await engineSendText({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        text,
    })
}

async function actionSendDestination(ctx: ActionContext, ref?: string): Promise<void> {
    if (!ref) {
        await actionSendMenu(ctx)
        return
    }
    const dest = await findDestination(ctx.userId, ref)
    if (!dest) {
        await engineSendText({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            contactId: ctx.contactId,
            text: `Hmm, "${ref}" abhi list me nahi mila. Yahan hamare available packages hain 👇`,
        })
        await actionSendMenu(ctx)
        return
    }

    const dur = dest.nights && dest.days ? ` ${dest.nights}N/${dest.days}D` : ''
    if (dest.poster_url) {
        try {
            await engineSendMedia({
                userId: ctx.userId,
                conversationId: ctx.conversationId,
                contactId: ctx.contactId,
                mediaType: 'image',
                link: dest.poster_url,
                caption: `${dest.name}${dur} 🏔️`,
            })
        } catch (err) {
            console.error('[ai-engine] poster send failed:', err)
        }
    }

    const parts: string[] = [`*${dest.name}*${dur}`]
    if (dest.highlights && dest.highlights.length) parts.push(`✨ ${dest.highlights.join(' · ')}`)
    if (dest.itinerary_url) parts.push(`\n👉 Full itinerary: ${dest.itinerary_url}`)
    parts.push(`\nReply *confirm* to book ✅`)
    await engineSendText({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        text: parts.join('\n'),
    })
}

async function actionSendPayment(ctx: ActionContext, ref?: string): Promise<void> {
    const upi = ctx.cfg.upi_id?.trim()
    const qr = ctx.cfg.payment_qr_url?.trim()
    const note = ctx.cfg.payment_note?.trim()

    if (!upi && !qr) {
        await engineSendText({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            contactId: ctx.contactId,
            text: 'Booking confirm karne ke liye hamari team aapse jaldi connect karegi. 🙏',
        })
        return
    }

    let destName = ''
    if (ref) {
        const d = await findDestination(ctx.userId, ref)
        if (d) destName = d.name
    }

    const capLines: string[] = [`🎉 ${destName ? destName + ' — ' : ''}booking confirm karein`]
    if (upi) capLines.push(`📲 UPI: ${upi}`)
    if (note) capLines.push(note)
    const caption = capLines.join('\n')

    if (qr) {
        try {
            await engineSendMedia({
                userId: ctx.userId,
                conversationId: ctx.conversationId,
                contactId: ctx.contactId,
                mediaType: 'image',
                link: qr,
                caption,
            })
        } catch (err) {
            console.error('[ai-engine] QR send failed:', err)
            await engineSendText({
                userId: ctx.userId,
                conversationId: ctx.conversationId,
                contactId: ctx.contactId,
                text: caption,
            })
        }
    } else {
        await engineSendText({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            contactId: ctx.contactId,
            text: caption,
        })
    }

    await engineSendText({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        text: 'Payment ke baad screenshot bhej dein — main aapki booking turant confirm kar deta hoon ✅',
    })
}

async function actionHandoff(ctx: ActionContext): Promise<void> {
    const phone = ctx.cfg.support_phone?.trim()
    const text = phone
        ? `Bilkul! Aap hamari team se yahan baat kar sakte hain: ${phone} 📞 Woh aapko jaldi assist karenge. 🙏`
        : 'Bilkul! Main aapko hamari team se connect kar raha hoon — woh jaldi reply karenge. 🙏'
    await engineSendText({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        text,
    })
    // Pause AI so a human can take over this conversation.
    await supabaseAdmin()
        .from('conversations')
        .update({ ai_paused: true, updated_at: new Date().toISOString() })
        .eq('id', ctx.conversationId)
}

async function dispatchAIAction(ctx: ActionContext, action: AIAction): Promise<void> {
    try {
        switch (action.type) {
            case 'send_menu':
                await actionSendMenu(ctx)
                break
            case 'send_destination':
                await actionSendDestination(ctx, action.destination)
                break
            case 'send_payment':
                await actionSendPayment(ctx, action.destination)
                break
            case 'handoff':
                await actionHandoff(ctx)
                break
        }
    } catch (err) {
        console.error('[ai-engine] action dispatch failed:', action.type, err)
    }
}

// ── Catalogue injection (Step 5) ───────────────────────────
// Feeds the client's live destinations + business info into the system
// prompt so the AI knows what to offer and which slug to use in
// send_destination / send_payment. Scales by data, not code.
async function buildCatalogueContext(userId: string, cfg: ActionCfg): Promise<string> {
    const { data } = await supabaseAdmin()
        .from('destinations')
        .select('name, slug, summary, price_from, currency, nights, days')
        .eq('user_id', userId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
    const rows = (data ?? []) as DestinationRow[]

    const brand = cfg.business_name?.trim() || 'this Tour & Travel business'
    const lines: string[] = [`BUSINESS NAME: ${brand}`]

    if (rows.length === 0) {
        lines.push(
            'AVAILABLE DESTINATIONS: none configured yet — invite the customer to share their travel interest and use the send_menu action.',
        )
    } else {
        lines.push(
            'AVAILABLE DESTINATIONS (use the EXACT slug in send_destination / send_payment actions):',
        )
        for (const d of rows) {
            const dur = d.nights && d.days ? `${d.nights}N/${d.days}D` : ''
            const price = d.price_from ? `from ${d.currency || 'INR'} ${d.price_from}` : ''
            const meta = [dur, price, d.summary].filter(Boolean).join(' · ')
            lines.push(`- slug:"${d.slug}" name:"${d.name}"${meta ? ' — ' + meta : ''}`)
        }
        lines.push(
            'If a customer asks about a destination NOT listed above, tell them it is not currently available and use the send_menu action.',
        )
    }

    if (cfg.support_phone?.trim()) {
        lines.push(
            `SUPPORT CONTACT (use the handoff action when a customer asks for a human/agent/call): ${cfg.support_phone.trim()}`,
        )
    }

    return lines.join('\n')
}

export async function runAIReply(input: AIReplyInput): Promise<void> {
    const { userId, contactId, conversationId, messageText, wasNewContact, currentMessageId, currentMessageCreatedAt } = input
    const db = supabaseAdmin()

    console.log('[ai-engine] runAIReply ENTRY — message:', currentMessageId, 'user:', userId)

    try {
        // ── 1. Fetch AI config from whatsapp_config ──────────────────
        const { data: cfg, error: cfgErr } = await db
            .from('whatsapp_config')
            .select(
                `ai_enabled, ai_provider, ai_model, ai_api_key,
         ai_system_prompt, ai_webhook_url,
         welcome_enabled, welcome_text,
         ooo_enabled, ooo_start, ooo_end, ooo_text,
         phone_number_id, access_token,
         business_name, support_phone, upi_id, payment_qr_url, payment_note`
            )
            .eq('user_id', userId)
            .maybeSingle()

        if (cfgErr || !cfg) {
            console.log('[ai-engine] No config found for user, skipping')
            return
        }

        // ── 2. Check if AI is enabled at all ────────────────────────
        if (!cfg.ai_enabled) {
            console.log('[ai-engine] ai_enabled=false, skipping')
            return
        }

        // ── 3. Human takeover check — skip if agent is assigned ─────
        const { data: conv } = await db
            .from('conversations')
            .select('assigned_agent_id, ai_paused')
            .eq('id', conversationId)
            .maybeSingle()

        if (conv?.assigned_agent_id || conv?.ai_paused) {
            console.log('[ai-engine] Human takeover active, skipping AI reply')
            return
        }

        // ── 4. Contact tag check — skip for confirmed travellers ─────
        // If contact has "confirmed-traveller" tag, human should handle
        const { data: tags } = await db
            .from('contact_tags')
            .select('tags!inner(name)')
            .eq('contact_id', contactId)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tagNames = (tags ?? []).map((t: any) => t.tags?.name ?? '')
        if (tagNames.includes('confirmed-traveller')) {
            console.log('[ai-engine] confirmed-traveller tag — skipping AI, human should handle')
            return
        }

        // Decrypt access token for sending
        let decryptedToken: string
        try {
            decryptedToken = decrypt(cfg.access_token)
        } catch {
            console.error('[ai-engine] Failed to decrypt access token')
            return
        }

        // ── Helper: send reply via WaCRM's engineSendText ────────────
        const sendReply = async (text: string, label: string) => {
            try {
                await engineSendText({
                    userId,
                    conversationId,
                    contactId,
                    text,
                })
                console.log(`[ai-engine] Sent reply via ${label}`)
            } catch (err) {
                console.error(`[ai-engine] Send failed (${label}):`, err)
            }
        }

        // ── 5. Welcome message — first ever message from this contact ─
        if (cfg.welcome_enabled && cfg.welcome_text && wasNewContact) {
            console.log('[ai-engine] Sending welcome message')
            await sendReply(cfg.welcome_text, 'welcome')
            return // Welcome message sent — don't also send AI reply
        }

        // ── 6. Out of Office check ────────────────────────────────────
        if (
            cfg.ooo_enabled &&
            cfg.ooo_start &&
            cfg.ooo_end &&
            cfg.ooo_text &&
            isInOOOWindow(cfg.ooo_start, cfg.ooo_end)
        ) {
            console.log('[ai-engine] OOO window active, sending OOO message')
            await sendReply(cfg.ooo_text, 'ooo')
            return // OOO sent — don't also send AI reply
        }

        // ── 7. AI Engine — only if provider is set ───────────────────
        const provider = cfg.ai_provider
        if (!provider || provider === 'off') {
            console.log('[ai-engine] No provider configured, skipping')
            return
        }

        // ── 7a. Webhook forward (n8n) ─────────────────────────────────
        if (provider === 'webhook') {
            if (!cfg.ai_webhook_url) return
            try {
                await fetch(cfg.ai_webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contact_id: contactId,
                        conversation_id: conversationId,
                        user_id: userId,
                        message_text: messageText,
                        timestamp: new Date().toISOString(),
                    }),
                })
                console.log('[ai-engine] Forwarded to n8n webhook')
            } catch (err) {
                console.error('[ai-engine] n8n webhook forward failed:', err)
            }
            return
        }

        // ── 7b. LLM providers ─────────────────────────────────────────
        if (!cfg.ai_api_key) {
            console.log('[ai-engine] No API key configured, skipping')
            return
        }

        // Decrypt the stored API key
        let apiKey: string
        try {
            apiKey = decrypt(cfg.ai_api_key)
        } catch {
            console.error('[ai-engine] Failed to decrypt AI API key')
            return
        }
        // ── Blue tick + typing indicator for this message ──
        // No dedup/batching: Vercel free's waitUntil runs background tasks
        // with unpredictable timing, so a DB-query-based "is this the latest
        // message" check is unreliable (it caused every message to be skipped).
        // Real customers leave 10-30s gaps between messages, so replying to
        // each one is the correct, predictable behaviour. The off-by-one fix
        // in getConversationHistory already excludes the current message, so
        // each reply is built on correct context.
        if (currentMessageId) {
            // engineSendTyping marks as read (blue tick) AND shows typing.
            await engineSendTyping({ userId, incomingMessageId: currentMessageId })
        }
        console.log('[ai-engine] Proceeding to reply')

        // Build system prompt with context awareness
        const isNewContact = wasNewContact
        const systemPrompt =
            cfg.ai_system_prompt ||
            (isNewContact
                ? `You are a helpful WhatsApp assistant for a Tour & Travel company. This is a NEW customer reaching out for the first time. Greet them warmly and ask about their travel interests, dates, group size, and budget. Keep it conversational — ask ONE question at a time. Max 2-3 sentences.`
                : DEFAULT_SYSTEM_PROMPT)

        // Inject the client's live catalogue + settings, then the output contract.
        const catalogue = await buildCatalogueContext(userId, {
            business_name: cfg.business_name,
            support_phone: cfg.support_phone,
        })
        const finalSystemPrompt = `${systemPrompt}\n\n${catalogue}\n\n${RESPONSE_FORMAT_INSTRUCTION}`

        // Fetch conversation history for context (excludes current message)
        const history = await getConversationHistory(conversationId, currentMessageId, HISTORY_LIMIT)
        console.log(`[ai-engine] History: ${history.length} messages, provider: ${provider}`)

        // Call LLM (returns raw text; will be JSON per the response-format contract)
        const aiText = await callAI(
            provider,
            apiKey,
            cfg.ai_model || null,
            finalSystemPrompt,
            messageText,
            history
        )

        // Parse into { reply, action } — defensive, never throws.
        const result = parseAIResult(aiText)

        // Send the conversational reply (lead-in), then run any action.
        if (result.reply) {
            await sendReply(result.reply, provider)
        }
        if (result.action) {
            await dispatchAIAction(
                {
                    userId,
                    conversationId,
                    contactId,
                    cfg: {
                        business_name: cfg.business_name,
                        support_phone: cfg.support_phone,
                        upi_id: cfg.upi_id,
                        payment_qr_url: cfg.payment_qr_url,
                        payment_note: cfg.payment_note,
                    },
                },
                result.action,
            )
        }

    } catch (err) {
        // Never throw — must not break webhook flow
        console.error('[ai-engine] Unexpected error:', err)
    }
}