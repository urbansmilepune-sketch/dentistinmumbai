import Link from 'next/link'
import { formatDistance } from '@/lib/distance'
import { istDayTime } from '@/lib/time'
import { whatsappLink } from '@/lib/phone'

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
  profile_photo: string | null
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
  // IST day/time — server runs UTC; naive getDay()/getHours() would offset
  // by 5h30 and render the wrong weekday's hours past 18:30 IST.
  const { dayKey, hour, minute } = istDayTime(new Date())
  const hours = working_hours[dayKey]
  if (!hours?.is_open) return false
  const [openH, openM] = (hours.open_time || '09:00').split(':').map(Number)
  const [closeH, closeM] = (hours.close_time || '19:00').split(':').map(Number)
  const currentMins = hour * 60 + minute
  const openMins = openH * 60 + openM
  const closeMins = closeH * 60 + closeM
  return currentMins >= openMins && currentMins < closeMins
}

function TierBadge({ verified }: { tier: string; verified: boolean }) {
  // Launch-phase override: hide tier-specific badges (Featured / Gold)
  // from the public listing. Verified checkmark stays as it conveys
  // identity, not pricing — see /lib/tier.ts.
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
  // Normalised wa.me link — handles raw, '+91…', '91…' and trunk-prefix
  // numbers, returns null when the column is unusable so the WhatsApp
  // button is skipped entirely.
  const waLink = whatsappLink(d.whatsapp)

  if (view === 'grid') {
    return (
      <div style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
        overflow: 'hidden', transition: 'box-shadow 0.2s, transform 0.2s',
        // Defensive: cap the card to its column so a future layout regression
        // can never let it push past the 360px viewport again (box-sizing is
        // global). The real fix for the recent overflow was the listing-layout
        // align-items:stretch — this just makes the card itself fail-safe.
        width: '100%', maxWidth: '100%',
      }} className="card-hover">
        {/* Photo banner */}
        <div style={{ height: 130, background: 'var(--blue-light)', position: 'relative', overflow: 'hidden' }}>
          {d.profile_photo ? (
            <img src={d.profile_photo} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', aspectRatio: '1 / 1' }} />
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
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rating.toFixed(1)}{(d.review_count || 0) > 0 ? ` (${d.review_count})` : ''}</span>
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
      // Defensive width cap — see grid-view note above.
      width: '100%', maxWidth: '100%',
    }} className="card-hover dentist-card-list">
      {/* Photo */}
      <div style={{
        width: 80, height: 80, borderRadius: 12, flexShrink: 0,
        background: 'var(--blue-light)', overflow: 'hidden',
        border: '2px solid var(--border)',
      }}>
        {d.profile_photo ? (
          <img src={d.profile_photo} alt={d.name} className="dentist-card-photo-img" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', aspectRatio: '1 / 1' }} />
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
              {d.consultation_fee ? `₹${d.consultation_fee}` : 'Call for price'}
            </div>
            {rating > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                <Stars rating={rating} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rating.toFixed(1)}{(d.review_count || 0) > 0 ? ` (${d.review_count})` : ''}</span>
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

        {/* Action buttons — three patient-facing CTAs always visible.
            WhatsApp leads (highest-intent action), Call sits in the middle as
            a blue-outline alternative, Book is the solid conversion button.
            View Profile demotes to a subtle text link below. */}
        <div className="dentist-cta-row">
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="dentist-cta dentist-cta-whatsapp" aria-label={`WhatsApp ${d.name}`}>
              <span aria-hidden="true">💬</span> WhatsApp
            </a>
          )}
          {d.phone && (
            <a href={`tel:${d.phone}`} className="dentist-cta dentist-cta-call" aria-label={`Call ${d.name}`}>
              <span aria-hidden="true">📞</span> Call
            </a>
          )}
          <Link href={`/book/${d.slug}`} className="dentist-cta dentist-cta-book" aria-label={`Book ${d.name}`}>
            <span aria-hidden="true">📅</span> Book
          </Link>
        </div>
        <Link href={`/dentist/${d.slug}`} className="dentist-cta-profile-link">View full profile →</Link>
      </div>
      <style>{`
        .dentist-cta-row {
          display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;
        }
        .dentist-cta {
          flex: 1 1 0; min-width: 90px; min-height: 48px;
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 0 12px; border-radius: 10px;
          font-family: var(--font-body); font-weight: 700; font-size: 14px;
          text-decoration: none; transition: opacity 0.15s, transform 0.15s;
        }
        .dentist-cta:active { transform: scale(0.98); }
        .dentist-cta-whatsapp { background: #25D366; color: #fff; }
        .dentist-cta-call     { background: #fff; color: var(--blue); border: 2px solid var(--blue); }
        .dentist-cta-book     { background: var(--blue); color: #fff; }
        .dentist-cta-profile-link {
          display: inline-block; font-size: 13px; color: var(--muted); font-weight: 500;
          text-decoration: none;
        }
        @media (max-width: 640px) {
          .dentist-card-list { padding: 16px !important; gap: 12px !important; flex-direction: column !important; }
          .dentist-card-list > div:first-child { width: 100% !important; height: 200px !important; border-radius: 12px !important; }
          .dentist-card-photo-img { height: 200px !important; width: 100% !important; object-fit: cover !important; object-position: top center !important; }
          .dentist-cta { min-height: 52px; font-size: 14px; flex: 1 1 calc(33.333% - 6px); min-width: 86px; }
        }
        @media (max-width: 360px) {
          /* Very narrow phones — stack the CTAs so each gets the full row. */
          .dentist-cta { flex: 1 1 100%; }
        }
      `}</style>
    </div>
  )
}
