
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getDentistProfileData } from '@/lib/cache/public-pages'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import { istDayTime } from '@/lib/time'
import { whatsappLink } from '@/lib/phone'
import { buildMapsIframe } from '@/lib/maps'
import LocationTabs from './LocationTabs'
import ViewTracker from './ViewTracker'
import TrackedLink from './TrackedLink'
import TrackedBookingLink from './TrackedBookingLink'
import ClinicContactButton from './ClinicContactButton'
import ReviewForm from '@/components/ReviewForm'
import CitiesFooterLinks from '@/components/CitiesFooterLinks'
import FaqAccordion from '@/components/FaqAccordion'

interface Props { params: Promise<{ slug: string }> }

// Cloudinary URLs are stored as the raw upload secure_url. Injecting
// f_auto,q_auto here asks Cloudinary to serve WebP/AVIF at an optimised
// quality at delivery time, which removes the soft/blurred look the cover
// had on retina + wide desktop displays (the browser was upscaling and
// then re-decoding a baseline JPEG).
function cloudinaryDeliveryUrl(url: string | null | undefined, transforms = 'f_auto,q_auto'): string | null {
  if (!url) return null
  if (!url.includes('/image/upload/')) return url
  if (url.includes('/upload/f_auto') || url.includes('/upload/q_auto')) return url
  return url.replace('/image/upload/', `/image/upload/${transforms}/`)
}

function isOpenNow(working_hours: any): { open: boolean; label: string } {
  if (!working_hours) return { open: false, label: 'Hours not set' }
  const { dayKey, hour, minute } = istDayTime(new Date())
  const dayHours = working_hours[dayKey]
  if (!dayHours?.is_open) return { open: false, label: 'Closed today' }
  const [openH, openM] = (dayHours.open_time || '09:00').split(':').map(Number)
  const [closeH, closeM] = (dayHours.close_time || '19:00').split(':').map(Number)
  const currentMins = hour * 60 + minute
  const openMins = openH * 60 + openM
  const closeMins = closeH * 60 + closeM
  if (currentMins >= openMins && currentMins < closeMins) return { open: true, label: `Open until ${dayHours.close_time}` }
  if (currentMins < openMins) return { open: false, label: `Opens at ${dayHours.open_time}` }
  return { open: false, label: 'Closed now' }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  // Reuses the cached dentist row — same key the page fetch hits below.
  const cached = await getDentistProfileData(slug)
  const d = cached?.dentist as any
  if (!d) return {}

  const brand = `DentistIn${city.cityName.replace(/\s+/g, '')}`
  const areaName = (d.areas as any)?.name || city.cityName
  const clinicLabel = d.clinic_name || 'Dental Clinic'
  const experienceSegment = d.experience_years ? ` ${d.experience_years} years experience.` : ''
  const qualifications = d.qualifications || 'BDS'
  const title = `Dr. ${d.name} - ${clinicLabel} | ${areaName} | ${brand}`
  const description = `Book appointment with Dr. ${d.name} at ${clinicLabel} in ${areaName}, ${city.cityName}. ${qualifications}.${experienceSegment} Online booking available.`
  const url = `${cityOrigin(city)}/dentist/${slug}`
  const ogImage = d.profile_photo || undefined

  return {
    title,
    description,
    keywords: `Dr ${d.name}, ${d.clinic_name || ''}, dentist ${areaName}, dental clinic ${city.cityName}, book dentist online`,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: brand,
      locale: 'en_IN',
      type: 'profile',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

export default async function DentistProfilePage({ params }: Props) {
  const { slug } = await params
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const origin = cityOrigin(city)

  // Dentist row + reviews + locations + similar dentists come from the Data
  // Cache (60s TTL). Reviews are fetched server-side with status='approved'
  // so pending/rejected text never ships over the wire to anonymous visitors.
  // Multi-location support: dentists with zero clinic_locations rows fall
  // back to the dentist row's single address/working_hours fields — no
  // backfill of legacy data.
  const cached = await getDentistProfileData(slug)
  if (!cached) notFound()
  const dentist = cached.dentist as any
  const approvedReviews = cached.approvedReviews
  const locations = cached.locations
  const similarDentists = cached.similarDentists

  // Cross-city URLs always resolve to the dentist's own city domain. A
  // Pune dentist linked from dentistinmumbai.in/dentist/<slug> would
  // otherwise render under the Mumbai brand (wrong header, wrong logo,
  // wrong "All Dentists" link) and split SEO between two hosts. 308 keeps
  // the slug, swaps the origin.
  const dentistCityConfig = getCityBySlug(dentist.city)
  if (dentistCityConfig.domain !== city.domain) {
    redirect(`https://${dentistCityConfig.domain}/dentist/${slug}`)
  }

  const openStatus = isOpenNow(dentist.working_hours)
  // Normalised wa.me link — handles raw, '+91…', '91…' and trunk-prefix
  // numbers, returns null when the column is unusable so we can skip
  // rendering the button entirely.
  const waPrefill = `Hi ${dentist.name}, I found you on ${city.domain} and would like to book an appointment.`
  // Fall back to the regular phone number when the dedicated whatsapp column
  // is empty — most dentists don't bother to fill in both, and treating the
  // primary phone as a WhatsApp target is correct for >99% of Indian clinics.
  // whatsappLink returns null on unusable input, so the buttons still hide
  // when there's truly no number to dial.
  const waUrl = whatsappLink(dentist.whatsapp || dentist.phone, waPrefill)
  const avgRating = approvedReviews.length > 0
    ? (approvedReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / approvedReviews.length).toFixed(1) : null

  const areaName = (dentist.areas as any)?.name || city.cityName
  const treatments = (dentist.dentist_treatments || []) as any[]
  const gallery = (dentist.gallery_photos || []) as any[]

  // Permissive map rendering on the public profile. The dashboard's stricter
  // classifyMapsInput() is meant to keep dentists from saving an iframe whose
  // src doesn't match /maps/embed?, but it also caused old saved iframes (the
  // legacy ?output=embed form, hand-rolled variants, etc.) to disappear from
  // public profiles where they had been rendering fine for months. Here we
  // let any iframe through as long as it points at google.com/maps.
  const rawMaps = (dentist.maps_embed ?? '').trim()
  let mapsHtml = ''
  if (rawMaps) {
    if (rawMaps.includes('<iframe') && rawMaps.includes('google.com/maps')) {
      mapsHtml = rawMaps
    } else {
      mapsHtml = buildMapsIframe(rawMaps, dentist.clinic_name)
    }
  }

  const directionsUrl = dentist.address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dentist.address)}`
    : null

  // Dentist is a Schema.org subtype of MedicalBusiness → LocalBusiness, so
  // this satisfies both rich-snippet eligibility and Google's local pack
  // requirements. image enables the dentist's photo to surface in the
  // knowledge-panel / search-result thumbnail.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': ['Dentist', 'Physician'],
    name: dentist.clinic_name || dentist.name,
    medicalSpecialty: 'Dentistry',
    description: dentist.bio || `Dental clinic in ${areaName}`,
    ...(dentist.profile_photo ? { image: dentist.profile_photo } : {}),
    url: `${origin}/dentist/${slug}`,
    telephone: dentist.phone,
    address: {
      '@type': 'PostalAddress',
      ...(dentist.address ? { streetAddress: dentist.address } : {}),
      addressLocality: areaName,
      addressRegion: city.cityName,
      addressCountry: 'IN',
    },
    areaServed: { '@type': 'City', name: city.cityName },
    ...(dentist.latitude && dentist.longitude
      ? { geo: { '@type': 'GeoCoordinates', latitude: dentist.latitude, longitude: dentist.longitude } }
      : {}),
    openingHours: 'Mo-Sa 09:00-20:00',
    priceRange: dentist.consultation_fee ? `₹${dentist.consultation_fee}` : '₹500-₹2000',
    ...(dentist.maps_embed ? { hasMap: dentist.maps_embed } : {}),
    ...(avgRating && { aggregateRating: { '@type': 'AggregateRating', ratingValue: avgRating, reviewCount: approvedReviews.length } }),
  }

  // Auto-generated FAQ. Built from whatever profile fields the dentist has
  // filled in — every dentist gets the booking-CTA question, the rest are
  // gated on the underlying field being non-empty so we don't ship an
  // answer like "Dr. X speaks " with a trailing nothing. The same items
  // feed the FAQPage JSON-LD below for rich-result eligibility.
  const drName = `Dr. ${dentist.name}`
  const clinicLabel = dentist.clinic_name || 'the clinic'
  const explicitArea = (dentist.areas as any)?.name as string | undefined
  const treatmentNames: string[] = treatments
    .map((dt: any) => dt.treatments?.name)
    .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
  const openDays = DAY_KEYS.filter(d => dentist.working_hours?.[d]?.is_open)

  const faqItems: { q: string; a: string }[] = []

  if (explicitArea) {
    faqItems.push({
      q: `Which area does ${drName} practice in?`,
      a: `${drName} practices at ${clinicLabel} in ${explicitArea}, ${city.cityName}.`,
    })
  }
  if (treatmentNames.length > 0) {
    faqItems.push({
      q: `What treatments does ${drName} offer?`,
      a: `${drName} offers ${treatmentNames.join(', ')}. You can book any of these treatments online.`,
    })
  }
  if (Array.isArray(dentist.specialties) && dentist.specialties.length > 0) {
    faqItems.push({
      q: `What is ${drName}'s specialization?`,
      a: `${drName} specialises in ${(dentist.specialties as string[]).join(', ')}.`,
    })
  }
  if (dentist.qualifications && String(dentist.qualifications).trim()) {
    faqItems.push({
      q: `What are ${drName}'s qualifications?`,
      a: `${drName} holds ${dentist.qualifications}.${dentist.mci_number ? ` MCI Registration: ${dentist.mci_number}.` : ''}`,
    })
  }
  if (dentist.address && String(dentist.address).trim()) {
    faqItems.push({
      q: `Where is ${drName}'s clinic located?`,
      a: `${clinicLabel} is located at ${dentist.address}${explicitArea ? `, ${explicitArea}, ${city.cityName}` : `, ${city.cityName}`}.`,
    })
  }
  if (typeof dentist.experience_years === 'number' && dentist.experience_years > 0) {
    faqItems.push({
      q: `How many years of experience does ${drName} have?`,
      a: `${drName} has ${dentist.experience_years} years of clinical experience in dentistry.`,
    })
  }
  // Booking question is unconditional — slug + clinic name are guaranteed
  // on every active dentist row, and this is the SEO-targeted "how do I
  // contact this dentist" question that Google likes to surface as a
  // rich snippet.
  {
    const channels: string[] = [`book online at ${origin}/book/${dentist.slug}`]
    if (dentist.phone) channels.push(`call the clinic at ${dentist.phone}`)
    if (waUrl) channels.push('message on WhatsApp')
    faqItems.push({
      q: `How can I book an appointment with ${drName}?`,
      a: `To book an appointment with ${drName} at ${clinicLabel}, ${channels.join(', or ')}.`,
    })
  }
  if (dentist.consultation_fee) {
    faqItems.push({
      q: `What is ${drName}'s consultation fee?`,
      a: `${drName}'s consultation fee is ₹${dentist.consultation_fee}. Individual treatment fees vary by procedure — see the Treatments & Fees section above.`,
    })
  }
  if (openDays.length > 0) {
    const timingLines = DAY_KEYS.map(d => {
      const dh = dentist.working_hours?.[d]
      if (!dh?.is_open) return `${DAY_LABELS[d]}: Closed`
      return `${DAY_LABELS[d]}: ${dh.open_time}–${dh.close_time}`
    })
    faqItems.push({
      q: `What are ${drName}'s clinic timings?`,
      a: timingLines.join('. ') + '.',
    })
  }
  if (Array.isArray(dentist.languages) && dentist.languages.length > 0) {
    faqItems.push({
      q: `What languages does ${drName} speak?`,
      a: `${drName} speaks ${(dentist.languages as string[]).join(', ')}.`,
    })
  }

  // Schema.org FAQPage — Google requires the FAQ to be visible on the page
  // (which it is, in the accordion below) and the questions must match the
  // visible text. The same array drives both, so they never drift.
  const faqJsonLd = faqItems.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      }
    : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      <ViewTracker dentistId={dentist.id} />
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src={city.logoPath} alt={city.domain} style={{ height: 40, width: 'auto', display: 'block' }} />
          </Link>
          <Link href="/dentists" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>← All Dentists</Link>
        </nav>
      </header>

      <main className="profile-main" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        {/* ─── SECTION 1: HERO ─────────────────────────────────────────── */}
        <section id="hero">
          <div className="profile-cover" style={{
            width: '100%',
            height: 220,
            overflow: 'hidden',
            position: 'relative',
            background: dentist.cover_photo
              ? `url(${cloudinaryDeliveryUrl(dentist.cover_photo)}) center / cover no-repeat`
              : 'linear-gradient(135deg, #003F7A, #0057A8)',
            backgroundSize: dentist.cover_photo ? 'cover' : undefined,
            backgroundPosition: dentist.cover_photo ? 'center' : undefined,
            backgroundRepeat: 'no-repeat',
          }}>
            {!dentist.cover_photo && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 64, opacity: 0.3 }}>🦷</span></div>}
          </div>
          <div className="container" style={{ position: 'relative' }}>
            <div className="profile-hero-card" style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '0 24px 24px', marginTop: -60, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="profile-avatar" style={{ width: 100, height: 100, borderRadius: '50%', border: '4px solid #fff', background: dentist.profile_photo ? `url(${dentist.profile_photo}) center/cover` : 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginTop: -20, flexShrink: 0, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                {!dentist.profile_photo && '👨‍⚕️'}
              </div>
              <div className="profile-hero-info" style={{ flex: 1, minWidth: 240, paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>{dentist.name}</h1>
                  {dentist.is_verified && <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '2px 8px', borderRadius: 20, border: '1px solid #BBF7D0' }}>✓ MCI Verified</span>}
                  {dentist.emi_available && <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 20 }}>💳 EMI Available</span>}
                </div>
                <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>{dentist.qualifications}{dentist.experience_years ? ` · ${dentist.experience_years} yrs exp` : ''}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>🏥 {dentist.clinic_name} · 📍 {areaName}, {city.cityName}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: openStatus.open ? '#00A878' : '#EF4444' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: openStatus.open ? '#00A878' : '#EF4444' }}>{openStatus.label}</span>
                  </div>
                  {avgRating && <span style={{ fontSize: 13, fontWeight: 600, color: '#F59E0B' }}>★ {avgRating} ({approvedReviews.length} reviews)</span>}
                  {dentist.consultation_fee && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Consult: <strong>₹{dentist.consultation_fee}</strong></span>}
                  {dentist.mci_number && <span style={{ fontSize: 12, color: 'var(--muted)' }}>MCI: {dentist.mci_number}</span>}
                </div>
                {dentist.languages && dentist.languages.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>🗣️</span>
                    {dentist.languages.map((lang: string) => (
                      <span key={lang} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text-secondary)' }}>{lang}</span>
                    ))}
                  </div>
                )}
                {dentist.specialties && dentist.specialties.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {dentist.specialties.map((sp: string) => (
                      <span key={sp} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 20, color: 'var(--blue)', fontWeight: 500 }}>{sp}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="profile-hero-cta profile-hero-cta-desktop" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 180, paddingTop: 16 }}>
                {waUrl && (
                  <TrackedLink
                    dentistId={dentist.id}
                    eventType="whatsapp_click"
                    href={waUrl}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: '#25D366', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    WhatsApp
                  </TrackedLink>
                )}
                {dentist.phone && (
                  <TrackedLink
                    dentistId={dentist.id}
                    eventType="call_click"
                    href={`tel:${dentist.phone}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', background: '#fff', color: 'var(--blue)', border: '2px solid var(--blue)', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                    📞 Call Clinic
                  </TrackedLink>
                )}
                <TrackedBookingLink
                  dentistId={dentist.id}
                  href={`/book/${dentist.slug}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  📅 Book Appointment
                </TrackedBookingLink>
              </div>
            </div>
          </div>
        </section>

        <div className="container profile-sections">
          {/* ─── SECTION 2: ABOUT ─────────────────────────────────────────── */}
          {dentist.bio && (
            <section id="about" className="profile-section">
              <h2 className="profile-section-title">About</h2>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{dentist.bio}</p>
              </div>
            </section>
          )}

          {/* ─── SECTION 3: TREATMENTS & FEES ─────────────────────────────── */}
          {treatments.length > 0 && (
            <section id="treatments" className="profile-section">
              <h2 className="profile-section-title">Treatments &amp; Fees</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {treatments.map((dt: any) => {
                  const t = dt.treatments
                  if (!t) return null
                  const fee = (dt.fee_from || dt.fee_to)
                    ? (dt.fee_from && dt.fee_to ? `₹${dt.fee_from}–₹${dt.fee_to}` : dt.fee_from ? `From ₹${dt.fee_from}` : '')
                    : ''
                  // Each row deep-links into the booking flow with the
                  // treatment name pre-selected — the booking page reads
                  // ?treatment=… and matches it to the dentist's treatment
                  // list. We use TrackedBookingLink so the click counts as
                  // a booking_click in analytics, same as the hero CTA.
                  return (
                    <TrackedBookingLink
                      key={t.id}
                      dentistId={dentist.id}
                      href={`/book/${dentist.slug}?treatment=${encodeURIComponent(t.name)}`}
                      className="profile-treatment-row"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 22 }}>{t.icon}</span>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {fee && <span style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 700 }}>{fee}</span>}
                        <span className="profile-treatment-cta" aria-hidden>Book →</span>
                      </div>
                    </TrackedBookingLink>
                  )
                })}
              </div>
            </section>
          )}

          {/* ─── SECTION 4: GALLERY ───────────────────────────────────────── */}
          {gallery.length > 0 && (
            <section id="gallery" className="profile-section">
              <h2 className="profile-section-title">Clinic Photos</h2>
              <div className="profile-gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {gallery.map((photo: any) => (
                  <div key={photo.id} style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '1', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <img src={photo.url} alt={photo.caption || 'Clinic photo'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── SECTION 5: REVIEWS ───────────────────────────────────────── */}
          <section id="reviews" className="profile-section">
            <h2 className="profile-section-title">Patient Reviews</h2>
            {approvedReviews.length > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 14 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#F59E0B', fontFamily: 'var(--font-heading)' }}>★ {avgRating}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                    Based on {approvedReviews.length} {approvedReviews.length === 1 ? 'review' : 'reviews'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {approvedReviews.map((r: any) => (
                    <div key={r.id} style={{ padding: '16px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontWeight: 700 }}>{r.patient_name}</span>
                        <span style={{ color: '#F59E0B' }}>{'★'.repeat(r.rating)}</span>
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{r.review_text}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: '18px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 14 }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Be the first to review {dentist.name}.</p>
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <ReviewForm dentistId={dentist.id} dentistName={dentist.name} />
            </div>
          </section>

          {/* ─── SECTION 6: FAQ ───────────────────────────────────────────── */}
          {/* Auto-generated from the dentist's profile fields — see the
              faqItems builder above. The same array is emitted as FAQPage
              JSON-LD in the document head for Google rich-result eligibility,
              so the visible accordion and the structured data can never
              disagree. */}
          {faqItems.length > 0 && (
            <section id="faq" className="profile-section">
              <h2 className="profile-section-title">Frequently Asked Questions</h2>
              <FaqAccordion items={faqItems} />
            </section>
          )}

          {/* ─── SECTION 7: LOCATION ──────────────────────────────────────── */}
          <section id="location" className="profile-section">
            <h2 className="profile-section-title">Find Us</h2>

            {mapsHtml && (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                <div className="profile-map-frame" dangerouslySetInnerHTML={{ __html: mapsHtml }} style={{ width: '100%', height: 360, display: 'block' }} />
              </div>
            )}

            {(dentist.address || directionsUrl) && (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {dentist.address && <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1, minWidth: 200 }}>📍 {dentist.address}</p>}
                {directionsUrl && (
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: 'var(--blue)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    🧭 Get Directions
                  </a>
                )}
              </div>
            )}

            {locations.length > 1 ? (
              // Dentist has registered multiple branches in the Locations
              // dashboard — show a tab strip so the patient can pick which
              // one's hours/address they're looking at.
              <LocationTabs locations={locations as any} />
            ) : (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Working Hours</h3>
                {DAY_KEYS.map(day => {
                  const dh = dentist.working_hours?.[day]
                  return (
                    <div key={day} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{DAY_LABELS[day]}</span>
                      <span style={{ fontWeight: 600, color: dh?.is_open ? 'var(--text)' : '#EF4444' }}>{dh?.is_open ? `${dh.open_time} – ${dh.close_time}` : 'Closed'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ─── SECTION 8: SIMILAR DENTISTS ──────────────────────────────── */}
          {similarDentists.length > 0 && (
            <section id="similar" className="profile-section">
              <h2 className="profile-section-title">More Dentists in {areaName}</h2>
              <div className="profile-similar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {similarDentists.map(sd => {
                  const sdSpecialty = (Array.isArray(sd.specialties) && sd.specialties[0]) || sd.qualifications || 'Dentist'
                  return (
                    <div key={sd.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, background: sd.profile_photo ? `url(${sd.profile_photo}) center/cover` : 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, overflow: 'hidden' }}>
                          {!sd.profile_photo && '👨‍⚕️'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sd.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sdSpecialty}</div>
                        </div>
                      </div>
                      {sd.consultation_fee && (
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Consult: <strong style={{ color: 'var(--text)' }}>₹{sd.consultation_fee}</strong></div>
                      )}
                      <Link href={`/dentist/${sd.slug}`} style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: '10px 12px', background: 'var(--blue)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                        View Profile
                      </Link>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Sticky mobile action bar — patient must always have one tap to book/call */}
      <div className="profile-sticky-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
        background: '#fff', borderTop: '1px solid var(--border)',
        padding: '10px 12px env(safe-area-inset-bottom, 10px)',
        display: 'none', gap: 8,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
      }}>
        {waUrl && (
          <TrackedLink
            dentistId={dentist.id}
            eventType="whatsapp_click"
            href={waUrl}
            target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52, padding: '0 8px', background: '#25D366', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            💬 WhatsApp
          </TrackedLink>
        )}
        {dentist.phone && (
          <TrackedLink
            dentistId={dentist.id}
            eventType="call_click"
            href={`tel:${dentist.phone}`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52, padding: '0 8px', background: '#fff', color: 'var(--blue)', border: '2px solid var(--blue)', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            📞 Call
          </TrackedLink>
        )}
        <TrackedBookingLink
          dentistId={dentist.id}
          href={`/book/${dentist.slug}`}
          style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52, padding: '0 8px', background: 'var(--blue)', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          📅 Book
        </TrackedBookingLink>
      </div>

      {/* Floating clinic-contact button — public-profile-only, talks to the
          dentist (not platform support). Hidden on mobile because the sticky
          action bar already covers WhatsApp/Call/Book. */}
      <ClinicContactButton
        dentistId={dentist.id}
        clinicName={dentist.clinic_name ?? 'this clinic'}
        whatsappUrl={waUrl}
        phone={dentist.phone ?? null}
      />

      <CitiesFooterLinks currentSlug={dentist.city} />

      <footer style={{ background: '#0A1628', padding: '24px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 40 }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} DentistIn. All rights reserved.</p>
      </footer>

      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .profile-sections { padding-bottom: 24px; }
        .profile-treatment-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 12px;
          text-decoration: none;
          color: var(--text);
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .profile-treatment-row:hover {
          border-color: var(--blue);
          box-shadow: 0 2px 8px rgba(0,87,168,0.08);
          transform: translateY(-1px);
        }
        .profile-treatment-cta {
          font-size: 13px;
          font-weight: 700;
          color: var(--blue);
          opacity: 0;
          transition: opacity 0.15s;
        }
        .profile-treatment-row:hover .profile-treatment-cta { opacity: 1; }
        @media (max-width: 768px) {
          /* On touch, hover never fires — keep the CTA visible so the
             affordance is obvious. Slightly dimmed so the fee still leads. */
          .profile-treatment-cta { opacity: 0.7; }
        }
        .profile-section {
          padding: 32px 0;
          border-top: 1px solid var(--border);
          scroll-margin-top: 80px;
        }
        .profile-section:first-child { border-top: none; padding-top: 28px; }
        .profile-section-title {
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 22px;
          margin-bottom: 16px;
          color: var(--text);
        }
        .profile-map-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
        @media (max-width: 768px) {
          .profile-main { padding-bottom: 80px !important; }
          .profile-cover { height: 140px !important; }
          .profile-hero-card { padding: 0 16px 18px !important; gap: 14px !important; margin-top: -50px !important; flex-direction: column !important; align-items: stretch !important; }
          .profile-avatar { width: 88px !important; height: 88px !important; margin-top: -36px !important; align-self: center !important; }
          .profile-hero-info { min-width: 0 !important; padding-top: 4px !important; text-align: center !important; }
          .profile-hero-info h1 { font-size: 20px !important; }
          .profile-hero-info > div { justify-content: center !important; }
          .profile-hero-cta-desktop { display: none !important; }
          .profile-sticky-bar { display: flex !important; }
          .profile-section { padding: 24px 0; }
          .profile-section-title { font-size: 19px; margin-bottom: 12px; }
          .profile-gallery-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .profile-similar-grid { grid-template-columns: 1fr !important; }
          .profile-map-frame { height: 280px !important; }
        }
      `}</style>
    </>
  )
}
