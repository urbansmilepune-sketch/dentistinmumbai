import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import DashboardShell from './DashboardShell'
import SupportButton from '@/components/SupportButton'
import { completionPct } from '@/lib/profileCompletion'
import { isDemoEmail } from '@/lib/demo'

const DENTIST_FIELDS = 'id, slug, name, clinic_name, tier, trial_started_at, is_active, profile_photo, cover_photo, bio, whatsapp, maps_embed, city'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/for-dentists/login')

  // Service role for ALL row lookups in this layout (dentists + staff +
  // owner dentist). The user-bound client is RLS-gated, and the public
  // SELECT policy on dentists filters by `is_active = true` — which means
  // the demo dentist row (is_active stays false so it never appears on
  // the public city directory) is invisible to the user-bound client even
  // when the signed-in user IS the demo dentist. Service role bypasses
  // that and lets the !is_active bypass below actually fire.
  //
  // Safety: every query here is scoped by `.eq('email', user.email)` or
  // `.eq('id', staffRow.dentist_id)` (where staffRow was already matched
  // by user.email). The service role is never used to read a row the
  // authenticated user doesn't already own.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Same two-tier lookup the auth callback uses: try dentists by email first
  // (the clinic owner), then fall back to clinic_staff for invited users.
  // Staff render the dashboard against the OWNER's dentist row — that's the
  // data their role is supposed to act on — while the shell uses staffRole
  // to scope the sidebar to features they're entitled to.
  const { data: dentist } = await admin
    .from('dentists')
    .select(DENTIST_FIELDS)
    .eq('email', user.email)
    .single()

  if (dentist) {
    // Demo profile bypass: the demo dentist row keeps is_active = false so
    // it never appears in public listings (which filter by is_active), but
    // we still want the signed-in demo user to reach the dashboard for
    // prospect walkthroughs. The /api/bookings rejection in tandem keeps
    // the row write-locked so the demo can't accrue real patient data.
    if (!dentist.is_active && !isDemoEmail(user.email)) redirect('/for-dentists/pending')
    const pct = completionPct(dentist)
    return (
      <>
        <DashboardShell dentist={dentist} completionPct={pct} staffRole={null}>
          {children}
        </DashboardShell>
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex' }}>
          <SupportButton />
        </div>
      </>
    )
  }

  // Staff fallback path — also keyed by user.email, also via the admin
  // client (staff have no self-read policy on clinic_staff in pre-RLS-
  // migration environments and the dentists table is gated as above).
  const { data: staffRow } = await admin
    .from('clinic_staff')
    .select('role, dentist_id, status')
    .ilike('email', user.email ?? '')
    .eq('status', 'active')
    .maybeSingle()

  if (!staffRow) {
    const email = user.email ?? ''
    redirect(`/for-dentists/register?email=${encodeURIComponent(email)}`)
  }

  const { data: ownerDentist } = await admin
    .from('dentists')
    .select(DENTIST_FIELDS)
    .eq('id', staffRow.dentist_id)
    .single()

  if (!ownerDentist) {
    // Staff row points at a missing dentist — stale invite from a deleted
    // clinic. Bounce to register so they can claim their own profile.
    const email = user.email ?? ''
    redirect(`/for-dentists/register?email=${encodeURIComponent(email)}`)
  }
  if (!ownerDentist.is_active) redirect('/for-dentists/pending')

  const pct = completionPct(ownerDentist)

  return (
    <>
      <DashboardShell dentist={ownerDentist} completionPct={pct} staffRole={staffRow.role}>
        {children}
      </DashboardShell>
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex' }}>
        <SupportButton />
      </div>
    </>
  )
}
