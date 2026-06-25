// SECTION 8 — Reviews. Renders the approved reviews with an aggregate header
// when any exist; otherwise an intentional "be among the first" card (never
// an empty box, never "0 reviews"). The ReviewForm is always shown below so
// patients can leave a review either way.

import ReviewForm from '@/components/ReviewForm'
import { NAVY, TEAL } from './profileTheme'
import { StarIcon } from './profileIcons'

interface Review {
  id: string
  patient_name: string | null
  rating: number
  review_text: string | null
}

interface Props {
  reviews: Review[]
  avgRating: string | null
  drName: string
  dentistId: string
  dentistName: string
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => (
        <StarIcon key={i} size={14} color={i <= rating ? '#F59E0B' : '#E2E8F0'} />
      ))}
    </span>
  )
}

export default function ReviewsSection({ reviews, avgRating, drName, dentistId, dentistName }: Props) {
  return (
    <>
      {reviews.length > 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 26, fontWeight: 800, color: NAVY, fontFamily: 'var(--font-heading)' }}>
              <StarIcon size={22} color="#F59E0B" />{avgRating}
            </span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>
              Based on {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews.map(r => (
              <div key={r.id} style={{ padding: '16px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: NAVY }}>{r.patient_name || 'Verified patient'}</span>
                  <Stars rating={r.rating} />
                </div>
                {r.review_text && <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{r.review_text}</p>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{
          padding: '32px 24px', background: '#fff', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 14, textAlign: 'center',
        }}>
          <div style={{ display: 'inline-flex', gap: 3, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map(i => <StarIcon key={i} size={20} color={TEAL} />)}
          </div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: NAVY, marginBottom: 6 }}>
            Be among the first to review {drName}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
            Visited this clinic? Share your experience to help other patients in your area choose with confidence.
          </p>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <ReviewForm dentistId={dentistId} dentistName={dentistName} />
      </div>
    </>
  )
}
