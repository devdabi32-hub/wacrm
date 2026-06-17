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

/** Appends -2, -3, ... until the slug is unique for this user. */
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

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('destinations')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ destinations: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const admin = supabaseAdmin()
  const baseSlug = slugify(typeof body.slug === 'string' && body.slug.trim() ? body.slug : name)
  const slug = await uniqueSlug(user.id, baseSlug)

  // New destinations go to the end of the list by default.
  const { data: maxRow } = await admin
    .from('destinations')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = typeof body.sort_order === 'number' ? body.sort_order : (maxRow?.sort_order ?? -1) + 1

  const { data: destination, error: insertErr } = await admin
    .from('destinations')
    .insert({
      user_id: user.id,
      name,
      slug,
      keywords: toStringArray(body.keywords),
      summary: typeof body.summary === 'string' ? body.summary : null,
      description: typeof body.description === 'string' ? body.description : null,
      highlights: toStringArray(body.highlights),
      departures: toStringArray(body.departures),
      poster_url: typeof body.poster_url === 'string' && body.poster_url.trim() ? body.poster_url.trim() : null,
      itinerary_url: typeof body.itinerary_url === 'string' && body.itinerary_url.trim() ? body.itinerary_url.trim() : null,
      price_from: typeof body.price_from === 'number' ? body.price_from : null,
      currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'INR',
      nights: typeof body.nights === 'number' ? body.nights : null,
      days: typeof body.days === 'number' ? body.days : null,
      sort_order: nextSortOrder,
      active: typeof body.active === 'boolean' ? body.active : true,
    })
    .select()
    .single()

  if (insertErr || !destination) {
    return NextResponse.json({ error: insertErr?.message ?? 'insert failed' }, { status: 500 })
  }

  return NextResponse.json({ destination }, { status: 201 })
}
