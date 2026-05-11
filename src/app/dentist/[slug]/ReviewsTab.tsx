'use client'

import { useState } from 'react'

interface Review {
  id: string
  patient_name: string
  rating: number
  review_text: string | null
  treatment: string | null
  created_at: string
  verified: boolean
}

interface ReviewsTabProps {
  reviews: Review[]
  dentistId: string
  dentistSlug: string
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ color: '#F59E0B', fontSize: size }}>
      {'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}
    </span>
  )
}

export default function ReviewsTab({ reviews, dentistId, dentistSlug }: ReviewsTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', rating: 5, text: '', treatment: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0

  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: reviews.filter(rv => rv.rating === r).length,
  }))

  async function submitReview() {
    if (!form.name || !form.text) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, dentist_id: dentistId }),
      })
      if (res.ok) { setSubmitted(true); setShowForm(false) }
    } catch {}
    setSubmitting(false)
  }

  return (
    <div>
      {/* Rating summary */}
      {reviews.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '28px', marginBottom: 24, display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 48, color: 'var(--text)', lineHeight: 1 }}>
              {avgRating.toFixed(1)}
            </div>
            <Stars rating={avgRating} size={20} />
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{reviews.length} reviews</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            {ratingCounts.map(({ rating, count }) => (
              <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', width: 20 }}>{rating}★</span>
                <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, background: 'var(--gold)',
                    width: reviews.length > 0 ? `${(count / reviews.length) * 100}%` : '0%',
                    transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted)', width: 20 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Write review button */}
      {!submitted && (
        <div style={{ marginBottom: 24 }}>
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-outline"
            >✏️ Write a Review</button>
          ) : (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Write a Review</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Rating *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, rating: r }))} style={{
                      fontSize: 28, background: 'none', border: 'none', cursor: 'pointer',
                      color: r <= form.rating ? '#F59E0B' : '#D1D5DB',
                    }}>★</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Name *</label>
                <input
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Enter your name"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Treatment Taken</label>
                <input
                  value={form.treatment} onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))}
                  placeholder="e.g. Dental Implants, Root Canal"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Review *</label>
                <textarea
                  value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                  placeholder="Share your experience..."
                  rows={4}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={submitReview} disabled={submitting || !form.name || !form.text} className="btn btn-primary">
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
                <button onClick={() => setShowForm(false)} className="btn btn-outline">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {submitted && (
        <div style={{ background: 'var(--green-light)', border: '1px solid #A7F3D0', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
          <p style={{ color: '#065F46', fontWeight: 600 }}>✅ Thank you! Your review has been submitted for moderation.</p>
        </div>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No reviews yet</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Be the first to review this dentist.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reviews.map(review => (
            <div key={review.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-heading)' }}>{review.patient_name}</span>
                    {review.verified && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--green-light)', color: '#065F46', borderRadius: 20, fontWeight: 600 }}>✓ Verified</span>
                    )}
                  </div>
                  <Stars rating={review.rating} />
                  {review.treatment && (
                    <span style={{ fontSize: 12, color: 'var(--blue)', marginLeft: 8, fontWeight: 500 }}>· {review.treatment}</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {review.review_text && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{review.review_text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
'use client'

import { useState } from 'react'

interface Review {
  id: string
  patient_name: string
  rating: number
  review_text: string | null
  treatment: string | null
  created_at: string
  verified: boolean
}

interface ReviewsTabProps {
  reviews: Review[]
  dentistId: string
  dentistSlug: string
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ color: '#F59E0B', fontSize: size }}>
      {'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}
    </span>
  )
}

export default function ReviewsTab({ reviews, dentistId, dentistSlug }: ReviewsTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', rating: 5, text: '', treatment: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0

  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: reviews.filter(rv => rv.rating === r).length,
  }))

  async function submitReview() {
    if (!form.name || !form.text) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, dentist_id: dentistId }),
      })
      if (res.ok) { setSubmitted(true); setShowForm(false) }
    } catch {}
    setSubmitting(false)
  }

  return (
    <div>
      {/* Rating summary */}
      {reviews.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '28px', marginBottom: 24, display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 48, color: 'var(--text)', lineHeight: 1 }}>
              {avgRating.toFixed(1)}
            </div>
            <Stars rating={avgRating} size={20} />
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{reviews.length} reviews</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            {ratingCounts.map(({ rating, count }) => (
              <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', width: 20 }}>{rating}★</span>
                <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, background: 'var(--gold)',
                    width: reviews.length > 0 ? `${(count / reviews.length) * 100}%` : '0%',
                    transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted)', width: 20 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Write review button */}
      {!submitted && (
        <div style={{ marginBottom: 24 }}>
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-outline"
            >✏️ Write a Review</button>
          ) : (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Write a Review</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Rating *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, rating: r }))} style={{
                      fontSize: 28, background: 'none', border: 'none', cursor: 'pointer',
                      color: r <= form.rating ? '#F59E0B' : '#D1D5DB',
                    }}>★</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Name *</label>
                <input
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Enter your name"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Treatment Taken</label>
                <input
                  value={form.treatment} onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))}
                  placeholder="e.g. Dental Implants, Root Canal"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Review *</label>
                <textarea
                  value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                  placeholder="Share your experience..."
                  rows={4}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={submitReview} disabled={submitting || !form.name || !form.text} className="btn btn-primary">
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
                <button onClick={() => setShowForm(false)} className="btn btn-outline">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {submitted && (
        <div style={{ background: 'var(--green-light)', border: '1px solid #A7F3D0', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
          <p style={{ color: '#065F46', fontWeight: 600 }}>✅ Thank you! Your review has been submitted for moderation.</p>
        </div>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No reviews yet</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Be the first to review this dentist.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reviews.map(review => (
            <div key={review.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-heading)' }}>{review.patient_name}</span>
                    {review.verified && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--green-light)', color: '#065F46', borderRadius: 20, fontWeight: 600 }}>✓ Verified</span>
                    )}
                  </div>
                  <Stars rating={review.rating} />
                  {review.treatment && (
                    <span style={{ fontSize: 12, color: 'var(--blue)', marginLeft: 8, fontWeight: 500 }}>· {review.treatment}</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {review.review_text && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{review.review_text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
