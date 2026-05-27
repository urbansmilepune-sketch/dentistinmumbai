// Resolves the dentist row the current session is authorised to act on.
//
// Two paths:
//   - The clinic owner — they log in with their own email, which matches
//     a dentists.email row directly.
//   - Invited staff — they log in with their own email, which has NO
//     dentists row. They DO have a clinic_staff row pointing at their
//     owner's dentist_id; we follow the join and return that dentist.
//
// Both paths return the SAME dentists row shape, so dashboard pages can
// call this and treat the result identically — `dentist.id` is the
// scope they should use on every subsequent query. RLS (see
// 20260527130000_clinic_staff_data_access.sql) grants active staff
// read access to the owner's dentists row, so a single user-bound
// supabase client is sufficient — no service role on the client.

// Loosely typed: accepts both the browser client (@supabase/supabase-js)
// and the SSR client (@supabase/ssr) which share the relevant query
// surface but report distinct nominal types. Tightening this would
// require a generic-typed Database schema that the repo doesn't expose.
type AnySupabase = {
  auth: { getUser: () => Promise<{ data: { user: { email?: string | null } | null } }> }
  from: (table: string) => any
}

export type StaffRole = 'owner' | 'associate_dentist' | 'reception'

export type CurrentDentist<T = { id: string }> = T & {
  // `staffRole` is null when the signed-in user IS the dentist; it carries
  // the clinic_staff.role when the user is invited staff. Callers use it
  // to gate write actions in the UI alongside the sidebar visibility
  // filter in DashboardShell.
  __staffRole: StaffRole | null
}

export async function resolveCurrentDentist<T extends { id: string } = { id: string }>(
  supabase: AnySupabase,
  selectFields: string = 'id',
): Promise<CurrentDentist<T> | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const { data: ownDentist } = await supabase
    .from('dentists')
    .select(selectFields)
    .eq('email', user.email)
    .maybeSingle()
  if (ownDentist) {
    return { ...(ownDentist as unknown as T), __staffRole: null }
  }

  const { data: staffRow } = await supabase
    .from('clinic_staff')
    .select('role, dentist_id, status')
    .ilike('email', user.email)
    .eq('status', 'active')
    .maybeSingle()
  if (!staffRow) return null

  const { data: ownerDentist } = await supabase
    .from('dentists')
    .select(selectFields)
    .eq('id', staffRow.dentist_id)
    .maybeSingle()
  if (!ownerDentist) return null

  return { ...(ownerDentist as unknown as T), __staffRole: staffRow.role as StaffRole }
}
