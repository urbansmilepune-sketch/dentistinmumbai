import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'
import SupportButton from '@/components/SupportButton'

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
    const email = user.email ?? ''
    redirect(`/for-dentists/register?email=${encodeURIComponent(email)}`)
  }
  if (!dentist.is_active) redirect('/for-dentists/pending')

  // Profile completion
  const checks = [
    !!dentist.profile_photo,
    !!dentist.cover_photo,
    !!(dentist.bio && dentist.bio.length >= 50),
    !!dentist.whatsapp,
    !!dentist.maps_embed,
  ]
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100)

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
