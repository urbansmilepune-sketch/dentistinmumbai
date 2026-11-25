import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { CITY_CONFIGS } from '@/config/cities'
import { SPECIALTIES } from '@/lib/dentalSpecialties'
import { isNationalRequest, getViewerDentist, adminDb, ui } from '@/lib/national'
import { activeDentistCounts } from '@/lib/eventAlerts'
import { eventPaymentsEnabled } from '@/lib/eventPayments'
import EventForm from './EventForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'List a dental event or course | DentistIn India',
  description: 'List your dental conference, seminar, CDE program or course on DentistIn India. Free to list, or Featured with alerts to dentists.',
  robots: { index: false, follow: true },
}

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  if (!(await isNationalRequest())) notFound()
  const sp = await searchParams
  const viewer = await getViewerDentist()
  const cities = Object.values(CITY_CONFIGS)
    .map(c => ({ slug: c.citySlug as string, name: c.cityName }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const topics = SPECIALTIES.map(s => ({ slug: s.slug, label: s.label }))
  const counts = await activeDentistCounts(adminDb())
  // Featured can only target cities that have dentists to alert.
  const coverageCities = cities
    .filter(c => (counts[c.slug] || 0) > 0)
    .map(c => ({ ...c, dentists: counts[c.slug] }))
    .sort((a, b) => b.dentists - a.dentists)

  return (
    <NationalShell>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px 64px' }}>
        <h1 style={ui.h1}>Add your event or course</h1>
        <p style={{ ...ui.sub, marginBottom: 18 }}>Free to list. Our team checks every listing before it goes live, usually within a day.</p>
        <EventForm
          cities={cities} coverageCities={coverageCities} counts={counts} topics={topics}
          defaultEmail={viewer?.email || ''} defaultCity={viewer?.city || ''}
          defaultMode={sp.k === 'course' ? 'course' : 'event'} paymentsOn={eventPaymentsEnabled()}
        />
      </main>
    </NationalShell>
  )
}
