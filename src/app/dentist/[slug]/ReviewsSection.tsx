// SECTION 9 — Reviews. With reviews: average + star breakdown, what patients
// mention most, then the newest reviews (verified-visit badge, dentist
// reply). Without: an intentional "New on DentistIn" card, never
// "0 reviews". The OTP review form sits behind "Write a review" for patients
// who did not get a review link.

import ReviewForm from '@/components/ReviewForm'
import { NAVY, TEAL_DARK } from './profileTheme'
import { StarIcon, ShieldCheckIcon } from './profileIcons'
import { GOOD_TAGS } from '@/lib/reviewRequests'

interface Review {
  id: string
  patient_name: string | null
  rating: number
  review_text: string | null
  treatment?: string | null
  created_at?: string | null
  tags?: string[] | null
  verified_visit?: boolean | null
  dentist_reply?: string | null
}

interface Props {
  reviews: Review[]
  avgRating: string | null
  drName: string
  dentistId: string
  dentistName: string
}

const FIRST_SHOWN = 5

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => (
        <StarIcon key={i} size={size} color={i <= rating ? '#F59E0B' : '#E2E8F0'} />
      ))}
    </span>
  )
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (!Number.isFinite(days) || days < 0) return ''
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) { const w = Math.floor(days / 7); return `${w} ${w === 1 ? 'week' : 'weeks'} ago` }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} ${m === 1 ? 'month' : 'months'} ago` }
  const y = Math.floor(days / 365); return `${y} ${y === 1 ? 'year' : 'years'} ago`
}

function ReviewCard({ r, drName }: { r: Review; drName: string }) {
  const meta = [r.treatment, timeAgo(r.created_at)].filter(Boolean).join(' · ')
  return (
    <article style={{ padding: '14px 16px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontWeight: 700, color: NAVY }}>{r.patient_name || 'Verified patient'}</span>
          {meta && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{meta}</span>}
        </div>
        <Stars rating={r.rating} />
      </div>
      {r.verified_visit && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: TEAL_DARK }}>
          <ShieldCheckIcon size={14} color={TEAL_DARK} /> Verified visit · booked on DentistIn
        </span>
      )}
      {r.review_text && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{r.review_text}</p>}
      {r.tags && r.tags.length > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.tags.join(' · ')}</span>}
      {r.dentist_reply && (
        <div style={{ background: '#F1F5F9', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Reply from {drName}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: '#334155' }}>{r.dentist_reply}</span>
        </div>
      )}
    </article>
  )
}

export default function ReviewsSection({ reviews, avgRating, drName, dentistId, dentistName }: Props) {
  const total = reviews.length
  const counts = [5, 4, 3, 2, 1].map(n => ({ n, c: reviews.filter(r => r.rating === n).length }))

  // Only praise tags are summarised as "often mention"; a complaint tag shows
  // on its own review, where it has context.
  const tagCounts = new Map<string, number>()
  for (const r of reviews) for (const t of r.tags ?? []) {
    if ((GOOD_TAGS as readonly string[]).includes(t)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const topTags = Array.from(tagCounts.entries()).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const first = reviews.slice(0, FIRST_SHOWN)
  const rest = reviews.slice(FIRST_SHOWN)

  return (
    <>
      {total > 0 ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: '#fff', border: '1px solid var(--border)', borderRadius: 14 }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 4, width: 96, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 38, fontWeight: 800, lineHeight: 1, color: NAVY }}>{avgRating}</span>
              <Stars rating={Math.round(Number(avgRating) || 0)} size={14} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{total} {total === 1 ? 'review' : 'reviews'}</span>
            </div>
            <div style={{ flex: 1, display: 'grid', gap: 5 }}>
              {counts.map(({ n, c }) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                  <span style={{ width: 10 }}>{n}</span>
                  <span style={{ flex: 1, height: 7, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.round((c / total) * 100)}%`, background: '#F59E0B', borderRadius: 4 }} />
                  </span>
                  <span style={{ width: 20, textAlign: 'right' }}>{c}</span>
                </div>
              ))}
            </div>
          </div>

          {topTags.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>Patients often mention</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {topTags.map(([t, c]) => (
                  <span key={t} style={{ padding: '6px 11px', borderRadius: 999, background: '#F0FDFA', border: '1px solid #99F6E4', fontSize: 13, fontWeight: 600, color: '#115E59' }}>{t} · {c}</span>
                ))}
              </div>
            </div>
          )}

          {first.map(r => <ReviewCard key={r.id} r={r} drName={drName} />)}
          {rest.length > 0 && (
            <details className="reviews-more">
              <summary style={{ listStyle: 'none', cursor: 'pointer', minHeight: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)', borderRadius: 12, background: '#fff', fontWeight: 700, fontSize: 14, color: NAVY }}>
                See all {total} reviews
              </summary>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                {rest.map(r => <ReviewCard key={r.id} r={r} drName={drName} />)}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div style={{ padding: '16px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 999, background: NAVY, color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>New</span>
          <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>New on DentistIn. Reviews from patients who visit {drName} will show here.</span>
        </div>
      )}

      <details className="reviews-write" style={{ marginTop: 16 }}>
        <summary style={{ listStyle: 'none', cursor: 'pointer', textAlign: 'center', fontSize: 14, fontWeight: 600, color: TEAL_DARK, padding: '8px 0' }}>
          Visited this clinic? Write a review
        </summary>
        <div style={{ marginTop: 12 }}>
          <ReviewForm dentistId={dentistId} dentistName={dentistName} />
        </div>
      </details>
      <style>{`.reviews-more > summary::-webkit-details-marker, .reviews-write > summary::-webkit-details-marker { display: none; } .reviews-more[open] > summary { display: none; }`}</style>
    </>
  )
}
