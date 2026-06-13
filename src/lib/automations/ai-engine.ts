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
import { engineSendText } from '@/lib/automations/meta-send'

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
    limit = 5
): Promise<ChatMessage[]> {
    const db = supabaseAdmin()
    let query = db
        .from('messages')
        .select('message_id, content_text, sender_type')
        .eq('conversation_id', conversationId)
        .in('sender_type', ['customer', 'bot'])
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
            role: msg.sender_type === 'bot' ? 'assistant' : 'user',
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

export async function runAIReply(input: AIReplyInput): Promise<void> {
    const { userId, contactId, conversationId, messageText, wasNewContact, currentMessageId, currentMessageCreatedAt } = input
    const db = supabaseAdmin()

    try {
        // ── 1. Fetch AI config from whatsapp_config ──────────────────
        const { data: cfg, error: cfgErr } = await db
            .from('whatsapp_config')
            .select(
                `ai_enabled, ai_provider, ai_model, ai_api_key,
         ai_system_prompt, ai_webhook_url,
         welcome_enabled, welcome_text,
         ooo_enabled, ooo_start, ooo_end, ooo_text,
         phone_number_id, access_token`
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
        // ── DEBOUNCE: wait 3s, then bail out if a newer message arrived ──
        // If the customer sends several quick messages, only the LAST
        // message's AI call survives — the earlier ones detect a newer
        // message during the wait and skip. The surviving call picks up
        // all the messages via getConversationHistory, producing ONE
        // coherent reply instead of one-per-message.
        const DEBOUNCE_MS = 3000
        await new Promise((r) => setTimeout(r, DEBOUNCE_MS))

        if (currentMessageCreatedAt) {
            const { data: newerMsgs } = await db
                .from('messages')
                .select('id')
                .eq('conversation_id', conversationId)
                .eq('sender_type', 'customer')
                .gt('created_at', currentMessageCreatedAt)
                .limit(1)

            if (newerMsgs && newerMsgs.length > 0) {
                console.log('[ai-engine] Newer message arrived during debounce — skipping (batched)')
                return
            }
        }


        // Build system prompt with context awareness
        const isNewContact = wasNewContact
        const systemPrompt =
            cfg.ai_system_prompt ||
            (isNewContact
                ? `You are a helpful WhatsApp assistant for a Tour & Travel company. This is a NEW customer reaching out for the first time. Greet them warmly and ask about their travel interests, dates, group size, and budget. Keep it conversational — ask ONE question at a time. Max 2-3 sentences.`
                : DEFAULT_SYSTEM_PROMPT)

        // Fetch conversation history for context (excludes current message)
        const history = await getConversationHistory(conversationId, currentMessageId, 5)
        console.log(`[ai-engine] History: ${history.length} messages, provider: ${provider}`)

        // Call LLM
        const aiText = await callAI(
            provider,
            apiKey,
            cfg.ai_model || null,
            systemPrompt,
            messageText,
            history
        )

        await sendReply(aiText, provider)

    } catch (err) {
        // Never throw — must not break webhook flow
        console.error('[ai-engine] Unexpected error:', err)
    }
}