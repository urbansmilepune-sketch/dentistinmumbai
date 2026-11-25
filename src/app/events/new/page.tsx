import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { CITY_CONFIGS } from '@/config/cities'
import { SPECIALTIES } from '@/lib/dentalSpecialties'
import { isNationalRequest, getViewerDentist, ui } from '@/lib/national'
import EventForm from './EventForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'List a dental event or course | DentistIn India',
  description: 'List your dental exhibition, seminar, study club or course on DentistIn India for free.',
  robots: { index: false, follow: true },
}

export default async function NewEventPage() {
  if (!(await isNationalRequest())) notFound()
  const viewer = await getViewerDentist()
  const cities = Object.values(CITY_CONFIGS)
    .map(c => ({ slug: c.citySlug as string, name: c.cityName }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const topics = SPECIALTIES.map(s => ({ slug: s.slug, label: s.label }))

  return (
    <NationalShell>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px 64px' }}>
        <h1 style={ui.h1}>List an event or course</h1>
        <p style={{ ...ui.sub, marginBottom: 18 }}>Free to list. Our team checks every listing before it goes live, usually within a day.</p>
        <EventForm cities={cities} topics={topics} defaultEmail={viewer?.email || ''} defaultCity={viewer?.city || ''} />
      </main>
    </NationalShell>
  )
}
