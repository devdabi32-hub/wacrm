import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/whatsapp/encryption'

/**
 * POST /api/ai/config
 *
 * Saves AI Engine configuration into whatsapp_config table.
 * API key is encrypted with AES-256-GCM before storage.
 * All other fields are stored as plain text.
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()

        const {
            ai_enabled,
            ai_provider,
            ai_model,
            ai_api_key,       // plain text from UI — encrypt before saving
            ai_system_prompt,
            ai_webhook_url,
            welcome_enabled,
            welcome_text,
            ooo_enabled,
            ooo_start,
            ooo_end,
            ooo_text,
        } = body

        // Build update payload
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: Record<string, any> = {
            ai_enabled: !!ai_enabled,
            ai_provider: ai_provider ?? 'groq',
            ai_model: ai_model ?? null,
            ai_system_prompt: ai_system_prompt ?? null,
            ai_webhook_url: ai_webhook_url ?? null,
            welcome_enabled: !!welcome_enabled,
            welcome_text: welcome_text ?? null,
            ooo_enabled: !!ooo_enabled,
            ooo_start: ooo_start ?? null,
            ooo_end: ooo_end ?? null,
            ooo_text: ooo_text ?? null,
            updated_at: new Date().toISOString(),
        }

        // Encrypt API key only if a new one was provided
        // UI sends undefined when key was not changed (shows •••• placeholder)
        if (ai_api_key && typeof ai_api_key === 'string' && ai_api_key.trim()) {
            try {
                patch.ai_api_key = encrypt(ai_api_key.trim())
            } catch (err) {
                console.error('[ai/config] Encryption failed:', err)
                return NextResponse.json(
                    { error: 'Failed to encrypt API key. Check ENCRYPTION_KEY env var.' },
                    { status: 500 }
                )
            }
        }

        // Check if whatsapp_config row exists for this user
        const { data: existing } = await supabase
            .from('whatsapp_config')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (!existing) {
            return NextResponse.json(
                { error: 'WhatsApp not configured yet. Please set up WhatsApp first in Settings.' },
                { status: 400 }
            )
        }

        const { error: updateError } = await supabase
            .from('whatsapp_config')
            .update(patch)
            .eq('user_id', user.id)

        if (updateError) {
            console.error('[ai/config] Update failed:', updateError)
            return NextResponse.json(
                { error: 'Failed to save configuration' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('[ai/config] Unexpected error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}