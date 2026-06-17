import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'destination'
}

async function uniqueSlug(userId: string, base: string, excludeId?: string): Promise<string> {
  const admin = supabaseAdmin()
  let candidate = base
  let n = 2
  for (;;) {
    let query = admin
      .from('destinations')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', candidate)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query.maybeSingle()
    if (!data) return candidate
    candidate = `${base}-${n++}`
  }
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const admin = supabaseAdmin()

  const { data: existing } = await admin
    .from('destinations')
    .select('id, user_id, slug')
    .eq('id', id)
    .maybeSingle()
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    update.name = name
  }
  if ('slug' in body) {
    const base = slugify(typeof body.slug === 'string' && body.slug.trim() ? body.slug : String(update.name ?? ''))
    update.slug = await uniqueSlug(user.id, base, id)
  }
  if ('summary' in body) update.summary = typeof body.summary === 'string' ? body.summary : null
  if ('description' in body) update.description = typeof body.description === 'string' ? body.description : null
  if ('keywords' in body) update.keywords = toStringArray(body.keywords)
  if ('highlights' in body) update.highlights = toStringArray(body.highlights)
  if ('departures' in body) update.departures = toStringArray(body.departures)
  if ('poster_url' in body) update.poster_url = typeof body.poster_url === 'string' && body.poster_url.trim() ? body.poster_url.trim() : null
  if ('itinerary_url' in body) update.itinerary_url = typeof body.itinerary_url === 'string' && body.itinerary_url.trim() ? body.itinerary_url.trim() : null
  if ('price_from' in body) update.price_from = typeof body.price_from === 'number' ? body.price_from : null
  if ('currency' in body) update.currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'INR'
  if ('nights' in body) update.nights = typeof body.nights === 'number' ? body.nights : null
  if ('days' in body) update.days = typeof body.days === 'number' ? body.days : null
  if ('sort_order' in body) update.sort_order = typeof body.sort_order === 'number' ? body.sort_order : 0
  if ('active' in body) update.active = !!body.active

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: destination, error: updErr } = await admin
    .from('destinations')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (updErr || !destination) {
    return NextResponse.json({ error: updErr?.message ?? 'update failed' }, { status: 500 })
  }

  return NextResponse.json({ destination })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabaseAdmin()
    .from('destinations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
