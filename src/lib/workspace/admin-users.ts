import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Find an auth user's id by email using the service-role admin client.
 *
 * supabase-js has no getUserByEmail, so we page through listUsers and match
 * case-insensitively. Used to clean up an orphaned auth user (an invite that
 * created the user but never got linked) so the email can be re-invited or
 * fully removed. Capped at 10 pages — far beyond any single-client deployment.
 */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(
      (u) => (u.email ?? '').toLowerCase() === target,
    );
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}
