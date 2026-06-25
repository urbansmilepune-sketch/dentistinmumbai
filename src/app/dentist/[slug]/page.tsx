
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getDentistProfileData } from '@/lib/cache/public-pages'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import { whatsappLink } from '@/lib/phone'
import { buildMapsIframe } from '@/lib/maps'
import { getOpenStatus } from '@/lib/openStatus'
import { completionPct } from '@/lib/profileCompletion'
import { getDentistOwner } from '@/lib/dentistSession'
import ViewTracker from './ViewTracker'
import TrackedLink from './TrackedLink'
import TrackedBookingLink from './TrackedBookingLink'
import ClinicContactButton from './ClinicContactButton'
import CitiesFooterLinks from '@/components/CitiesFooterLinks'
import FaqAccordion from '@/components/FaqAccordion'
import ProfileCover from './ProfileCover'
import ProofStrip from './ProofStrip'
import OpenStatusBanner from './OpenStatusBanner'
import TrustPills from './TrustPills'
import WhyChoose from './WhyChoose'
import TreatmentsList from './TreatmentsList'
import ReviewsSection from './ReviewsSection'
import LocationSection from './LocationSection'
import SimilarDentists from './SimilarDentists'
import StickyBookBar from './StickyBookBar'
import OwnerBanner, { type ChecklistItem } from './OwnerBanner'
import { NAVY, TEAL, TEAL_DARK, WHATSAPP, BRAND_GRADIENT, normalizeDrName, initialsFrom } from './profileTheme'
import { ShieldCheckIcon, MapPinIcon, PhoneIcon, WhatsAppIcon, CalendarIcon } from './profileIcons'

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
  // Some dentists store the "Dr." honorific in their name ("Dr. Sweety",
  // "Dr.Amir", "Dr veena"), others store the bare name. Strip a leading
  // "dr"/"dr." before re-adding a single prefix so titles/metadata never
  // read "Dr. Dr. ...". The \b word boundary is what makes this safe: it
  // only fires when "dr" is followed by a dot, space, or end — so a real
  // name like "Drishti" is left untouched instead of becoming "Dr. ishti".
  // Same transform the FAQ section uses; applied at display time so all
  // affected profiles are fixed without touching the DB.
  const bareName = String(d.name || '').replace(/^\s*dr\b\.?\s*/i, '').trim()
  const drName = `Dr. ${bareName}`
  const title = `${drName} - ${clinicLabel} | ${areaName} | ${brand}`
  const description = `Book appointment with ${drName} at ${clinicLabel} in ${areaName}, ${city.cityName}. ${qualifications}.${experienceSegment} Online booking available.`
  const url = `${cityOrigin(city)}/dentist/${slug}`
  const ogImage = d.profile_photo || undefined

  return {
    title,
    description,
    keywords: `Dr ${bareName}, ${d.clinic_name || ''}, dentist ${areaName}, dental clinic ${city.cityName}, book dentist online`,
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

  // Owner view: is the logged-in dentist looking at their OWN profile? This
  // is the only check that exposes the owner banner — getDentistOwner()
  // returns null for anonymous visitors and for any other logged-in dentist,
  // so the banner can never leak to patients/public.
  const owner = await getDentistOwner()
  const isOwner = !!owner && owner.id === dentist.id

  const openStatus = getOpenStatus(dentist.working_hours)
  // Normalised wa.me link — handles raw, '+91…', '91…' and trunk-prefix
  // numbers, returns null when the column is unusable so we can skip
  // rendering the button entirely. Falls back to the regular phone number
  // when the dedicated whatsapp column is empty.
  const waPrefill = `Hi ${dentist.name}, I found you on ${city.domain} and would like to book an appointment.`
  const waUrl = whatsappLink(dentist.whatsapp || dentist.phone, waPrefill)
  const avgRating = approvedReviews.length > 0
    ? (approvedReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / approvedReviews.length).toFixed(1) : null

  const areaName = (dentist.areas as any)?.name || city.cityName
  const areaSlug = (dentist.areas as any)?.slug as string | undefined
  const treatments = (dentist.dentist_treatments || []) as any[]
  const gallery = (dentist.gallery_photos || []) as any[]
  const galleryPhotos = gallery
    .map((p: any) => ({ url: cloudinaryDeliveryUrl(p.url) || p.url, caption: p.caption }))
    .filter((p: { url: string | null }) => !!p.url) as { url: string; caption?: string | null }[]

  const whyChoose = (Array.isArray(dentist.why_choose_us) ? dentist.why_choose_us as string[] : [])
    .map(s => (s || '').trim())
    .filter(Boolean)

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

  // Single normalised, title-cased display name used everywhere on the page
  // (H1, reviews, closed nudge) AND in the FAQ / JSON-LD text below, so the
  // dentist never reads as "Dr. veena" in one place and "Dr. Veena" in
  // another. Strips a baked-in "Dr"/"Dr." honorific first.
  const drName = normalizeDrName(dentist.name)

  // Dentist is a Schema.org subtype of MedicalBusiness → LocalBusiness, so
  // this satisfies both rich-snippet eligibility and Google's local pack
  // requirements. image enables the dentist's photo to surface in the
  // knowledge-panel / search-result thumbnail.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': ['Dentist', 'Physician'],
    // Prefer the clinic name (the LocalBusiness identity); fall back to the
    // normalised "Dr. <name>" so the schema name never duplicates the prefix.
    name: dentist.clinic_name || drName,
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

  // Owner-only checklist of high-impact missing items. Curated, NOT a
  // breakdown of completionPct — only items actually missing are listed.
  const checklist: ChecklistItem[] = []
  if (isOwner) {
    if (!dentist.profile_photo) checklist.push({ label: 'Add your photo', href: '/for-dentists/dashboard/profile', impact: '3× more profile views' })
    if (gallery.length === 0) checklist.push({ label: 'Add clinic photos', href: '/for-dentists/dashboard/photos', impact: '2× more bookings' })
    if (!dentist.maps_embed) checklist.push({ label: 'Add location on map', href: '/for-dentists/dashboard/locations' })
    if (openDays.length === 0) checklist.push({ label: 'Set working hours', href: '/for-dentists/dashboard/hours' })
  }
  const ownerCompletion = isOwner
    ? completionPct({
        profile_photo: dentist.profile_photo,
        cover_photo: dentist.cover_photo,
        bio: dentist.bio,
        whatsapp: dentist.whatsapp,
        maps_embed: dentist.maps_embed,
      })
    : 0

  const topSpecialty = (Array.isArray(dentist.specialties) && dentist.specialties[0]) || null
  const hasTrustPills = !!dentist.is_verified || !!dentist.emi_available
    || (Array.isArray(dentist.languages) && dentist.languages.filter((l: string) => l && l.trim()).length > 0)
    || ['male', 'female'].includes(String(dentist.gender || '').toLowerCase())

  const closedNudge = openStatus.state === 'closed' && areaSlug
    ? { drName, areaSlug, areaName }
    : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      <ViewTracker dentistId={dentist.id} />

      {/* ─── OWNER VIEW (owner-only; never reaches patients) ─────────────── */}
      {isOwner && <OwnerBanner completionPct={ownerCompletion} checklist={checklist} />}

      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src={city.logoPath} alt={city.domain} style={{ height: 56, width: 'auto', display: 'block' }} />
          </Link>
          <Link href="/dentists" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>← All Dentists</Link>
        </nav>
      </header>

      <main className="profile-main" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        {/* ─── SECTION 1: COVER + PHOTOS ───────────────────────────────── */}
        <ProfileCover photos={galleryPhotos} coverPhoto={cloudinaryDeliveryUrl(dentist.cover_photo)} clinicName={dentist.clinic_name || drName} />

        <div className="container">
          {/* ─── SECTION 2: IDENTITY (overlaps cover) ──────────────────── */}
          <div className="profile-identity">
            <div className="profile-avatar" style={{
              background: dentist.profile_photo ? `url(${cloudinaryDeliveryUrl(dentist.profile_photo)}) center/cover` : BRAND_GRADIENT,
            }}>
              {!dentist.profile_photo && <span style={{ color: '#fff', fontWeight: 800, fontSize: 26, fontFamily: 'var(--font-heading)' }}>{initialsFrom(dentist.name)}</span>}
            </div>

            <div className="profile-identity-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: NAVY, lineHeight: 1.2 }}>{drName}</h1>
                {dentist.is_verified && (
                  <span title="MCI Verified" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <ShieldCheckIcon size={20} color={TEAL} />
                  </span>
                )}
              </div>
              {(dentist.qualifications || dentist.experience_years) && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {[dentist.qualifications, dentist.experience_years ? `${dentist.experience_years} years experience` : null].filter(Boolean).join(' · ')}
                </p>
              )}
              <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'inherit' }}>
                <MapPinIcon size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                {[dentist.clinic_name, areaName ? `${areaName}, ${city.cityName}` : city.cityName].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Desktop CTA cluster — mobile uses the sticky bottom bar. */}
            <div className="profile-hero-cta-desktop">
              {waUrl && (
                <TrackedLink dentistId={dentist.id} eventType="whatsapp_click" href={waUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: WHATSAPP, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <WhatsAppIcon size={18} color="#fff" /> WhatsApp
                </TrackedLink>
              )}
              {dentist.phone && (
                <TrackedLink dentistId={dentist.id} eventType="call_click" href={`tel:${dentist.phone}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', background: '#fff', color: NAVY, border: `2px solid ${NAVY}`, borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <PhoneIcon size={18} color={NAVY} /> Call clinic
                </TrackedLink>
              )}
              <TrackedBookingLink dentistId={dentist.id} href={`/book/${dentist.slug}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: TEAL, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                <CalendarIcon size={18} color="#fff" /> Book appointment
              </TrackedBookingLink>
            </div>
          </div>

          {/* ─── SECTIONS 3–5: PROOF / OPEN / TRUST ────────────────────── */}
          <div className="profile-intro-stack">
            <ProofStrip
              avgRating={avgRating}
              reviewCount={approvedReviews.length}
              experienceYears={typeof dentist.experience_years === 'number' ? dentist.experience_years : null}
              topSpecialty={topSpecialty}
              qualifications={dentist.qualifications || null}
            />
            {openStatus.state !== 'none' && <OpenStatusBanner status={openStatus} />}
            {hasTrustPills && (
              <TrustPills
                isVerified={!!dentist.is_verified}
                emiAvailable={!!dentist.emi_available}
                languages={Array.isArray(dentist.languages) ? dentist.languages : []}
                gender={dentist.gender || null}
              />
            )}
          </div>
        </div>

        <div className="container profile-sections">
          {/* ─── SECTION 6: WHY CHOOSE ─────────────────────────────────── */}
          {whyChoose.length > 0 && (
            <section id="why-choose" className="profile-section">
              <h2 className="profile-section-title">Why choose {drName}?</h2>
              <WhyChoose items={whyChoose} />
            </section>
          )}

          {/* About — the dentist's own words. Hidden when empty so an
              unmaintained profile never shows an empty header. (Kept from the
              previous design; not in the new numbered structure but it's
              genuine trust content and hides cleanly when absent.) */}
          {dentist.bio && String(dentist.bio).trim() && (
            <section id="about" className="profile-section">
              <h2 className="profile-section-title">About</h2>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
                <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{dentist.bio}</p>
              </div>
            </section>
          )}

          {/* ─── SECTION 7: TREATMENTS & FEES ──────────────────────────── */}
          {treatments.length > 0 && (
            <section id="treatments" className="profile-section">
              <h2 className="profile-section-title">Treatments &amp; fees</h2>
              <TreatmentsList treatments={treatments} dentistId={dentist.id} slug={dentist.slug} />
            </section>
          )}

          {/* ─── SECTION 8: REVIEWS ────────────────────────────────────── */}
          <section id="reviews" className="profile-section">
            <h2 className="profile-section-title">Patient reviews</h2>
            <ReviewsSection
              reviews={approvedReviews as any}
              avgRating={avgRating}
              drName={drName}
              dentistId={dentist.id}
              dentistName={dentist.name}
            />
          </section>

          {/* ─── FAQ (preserved; feeds FAQPage JSON-LD above) ──────────── */}
          {faqItems.length > 0 && (
            <section id="faq" className="profile-section">
              <h2 className="profile-section-title">Frequently asked questions</h2>
              <FaqAccordion items={faqItems} />
            </section>
          )}

          {/* ─── SECTION 9: LOCATION ───────────────────────────────────── */}
          <section id="location" className="profile-section">
            <h2 className="profile-section-title">Find the clinic</h2>
            <LocationSection
              mapsHtml={mapsHtml}
              address={dentist.address || null}
              directionsUrl={directionsUrl}
              workingHours={dentist.working_hours}
              locations={locations as any}
            />
          </section>

          {/* ─── SECTION 10: MORE DENTISTS IN {AREA} ───────────────────── */}
          {similarDentists.length > 0 && (
            <section id="similar" className="profile-section">
              <h2 className="profile-section-title">More dentists in {areaName}</h2>
              <SimilarDentists dentists={similarDentists as any} />
            </section>
          )}
        </div>
      </main>

      {/* ─── SECTION 11: STICKY BOOK BAR (+ closed nudge above it) ──────── */}
      <StickyBookBar dentistId={dentist.id} slug={dentist.slug} waUrl={waUrl} phone={dentist.phone ?? null} closedNudge={closedNudge} />

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
        @keyframes profilePulse { 0% { transform: scale(1); opacity: 0.7; } 70%, 100% { transform: scale(2.4); opacity: 0; } }

        .profile-main { padding-bottom: 40px; }

        /* Cover heights — mobile-first */
        .profile-cover-wrap { height: 190px; }
        .profile-cover-empty { height: 150px; }
        .profile-cover-collage { display: grid; width: 100%; height: 100%; gap: 3px; }
        .profile-cover-single { grid-template-columns: 1fr; }
        .profile-cover-two { grid-template-columns: 1fr 1fr; }
        .profile-cover-grid { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; }
        .profile-cover-grid .profile-cover-hero { grid-row: 1 / 3; }

        /* Identity card overlapping the cover */
        .profile-identity {
          position: relative;
          margin-top: -32px;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          gap: 16px;
          align-items: flex-start;
          box-shadow: 0 4px 18px rgba(15,23,42,0.06);
        }
        .profile-avatar {
          width: 72px; height: 72px; flex-shrink: 0;
          border-radius: 16px;
          border: 3px solid #fff;
          margin-top: -36px;
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 12px rgba(15,23,42,0.14);
        }
        .profile-identity-info { flex: 1; min-width: 0; }
        .profile-hero-cta-desktop { display: none; flex-direction: column; gap: 10px; min-width: 190px; }

        .profile-intro-stack { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }

        .profile-sections { padding-bottom: 24px; }
        .profile-section {
          padding: 28px 0;
          border-top: 1px solid var(--border);
          scroll-margin-top: 80px;
        }
        .profile-section:first-child { border-top: none; }
        .profile-section-title {
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 20px;
          margin-bottom: 14px;
          color: ${NAVY};
        }

        .profile-treatment-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          background: #fff; border: 1px solid var(--border); border-radius: 12px;
          text-decoration: none; color: var(--text);
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
          gap: 12px;
        }
        .profile-treatment-row:hover {
          border-color: ${TEAL};
          box-shadow: 0 2px 8px rgba(20,184,166,0.12);
          transform: translateY(-1px);
        }
        .profile-treatment-cta {
          font-size: 13px; font-weight: 700; color: ${TEAL_DARK};
          opacity: 0; transition: opacity 0.15s; white-space: nowrap;
        }
        .profile-treatment-row:hover .profile-treatment-cta { opacity: 1; }

        .profile-map-frame iframe { width: 100%; height: 100%; border: 0; display: block; }

        /* Desktop */
        @media (min-width: 769px) {
          .profile-cover-wrap { height: 280px; }
          .profile-cover-empty { height: 220px; }
          .profile-identity { padding: 20px 24px; align-items: center; }
          .profile-avatar { width: 84px; height: 84px; }
          .profile-hero-cta-desktop { display: flex; }
          .profile-section-title { font-size: 22px; }
        }
        @media (max-width: 768px) {
          .profile-main { padding-bottom: 92px; }
          .profile-identity-info { text-align: center; }
          .profile-identity {
            flex-direction: column; align-items: center; text-align: center;
          }
          .profile-avatar { margin-top: -52px; align-self: center; }
          .profile-identity-info p { justify-content: center; }
          .profile-treatment-cta { opacity: 0.7; }
        }
      `}</style>
    </>
  )
}
