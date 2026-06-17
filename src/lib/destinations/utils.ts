import { supabaseAdmin } from '@/lib/automations/admin-client'

export function slugify(input: string): string {
    return (
        input
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'destination'
    )
}

/**
 * Appends -2, -3, ... until the slug is unique for this user. `taken`
 * lets bulk-import claim slugs across a batch without re-querying the DB
 * for collisions between rows in the same request.
 */
export async function uniqueSlug(
    userId: string,
    base: string,
    opts: { excludeId?: string; taken?: Set<string> } = {},
): Promise<string> {
    const admin = supabaseAdmin()
    let candidate = base
    let n = 2
    for (;;) {
        if (!opts.taken?.has(candidate)) {
            let query = admin
                .from('destinations')
                .select('id')
                .eq('user_id', userId)
                .eq('slug', candidate)
            if (opts.excludeId) query = query.neq('id', opts.excludeId)
            const { data } = await query.maybeSingle()
            if (!data) {
                opts.taken?.add(candidate)
                return candidate
            }
        }
        candidate = `${base}-${n++}`
    }
}

export function toStringArray(v: unknown): string[] {
    if (typeof v === 'string') {
        return v.split(',').map((x) => x.trim()).filter(Boolean)
    }
    if (!Array.isArray(v)) return []
    return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}
