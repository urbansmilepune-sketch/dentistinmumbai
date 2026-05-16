import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import BookingFlow from './BookingFlow'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const { data: d } = await supabase
    .from('dentists')
    .select('name, clinic_name, profile_photo, areas(name)')
    .eq('slug', slug)
    .single()
  if (!d) return {}
  const area = (d.areas as any)?.name || city.cityName
  const title = `Book Appointment — ${d.name} | ${d.clinic_name}, ${area}`
  const description = `Book an appointment with ${d.name} at ${d.clinic_name} in ${area}. Pick a date, choose a time slot, confirm in seconds.`
  const url = `${cityOrigin(city)}/book/${slug}`
  const images = d.profile_photo ? [{ url: d.profile_photo, alt: d.name ?? 'Dentist' }] : undefined
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url,
      siteName: city.domain,
      type: 'website',
      locale: 'en_IN',
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title, description,
      images: images?.map(i => i.url),
    },
  }
}

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))

  const { data: dentist } = await supabase
    .from('dentists')
    .select(`
      id, slug, name, clinic_name, profile_photo, phone, whatsapp, working_hours,
      areas(name),
      dentist_treatments(treatments(id, name, icon))
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!dentist) notFound()

  const areaName = (dentist.areas as any)?.name || city.cityName
  const treatments = ((dentist.dentist_treatments ?? []) as any[])
    .map(dt => dt.treatments)
    .filter((t: any) => t && t.id) as { id: string; name: string; icon: string | null }[]

  return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Slim top nav */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <Link href={`/dentist/${dentist.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--muted)', fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>←</span> Profile
          </Link>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {city.domain.split('.')[0]}<span style={{ color: 'var(--blue)' }}>{'.' + city.domain.split('.').slice(1).join('.')}</span>
          </span>
        </div>
      </header>

      <div className="container booking-container" style={{ paddingTop: 20, paddingBottom: 80, maxWidth: 640 }}>
        {/* Dentist header card */}
        <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            {dentist.profile_photo ? <img src={dentist.profile_photo} alt={dentist.name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👨‍⚕️'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{dentist.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏥 {dentist.clinic_name}
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>📍 {areaName}, {city.cityName}</p>
          </div>
        </section>

        <BookingFlow
          dentistId={dentist.id}
          dentistSlug={dentist.slug}
          dentistName={dentist.name ?? ''}
          clinicName={dentist.clinic_name ?? ''}
          areaName={areaName}
          dentistPhone={dentist.whatsapp || dentist.phone || ''}
          workingHours={dentist.working_hours ?? null}
          treatments={treatments}
        />
      </div>
      <style>{`
        @media (max-width: 640px) {
          .booking-container { padding-bottom: 120px !important; }
        }
      `}</style>
    </main>
  )
}
