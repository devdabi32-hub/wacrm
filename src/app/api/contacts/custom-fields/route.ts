import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { getOwnerId } from '@/lib/workspace/owner'

/**
 * Saves a contact's custom field values, then fires the `field_updated`
 * automation trigger for each field whose value actually changed.
 *
 * Why server-side (not direct from the browser): firing automations needs
 * the engine, which uses an admin client and must never be exposed to the
 * browser. Doing the write here also lets us diff old vs new values so we
 * only fire the trigger for fields that genuinely changed — no duplicate
 * "booking confirmed" messages when an agent re-saves an unchanged field.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Automations + the contact are owned by the workspace owner, so the
    // engine must run under the owner id (not the acting member's id) or a
    // member's edit would find no automations to fire.
    const ownerId = await getOwnerId(supabase, user.id)

    const body = (await request.json().catch(() => null)) as {
        contact_id?: string
        values?: Record<string, string>
    } | null

    if (!body?.contact_id || !body.values) {
        return NextResponse.json({ error: 'contact_id and values required' }, { status: 400 })
    }

    const contactId = body.contact_id
    const incoming = body.values

    // 1. Read existing values first so we can diff old vs new.
    const { data: existingRows, error: readErr } = await supabase
        .from('contact_custom_values')
        .select('custom_field_id, value')
        .eq('contact_id', contactId)

    if (readErr) {
        return NextResponse.json({ error: 'Failed to read existing values' }, { status: 500 })
    }

    const oldMap: Record<string, string> = {}
    for (const row of existingRows ?? []) {
        oldMap[row.custom_field_id] = (row.value ?? '').trim()
    }

    // 2. Replace stored values (delete-all + re-insert non-empty), matching
    //    the previous client-side behaviour exactly.
    const { error: delErr } = await supabase
        .from('contact_custom_values')
        .delete()
        .eq('contact_id', contactId)

    if (delErr) {
        return NextResponse.json({ error: 'Failed to save custom fields' }, { status: 500 })
    }

    const rows = Object.entries(incoming)
        .filter(([, val]) => val.trim())
        .map(([fieldId, val]) => ({
            contact_id: contactId,
            custom_field_id: fieldId,
            value: val.trim(),
        }))

    if (rows.length > 0) {
        const { error: insErr } = await supabase.from('contact_custom_values').insert(rows)
        if (insErr) {
            return NextResponse.json({ error: 'Failed to save custom fields' }, { status: 500 })
        }
    }

    // 3. Fire field_updated for every field whose value actually changed.
    //    field_id mirrors the automation builder convention: 'custom::<uuid>'.
    const changedFieldIds = new Set<string>()
    for (const [fieldId, rawVal] of Object.entries(incoming)) {
        if (rawVal.trim() !== (oldMap[fieldId] ?? '')) changedFieldIds.add(fieldId)
    }
    // Also catch fields that were cleared (had a value before, empty now).
    for (const fieldId of Object.keys(oldMap)) {
        if ((incoming[fieldId] ?? '').trim() !== oldMap[fieldId]) changedFieldIds.add(fieldId)
    }

    for (const fieldId of changedFieldIds) {
        const newVal = (incoming[fieldId] ?? '').trim()
        await runAutomationsForTrigger({
            userId: ownerId,
            triggerType: 'field_updated',
            contactId,
            context: {
                field_id: `custom::${fieldId}`,
                field_value: newVal,
            },
        })
    }

    return NextResponse.json({ ok: true, changed: changedFieldIds.size })
}