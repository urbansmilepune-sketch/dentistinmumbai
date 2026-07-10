// Shared admin gate for the /api/admin/* route handlers.
//
// Every admin route repeats the same two-step check: resolve identity from
// the request JWT (user-bound client) then confirm that email is in
// admin_users via the SERVICE-ROLE client so the lookup isn't itself subject
// to an admin_users RLS policy that may not exist. This helper centralises
// that so the individual routes don't each re-implement it (and drift).
//
// Returns the service-role client on success — the caller uses it for the
// RLS-exempt reads/writes an admin needs. Returns null when the caller is
// not an authenticated admin; the route turns that into a 401.
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

export function serviceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Resolves the caller's identity and confirms admin membership. On success
 *  returns the service-role client to use for the rest of the request; on
 *  failure returns null (caller responds 401). */
export async function requireAdmin(): Promise<SupabaseClient | null> {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return null

  const admin_db = serviceClient()
  const { data: admin } = await admin_db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!admin) return null
  return admin_db
}
