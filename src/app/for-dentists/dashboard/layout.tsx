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

  // Same two-tier lookup the auth callback uses: try dentists by email first
  // (the clinic owner), then fall back to clinic_staff for invited users.
  // Staff render the dashboard against the OWNER's dentist row — that's the
  // data their role is supposed to act on — while the shell uses staffRole
  // to scope the sidebar to features they're entitled to.
  const { data: dentist } = await supabase
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

  // Service role bypasses RLS for the staff lookup + owner dentist load:
  // staff don't have a policy granting access to dentists at row-fetch time
  // until the new RLS migration is applied everywhere, and even after,
  // service role avoids a second round trip for the layout.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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
