import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { slugify, uniqueSlug, toStringArray } from '@/lib/destinations/utils'

interface SkippedRow {
  row: number
  reason: string
}

const MAX_ROWS = 500

/**
 * POST /api/destinations/bulk
 *
 * Bulk import for the CSV/XLSX catalogue upload (Step 4). Body: { rows: object[] }
 * — same shape as a single POST /api/destinations payload, repeated. Rows
 * missing a name are skipped (reported back), valid rows are slugified
 * (unique within the user's catalogue AND within this batch) and inserted
 * in one round trip, appended after the current end of the list.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'rows array is required' }, { status: 400 })
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ error: 'rows array is empty' }, { status: 400 })
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Max ${MAX_ROWS} rows per import` }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { data: maxRow } = await admin
    .from('destinations')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  let nextSortOrder = (maxRow?.sort_order ?? -1) + 1

  const takenSlugs = new Set<string>()
  const skipped: SkippedRow[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: Record<string, any>[] = []

  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i]
    if (!row || typeof row !== 'object') {
      skipped.push({ row: i + 1, reason: 'Invalid row' })
      continue
    }
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (!name) {
      skipped.push({ row: i + 1, reason: 'Missing name' })
      continue
    }

    const baseSlug = slugify(typeof row.slug === 'string' && row.slug.trim() ? row.slug : name)
    const slug = await uniqueSlug(user.id, baseSlug, { taken: takenSlugs })

    toInsert.push({
      user_id: user.id,
      name,
      slug,
      keywords: toStringArray(row.keywords),
      summary: typeof row.summary === 'string' && row.summary.trim() ? row.summary.trim() : null,
      description: typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null,
      highlights: toStringArray(row.highlights),
      departures: toStringArray(row.departures),
      poster_url: typeof row.poster_url === 'string' && row.poster_url.trim() ? row.poster_url.trim() : null,
      itinerary_url: typeof row.itinerary_url === 'string' && row.itinerary_url.trim() ? row.itinerary_url.trim() : null,
      price_from: typeof row.price_from === 'number' && !Number.isNaN(row.price_from) ? row.price_from : null,
      currency: typeof row.currency === 'string' && row.currency.trim() ? row.currency.trim() : 'INR',
      nights: typeof row.nights === 'number' && !Number.isNaN(row.nights) ? row.nights : null,
      days: typeof row.days === 'number' && !Number.isNaN(row.days) ? row.days : null,
      sort_order: nextSortOrder++,
      active: typeof row.active === 'boolean' ? row.active : true,
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, destinations: [] }, { status: 200 })
  }

  const { data: destinations, error: insertErr } = await admin
    .from('destinations')
    .insert(toInsert)
    .select()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ inserted: destinations?.length ?? 0, skipped, destinations: destinations ?? [] }, { status: 201 })
}
