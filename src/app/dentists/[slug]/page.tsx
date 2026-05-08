import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileTabs from './ProfileTabs'
import GalleryTab from './GalleryTab'
import ReviewsTab from './ReviewsTab'
import BookingSidebar from './BookingSidebar'

export const revalidate = 3600

export async function generateStaticParams() {
  const { createClient: sb } = await import('@supabase/supabase-js')
  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data } = await supabase.from('dentists').select('slug').eq('is_active', true)
  return (data || []).map((d: any) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: d } = await supabase
    .from('dentists')
    .select('name, clinic_name, qualifications, areas(name)')
    .eq('slug', slug).single()
  if (!d) return { title: 'Dentist Not Found' }
  const area = (d.areas as any)?.name || 'Mumbai'
  return {
    title: `${d.name} — ${d.clinic_name || 'Dental Clinic'} in ${area} | dentistinmumbai.in`,
    description: `${d.name}${d.qualifications ? ` (${d.qualifications})` : ''} at ${d.clinic_name || 'dental clinic'} in ${area}, Mumbai. View fees, reviews, gallery and book appointment online.`,
    alternates: { canonical: `https://www.dentistinmumbai.in/dentist/${slug}` },
  }
}

function WorkingHoursDisplay({ hours }: { hours: any }) {
  const days = [
    { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' }, { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
    { key: 'sun', label: 'Sunday' },
  ]
  if (!hours) return <p style={{ color: 'var(--muted)', fontSize: 14 }}>Hours not available</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {days.map(({ key, label }) => {
        const day = hours[key]
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 100, fontSize: 14, fontWeight: 500 }}>{label}</span>
            {day?.is_open ? (
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {day.open_time} – {day.close_time}
                {day.has_break && ` (Break: ${day.break_start}–${day.break_end})`}
              </span>
            ) : (
              <span style={{ fontSize: 14, color: '#DC2626', fontWeight: 500 }}>Closed</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stars({ rating }: { rating: number }) {
  return <span style={{ color: '#F59E0B', fontSize: 15 }}>{'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}</span>
}

export default async function DentistProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const [{ data: dentist }, ] = await Promise.all([
    supabase.from('dentists').select(`
      *, areas(name, slug),
      dentist_treatments(fee_from, fee_to, treatments(id, name, slug, icon)),
      gallery_photos(id, url, category, caption, sort_order),
      reviews!inner(id, patient_name, rating, review_text, treatment, created_at, verified)
    `).eq('slug', slug).eq('reviews.status', 'approved').single(),
  ])

  // Fetch reviews separately to handle no reviews case
  const { data: dentistData } = await supabase
    .from('dentists')
    .select(`*, areas(name, slug), dentist_treatments(fee_from, fee_to, treatments(id, name, slug, icon)), gallery_photos(id, url, category, caption, sort_order)`)
    .eq('slug', slug)
    .single()

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, patient_name, rating, review_text, treatment, created_at, verified')
    .eq('dentist_id', dentistData?.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (!dentistData) notFound()

  const d = dentistData
  const reviewList = reviews || []
  const treatments = d.dentist_treatments || []
  const photos = d.gallery_photos || []
  const area = (d.areas as any)
  const avgRating = reviewList.length > 0 ? reviewList.reduce((s: number, r: any) => s + r.rating, 0) / reviewList.length : 0

  const waLink = d.whatsapp
    ? `https://wa.me/91${d.whatsapp.replace(/\D/g, '')}?text=Hi, I found your profile on DentistInMumbai.in and would like to book an appointment.`
    : null

  // JSON-LD
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name: d.name,
    description: d.bio,
    url: `https://www.dentistinmumbai.in/dentist/${slug}`,
    telephone: d.phone,
    address: { '@type': 'PostalAddress', streetAddress: d.address, addressLocality: area?.name || 'Mumbai', addressRegion: 'Maharashtra', addressCountry: 'IN' },
    ...(avgRating > 0 && {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: avgRating.toFixed(1), reviewCount: reviewList.length },
    }),
    priceRange: d.consultation_fee ? `₹${d.consultation_fee}` : undefined,
  }

  // TAB CONTENT — Overview
  const overviewTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Bio */}
      {d.bio && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 12 }}>About {d.name}</h3>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{d.bio}</p>
        </div>
      )}

      {/* Info grid */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Clinic Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: 'Experience', value: d.experience_years ? `${d.experience_years} years` : null },
            { label: 'Qualifications', value: d.qualifications },
            { label: 'Languages', value: d.languages?.join(', ') },
            { label: 'MCI Registration', value: d.mci_registration },
            { label: 'Gender', value: d.gender ? d.gender.charAt(0).toUpperCase() + d.gender.slice(1) : null },
            { label: 'EMI Available', value: d.emi_available ? 'Yes' : null },
            { label: 'Insurance Accepted', value: d.accepts_insurance ? 'Yes' : null },
            { label: 'Consultation Fee', value: d.consultation_fee ? `₹${d.consultation_fee}` : 'Call for fee' },
          ].filter(item => item.value).map(item => (
            <div key={item.label} style={{ padding: '12px', background: 'var(--bg)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Working Hours */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Working Hours</h3>
        <WorkingHoursDisplay hours={d.working_hours} />
      </div>
    </div>
  )

  // TAB CONTENT — Treatments
  const treatmentsTab = (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      {treatments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No treatments listed yet.</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--blue-light)' }}>
              <th style={{ padding: '14px 24px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--blue-dark)' }}>Treatment</th>
              <th style={{ padding: '14px 24px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--blue-dark)' }}>Fee Range</th>
            </tr>
          </thead>
          <tbody>
            {treatments.map((dt: any, i: number) => (
              <tr key={dt.treatments?.id || i} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : 'var(--bg)' }}>
                <td style={{ padding: '14px 24px', fontSize: 14, fontWeight: 500 }}>
                  <span style={{ marginRight: 8 }}>{dt.treatments?.icon}</span>
                  {dt.treatments?.name}
                </td>
                <td style={{ padding: '14px 24px', fontSize: 14, fontWeight: 700, color: 'var(--blue)', textAlign: 'right' }}>
                  {dt.fee_from && dt.fee_to ? `₹${dt.fee_from} – ₹${dt.fee_to}` : dt.fee_from ? `From ₹${dt.fee_from}` : 'Call for price'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  // TAB CONTENT — Location
  const locationTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 12 }}>Address</h3>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>{d.address}</p>
        {d.lat && d.lng && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`}
            target="_blank" rel="noopener noreferrer"
            className="btn btn-outline btn-sm"
          >🗺️ Get Directions</a>
        )}
      </div>
      {d.lat && d.lng && (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', height: 380 }}>
          <iframe
            src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY&q=${d.lat},${d.lng}&zoom=15`}
            width="100%" height="380" style={{ border: 0, display: 'block' }}
            allowFullScreen loading="lazy"
            title={`${d.name} location map`}
          />
        </div>
      )}
    </div>
  )

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      {/* NAV */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>DentistInMumbai<span style={{ color: 'var(--blue)' }}>.in</span></span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>Find Dentists</Link>
            <Link href="/for-dentists/register" className="btn btn-primary btn-sm">List Your Clinic</Link>
          </div>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '10px 20px' }}>
        <div className="container">
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
            <Link href="/" style={{ color: 'var(--blue)' }}>Home</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'var(--blue)' }}>Dentists</Link>
            {area && <><span>›</span><Link href={`/area/${area.slug}`} style={{ color: 'var(--blue)' }}>{area.name}</Link></>}
            <span>›</span>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{d.name}</span>
          </nav>
        </div>
      </div>

      {/* COVER PHOTO */}
      <div style={{ height: 220, background: 'linear-gradient(135deg, #003F7A, #1A6FC4)', position: 'relative', overflow: 'hidden' }}>
        {d.cover_photo_url && (
          <img src={d.cover_photo_url} alt="Clinic cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
      </div>

      {/* PROFILE HEADER */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '0 20px 20px' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{
              width: 96, height: 96, borderRadius: 16, border: '4px solid #fff',
              background: 'var(--blue-light)', overflow: 'hidden', flexShrink: 0,
              marginTop: -48, boxShadow: 'var(--shadow-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
            }}>
              {d.profile_photo_url
                ? <img src={d.profile_photo_url} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🦷'}
            </div>

            <div style={{ flex: 1, paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{d.name}</h1>
                    {d.is_verified && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--green-light)', color: '#065F46', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid #A7F3D0' }}>
                        ✓ Verified
                      </span>
                    )}
                    {d.tier === 'featured' && <span className="badge badge-featured">⭐ Featured</span>}
                    {d.tier === 'gold' && <span className="badge badge-gold">Gold</span>}
                  </div>
                  {d.qualifications && <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>{d.qualifications}</p>}
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {d.clinic_name}{area ? ` · ${area.name}, Mumbai` : ''}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
                    {avgRating > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Stars rating={avgRating} />
                        <strong style={{ color: 'var(--text)' }}>{avgRating.toFixed(1)}</strong>
                        <span>({reviewList.length} reviews)</span>
                      </span>
                    )}
                    {d.experience_years > 0 && <span>🎓 {d.experience_years} yrs exp</span>}
                    {treatments.length > 0 && <span>💉 {treatments.length} treatments</span>}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {d.phone && (
                    <a href={`tel:${d.phone}`} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
                      fontWeight: 600, fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font-body)',
                    }}>📞 Call</a>
                  )}
                  {waLink && (
                    <a href={waLink} target="_blank" rel="noopener noreferrer" style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                      background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 10,
                      fontWeight: 600, fontSize: 14, color: '#166534', fontFamily: 'var(--font-body)',
                    }}>💬 WhatsApp</a>
                  )}
                  <Link href={`/dentist/${d.slug}#book`} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                    background: 'var(--blue)', borderRadius: 10,
                    fontWeight: 600, fontSize: 14, color: '#fff', fontFamily: 'var(--font-body)',
                  }}>📅 Book Appointment</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main style={{ background: 'var(--bg)' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

            {/* Tabs + content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <ProfileTabs
                reviewCount={reviewList.length}
                overview={overviewTab}
                treatments={treatmentsTab}
                gallery={<GalleryTab photos={photos} />}
                reviews={<ReviewsTab reviews={reviewList as any} dentistId={d.id} dentistSlug={d.slug} />}
                location={locationTab}
              />
            </div>

            {/* Booking sidebar */}
            <BookingSidebar dentist={{
              id: d.id, slug: d.slug, name: d.name,
              phone: d.phone, whatsapp: d.whatsapp,
              consultation_fee: d.consultation_fee,
              emi_available: d.emi_available,
              is_verified: d.is_verified, tier: d.tier,
            }} />
          </div>
        </div>
      </main>
    </>
  )
}
