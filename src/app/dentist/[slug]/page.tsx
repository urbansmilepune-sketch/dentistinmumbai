import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ProfileTabs from './ProfileTabs'
import BookingTrigger from '@/components/BookingTrigger'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ slug: string }> }

function isOpenNow(working_hours: any): { open: boolean; label: string } {
  if (!working_hours) return { open: false, label: 'Hours not set' }
  const now = new Date()
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dayKey = days[now.getDay()]
  const dayHours = working_hours[dayKey]
  if (!dayHours?.is_open) return { open: false, label: 'Closed today' }
  const [openH, openM] = (dayHours.open_time || '09:00').split(':').map(Number)
  const [closeH, closeM] = (dayHours.close_time || '19:00').split(':').map(Number)
  const currentMins = now.getHours() * 60 + now.getMinutes()
  const openMins = openH * 60 + openM
  const closeMins = closeH * 60 + closeM
  if (currentMins >= openMins && currentMins < closeMins) return { open: true, label: `Open until ${dayHours.close_time}` }
  if (currentMins < openMins) return { open: false, label: `Opens at ${dayHours.open_time}` }
  return { open: false, label: 'Closed now' }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: d } = await supabase.from('dentists').select('name, clinic_name, areas(name), bio').eq('slug', slug).single()
  if (!d) return {}
  return {
    title: `${d.name} — ${d.clinic_name} | dentistinmumbai.in`,
    description: d.bio || `Book an appointment with ${d.name} at ${d.clinic_name} in ${(d.areas as any)?.name || 'Mumbai'}.`,
    alternates: { canonical: `https://www.dentistinmumbai.in/dentist/${slug}` },
  }
}

export default async function DentistProfilePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

 const { data: dentist } = await supabase
    .from('dentists')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!dentist) notFound()

  const openStatus = isOpenNow(dentist.working_hours)
  const approvedReviews = (dentist.reviews || []).filter((r: any) => r.status === 'approved')
  const avgRating = approvedReviews.length > 0
    ? (approvedReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / approvedReviews.length).toFixed(1) : null

  const jsonLd = {
    '@context': 'https://schema.org', '@type': ['Dentist', 'Physician'],
    name: dentist.name, medicalSpecialty: 'Dentistry',
    description: dentist.bio || `Dentist at ${dentist.clinic_name}`,
    address: { '@type': 'PostalAddress', addressLocality: (dentist.areas as any)?.name || 'Mumbai', addressCountry: 'IN' },
    telephone: dentist.phone, url: `https://www.dentistinmumbai.in/dentist/${slug}`,
    ...(avgRating && { aggregateRating: { '@type': 'AggregateRating', ratingValue: avgRating, reviewCount: approvedReviews.length } }),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'var(--blue)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 17 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>DentistInMumbai<span style={{ color: 'var(--blue)' }}>.in</span></span>
          </Link>
          <Link href="/dentists" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>← All Dentists</Link>
        </nav>
      </header>
      <main style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <div style={{ height: 220, background: dentist.cover_photo ? `url(${dentist.cover_photo}) center/cover` : 'linear-gradient(135deg, #003F7A, #0057A8)', position: 'relative' }}>
          {!dentist.cover_photo && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 64, opacity: 0.3 }}>🦷</span></div>}
        </div>
        <div className="container" style={{ position: 'relative' }}>
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '0 24px 24px', marginTop: -60, marginBottom: 24, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', border: '4px solid #fff', background: dentist.profile_photo ? `url(${dentist.profile_photo}) center/cover` : 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginTop: -20, flexShrink: 0, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
              {!dentist.profile_photo && '👨‍⚕️'}
            </div>
            <div style={{ flex: 1, minWidth: 240, paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>{dentist.name}</h1>
                {dentist.is_verified && <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '2px 8px', borderRadius: 20, border: '1px solid #BBF7D0' }}>✓ MCI Verified</span>}
                {dentist.emi_available && <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 20 }}>💳 EMI Available</span>}
              </div>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>{dentist.qualifications}{dentist.experience_years ? ` · ${dentist.experience_years} yrs exp` : ''}</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>🏥 {dentist.clinic_name} · 📍 {(dentist.areas as any)?.name}, Mumbai</p>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 180, paddingTop: 16 }}>
              {dentist.whatsapp && (
                <a href={`https://wa.me/91${dentist.whatsapp.replace(/\D/g, '')}?text=Hi%20${encodeURIComponent(dentist.name)}%2C%20I%20found%20you%20on%20dentistinmumbai.in%20and%20would%20like%20to%20book%20an%20appointment.`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: '#25D366', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  WhatsApp
                </a>
              )}
              {dentist.phone && (
                <a href={`tel:${dentist.phone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', background: '#fff', color: 'var(--blue)', border: '2px solid var(--blue)', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  📞 Call Clinic
                </a>
              )}
              <BookingTrigger dentist={{ id: dentist.id, name: dentist.name, clinic_name: dentist.clinic_name, working_hours: dentist.working_hours }} treatments={dentist.dentist_treatments || []} />
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
                        <img src={photo.image_url} alt={photo.caption || 'Clinic photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
              {dentist.maps_embed && (
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>📍 Location</h3>
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: dentist.maps_embed }} style={{ width: '100%', height: 220, display: 'block' }} />
                  {dentist.address && <div style={{ padding: '12px 20px' }}><p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{dentist.address}</p></div>}
                </div>
              )}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Share this profile</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <a href={`https://wa.me/?text=Check out ${dentist.name} on DentistInMumbai.in: https://www.dentistinmumbai.in/dentist/${dentist.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', background: '#25D366', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Share</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer style={{ background: '#0A1628', padding: '24px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 40 }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} dentistinmumbai.in · A Dentaura Prime LLP initiative</p>
      </footer>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } } @media (max-width: 768px) { .profile-grid { grid-template-columns: 1fr !important; } }`}</style>
    </>
  )
}

