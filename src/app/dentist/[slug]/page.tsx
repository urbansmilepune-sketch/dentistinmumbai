
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import { istDayTime } from '@/lib/time'
import { whatsappLink } from '@/lib/phone'
import { buildMapsIframe } from '@/lib/maps'
import ProfileTabs from './ProfileTabs'
import LocationTabs from './LocationTabs'
import ViewTracker from './ViewTracker'
import TrackedLink from './TrackedLink'
import ClinicContactButton from './ClinicContactButton'
import ReviewForm from '@/components/ReviewForm'
import CitiesFooterLinks from '@/components/CitiesFooterLinks'

export const dynamic = 'force-dynamic'

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
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const { data: d } = await supabase
    .from('dentists')
    .select('name, clinic_name, areas(name), bio, profile_photo, qualifications, specialties')
    .eq('slug', slug)
    .single()
  if (!d) return {}

  const brand = `DentistIn${city.cityName.replace(/\s+/g, '')}`
  const areaName = (d.areas as any)?.name || city.cityName
  // Pick the most search-friendly qualifier for the title — first listed
  // specialty if any, otherwise the qualifications string. Falls back to
  // "Dentist" so the title stays grammatical when the row is sparse.
  const specialization = (Array.isArray(d.specialties) && d.specialties[0])
    || d.qualifications
    || 'Dentist'
  const bioSnippet = d.bio ? d.bio.slice(0, 150).trim() : ''
  const description = bioSnippet
    ? `Book appointment with ${d.name} at ${d.clinic_name} in ${areaName}. ${bioSnippet}${d.bio && d.bio.length > 150 ? '…' : ''}`
    : `Book appointment with ${d.name} at ${d.clinic_name} in ${areaName}.`
  const url = `${cityOrigin(city)}/dentist/${slug}`
  const ogImage = d.profile_photo || undefined

  return {
    title: `${d.name} - ${specialization} in ${city.cityName} | ${brand}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${d.name} - ${specialization} in ${city.cityName}`,
      description,
      url,
      siteName: brand,
      locale: 'en_IN',
      type: 'profile',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: `${d.name} - ${specialization} in ${city.cityName}`,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export default async function DentistProfilePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const origin = cityOrigin(city)

 const { data: dentist } = await supabase
    .from('dentists')
    .select('*, areas(name, slug), dentist_treatments(fee_from, fee_to, treatments(id, name, slug, icon)), gallery_photos(id, url, caption, category)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!dentist) notFound()

  // Cross-city URLs always resolve to the dentist's own city domain. A
  // Pune dentist linked from dentistinmumbai.in/dentist/<slug> would
  // otherwise render under the Mumbai brand (wrong header, wrong logo,
  // wrong "All Dentists" link) and split SEO between two hosts. 308 keeps
  // the slug, swaps the origin.
  const dentistCityConfig = getCityBySlug(dentist.city)
  if (dentistCityConfig.domain !== city.domain) {
    redirect(`https://${dentistCityConfig.domain}/dentist/${slug}`)
  }

  // Reviews are fetched separately so the status filter applies server-side.
  // Previously they joined with the dentists row and we filtered approved in
  // JS — that shipped pending/rejected review text over the wire to every
  // anonymous visitor, leaking moderation state.
  const { data: approvedReviewsRows } = await supabase
    .from('reviews')
    .select('id, patient_name, rating, review_text, treatment, created_at')
    .eq('dentist_id', dentist.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  const approvedReviews = approvedReviewsRows ?? []

  // Multi-location support: pulled separately because the dentist row already
  // joins four tables. Dentists with zero rows here keep using the original
  // single-location fields (address, working_hours) on the dentists table —
  // no backfill, no migration of legacy data.
  // The DB column is `clinic_name`; LocationTabs expects `name`, so we
  // alias on the select. `sort_order` was removed from the schema —
  // ordering is is_primary DESC then created_at ASC.
  const { data: locationRows } = await supabase
    .from('clinic_locations')
    .select('id, name:clinic_name, address, phone, working_hours, is_primary, areas(name)')
    .eq('dentist_id', dentist.id)
    .order('is_primary', { ascending: false })
    .order('created_at')
  const locations = locationRows ?? []

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

  // Dentist is a Schema.org subtype of MedicalBusiness → LocalBusiness, so
  // this satisfies both rich-snippet eligibility and Google's local pack
  // requirements. image enables the dentist's photo to surface in the
  // knowledge-panel / search-result thumbnail.
  const jsonLd = {
    '@context': 'https://schema.org', '@type': ['Dentist', 'Physician'],
    name: dentist.name, medicalSpecialty: 'Dentistry',
    description: dentist.bio || `Dentist at ${dentist.clinic_name}`,
    ...(dentist.profile_photo ? { image: dentist.profile_photo } : {}),
    address: { '@type': 'PostalAddress', addressLocality: (dentist.areas as any)?.name || city.cityName, addressCountry: 'IN' },
    areaServed: { '@type': 'City', name: city.cityName },
    telephone: dentist.phone, url: `${origin}/dentist/${slug}`,
    ...(avgRating && { aggregateRating: { '@type': 'AggregateRating', ratingValue: avgRating, reviewCount: approvedReviews.length } }),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
        <div className="profile-cover" style={{
          width: '100%',
          height: 220,
          overflow: 'hidden',
          position: 'relative',
          // Background shorthand below resolves to: image at center, sized
          // cover, no-repeat. Explicit longhand sits below too in case a
          // browser interprets the shorthand differently for very wide
          // viewports where the image would otherwise overflow.
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
          <div className="profile-hero-card" style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '0 24px 24px', marginTop: -60, marginBottom: 24, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>🏥 {dentist.clinic_name} · 📍 {(dentist.areas as any)?.name}, {city.cityName}</p>
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
              <Link
                href={`/book/${dentist.slug}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                📅 Book Appointment
              </Link>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }} className="profile-grid">
            <div>
              <ProfileTabs
                reviewCount={approvedReviews.length}
                overview={
                  <div style={{ padding: '20px', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
                    {dentist.bio ? <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>{dentist.bio}</p> : <p style={{ color: 'var(--muted)', fontSize: 14 }}>No bio added yet.</p>}
                  </div>
                }
                treatments={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(dentist.dentist_treatments || []).length > 0 ? (dentist.dentist_treatments || []).map((dt: any) => (
                      <div key={dt.treatments?.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 22 }}>{dt.treatments?.icon}</span>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{dt.treatments?.name}</span>
                        </div>
                        {(dt.fee_from || dt.fee_to) && <span style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 700 }}>{dt.fee_from && dt.fee_to ? `₹${dt.fee_from}–₹${dt.fee_to}` : dt.fee_from ? `From ₹${dt.fee_from}` : ''}</span>}
                      </div>
                    )) : <p style={{ color: 'var(--muted)', fontSize: 14, padding: 20 }}>No treatments listed yet.</p>}
                  </div>
                }
                gallery={
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {(dentist.gallery_photos || []).length > 0 ? (dentist.gallery_photos || []).map((photo: any) => (
                      <div key={photo.id} style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '1', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <img src={photo.url} alt={photo.caption || 'Clinic photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )) : <p style={{ color: 'var(--muted)', fontSize: 14, padding: 20 }}>No photos uploaded yet.</p>}
                  </div>
                }
                reviews={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {approvedReviews.length > 0 ? approvedReviews.map((r: any) => (
                      <div key={r.id} style={{ padding: '16px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontWeight: 700 }}>{r.patient_name}</span>
                          <span style={{ color: '#F59E0B' }}>{'★'.repeat(r.rating)}</span>
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{r.review_text}</p>
                      </div>
                   )) : <p style={{ color: 'var(--muted)', fontSize: 14, padding: 20 }}>No reviews yet.</p>}
                    <div style={{ marginTop: 20 }}><ReviewForm dentistId={dentist.id} dentistName={dentist.name} /></div>
                  </div>
                }
                location={
                  <div style={{ padding: '20px', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{dentist.address || 'Address not added yet.'}</p>
                  </div>
                }
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {locations.length > 1 ? (
                // Dentist has registered multiple branches in the Locations
                // dashboard — show a tab strip so the patient can pick which
                // one's hours/address they're looking at.
                <LocationTabs locations={locations as any} />
              ) : (
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Working Hours</h3>
                  {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => {
                    const h = dentist.working_hours?.[day]
                    const labels: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
                    return (
                      <div key={day} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{labels[day]}</span>
                        <span style={{ fontWeight: 600, color: h?.is_open ? 'var(--text)' : '#EF4444' }}>{h?.is_open ? `${h.open_time} – ${h.close_time}` : 'Closed'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {(() => {
                // Permissive map rendering on the public profile. The
                // dashboard's stricter classifyMapsInput() is meant to keep
                // dentists from saving an iframe whose src doesn't match
                // /maps/embed?, but it also caused old saved iframes (the
                // legacy ?output=embed form, hand-rolled variants, etc.) to
                // disappear from public profiles where they had been
                // rendering fine for months. Here we let any iframe through
                // as long as it points at google.com/maps — the dentist
                // saved it, the patient should see it. URL-shaped inputs
                // still go through buildMapsIframe for the wrapping step.
                const raw = (dentist.maps_embed ?? '').trim()
                let mapsHtml = ''
                if (raw) {
                  if (raw.includes('<iframe') && raw.includes('google.com/maps')) {
                    mapsHtml = raw
                  } else {
                    mapsHtml = buildMapsIframe(raw, dentist.clinic_name)
                  }
                }
                if (!mapsHtml) return null
                return (
                  <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>📍 Location</h3>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: mapsHtml }} style={{ width: '100%', height: 220, display: 'block' }} />
                    {dentist.address && <div style={{ padding: '12px 20px' }}><p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{dentist.address}</p></div>}
                  </div>
                )
              })()}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Share this profile</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Check out ${dentist.name} on ${city.domain}: ${origin}/dentist/${dentist.slug}`)}`} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', background: '#25D366', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Share</a>
                </div>
              </div>
            </div>
          </div>
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
        <Link
          href={`/book/${dentist.slug}`}
          style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52, padding: '0 8px', background: 'var(--blue)', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          📅 Book
        </Link>
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
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media (max-width: 768px) {
          .profile-main { padding-bottom: 80px !important; }
          .profile-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .profile-cover { height: 140px !important; }
          .profile-hero-card { padding: 0 16px 18px !important; gap: 14px !important; margin-top: -50px !important; flex-direction: column !important; align-items: stretch !important; }
          .profile-avatar { width: 88px !important; height: 88px !important; margin-top: -36px !important; align-self: center !important; }
          .profile-hero-info { min-width: 0 !important; padding-top: 4px !important; text-align: center !important; }
          .profile-hero-info h1 { font-size: 20px !important; }
          .profile-hero-info > div { justify-content: center !important; }
          .profile-hero-cta-desktop { display: none !important; }
          .profile-sticky-bar { display: flex !important; }
        }
      `}</style>
    </>
  )
}









