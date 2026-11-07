import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { googleBookingLink, googleStepsMessage, GBP_ADDED_EVENT, GOOGLE_VISIT_EVENT, GBP_PLACE_PREFIX, PLACE_ID_RE } from '@/lib/googleBooking'
import { getCityBySlug } from '@/config/cities'
import GoogleBookingGuide from './GoogleBookingGuide'

export const dynamic = 'force-dynamic'

export default async function GoogleBookingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/for-dentists/login')

  const dentist = await resolveCurrentDentist<{ id: string; slug: string | null; city: string | null; name: string | null; clinic_name: string | null }>(
    supabase, 'id, slug, city, name, clinic_name',
  )
  if (!dentist) redirect('/for-dentists/login')

  const clinicName = dentist.clinic_name || dentist.name || ''

  if (!dentist.slug) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', fontSize: 14, color: 'var(--muted)' }}>
        Your profile link isn&apos;t ready yet. <Link href="/for-dentists/dashboard/profile">Finish your profile</Link> first.
      </div>
    )
  }

  // analytics_events RLS blocks the dentist role, so reads use the service
  // role, pinned to the auth-resolved dentist id.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const ms = new Date(); ms.setUTCDate(1); ms.setUTCHours(0, 0, 0, 0)
  const [{ count: addedCount }, { count: monthVisits }, { data: placeRows }] = await Promise.all([
    admin.from('analytics_events').select('id', { count: 'exact', head: true })
      .eq('dentist_id', dentist.id).eq('event_type', GBP_ADDED_EVENT),
    admin.from('analytics_events').select('id', { count: 'exact', head: true })
      .eq('dentist_id', dentist.id).eq('event_type', GOOGLE_VISIT_EVENT).gte('created_at', ms.toISOString()),
    admin.from('analytics_events').select('event_type')
      .eq('dentist_id', dentist.id).like('event_type', `${GBP_PLACE_PREFIX}%`)
      .order('created_at', { ascending: false }).limit(1),
  ])
  const savedPlaceId = placeRows?.[0]?.event_type?.slice(GBP_PLACE_PREFIX.length) ?? ''
  const city = getCityBySlug(dentist.city)

  const link = googleBookingLink(dentist.slug, dentist.city)

  return (
    <GoogleBookingGuide
      link={link}
      stepsMessage={googleStepsMessage(link, clinicName)}
      initiallyAdded={(addedCount ?? 0) > 0}
      monthVisits={monthVisits ?? 0}
      placesKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || ''}
      initialPlaceId={PLACE_ID_RE.test(savedPlaceId) ? savedPlaceId : null}
      clinicQuery={[dentist.clinic_name || dentist.name || '', city.cityName].filter(Boolean).join(' ')}
      lat={city.lat}
      lng={city.lng}
    />
  )
}
