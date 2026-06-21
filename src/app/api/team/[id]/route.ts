import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getOwnerId } from '@/lib/workspace/owner'
import { findAuthUserByEmail } from '@/lib/workspace/admin-users'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/team/[id] — permanently remove a member.
 *
 * Removes the workspace_members row AND deletes the member's auth user
 * (and their profile, via ON DELETE CASCADE). This frees the email so the
 * owner can cleanly re-invite it. Falls back to an email lookup when the
 * row was never linked to an auth user (member_id is null) so orphaned
 * invites are cleaned up too.
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

  const admin = supabaseAdmin()

  // Load the row (scoped to the caller's workspace) so we know which auth
  // user to delete and can confirm ownership before touching anything.
  const { data: row } = await admin
    .from('workspace_members')
    .select('id, member_id, invited_email')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Remove the membership row first (explicit — covers the unlinked case
  // where deleting the auth user wouldn't cascade anything).
  const { error: delErr } = await admin
    .from('workspace_members')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Delete the auth user so the email is freed for a future invite.
  const authId =
    row.member_id ?? (await findAuthUserByEmail(admin, row.invited_email))
  if (authId) {
    const { error: authErr } = await admin.auth.admin.deleteUser(authId)
    // The row is already gone; surface a soft warning but don't fail the
    // whole request if the auth delete hiccups.
    if (authErr) {
      console.error('[team DELETE] auth user delete failed:', authErr.message)
    }
  }

  return NextResponse.json({ ok: true })
}
