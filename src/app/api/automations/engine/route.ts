import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { getOwnerId } from '@/lib/workspace/owner'
import type { AutomationTriggerType } from '@/types'

/**
 * Manual trigger for testing or for external integrations that want
 * to fire automations. Auth is required — the caller's user_id is
 * used so RLS-safe data remains per-user.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Automations are owned by the workspace owner — run under the owner id
  // so a member's manual trigger fires the shared workspace's automations.
  const ownerId = await getOwnerId(supabase, user.id)

  const body = await request.json().catch(() => null)
  if (!body?.trigger_type) {
    return NextResponse.json({ error: 'trigger_type required' }, { status: 400 })
  }

  await runAutomationsForTrigger({
    userId: ownerId,
    triggerType: body.trigger_type as AutomationTriggerType,
    contactId: body.contact_id ?? null,
    context: body.context ?? {},
  })

  return NextResponse.json({ ok: true })
}
