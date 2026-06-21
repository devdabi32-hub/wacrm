import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve the workspace OWNER id for the current session.
 *
 * - Normal / owner account  → their own auth id.
 * - Active member           → the id of the owner whose workspace they joined.
 *
 * All owned data (contacts, conversations, deals, broadcasts, destinations, …)
 * is stamped with and filtered by this id so members transparently share the
 * owner's workspace. This mirrors the Postgres `app_owner_id()` function used
 * in RLS (migration 012) — keep the two in sync.
 *
 * Works with both the browser and server Supabase clients (both carry the
 * caller's session). Falls back to `fallbackUserId` if the RPC is unavailable
 * (e.g. migration not yet applied), which keeps solo accounts working.
 */
export async function getOwnerId(
  supabase: SupabaseClient,
  fallbackUserId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('app_owner_id');
  if (error || typeof data !== 'string') return fallbackUserId;
  return data;
}
