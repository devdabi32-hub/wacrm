import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getOwnerId } from '@/lib/workspace/owner'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Only a workspace OWNER (a top-level account, not an invited member) may
 * manage team members. Returns the owner's user id, or null if the caller
 * is unauthenticated or is themselves a member of someone else's workspace.
 */
async function requireOwnerUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const ownerId = await getOwnerId(supabase, user.id)
  if (ownerId !== user.id) {
    // Caller is a member — members cannot manage the team.
    return { error: 'Only the workspace owner can manage team members', status: 403 as const }
  }
  return { ownerId: user.id }
}

/**
 * GET /api/team — list the owner's invited/active members.
 */
export async function GET() {
  const auth = await requireOwnerUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { data, error } = await supabaseAdmin()
    .from('workspace_members')
    .select('id, invited_email, invited_name, role, status, member_id, invited_at, accepted_at')
    .eq('owner_id', auth.ownerId)
    .order('invited_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { members: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * POST /api/team — invite a member by email.
 *
 * Inserts (or re-arms) the workspace_members row, then sends a Supabase
 * invite email. When the invitee accepts and signs up, handle_new_user()
 * (migration 012) links their auth id to this row and flips it to active.
 */
export async function POST(request: Request) {
  const auth = await requireOwnerUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json().catch(() => null)
  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // Don't let an owner invite themselves.
  const {
    data: { user: self },
  } = await (await createClient()).auth.getUser()
  if (self?.email && self.email.toLowerCase() === rawEmail) {
    return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 })
  }

  // Look at any existing membership for this (owner, email).
  const { data: existing } = await admin
    .from('workspace_members')
    .select('id, status')
    .eq('owner_id', auth.ownerId)
    .eq('invited_email', rawEmail)
    .maybeSingle()

  if (existing?.status === 'active') {
    return NextResponse.json(
      { error: 'That email is already an active member' },
      { status: 409 },
    )
  }

  // Upsert the row to 'invited' (covers fresh invite + re-inviting a
  // previously revoked/pending email). member_id stays null until accept.
  if (existing) {
    const { error: updErr } = await admin
      .from('workspace_members')
      .update({
        status: 'invited',
        role: 'member',
        invited_name: name || null,
        invited_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  } else {
    const { error: insErr } = await admin.from('workspace_members').insert({
      owner_id: auth.ownerId,
      invited_email: rawEmail,
      invited_name: name || null,
      role: 'member',
      status: 'invited',
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Send the Supabase invite email. The link drops the invitee on
  // /accept-invite with a session so they can set a password.
  const origin = new URL(request.url).origin
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(rawEmail, {
    // full_name flows into raw_user_meta_data → profile via handle_new_user().
    data: name ? { full_name: name } : undefined,
    redirectTo: `${origin}/accept-invite`,
  })

  if (inviteErr) {
    // The membership row is saved; the most common failure is that an auth
    // user already exists for this email. Surface a clear message.
    const alreadyExists = /already|registered|exist/i.test(inviteErr.message)
    return NextResponse.json(
      {
        error: alreadyExists
          ? 'An account with this email already exists. Ask them to sign in — they will need to be linked manually.'
          : `Invite saved but email failed to send: ${inviteErr.message}`,
        partial: true,
      },
      { status: alreadyExists ? 409 : 502 },
    )
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
