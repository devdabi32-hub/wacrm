import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getOwnerId } from '@/lib/workspace/owner'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/team/[id] — revoke a member's workspace access.
 *
 * Sets the membership to 'revoked'. Because app_owner_id() only resolves a
 * workspace owner for ACTIVE members, revoking instantly cuts the member's
 * access to shared data (their queries fall back to their own empty
 * workspace). The auth account itself is left intact.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ownerId = await getOwnerId(supabase, user.id)
  if (ownerId !== user.id) {
    return NextResponse.json(
      { error: 'Only the workspace owner can manage team members' },
      { status: 403 },
    )
  }

  // Scope the update to rows the caller actually owns.
  const { data: updated, error } = await supabaseAdmin()
    .from('workspace_members')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
