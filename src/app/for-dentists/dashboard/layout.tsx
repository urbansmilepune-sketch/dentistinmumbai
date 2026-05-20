import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import DashboardShell from './DashboardShell'
import SupportButton from '@/components/SupportButton'
import { completionPct } from '@/lib/profileCompletion'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/for-dentists/login')

  // We look the dentist up by email, NOT by current city domain. Each
  // city is a separate apex with its own supabase auth cookie, so we
  // serve a dentist whichever host they happened to log in on. The
  // DashboardShell picks up city branding from window.location, so the
  // page reads "DentistInMumbai" or "DentistInPune" based on the host;
  // the dentist's data is always their own row.
  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, slug, name, clinic_name, tier, trial_started_at, is_active, profile_photo, cover_photo, bio, whatsapp, maps_embed, city')
    .eq('email', user.email)
    .single()

  if (!dentist) {
    // Staff members have no dentists row — they live in clinic_staff
    // and have their own portal at /for-dentists/staff. Before bouncing
    // to /register, check whether this email belongs to staff at any
    // clinic. Service role bypasses RLS so the lookup works even though
    // staff have no policy granting them read on clinic_staff.
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: staffRow } = await admin
      .from('clinic_staff')
      .select('id')
      .ilike('email', user.email ?? '')
      .neq('status', 'removed')
      .maybeSingle()
    if (staffRow) redirect('/for-dentists/staff')

    const email = user.email ?? ''
    redirect(`/for-dentists/register?email=${encodeURIComponent(email)}`)
  }
  if (!dentist.is_active) redirect('/for-dentists/pending')

  const pct = completionPct(dentist)

  return (
    <>
      <DashboardShell dentist={dentist} completionPct={pct}>
        {children}
      </DashboardShell>
      {/* Mounted here (not in root layout) so the help button is scoped
          to authenticated dashboard routes by virtue of file-system
          layout, no client-side pathname matching required. The
          fixed-position wrapper lives in this layout so the parent
          owns positioning and the inner component can't hide itself. */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex' }}>
        <SupportButton />
      </div>
    </>
  )
}
