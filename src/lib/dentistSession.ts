// Tiny helper used by the dentist-scoped API routes (locations, staff).
// Returns the dentist row that owns the current session, or null if the
// caller isn't a logged-in dentist. We use the user-bound supabase client
// (RLS-aware) for the auth check and the dentists lookup — both queries are
// safe under RLS because a dentist can always read their own row.
import { createClient } from '@/lib/supabase/server'

export type DentistOwner = {
  id: string
  email: string
  slug: string
  name: string | null
  clinic_name: string | null
  city: string | null
}

export async function getDentistOwner(): Promise<DentistOwner | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const { data } = await supabase
    .from('dentists')
    .select('id, email, slug, name, clinic_name, city')
    .eq('email', user.email)
    .maybeSingle()

  return (data as DentistOwner) ?? null
}
