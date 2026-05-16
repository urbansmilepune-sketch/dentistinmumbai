import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'
import { CITY_CONFIGS, CITY_BY_DOMAIN, type CitySlug } from '@/config/cities'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/for-dentists/login')

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, slug, name, clinic_name, tier, is_active, profile_photo, cover_photo, bio, whatsapp, maps_embed, city')
    .eq('email', user.email)
    .single()

  if (!dentist) {
    const email = user.email ?? ''
    redirect(`/for-dentists/register?email=${encodeURIComponent(email)}`)
  }
  if (!dentist.is_active) redirect('/for-dentists/pending')

  // Safety net: dentist is on the dashboard for a city domain that doesn't
  // match their own. Happens when they bookmark or get linked into the
  // wrong city. We only redirect when the current host is a recognised
  // city domain (skips localhost in dev). Same cross-domain cookie caveat
  // applies as in /auth/callback — if cookies are host-scoped the new
  // domain will see no session, so verify cookie config covers all
  // city hosts before relying on this in production.
  const hdrs = await headers()
  const rawHost = (hdrs.get('host') || '').toLowerCase().replace(/^www\./, '').split(':')[0]
  const hostIsKnownCity = !!CITY_BY_DOMAIN[rawHost]
  const dentistSlug = dentist.city as CitySlug | null
  if (hostIsKnownCity && dentistSlug && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, dentistSlug)) {
    const expectedDomain = CITY_CONFIGS[dentistSlug].domain
    if (expectedDomain !== rawHost) {
      redirect(`https://${expectedDomain}/for-dentists/dashboard`)
    }
  }

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
    <DashboardShell dentist={dentist} completionPct={pct}>
      {children}
    </DashboardShell>
  )
}
