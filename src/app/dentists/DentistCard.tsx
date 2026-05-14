import Link from 'next/link'
import { formatDistance } from '@/lib/distance'

interface Treatment {
  name: string
  slug: string
}

interface Dentist {
  id: string
  slug: string
  name: string
  clinic_name: string | null
  qualifications: string | null
  experience_years: number
  gender: string | null
  consultation_fee: number
  emi_available: boolean
  is_verified: boolean
  tier: string
  profile_photo_url: string | null
  whatsapp: string | null
  phone: string | null
  working_hours: any
  areas: { name: string; slug: string } | null
  dentist_treatments: { treatments: Treatment }[]
  avg_rating?: number
  review_count?: number
  distance_km?: number | null
}

function DistanceBadge({ distance_km }: { distance_km: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      background: '#DCFCE7', color: '#166534',
      fontSize: 11, fontWeight: 700,
      border: '1px solid #BBF7D0',
    }}>
      📍 {formatDistance(distance_km)}
    </span>
  )
}

interface DentistCardProps {
  dentist: Dentist
  view: 'list' | 'grid'
}

function isOpenNow(working_hours: any): boolean {
  if (!working_hours) return false
  const now = new Date()
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const day = days[now.getDay()]
  const hours = working_hours[day]
  if (!hours?.is_open) return false
  const [openH, openM] = (hours.open_time || '09:00').split(':').map(Number)
  const [closeH, closeM] = (hours.close_time || '19:00').split(':').map(Number)
  const currentMins = now.getHours() * 60 + now.getMinutes()
  const openMins = openH * 60 + openM
  const closeMins = closeH * 60 + closeM
  return currentMins >= openMins && currentMins < closeMins
}

function TierBadge({ tier, verified }: { tier: string; verified: boolean }) {
  if (tier === 'featured') return <span className="badge badge-featured">⭐ Featured</span>
  if (tier === 'gold' && verified) return <span className="badge badge-verified">✓ Verified Gold</span>
  if (verified) return <span className="badge badge-verified">✓ Verified</span>
  return null
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: '#F59E0B', fontSize: 13 }}>
      {'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}
    </span>
  )
}

export default function DentistCard({ dentist: d, view }: DentistCardProps) {
  const open = isOpenNow(d.working_hours)
  const treatments = d.dentist_treatments?.map(dt => dt.treatments).filter(Boolean) || []
  const rating = d.avg_rating || 0
  const waLink = d.whatsapp ? `https://wa.me/91${d.whatsapp.replace(/\D/g, '')}` : null

  if (view === 'grid') {
    return (
      <div style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
        overflow: 'hidden', transition: 'box-shadow 0.2s, transform 0.2s',
      }} className="card-hover">
        {/* Photo banner */}
        <div style={{ height: 130, background: 'var(--blue-light)', position: 'relative', overflow: 'hidden' }}>
          {d.profile_photo_url ? (
            <img src={d.profile_photo_url} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🦷</div>
          )}
          {/* Open badge */}
          <div style={{
            position: 'absolute', top: 10, right: 10,
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: open ? '#DCFCE7' : '#FEE2E2',
            color: open ? '#166534' : '#991B1B',
          }}>{open ? '● Open' : '● Closed'}</div>
          {/* Tier badge */}
          <div style={{ position: 'absolute', top: 10, left: 10 }}>
            <TierBadge tier={d.tier} verified={d.is_verified} />
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{d.name}</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            {d.clinic_name} · {d.areas?.name}
          </p>
          {typeof d.distance_km === 'number' && (
            <div style={{ marginBottom: 8 }}>
              <DistanceBadge distance_km={d.distance_km} />
            </div>
          )}

          {rating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Stars rating={rating} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rating.toFixed(1)} ({d.review_count || 0})</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {treatments.slice(0, 2).map(t => (
              <span key={t.slug} style={{
                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                background: 'var(--blue-light)', color: 'var(--blue-dark)',
              }}>{t.name}</span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>From</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                {d.consultation_fee ? `₹${d.consultation_fee}` : 'Call'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {waLink && (
                <a href={waLink} target="_blank" rel="noopener noreferrer" style={{
                  width: 34, height: 34, borderRadius: 8, background: '#DCFCE7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>💬</a>
              )}
              <Link href={`/dentist/${d.slug}`} style={{
                padding: '6px 14px', background: 'var(--blue)', color: '#fff',
                borderRadius: 8, fontSize: 12, fontWeight: 600,
              }}>View</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
      padding: '20px', display: 'flex', gap: 16, transition: 'box-shadow 0.2s',
    }} className="card-hover">
      {/* Photo */}
      <div style={{
        width: 80, height: 80, borderRadius: 12, flexShrink: 0,
        background: 'var(--blue-light)', overflow: 'hidden',
        border: '2px solid var(--border)',
      }}>
        {d.profile_photo_url ? (
          <img src={d.profile_photo_url} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🦷</div>
        )}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{d.name}</h3>
              <TierBadge tier={d.tier} verified={d.is_verified} />
            </div>
            {d.qualifications && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>{d.qualifications}</p>}
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{d.clinic_name}</p>
          </div>

          {/* Fee — right side */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Consultation</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>
              {d.consultation_fee ? `₹${d.consultation_fee}` : 'Call for fee'}
            </div>
            {rating > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                <Stars rating={rating} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rating.toFixed(1)} ({d.review_count || 0})</span>
              </div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: 'var(--muted)', marginBottom: 10, alignItems: 'center' }}>
          {typeof d.distance_km === 'number' && <DistanceBadge distance_km={d.distance_km} />}
          {d.areas && <span>📍 {d.areas.name}</span>}
          {d.experience_years > 0 && <span>🎓 {d.experience_years} yrs exp</span>}
          {d.gender && <span>👤 {d.gender.charAt(0).toUpperCase() + d.gender.slice(1)}</span>}
          <span style={{ color: open ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
            {open ? '● Open Now' : '● Closed'}
          </span>
          {d.emi_available && (
            <span style={{ padding: '1px 8px', background: 'var(--green-light)', color: '#065F46', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>EMI Available</span>
          )}
        </div>

        {/* Treatment tags */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {treatments.slice(0, 3).map(t => (
            <span key={t.slug} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              background: 'var(--blue-light)', color: 'var(--blue-dark)',
              border: '1px solid #BFDBFE',
            }}>{t.name}</span>
          ))}
          {treatments.length > 3 && (
            <span style={{ fontSize: 12, color: 'var(--muted)', padding: '3px 0' }}>+{treatments.length - 3} more</span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/dentist/${d.slug}`} style={{
            padding: '8px 20px', background: 'var(--blue)', color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600,
          }}>View Profile →</Link>
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" style={{
              padding: '8px 16px', background: '#DCFCE7', color: '#166534',
              borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid #BBF7D0',
            }}>💬 WhatsApp</a>
          )}
          <Link href={`/dentist/${d.slug}#book`} style={{
            padding: '8px 16px', background: 'var(--orange-light)', color: 'var(--orange)',
            borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid #FECACA',
          }}>📅 Book</Link>
        </div>
      </div>
    </div>
  )
}
