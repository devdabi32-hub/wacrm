import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { slugify, uniqueSlug, toStringArray } from '@/lib/destinations/utils'
import { getOwnerId } from '@/lib/workspace/owner'

// Catalogue data must never be cached — the Catalogue UI's "delete then
// refetch" flow depends on every GET seeing the latest row immediately.
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
  return NextResponse.json({ destinations: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
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

  // Stamp every row with the workspace owner so members share the
  // owner's catalogue (and slugs stay unique per workspace, not per member).
  const ownerId = await getOwnerId(supabase, user.id)

  const admin = supabaseAdmin()
  const baseSlug = slugify(typeof body.slug === 'string' && body.slug.trim() ? body.slug : name)
  const slug = await uniqueSlug(ownerId, baseSlug)

  // New destinations go to the end of the list by default.
  const { data: maxRow } = await admin
    .from('destinations')
    .select('sort_order')
    .eq('user_id', ownerId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = typeof body.sort_order === 'number' ? body.sort_order : (maxRow?.sort_order ?? -1) + 1

  const { data: destination, error: insertErr } = await admin
    .from('destinations')
    .insert({
      user_id: ownerId,
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
      imported: false,
    })
    .select()
    .single()

  if (insertErr || !destination) {
    return NextResponse.json({ error: insertErr?.message ?? 'insert failed' }, { status: 500 })
  }

  return NextResponse.json({ destination }, { status: 201 })
}
